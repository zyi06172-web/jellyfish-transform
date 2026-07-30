"""Project CRUD。"""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.utils import apply_keyword_filter, apply_order, paginate
from app.dependencies import get_db
from app.models.studio import AgentArtifact, AgentMessage, AgentSession, Chapter, Project
from app.models.types import (
    AgentActionType,
    AgentArtifactKind,
    AgentArtifactStatus,
    ChapterStatus,
    AgentMessageKind,
    AgentMessageRole,
    AgentSessionStage,
    AgentSessionStatus,
    ProjectStyle,
    ProjectVisualStyle,
)
from app.schemas.common import ApiResponse, PaginatedData, created_response, empty_response, paginated_response, success_response
from app.schemas.studio.agent_workspace import (
    AgentMessageRead,
    AgentQuestionCardRead,
    AgentQuestionOptionRead,
    AgentTurnRead,
    AgentTurnRequest,
    AgentWorkspaceSnapshotRead,
)
from app.services.common import (
    create_and_refresh,
    delete_if_exists,
    entity_already_exists,
    entity_not_found,
    ensure_not_exists,
    flush_and_refresh,
    get_or_404,
    patch_model,
)
from app.schemas.studio.projects import (
    ProjectCreate,
    ProjectAssetLibraryRead,
    ProjectCanvasActionRead,
    ProjectCanvasActionRequest,
    ProjectBlankCanvasRead,
    ProjectBlankCanvasRequest,
    ProjectCanvasStateRead,
    ProjectCanvasStateUpdate,
    ProjectCanvasViewport,
    ProjectFromPromptRead,
    ProjectFromPromptRequest,
    ProjectRead,
    ProjectStyleOptionsRead,
    ProjectUpdate,
    StyleOption,
)
from app.services.studio.agent.home_prompt_analysis import (
    create_home_project_from_prompt,
    run_home_prompt_analysis_task,
)
from app.tasks.agent_workflow import enqueue_agent_auto_elements_chain
from app.services.llm import build_default_text_llm
from app.services.studio.agent.db_repository import DbAgentRepository
from app.services.studio.agent.element_regeneration import regenerate_element_image
from app.services.studio.agent.turn_decision_llm import LLMAgentTurnDecisionLLM
from app.services.studio.agent.types import AgentTurnCommand, AgentTurnInput
from app.services.studio.agent.video_creation_agent import VideoCreationAgent
from app.services.studio.asset_library import build_project_asset_library

router = APIRouter()

PROJECT_ORDER_FIELDS = {"name", "created_at", "updated_at", "progress"}


def _json_value(value, fallback):  # noqa: ANN001, ANN202
    """兼容 MySQL JSON 字段在不同驱动下返回 str 或 Python 对象的差异。"""
    if value is None:
        return fallback
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback
    return value


def _build_project_style_options() -> tuple[dict[ProjectVisualStyle, list[ProjectStyle]], dict[ProjectVisualStyle, ProjectStyle]]:
    mapping: dict[ProjectVisualStyle, list[ProjectStyle]] = {key: [] for key in ProjectVisualStyle}
    for item in ProjectStyle:
        if item.name.startswith("real_people_"):
            mapping[ProjectVisualStyle.live_action].append(item)
            continue
        if item.name.startswith("anime_") or item.name in {"guoman", "ink_wash"}:
            mapping[ProjectVisualStyle.anime].append(item)
            continue
    defaults: dict[ProjectVisualStyle, ProjectStyle] = {
        visual: styles[0]
        for visual, styles in mapping.items()
        if styles
    }
    return mapping, defaults


def _validate_project_style_combo(*, visual_style: ProjectVisualStyle, style: ProjectStyle) -> None:
    mapping, _defaults = _build_project_style_options()
    allowed = mapping.get(visual_style, [])
    if style not in allowed:
        raise ValueError(
            f"style is not allowed for visual_style: visual_style={visual_style.value}, "
            f"style={style.value}, allowed={[item.value for item in allowed]}"
        )


