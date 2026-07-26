"""Project CRUD。"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.utils import apply_keyword_filter, apply_order, paginate
from app.dependencies import get_db
from app.models.studio import Project
from app.models.types import AgentActionType, AgentSessionStage, ProjectStyle, ProjectVisualStyle
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

router = APIRouter()

PROJECT_ORDER_FIELDS = {"name", "created_at", "updated_at", "progress"}


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
