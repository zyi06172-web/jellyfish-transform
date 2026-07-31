"""Project CRUD。"""

from __future__ import annotations

import json
import logging
import os
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.utils import apply_keyword_filter, apply_order, paginate
from app.dependencies import get_db
from app.models.studio import (
    AgentAction,
    AgentArtifact,
    AgentCheckpoint,
    AgentMessage,
    AgentSession,
    Chapter,
    Project,
    Shot,
    ShotDetail,
    ShotFrameImage,
)
from app.models.task import GenerationDeliveryMode, GenerationTask, GenerationTaskStatus
from app.models.task_links import GenerationTaskLink
from app.models.types import (
    AgentActionStatus,
    AgentActionType,
    AgentArtifactKind,
    AgentArtifactStatus,
    AgentCheckpointStatus,
    CameraAngle,
    CameraMovement,
    CameraShotType,
    ChapterStatus,
    AgentMessageKind,
    AgentMessageRole,
    AgentSessionStage,
    AgentSessionStatus,
    ShotFrameType,
    ShotStatus,
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
from app.services.llm import build_default_text_llm
from app.services.studio.agent.db_repository import DbAgentRepository
from app.services.studio.agent.element_regeneration import regenerate_element_image
from app.services.studio.agent.turn_decision_llm import LLMAgentTurnDecisionLLM
from app.services.studio.agent.types import AgentTurnCommand, AgentTurnInput
from app.services.studio.agent.video_creation_agent import VideoCreationAgent
from app.services.studio.asset_library import build_project_asset_library
from app.services.studio.entity_thumbnails import download_url
from app.services.studio.image_task_runner import create_image_task_and_link
from app.services.film.generated_video import build_run_args

router = APIRouter()
logger = logging.getLogger(__name__)

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
    background_tasks: BackgroundTasks,
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
    current_session = await db.get(AgentSession, body.session_id)
    decision_llm = None
    if body.input.type == "text" and body.input.text.strip() and current_session is not None:
        if current_session.current_stage == AgentSessionStage.intake:
            decision_llm = LLMAgentTurnDecisionLLM(None)
        else:
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
        if os.getenv("NUWA_AGENT_CHAIN_DIRECT", "").strip() == "1":
            from app.services.studio.agent.auto_elements_chain import run_agent_auto_elements_chain

            background_tasks.add_task(
                run_agent_auto_elements_chain,
                project_id=project_id,
                session_id=body.session_id,
                idempotency_key=body.idempotency_key,
            )
        else:
            from app.tasks.agent_workflow import enqueue_agent_auto_elements_chain

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
                session_id=body.session_id,
                raw_script=str(action.input.get("raw_script") or body.input.text or ""),
                action_idempotency_key=(
                    f"{body.idempotency_key}:{action.action_type.value}:{action.target_type}:{action.target_id}:{index}"
                ),
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
    paid_payload: dict = {}
    paid_call_enqueued = False
    if body.action == "keyframe_render":
        paid_payload = await _enqueue_canvas_keyframes(
            db,
            project=project,
            idempotency_key=body.idempotency_key,
            model=body.model,
            aspect_ratio=str(body.payload.get("aspect_ratio") or project.default_video_ratio or "16:9"),
            seed=int((body.payload or {}).get("seed") or project.seed or 0),
        )
        paid_call_enqueued = True
    elif body.action == "video_generate":
        paid_payload = await _enqueue_or_dryrun_canvas_video(
            db,
            project=project,
            idempotency_key=body.idempotency_key,
            model=body.model,
            aspect_ratio=str(body.payload.get("aspect_ratio") or project.default_video_ratio or "16:9"),
        )
        paid_call_enqueued = bool(paid_payload.get("paid_call_enqueued"))

    normalized_payload = {**body.payload, **paid_payload}
    if body.action == "shotlist_text_ready":
        normalized_payload = {**normalized_payload, "rows": await _build_canvas_shotlist_rows(db, project_id=project_id)}
    elif body.action == "shotlist_render_ready":
        normalized_payload = {**normalized_payload, "rows": await _build_canvas_render_rows(db, project_id=project_id)}
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
        payload=normalized_payload,
        paid_call_enqueued=paid_call_enqueued,
    )
    await db.commit()
    return created_response(
        ProjectCanvasActionRead(
            project_id=project_id,
            session_id=session.id,
            stage=stage.value,
            status=AgentSessionStatus.waiting_user.value,
            artifact_id=artifact_id,
            paid_call_enqueued=paid_call_enqueued,
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


async def _persist_intake_script(
    db: AsyncSession,
    *,
    project_id: str,
    session_id: str,
    raw_script: str,
    action_idempotency_key: str,
) -> None:
    """把画布对话框贴入的剧本落库，并创建进入严格解析链路的确认点。"""
    script = raw_script.strip()
    if not script:
        return
    project = await db.get(Project, project_id)
    session = await db.get(AgentSession, session_id)
    if project is None or session is None or session.project_id != project_id:
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
    await _mark_agent_action_succeeded(
        db,
        session_id=session.id,
        idempotency_key=action_idempotency_key,
        output={"script_artifact_id": artifact.id, "stage": AgentSessionStage.spec_review.value},
    )
    await _supersede_pending_checkpoints(db, session_id=session.id)
    message = AgentMessage(
        id=f"agent_message_{uuid.uuid4().hex}",
        session_id=session.id,
        sequence=int(await db.scalar(select(func.max(AgentMessage.sequence)).where(AgentMessage.session_id == session.id)) or 0) + 1,
        role=AgentMessageRole.assistant,
        kind=AgentMessageKind.question_card,
        content="已收到剧本。确认后我会调用现有 script_divider_agent 严格按原文拆分镜，并继续提取人物、场景、道具资产与手绘故事板。",
        payload={"stage": AgentSessionStage.spec_review.value, "script_artifact_id": artifact.id},
    )
    db.add(message)
    await db.flush()
    db.add(
        AgentCheckpoint(
            id=f"agent_checkpoint_{uuid.uuid4().hex}",
            session_id=session.id,
            stage=AgentSessionStage.spec_review,
            status=AgentCheckpointStatus.pending,
            question="确认进入正式解析与资产生成流程？",
            options=[
                {
                    "id": "confirm-script-and-start",
                    "label": "确认，开始解析",
                    "effect": "confirm_and_advance",
                    "payload": {"script_artifact_id": artifact.id},
                },
                {
                    "id": "revise-script",
                    "label": "我再补充剧本",
                    "effect": "stay_and_collect_feedback",
                    "payload": {"script_artifact_id": artifact.id},
                },
            ],
            message_id=message.id,
        )
    )
    state = session.state or {}
    completed = set(state.get("completed_stages") or [])
    completed.add(AgentSessionStage.intake.value)
    session.current_stage = AgentSessionStage.spec_review
    session.status = AgentSessionStatus.waiting_user
    session.revision += 1
    session.state = {
        **state,
        "completed_stages": sorted(completed),
        "script_artifact_id": artifact.id,
        "pending_stage": AgentSessionStage.spec_review.value,
    }
    await db.commit()


async def _mark_agent_action_succeeded(
    db: AsyncSession,
    *,
    session_id: str,
    idempotency_key: str,
    output: dict,
) -> None:
    """把同步完成的 Agent 动作收口，避免后续 turn 被 running guard 误拦。"""
    action = (
        await db.execute(
            select(AgentAction)
            .where(
                AgentAction.session_id == session_id,
                AgentAction.idempotency_key == idempotency_key,
            )
            .limit(1)
        )
    ).scalars().first()
    if action is None:
        return
    action.status = AgentActionStatus.succeeded
    action.output = output


async def _supersede_pending_checkpoints(db: AsyncSession, *, session_id: str) -> None:
    """作废旧问题卡，保证 AgentDock 每次只响应最新确认点。"""
    rows = (
        await db.execute(
            select(AgentCheckpoint).where(
                AgentCheckpoint.session_id == session_id,
                AgentCheckpoint.status == AgentCheckpointStatus.pending,
            )
        )
    ).scalars().all()
    for row in rows:
        row.status = AgentCheckpointStatus.superseded


async def _first_project_chapter(db: AsyncSession, *, project: Project) -> Chapter:
    """读取或创建画布默认章节，供第6批画布任务挂载 shot/task。"""
    chapter = (
        await db.execute(
            select(Chapter).where(Chapter.project_id == project.id).order_by(Chapter.index.asc()).limit(1)
        )
    ).scalars().first()
    if chapter is not None:
        return chapter
    chapter = Chapter(
        id=f"chapter_{uuid.uuid4().hex}",
        project_id=project.id,
        index=1,
        title="第 1 章",
        summary="画布自动创建的默认章节。",
        raw_text=project.description or "",
        condensed_text=project.description or "",
        storyboard_count=0,
        status=ChapterStatus.draft,
    )
    db.add(chapter)
    await db.flush()
    return chapter


async def _ensure_canvas_keyframe_slots(db: AsyncSession, *, project: Project) -> list[tuple[Shot, ShotDetail, ShotFrameImage]]:
    """确保 5 秒画布存在 5 个 shot 与 key frame image slot。"""
    chapter = await _first_project_chapter(db, project=project)
    shots = (
        await db.execute(select(Shot).where(Shot.chapter_id == chapter.id).order_by(Shot.index.asc()).limit(5))
    ).scalars().all()
    existing_indices = {shot.index for shot in shots}
    for index in range(1, 6):
        if index in existing_indices:
            continue
        shot = Shot(
            id=f"shot_{uuid.uuid4().hex}",
            chapter_id=chapter.id,
            index=index,
            title=f"格 {index}",
            thumbnail="",
            status=ShotStatus.ready,
            skip_extraction=True,
            script_excerpt=f"画布关键帧第 {index} 格",
        )
        db.add(shot)
        shots.append(shot)
    await db.flush()
    shots = sorted(shots, key=lambda item: item.index)[:5]

    result: list[tuple[Shot, ShotDetail, ShotFrameImage]] = []
    for shot in shots:
        detail = await db.get(ShotDetail, shot.id)
        if detail is None:
            detail = ShotDetail(
                id=shot.id,
                camera_shot=CameraShotType.ms,
                angle=CameraAngle.eye_level,
                movement=CameraMovement.static,
                duration=1,
                override_video_ratio=None,
                mood_tags=[],
                atmosphere="",
                follow_atmosphere=True,
                has_bgm=False,
                description=shot.script_excerpt or shot.title,
                action_beats=[shot.script_excerpt or shot.title],
                first_frame_prompt="",
                last_frame_prompt="",
                key_frame_prompt=shot.script_excerpt or shot.title,
            )
            db.add(detail)
            await db.flush()
        frame = (
            await db.execute(
                select(ShotFrameImage)
                .where(ShotFrameImage.shot_detail_id == shot.id, ShotFrameImage.frame_type == ShotFrameType.key)
                .limit(1)
            )
        ).scalars().first()
        if frame is None:
            frame = ShotFrameImage(shot_detail_id=shot.id, frame_type=ShotFrameType.key, file_id=None, format="png")
            db.add(frame)
            await db.flush()
        result.append((shot, detail, frame))
    return result


async def _paid_image_call_count(db: AsyncSession, *, project_id: str) -> int:
    """按 keyframe artifact 统计画布已确认的真实生图调用数，供预算硬闸使用。"""
    rows = (
        await db.execute(
            select(AgentArtifact).where(
                AgentArtifact.project_id == project_id,
                AgentArtifact.kind == AgentArtifactKind.keyframe,
            )
        )
    ).scalars().all()
    total = 0
    for row in rows:
        frames = (row.content_json or {}).get("frames")
        if isinstance(frames, list):
            total += len(frames)
    return total


async def _enqueue_canvas_keyframes(
    db: AsyncSession,
    *,
    project: Project,
    idempotency_key: str,
    model: str,
    aspect_ratio: str,
    seed: int,
) -> dict:
    """确认成本后创建 5 个关键帧图片任务；未确认路径不会调用这里。"""
    cap_text = os.getenv("NUWA_PAID_IMAGE_CALL_CAP", "").strip()
    if cap_text:
        try:
            cap = int(cap_text)
        except ValueError as exc:
            raise HTTPException(status_code=500, detail="NUWA_PAID_IMAGE_CALL_CAP must be an integer") from exc
        current = await _paid_image_call_count(db, project_id=project.id)
        if current + 5 > cap:
            raise HTTPException(status_code=402, detail=f"paid image call cap exceeded: current={current}, requested=5, cap={cap}")

    slots = await _ensure_canvas_keyframe_slots(db, project=project)
    frames: list[dict] = []
    for panel_index, (shot, detail, frame) in enumerate(slots, start=1):
        prompt = (detail.key_frame_prompt or detail.description or shot.script_excerpt or shot.title).strip()
        task_id = await create_image_task_and_link(
            db=db,
            model_id=None,
            relation_type="shot_frame_image",
            relation_entity_id=str(frame.id),
            prompt=prompt,
            target_ratio=aspect_ratio,
            resolution_profile="standard",
            purpose="video_reference",
            render_context={
                "agent_workflow": "phase6_canvas_keyframes",
                "canvas_action": "keyframe_render",
                "idempotency_key": idempotency_key,
                "panel_index": panel_index,
                "shot_id": shot.id,
                "seed": seed,
                "model_label": model,
            },
            enqueue=True,
        )
        frames.append({
            "panel_index": panel_index,
            "shot_id": shot.id,
            "shot_frame_image_id": frame.id,
            "task_id": task_id,
            "status": "loading",
            "seed": seed,
            "prompt": prompt,
        })
    logger.info(
        "Nuwa canvas keyframe tasks enqueued: project_id=%s count=%s model=%s ratio=%s seed=%s task_ids=%s",
        project.id,
        len(frames),
        model,
        aspect_ratio,
        seed,
        [item["task_id"] for item in frames],
    )
    return {
        "aspect_ratio": aspect_ratio,
        "seed": seed,
        "frames": frames,
        "paid_image_call_count": len(frames),
    }


async def _latest_artifact(db: AsyncSession, *, project_id: str, kind: AgentArtifactKind) -> AgentArtifact | None:
    """读取项目内某类 artifact 的最新版本。"""
    return (
        await db.execute(
            select(AgentArtifact)
            .where(AgentArtifact.project_id == project_id, AgentArtifact.kind == kind)
            .order_by(AgentArtifact.version.desc())
            .limit(1)
        )
    ).scalars().first()


def _storyboard_panels_from_content(content: dict) -> list[dict]:
    """把 storyboard artifact 归一化为前 5 个格子的结构数据。"""
    pages = content.get("pages")
    if isinstance(pages, list) and pages:
        page = pages[-1] if isinstance(pages[-1], dict) else {}
        panels = page.get("panels")
        if isinstance(panels, list):
            return [item for item in panels if isinstance(item, dict) and not item.get("is_blank")][:5]
    for key in ("shots", "shot_divisions", "items", "storyboard"):
        rows = content.get(key)
        if isinstance(rows, list):
            return [item for item in rows if isinstance(item, dict)][:5]
    return []


def _motion_design_for_row(row: dict) -> dict:
    """把视频提示词公式需要的 6 项运动设计落成结构字段。"""
    summary = str(row.get("one_sentence_summary") or row.get("visible_summary") or row.get("summary") or row.get("title") or "")
    beats = row.get("action_beats") if isinstance(row.get("action_beats"), list) else []
    route = " → ".join(str(item) for item in beats) or summary or "按当前格动作推进"
    subject = row.get("subject")
    subject_text = str(subject.get("value") if isinstance(subject, dict) else subject or "主体")
    return {
        "follow_subject": subject_text,
        "route": route,
        "spatial_explanation": str(row.get("composition_anchor") or row.get("camera") or "保持项目比例内的清晰空间关系"),
        "relationship_change": str(row.get("relationship_change") or "主体关系按动作节拍变化"),
        "pause_point": str(row.get("pause_point") or "动作完成处短暂停顿"),
        "ending_information": str(row.get("ending_information") or summary or "释放本格结果信息"),
    }


async def _build_canvas_shotlist_rows(db: AsyncSession, *, project_id: str) -> list[dict]:
    """从 storyboard artifact 构造免费预审分镜表行；六要素只进结构数据。"""
    artifact = await _latest_artifact(db, project_id=project_id, kind=AgentArtifactKind.storyboard)
    panels = _storyboard_panels_from_content(artifact.content_json or {}) if artifact is not None else []
    if not panels:
        panels = [{"index": index, "one_sentence_summary": f"格 {index}"} for index in range(1, 6)]
    rows: list[dict] = []
    for index, panel in enumerate(panels[:5], start=1):
        six = panel.get("six_elements_for_video_model") or panel.get("six_elements")
        beats = panel.get("action_beats") if isinstance(panel.get("action_beats"), list) else []
        rows.append({
            "panel_index": int(panel.get("index") or panel.get("shot_index") or index),
            "one_sentence_summary": str(panel.get("one_sentence_summary") or panel.get("visible_summary") or panel.get("summary") or panel.get("title") or f"格 {index}"),
            "six_elements_for_video_model": six if isinstance(six, dict) else {},
            "emotion": str(panel.get("emotion") or "待审"),
            "action_beats": [str(item) for item in beats],
            "motion_design": _motion_design_for_row(panel),
        })
    return rows


def _image_url_from_task_result(result: object) -> str | None:
    """从生成任务结果中读取供应商返回的图片 URL，供本地无 S3 时继续引用同源图。"""
    payload = _json_value(result, {}) if result is not None else {}
    if not isinstance(payload, dict):
        return None
    images = payload.get("images")
    if isinstance(images, list):
        for image in images:
            if isinstance(image, dict) and image.get("url"):
                return str(image["url"])
    if payload.get("url"):
        return str(payload["url"])
    return None


async def _file_url_for_task(db: AsyncSession, *, task_id: str) -> str | None:
    """读取同一生成任务产物 URL；优先文件库，缺文件时回退到任务结果里的供应商 URL。"""
    link = (
        await db.execute(
            select(GenerationTaskLink)
            .where(GenerationTaskLink.task_id == task_id, GenerationTaskLink.file_id.is_not(None))
            .limit(1)
        )
    ).scalars().first()
    if link is not None and link.file_id:
        return download_url(link.file_id)
    task = await db.get(GenerationTask, task_id)
    return _image_url_from_task_result(task.result) if task is not None else None


async def _build_canvas_render_rows(db: AsyncSession, *, project_id: str) -> list[dict]:
    """用同一批 keyframe task/file 构造渲染版分镜表，禁止二次生图。"""
    text_rows = await _build_canvas_shotlist_rows(db, project_id=project_id)
    keyframe = await _latest_artifact(db, project_id=project_id, kind=AgentArtifactKind.keyframe)
    frame_by_panel: dict[int, dict] = {}
    for frame in (keyframe.content_json or {}).get("frames", []) if keyframe is not None else []:
        if isinstance(frame, dict):
            frame_by_panel[int(frame.get("panel_index") or 0)] = frame
    rows: list[dict] = []
    for row in text_rows[:5]:
        panel_index = int(row.get("panel_index") or len(rows) + 1)
        frame = frame_by_panel.get(panel_index, {})
        frame_url = await _file_url_for_task(db, task_id=str(frame.get("task_id") or "")) if frame.get("task_id") else None
        six = row.get("six_elements_for_video_model") if isinstance(row.get("six_elements_for_video_model"), dict) else {}
        rows.append({
            "panel_index": panel_index,
            "frame_url": frame_url,
            "task_id": frame.get("task_id"),
            "movement": str(six.get("movement") or six.get("camera_movement") or "待审"),
            "camera_shot": str(six.get("camera_shot") or six.get("shot_type") or "待审"),
            "emotion": row.get("emotion") or "待审",
            "action_beats": row.get("action_beats") if isinstance(row.get("action_beats"), list) else [],
            "atmosphere": str(six.get("lighting") or six.get("atmosphere") or "待审"),
        })
    return rows


async def _enqueue_or_dryrun_canvas_video(
    db: AsyncSession,
    *,
    project: Project,
    idempotency_key: str,
    model: str,
    aspect_ratio: str,
) -> dict:
    """确认成本后创建视频任务；默认 dry-run 只写日志和模拟成功任务。"""
    slots = await _ensure_canvas_keyframe_slots(db, project=project)
    shot = slots[0][0]
    render_rows = await _build_canvas_render_rows(db, project_id=project.id)
    first_row = render_rows[0] if render_rows else {}
    prompt = "；".join(
        [
            str(first_row.get("emotion") or ""),
            " → ".join(str(item) for item in first_row.get("action_beats") or []),
            str(first_row.get("movement") or ""),
            str(first_row.get("camera_shot") or ""),
        ]
    ).strip("；") or "按渲染版分镜表生成视频"
    images: list[str] = []
    keyframe_artifact = await _latest_artifact(db, project_id=project.id, kind=AgentArtifactKind.keyframe)
    keyframe_frames = (keyframe_artifact.content_json or {}).get("frames", []) if keyframe_artifact is not None else []
    for frame in keyframe_frames:
        if isinstance(frame, dict) and frame.get("task_id"):
            url = await _file_url_for_task(db, task_id=str(frame.get("task_id")))
            if url:
                images.append(url)

    request_payload = {
        "model": model or "Seedance 2.0",
        "prompt": prompt,
        "keyframe_image_urls": images[:5],
        "ratio": aspect_ratio,
        "resolution": "720p",
        "duration": 5,
        "shot_index": 1,
        "shot_id": shot.id,
    }
    dryrun = os.getenv("NUWA_VIDEO_DRYRUN", "1").strip() != "0"
    if dryrun:
        task_id = f"task_{uuid.uuid4().hex}"
        task = GenerationTask(
            id=task_id,
            mode=GenerationDeliveryMode.async_polling,
            task_kind="video_generation",
            status=GenerationTaskStatus.succeeded,
            progress=100,
            payload={"dryrun": True, "run_args": request_payload},
            result={
                "dryrun": True,
                "url": "/nuwa-video-dryrun.mp4",
                "provider": "volcengine",
                "status": "succeeded",
                "usage": {"model": model or "Seedance 2.0", "estimated_cny": 0},
            },
            error="",
        )
        db.add(task)
        db.add(GenerationTaskLink(task_id=task_id, resource_type="video", relation_type="video", relation_entity_id=shot.id))
        await db.flush()
        logger.info("NUWA_VIDEO_DRYRUN request=%s", json.dumps(request_payload, ensure_ascii=False))
        return {
            "paid_call_enqueued": False,
            "dryrun": True,
            "videos": [{
                "shot_index": 1,
                "shot_id": shot.id,
                "task_id": task_id,
                "url": "/nuwa-video-dryrun.mp4",
                "duration": 5,
                "resolution": "720P",
                "aspect_ratio": aspect_ratio,
                "prompt_used": prompt,
            }],
            "dryrun_request": request_payload,
        }

    run_args = await build_run_args(
        db,
        shot_id=shot.id,
        reference_mode="text_only",
        prompt=prompt,
        images=[],
        ratio=aspect_ratio,
    )
    task_id = f"task_{uuid.uuid4().hex}"
    db.add(
        GenerationTask(
            id=task_id,
            mode=GenerationDeliveryMode.async_polling,
            task_kind="video_generation",
            status=GenerationTaskStatus.pending,
            progress=0,
            payload={"run_args": run_args},
            result=None,
            error="",
        )
    )
    db.add(GenerationTaskLink(task_id=task_id, resource_type="video", relation_type="video", relation_entity_id=shot.id))
    await db.flush()
    from app.tasks.execute_task import enqueue_task_execution

    enqueue_task_execution(task_id)
    return {"paid_call_enqueued": True, "dryrun": False, "videos": [{"shot_index": 1, "shot_id": shot.id, "task_id": task_id}]}


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
        "shotlist_text_ready": AgentSessionStage.storyboard,
        "keyframe_render": AgentSessionStage.shot_video,
        "shotlist_render_ready": AgentSessionStage.shot_video,
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