@router.get(
    "/style-options",
    response_model=ApiResponse[ProjectStyleOptionsRead],
    summary="获取项目风格候选项",
)
async def get_project_style_options(
) -> ApiResponse[ProjectStyleOptionsRead]:
    mapping, defaults = _build_project_style_options()
    data = ProjectStyleOptionsRead(
        visual_styles=[StyleOption(value=x.value, label=x.value) for x in ProjectVisualStyle],
        styles_by_visual_style={
            visual.value: [StyleOption(value=style.value, label=style.value) for style in styles]
            for visual, styles in mapping.items()
        },
        default_style_by_visual_style={visual.value: style.value for visual, style in defaults.items()},
    )
    return success_response(data)


@router.get(
    "",
    response_model=ApiResponse[PaginatedData[ProjectRead]],
    summary="项目列表（分页）",
)
async def list_projects(
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(None, description="关键字，过滤 name/description"),
    order: str | None = Query(None, description="排序字段"),
    is_desc: bool = Query(False, description="是否倒序"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
) -> ApiResponse[PaginatedData[ProjectRead]]:
    stmt = select(Project)
    stmt = apply_keyword_filter(stmt, q=q, fields=[Project.name, Project.description])
    stmt = apply_order(stmt, model=Project, order=order, is_desc=is_desc, allow_fields=PROJECT_ORDER_FIELDS, default="created_at")
    items, total = await paginate(db, stmt=stmt, page=page, page_size=page_size)
    return paginated_response([ProjectRead.model_validate(x) for x in items], page=page, page_size=page_size, total=total)


@router.post(
    "",
    response_model=ApiResponse[ProjectRead],
    status_code=status.HTTP_201_CREATED,
    summary="创建项目",
)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ProjectRead]:
    await ensure_not_exists(
        db,
        Project,
        body.id,
        detail=entity_already_exists("Project"),
    )
    try:
        _validate_project_style_combo(visual_style=body.visual_style, style=body.style)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    obj = await create_and_refresh(db, Project(**body.model_dump()))
    return created_response(ProjectRead.model_validate(obj))


@router.post(
    "/blank-canvas",
    response_model=ApiResponse[ProjectBlankCanvasRead],
    status_code=status.HTTP_201_CREATED,
    summary="创建空白女娲画布并初始化 Agent 会话",
)
async def create_blank_canvas_project(
    body: ProjectBlankCanvasRequest,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ProjectBlankCanvasRead]:
    """创建空白画布，让用户从画布内 AgentDock 贴剧本开始。"""
    existing = (
        await db.execute(
            select(AgentSession)
            .where(AgentSession.state["idempotency_key"].as_string() == body.idempotency_key)
            .limit(1)
        )
    ).scalars().first()
    if existing is not None:
        return created_response(
            ProjectBlankCanvasRead(
                id=existing.project_id,
                project_id=existing.project_id,
                session_id=existing.id,
                status=existing.status.value if hasattr(existing.status, "value") else str(existing.status),
            )
        )

    project_id = f"proj_{uuid.uuid4().hex}"
    session_id = f"agent_session_{uuid.uuid4().hex}"
    project = Project(
        id=project_id,
        name=body.name.strip() or "画布1",
        description="",
        style=ProjectStyle.real_people_city,
        visual_style=ProjectVisualStyle.live_action,
        seed=0,
        unify_style=True,
        progress=0,
        default_video_ratio=body.default_video_ratio or "16:9",
        stats={"created_from": "blank_canvas", "canvas_name": body.name.strip() or "画布1"},
    )
    session = AgentSession(
        id=session_id,
        project_id=project_id,
        current_stage=AgentSessionStage.intake,
        status=AgentSessionStatus.waiting_user,
        revision=0,
        state={"source": "blank_canvas", "idempotency_key": body.idempotency_key},
    )
    message = AgentMessage(
        id=f"agent_message_{uuid.uuid4().hex}",
        session_id=session_id,
        sequence=1,
        role=AgentMessageRole.assistant,
        kind=AgentMessageKind.question_card,
        content="请在右下角对话框粘贴剧本，我会先严格解析故事构成、角色和分镜信息。",
        payload={"stage": AgentSessionStage.intake.value},
    )
    db.add(project)
    await db.flush()
    db.add(session)
    await db.flush()
    db.add(message)
    await db.commit()
    return created_response(
        ProjectBlankCanvasRead(
            id=project_id,
            project_id=project_id,
            session_id=session_id,
            status=AgentSessionStatus.waiting_user.value,
        )
    )


@router.post(
    "/from-prompt",
    response_model=ApiResponse[ProjectFromPromptRead],
    status_code=status.HTTP_201_CREATED,
    summary="从首页提示词创建项目并启动剧情分析",
)
async def create_project_from_prompt(
    body: ProjectFromPromptRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ProjectFromPromptRead]:
    created = await create_home_project_from_prompt(
        db,
        prompt=body.prompt,
        skill_key=body.skill_key,
        idempotency_key=body.idempotency_key,
    )
    await db.commit()
    if created.status == "running":
        background_tasks.add_task(run_home_prompt_analysis_task, created.action_id)
    return created_response(
        ProjectFromPromptRead(
            id=created.project_id,
            project_id=created.project_id,
            session_id=created.session_id,
            status=created.status,
        )
    )


@router.get(
    "/{project_id}/workspace",
    response_model=ApiResponse[AgentWorkspaceSnapshotRead],
    summary="获取 Agent 工作台快照",
)
async def get_project_workspace(
    project_id: str,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[AgentWorkspaceSnapshotRead]:
    await get_or_404(db, Project, project_id, detail=entity_not_found("Project"))
    agent = VideoCreationAgent(repository=DbAgentRepository(db))
    snapshot = await agent.get_workspace_snapshot(project_id)
    return success_response(_snapshot_to_read(snapshot))


@router.post(
    "/{project_id}/agent/turns",
    response_model=ApiResponse[AgentTurnRead],
    summary="提交 Agent 对话 turn",
)
async def handle_project_agent_turn(
    project_id: str,
    body: AgentTurnRequest,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[AgentTurnRead]:
    await get_or_404(db, Project, project_id, detail=entity_not_found("Project"))
    repository = DbAgentRepository(db, command_idempotency_key=body.idempotency_key)
    if body.input.type == "text" and body.input.text.strip():
        await repository.append_user_message(
            session_id=body.session_id,
            content=body.input.text.strip(),
            payload={"idempotency_key": body.idempotency_key},
        )
    elif body.input.type == "choice":
        await repository.append_user_message(
            session_id=body.session_id,
            content=body.input.choice_id,
            payload={"choice_id": body.input.choice_id, "idempotency_key": body.idempotency_key},
        )
    decision_llm = None
    if body.input.type == "text" and body.input.text.strip():
        llm = await build_default_text_llm(db, thinking=False)
        decision_llm = LLMAgentTurnDecisionLLM(llm)
    agent = VideoCreationAgent(repository=repository, decision_llm=decision_llm)
    result = await agent.handle_turn(
        AgentTurnCommand(
            project_id=project_id,
            session_id=body.session_id,
            expected_revision=body.expected_revision,
            input=AgentTurnInput(
                type=body.input.type,
                text=body.input.text,
                choice_id=body.input.choice_id,
            ),
            idempotency_key=body.idempotency_key,
        )
    )
    if body.input.type == "choice" and result.stage == AgentSessionStage.storyboard:
        await db.commit()
        enqueue_agent_auto_elements_chain(
            project_id=project_id,
            session_id=body.session_id,
            idempotency_key=body.idempotency_key,
        )
    for index, action in enumerate(result.actions):
        if action.action_type == AgentActionType.analyze and action.target_type == "project":
            await _persist_intake_script(
                db,
                project_id=project_id,
                raw_script=str(action.input.get("raw_script") or body.input.text or ""),
            )
        if action.action_type == AgentActionType.regenerate_target and action.target_type == "character":
            await regenerate_element_image(
                db,
                project_id=project_id,
                session_id=body.session_id,
                action_idempotency_key=(
                    f"{body.idempotency_key}:{action.action_type.value}:{action.target_type}:{action.target_id}:{index}"
                ),
            )
    return success_response(
        AgentTurnRead(
            revision=result.revision,
            stage=result.stage.value,
            assistant_message=_message_to_read(result.assistant_message),
            question_card=_question_to_read(result.question_card),
            actions=[
                {
                    "action_type": action.action_type.value,
                    "target_type": action.target_type,
                    "target_id": action.target_id,
                    "input": action.input,
                }
                for action in result.actions
            ],
            workspace_patch=result.workspace_patch,
        )
    )


@router.get(
    "/{project_id}/asset-library",
    response_model=ApiResponse[ProjectAssetLibraryRead],
    summary="获取项目资产库",
)
async def get_project_asset_library(
    project_id: str,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ProjectAssetLibraryRead]:
    await get_or_404(db, Project, project_id, detail=entity_not_found("Project"))
    return success_response(await build_project_asset_library(db, project_id=project_id))


@router.post(
    "/{project_id}/canvas-actions",
    response_model=ApiResponse[ProjectCanvasActionRead],
    status_code=status.HTTP_201_CREATED,
    summary="记录第6批画布节点动作并推进 Agent 阶段",
)
async def create_project_canvas_action(
    project_id: str,
    body: ProjectCanvasActionRequest,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ProjectCanvasActionRead]:
    """把画布动作追加为 Agent 消息和 artifact；付费阶段必须带显式确认。"""
    project = await get_or_404(db, Project, project_id, detail=entity_not_found("Project"))
    session = await db.get(AgentSession, body.session_id)
    if session is None or session.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=entity_not_found("AgentSession"))
    if body.action in {"keyframe_render", "video_generate"} and not body.confirmed_paid_cost:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="paid cost confirmation is required")

    existing = await _find_canvas_action_artifact(db, project_id=project_id, idempotency_key=body.idempotency_key)
    if existing is not None:
        return created_response(
            ProjectCanvasActionRead(
                project_id=project_id,
                session_id=session.id,
                stage=str(session.current_stage.value if hasattr(session.current_stage, "value") else session.current_stage),
                status=str(session.status.value if hasattr(session.status, "value") else session.status),
                artifact_id=existing.id,
                paid_call_enqueued=False,
            )
        )

    artifact_kind = _artifact_kind_for_canvas_action(body.action)
    stage = _stage_for_canvas_action(body.action)
    artifact_id = await _append_canvas_action_artifact(
        db,
        project=project,
        session=session,
        stage=stage,
        kind=artifact_kind,
        action=body.action,
        idempotency_key=body.idempotency_key,
        model=body.model,
        item_count=body.item_count,
        estimated_cny=body.estimated_cny,
        payload=body.payload,
        paid_call_enqueued=False,
    )
    await db.commit()
    return created_response(
        ProjectCanvasActionRead(
            project_id=project_id,
            session_id=session.id,
            stage=stage.value,
            status=AgentSessionStatus.waiting_user.value,
            artifact_id=artifact_id,
            paid_call_enqueued=False,
        )
    )


@router.get(
    "/{project_id}/canvas-state",
    response_model=ApiResponse[ProjectCanvasStateRead],
    summary="获取项目画布状态",
)
async def get_project_canvas_state(
    project_id: str,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ProjectCanvasStateRead]:
    """读取 React Flow 画布状态；没有保存记录时返回空画布默认值。"""
    await get_or_404(db, Project, project_id, detail=entity_not_found("Project"))
    result = await db.execute(
        text(
            """
            SELECT nodes, edges, viewport
            FROM project_canvas_states
            WHERE project_id = :project_id
            """
        ),
        {"project_id": project_id},
    )
    row = result.mappings().first()
    if not row:
        return success_response(ProjectCanvasStateRead(project_id=project_id))
    return success_response(
        ProjectCanvasStateRead(
            project_id=project_id,
            nodes=_json_value(row["nodes"], []),
            edges=_json_value(row["edges"], []),
            viewport=ProjectCanvasViewport.model_validate(_json_value(row["viewport"], {})),
        )
    )


@router.patch(
    "/{project_id}/canvas-state",
    response_model=ApiResponse[ProjectCanvasStateRead],
    summary="保存项目画布状态",
)
async def update_project_canvas_state(
    project_id: str,
    body: ProjectCanvasStateUpdate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ProjectCanvasStateRead]:
    """保存节点、连线与视口，让画布刷新后可恢复。"""
    await get_or_404(db, Project, project_id, detail=entity_not_found("Project"))
    payload = body.model_dump(mode="json")
    await db.execute(
        text(
            """
            INSERT INTO project_canvas_states (project_id, nodes, edges, viewport)
            VALUES (:project_id, CAST(:nodes AS JSON), CAST(:edges AS JSON), CAST(:viewport AS JSON))
            ON DUPLICATE KEY UPDATE
              nodes = VALUES(nodes),
              edges = VALUES(edges),
              viewport = VALUES(viewport)
            """
        ),
        {
            "project_id": project_id,
            "nodes": json.dumps(payload["nodes"], ensure_ascii=False),
            "edges": json.dumps(payload["edges"], ensure_ascii=False),
            "viewport": json.dumps(payload["viewport"], ensure_ascii=False),
        },
    )
    await db.commit()
    return success_response(ProjectCanvasStateRead(project_id=project_id, **payload))


@router.get(
    "/{project_id}",
    response_model=ApiResponse[ProjectRead],
    summary="获取项目",
)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ProjectRead]:
    obj = await get_or_404(db, Project, project_id, detail=entity_not_found("Project"))
    return success_response(ProjectRead.model_validate(obj))


@router.patch(
    "/{project_id}",
    response_model=ApiResponse[ProjectRead],
    summary="更新项目",
)
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ProjectRead]:
    obj = await get_or_404(db, Project, project_id, detail=entity_not_found("Project"))
    update_data = body.model_dump(exclude_unset=True)
    visual_style = update_data.get("visual_style", obj.visual_style)
    style = update_data.get("style", obj.style)
    if visual_style is not None and style is not None:
        try:
            _validate_project_style_combo(visual_style=visual_style, style=style)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    patch_model(obj, update_data)
    await flush_and_refresh(db, obj)
    return success_response(ProjectRead.model_validate(obj))


@router.delete(
    "/{project_id}",
    response_model=ApiResponse[None],
    summary="删除项目",
)
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await delete_if_exists(db, Project, project_id)
    return empty_response()


def _snapshot_to_read(snapshot) -> AgentWorkspaceSnapshotRead:  # noqa: ANN001
    return AgentWorkspaceSnapshotRead(
        project_id=snapshot.project_id,
        session_id=snapshot.session_id,
        stage=snapshot.stage.value,
        status=snapshot.status.value,
        revision=snapshot.revision,
        confirmed_stages=[item.value for item in snapshot.confirmed_stages],
        completed_stages=[item.value for item in snapshot.completed_stages],
        question_card=_question_to_read(snapshot.question_card),
        messages=[_message_to_read(item) for item in snapshot.messages],
        artifacts=snapshot.artifacts,
    )


def _question_to_read(question) -> AgentQuestionCardRead | None:  # noqa: ANN001
    if question is None:
        return None
    return AgentQuestionCardRead(
        question=question.question,
        options=[
            AgentQuestionOptionRead(
                id=option.id,
                label=option.label,
                effect=option.effect,
                payload=option.payload,
            )
            for option in question.options
        ],
    )


def _message_to_read(message) -> AgentMessageRead:  # noqa: ANN001
    return AgentMessageRead(
        role=message.role,
        kind=message.kind.value if hasattr(message.kind, "value") else str(message.kind),
        content=message.content,
        payload=message.payload,
    )


async def _persist_intake_script(db: AsyncSession, *, project_id: str, raw_script: str) -> None:
    """把画布对话框贴入的剧本落到章节与 artifact，供 script 节点恢复。"""
    script = raw_script.strip()
    if not script:
        return
    project = await db.get(Project, project_id)
    if project is None:
        return
    chapter = (
        await db.execute(
            select(Chapter)
            .where(Chapter.project_id == project_id)
            .order_by(Chapter.index.asc())
            .limit(1)
        )
    ).scalars().first()
    if chapter is None:
        chapter = Chapter(
            id=f"chapter_{uuid.uuid4().hex}",
            project_id=project_id,
            index=1,
            title="第 1 章",
            summary="从画布 AgentDock 粘贴的剧本。",
            raw_text=script,
            condensed_text=script,
            storyboard_count=0,
            status=ChapterStatus.draft,
        )
        db.add(chapter)
    else:
        chapter.raw_text = script
        chapter.condensed_text = script

    latest_version = int(
        await db.scalar(
            select(func.max(AgentArtifact.version))
            .where(AgentArtifact.project_id == project_id, AgentArtifact.kind == AgentArtifactKind.story_summary)
        ) or 0
    )
    artifact = AgentArtifact(
        id=f"agent_artifact_{uuid.uuid4().hex}",
        project_id=project_id,
        kind=AgentArtifactKind.story_summary,
        version=latest_version + 1,
        status=AgentArtifactStatus.draft,
        content_text=script,
        content_json={
            "source": "canvas_agent_dock",
            "raw_script": script,
            "story_structure": {},
            "characters": [],
            "shots_info": {},
        },
    )
    db.add(artifact)
    project.description = script[:500]
    project.progress = max(project.progress or 0, 5)
    project.stats = {
        **(project.stats or {}),
        "source_prompt": script,
        "script_artifact_id": artifact.id,
    }
    await db.commit()


def _artifact_kind_for_canvas_action(action: str) -> AgentArtifactKind:
    """把画布动作映射为第6批正式 Agent 产物类型。"""
    mapping = {
        "script_parsed": AgentArtifactKind.story_summary,
        "assets_ready": AgentArtifactKind.final_video_spec,
        "storyboard_ready": AgentArtifactKind.storyboard,
        "shotlist_text_ready": AgentArtifactKind.shotlist_text,
        "keyframe_render": AgentArtifactKind.keyframe,
        "shotlist_render_ready": AgentArtifactKind.shotlist_render,
        "video_generate": AgentArtifactKind.video,
    }
    return mapping[action]


def _stage_for_canvas_action(action: str) -> AgentSessionStage:
    """把画布动作映射为 Agent 正式阶段；旧链路阶段保持兼容。"""
    mapping = {
        "script_parsed": AgentSessionStage.spec_review,
        "assets_ready": AgentSessionStage.elements_review,
        "storyboard_ready": AgentSessionStage.storyboard,
        "shotlist_text_ready": AgentSessionStage.shotlist_text,
        "keyframe_render": AgentSessionStage.keyframe,
        "shotlist_render_ready": AgentSessionStage.shotlist_render,
        "video_generate": AgentSessionStage.shot_video,
    }
    return mapping[action]


async def _find_canvas_action_artifact(
    db: AsyncSession,
    *,
    project_id: str,
    idempotency_key: str,
) -> AgentArtifact | None:
    """按幂等键查找已有画布动作产物，避免重复点击创建重复记录。"""
    return (
        await db.execute(
            select(AgentArtifact)
            .where(
                AgentArtifact.project_id == project_id,
                AgentArtifact.content_json["idempotency_key"].as_string() == idempotency_key,
            )
            .limit(1)
        )
    ).scalars().first()


async def _append_canvas_action_artifact(
    db: AsyncSession,
    *,
    project: Project,
    session: AgentSession,
    stage: AgentSessionStage,
    kind: AgentArtifactKind,
    action: str,
    idempotency_key: str,
    model: str,
    item_count: int,
    estimated_cny: float | None,
    payload: dict,
    paid_call_enqueued: bool,
) -> str:
    """追加画布动作消息和 artifact；不覆盖旧产物，重做会自然形成新版本。"""
    message = AgentMessage(
        id=f"agent_message_{uuid.uuid4().hex}",
        session_id=session.id,
        sequence=int(await db.scalar(select(func.max(AgentMessage.sequence)).where(AgentMessage.session_id == session.id)) or 0) + 1,
        role=AgentMessageRole.assistant,
        kind=AgentMessageKind.task_update,
        content=_canvas_action_message(action=action, item_count=item_count, model=model, paid_call_enqueued=paid_call_enqueued),
        payload={
            "stage": stage.value,
            "canvas_action": action,
            "idempotency_key": idempotency_key,
            "paid_call_enqueued": paid_call_enqueued,
        },
    )
    db.add(message)
    await db.flush()

    latest_version = int(
        await db.scalar(
            select(func.max(AgentArtifact.version))
            .where(AgentArtifact.project_id == project.id, AgentArtifact.kind == kind)
        ) or 0
    )
    artifact = AgentArtifact(
        id=f"agent_artifact_{uuid.uuid4().hex}",
        project_id=project.id,
        kind=kind,
        version=latest_version + 1,
        status=AgentArtifactStatus.draft,
        content_text=_canvas_action_summary(action=action, item_count=item_count, model=model),
        content_json={
            **payload,
            "canvas_action": action,
            "idempotency_key": idempotency_key,
            "stage": stage.value,
            "model": model,
            "item_count": item_count,
            "estimated_cny": estimated_cny,
            "paid_call_enqueued": paid_call_enqueued,
        },
        created_by_message_id=message.id,
    )
    db.add(artifact)
    session.current_stage = stage
    session.status = AgentSessionStatus.waiting_user
    session.revision += 1
    state = session.state or {}
    completed = set(state.get("completed_stages") or [])
    completed.add(stage.value)
    session.state = {
        **state,
        "pending_stage": stage.value,
        "completed_stages": sorted(completed),
        "last_canvas_action": action,
        "last_canvas_artifact_id": artifact.id,
    }
    project.progress = max(project.progress or 0, _progress_for_canvas_action(action))
    project.stats = {
        **(project.stats or {}),
        "last_canvas_action": action,
        "last_canvas_stage": stage.value,
    }
    await db.flush()
    return artifact.id


def _canvas_action_summary(*, action: str, item_count: int, model: str) -> str:
    """生成 artifact 的一句话摘要，六要素继续留在 JSON 内。"""
    labels = {
        "script_parsed": "剧本已贴入并进入严格解析",
        "assets_ready": "人物、场景和道具资产已进入画布资产阶段",
        "storyboard_ready": "手绘故事板已进入画布预审",
        "shotlist_text_ready": "文字版分镜表已进入免费预审",
        "keyframe_render": "关键帧渲染已通过成本确认",
        "shotlist_render_ready": "渲染版分镜表已复用关键帧生成",
        "video_generate": "视频生成已通过成本确认",
    }
    count_text = f"{item_count} 个" if item_count else ""
    model_text = f"（{model}）" if model else ""
    return f"{labels.get(action, action)}{count_text}{model_text}"


def _canvas_action_message(*, action: str, item_count: int, model: str, paid_call_enqueued: bool) -> str:
    """生成 AgentDock 展示消息，不展开隐藏的六要素结构。"""
    summary = _canvas_action_summary(action=action, item_count=item_count, model=model)
    if action in {"keyframe_render", "video_generate"} and not paid_call_enqueued:
        return f"{summary}。已记录确认，后续执行器接入后再创建付费任务。"
    return f"{summary}。"


def _progress_for_canvas_action(action: str) -> int:
    """给画布链路动作映射粗粒度项目进度。"""
    return {
        "script_parsed": 10,
        "assets_ready": 25,
        "storyboard_ready": 40,
        "shotlist_text_ready": 55,
        "keyframe_render": 70,
        "shotlist_render_ready": 82,
        "video_generate": 95,
    }.get(action, 5)
