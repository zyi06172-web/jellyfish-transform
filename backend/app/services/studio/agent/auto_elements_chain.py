from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date, datetime
from enum import Enum
from typing import Any, Literal

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import async_session_maker
from app.models.studio import (
    AgentAction,
    AgentArtifact,
    AgentCheckpoint,
    AgentMessage,
    AgentSession,
    Chapter,
    Character,
    Costume,
    CostumeImage,
    Project,
    ProjectCostumeLink,
    ProjectPropLink,
    ProjectSceneLink,
    Prop,
    PropImage,
    Scene,
    SceneImage,
    Shot,
)
from app.models.task import GenerationTask, GenerationTaskStatus
from app.models.types import (
    AgentActionStatus,
    AgentActionType,
    AgentArtifactKind,
    AgentArtifactStatus,
    AgentCheckpointStatus,
    AgentMessageKind,
    AgentMessageRole,
    AgentSessionStage,
    AgentSessionStatus,
    AssetQualityLevel,
    AssetViewAngle,
    ChapterStatus,
)
from app.services.llm.resolver import build_default_text_llm
from app.services.script_processing_tasks import (
    SCRIPT_DIVIDE_TASK_KIND,
    SCRIPT_EXTRACT_TASK_KIND,
    create_divide_task,
    create_extract_task,
)
from app.services.studio.agent.prompt_synthesizer import (
    ElementBible,
    FinalVideoSpec,
    ImagePromptRequest,
    PromptSynthesizer,
)
from app.services.studio.candidate_auto_confirm import auto_confirm_chapter_candidates
from app.services.studio.image_task_runner import create_image_task_and_link, run_image_generation_task
from app.services.worker.task_registry import task_executor_registry


logger = logging.getLogger(__name__)

ElementKind = Literal["character", "scene", "prop"]


@dataclass(slots=True)
class ElementImageTarget:
    kind: ElementKind
    entity_id: str
    name: str
    description: str
    relation_type: str
    relation_entity_id: str


@dataclass(slots=True)
class AutoElementsServices:
    run_task: Callable[[AsyncSession, str, str], Awaitable[None] | None]
    auto_confirm_l3: Callable[[AsyncSession, str], Awaitable[Any]]
    synthesize_prompt: Callable[[AsyncSession, ImagePromptRequest], Awaitable[str]]
    create_image_task: Callable[[AsyncSession, ElementImageTarget, str], Awaitable[str]]


def default_auto_elements_services() -> AutoElementsServices:
    return AutoElementsServices(
        run_task=_run_registered_task,
        auto_confirm_l3=_auto_confirm_l3,
        synthesize_prompt=_synthesize_prompt,
        create_image_task=_create_and_run_image_task,
    )


async def run_agent_auto_elements_chain(
    *,
    project_id: str,
    session_id: str,
    idempotency_key: str,
    services: AutoElementsServices | None = None,
) -> None:
    """规格确认后的自动链：拆分镜 -> 提取 -> L3 -> 提示词合成 -> 出图。"""

    services = services or default_auto_elements_services()
    async with async_session_maker() as db:
        await execute_agent_auto_elements_chain(
            db,
            project_id=project_id,
            session_id=session_id,
            idempotency_key=idempotency_key,
            services=services,
        )
        await db.commit()


async def execute_agent_auto_elements_chain(
    db: AsyncSession,
    *,
    project_id: str,
    session_id: str,
    idempotency_key: str,
    services: AutoElementsServices | None = None,
) -> None:
    services = services or default_auto_elements_services()
    session = await db.get(AgentSession, session_id)
    project = await db.get(Project, project_id)
    if session is None or project is None or session.project_id != project_id:
        return
    if await _chain_action_exists(db, session_id=session_id, idempotency_key=idempotency_key):
        return

    chain_action = await _create_action(
        db,
        session=session,
        action_type=AgentActionType.divide_shots,
        target_type="project",
        target_id=project_id,
        idempotency_key=f"{idempotency_key}:auto_chain",
        input_payload={"phase": "phase6_auto_elements_chain"},
    )
    await _set_session_running(session, stage=AgentSessionStage.storyboard)
    await _append_task_update(db, session_id=session_id, content="规格已确认，开始自动拆分镜。", payload={"stage": "storyboard"})
    await db.commit()
    chain_action_id = chain_action.id

    try:
        chapter = await _ensure_source_chapter(db, project=project)
        script_text = _chapter_script_text(chapter, project=project)

        if await _chapter_has_shots(db, chapter_id=chapter.id):
            divide_result = await _load_storyboard_artifact(db, project_id=project_id)
            divide_task_id = "reused_storyboard_artifact"
            await _create_action(
                db,
                session=session,
                action_type=AgentActionType.divide_shots,
                target_type="chapter",
                target_id=chapter.id,
                idempotency_key=f"{idempotency_key}:divide:{chapter.id}",
                input_payload={"task_id": divide_task_id, "write_to_db": False, "source": "storyboard_artifact"},
                output_payload={"status": "reused", "artifact_kind": AgentArtifactKind.storyboard.value},
            )
        else:
            divide = await create_divide_task(db, chapter_id=chapter.id, script_text=script_text, write_to_db=True)
            divide_task_id = divide.task_id
            await _create_action(
                db,
                session=session,
                action_type=AgentActionType.divide_shots,
                target_type="chapter",
                target_id=chapter.id,
                idempotency_key=f"{idempotency_key}:divide:{chapter.id}",
                input_payload={"task_id": divide.task_id, "write_to_db": True},
            )
            await db.commit()
            await _maybe_await(services.run_task(db, SCRIPT_DIVIDE_TASK_KIND, divide.task_id))
            divide_result = await _task_result_or_raise(db, divide.task_id, task_label="DeepSeek 拆分镜")
            await _upsert_storyboard_artifact(db, project_id=project_id, result=divide_result)
        await _complete_stage(db, session, AgentSessionStage.storyboard)
        await _append_task_update(
            db,
            session_id=session_id,
            content="DeepSeek 拆分镜完成。",
            payload={"stage": "storyboard", "task_id": divide_task_id, "status_code": 200},
        )
        logger.info("Agent auto chain: DeepSeek 拆分镜 200 task_id=%s chapter_id=%s", divide_task_id, chapter.id)
        await db.commit()

        await _advance_stage(session, AgentSessionStage.extract)
        extract = await create_extract_task(
            db,
            project_id=project_id,
            chapter_id=chapter.id,
            script_division=divide_result,
            consistency=None,
            refresh_cache=True,
        )
        await _create_action(
            db,
            session=session,
            action_type=AgentActionType.extract_assets,
            target_type="chapter",
            target_id=chapter.id,
            idempotency_key=f"{idempotency_key}:extract:{chapter.id}",
            input_payload={"task_id": extract.task_id},
        )
        await db.commit()
        await _maybe_await(services.run_task(db, SCRIPT_EXTRACT_TASK_KIND, extract.task_id))
        await _task_result_or_raise(db, extract.task_id, task_label="DeepSeek 逐镜头提取")
        await _complete_stage(db, session, AgentSessionStage.extract)
        await _append_task_update(
            db,
            session_id=session_id,
            content="DeepSeek 逐镜头提取完成。",
            payload={"stage": "extract", "task_id": extract.task_id, "status_code": 200},
        )
        logger.info("Agent auto chain: DeepSeek 逐镜头提取 200 task_id=%s chapter_id=%s", extract.task_id, chapter.id)
        await db.commit()

        await _advance_stage(session, AgentSessionStage.auto_confirm)
        l3_result = await services.auto_confirm_l3(db, chapter.id)
        await _create_action(
            db,
            session=session,
            action_type=AgentActionType.auto_confirm,
            target_type="chapter",
            target_id=chapter.id,
            idempotency_key=f"{idempotency_key}:l3:{chapter.id}",
            input_payload={"level": "L3"},
            output_payload=_model_dump(l3_result),
        )
        await _complete_stage(db, session, AgentSessionStage.auto_confirm)
        await _append_task_update(
            db,
            session_id=session_id,
            content="L3 跨镜头资产关联完成。",
            payload={"stage": "auto_confirm", "status_code": 200, "result": _model_dump(l3_result)},
        )
        logger.info("Agent auto chain: L3 自动关联 200 chapter_id=%s", chapter.id)
        await db.commit()

        await _advance_stage(session, AgentSessionStage.elements_gen)
        targets = await _collect_element_image_targets(db, project_id=project_id)
        spec = await _final_video_spec(db, project=project)
        image_task_ids: list[str] = []
        for target in targets:
            request = _image_prompt_request(spec=spec, target=target)
            prompt = await services.synthesize_prompt(db, request)
            await _create_action(
                db,
                session=session,
                action_type=AgentActionType.synthesize_prompt,
                target_type=target.kind,
                target_id=target.entity_id,
                idempotency_key=f"{idempotency_key}:prompt:{target.kind}:{target.entity_id}",
                input_payload={"prompt_request": request.element.__dict__},
                output_payload={"prompt": prompt},
            )
            await _append_task_update(
                db,
                session_id=session_id,
                content=f"{target.name} 的图片提示词合成完成。",
                payload={"stage": "elements_gen", "element_kind": target.kind, "element_id": target.entity_id},
            )
            await db.commit()

            image_task_id = await services.create_image_task(db, target, prompt)
            image_task_ids.append(image_task_id)
            await _create_action(
                db,
                session=session,
                action_type=AgentActionType.generate_element_image,
                target_type=target.kind,
                target_id=target.entity_id,
                idempotency_key=f"{idempotency_key}:image:{target.kind}:{target.entity_id}",
                input_payload={"task_id": image_task_id, "target_ratio": "9:16", "model_category": "image"},
                output_payload={"task_id": image_task_id, "target_ratio": "9:16"},
                task_id=image_task_id,
            )
            await _append_task_update(
                db,
                session_id=session_id,
                content=f"{target.name} 的 9:16 关键元素图生成完成。",
                payload={
                    "stage": "elements_gen",
                    "task_id": image_task_id,
                    "element_kind": target.kind,
                    "element_id": target.entity_id,
                    "target_ratio": "9:16",
                    "status_code": 200,
                },
            )
            logger.info(
                "Agent auto chain: Seedream 出图 200 task_id=%s element=%s/%s target_ratio=9:16",
                image_task_id,
                target.kind,
                target.entity_id,
            )
            await db.commit()

        await _complete_stage(db, session, AgentSessionStage.elements_gen)
        await _finish_at_elements_review(db, session, image_task_ids=image_task_ids)
        chain_action.status = AgentActionStatus.succeeded
        chain_action.output = _json_safe({"chapter_id": chapter.id, "image_task_ids": image_task_ids, "target_ratio": "9:16"})
        logger.info(
            "一次确认→自动依次调 DeepSeek 拆分镜 + Seedream 出图，均 200: project_id=%s session_id=%s image_count=%s",
            project_id,
            session_id,
            len(image_task_ids),
        )
        await db.flush()
    except Exception as exc:  # noqa: BLE001
        await db.rollback()
        failed_action = await db.get(AgentAction, chain_action_id)
        failed_session = await db.get(AgentSession, session_id)
        if failed_action is not None:
            failed_action.status = AgentActionStatus.failed
            failed_action.error = str(exc)
        if failed_session is not None:
            failed_session.status = AgentSessionStatus.failed
        await _append_task_update(
            db,
            session_id=session_id,
            content=f"自动出图链失败：{exc}",
            payload={"stage": str(failed_session.current_stage) if failed_session is not None else "", "error": str(exc)},
        )
        logger.exception("Agent auto elements chain failed: project_id=%s session_id=%s", project_id, session_id)
        await db.commit()
        raise


async def _synthesize_prompt(db: AsyncSession, request: ImagePromptRequest) -> str:
    llm = await asyncio.wait_for(build_default_text_llm(db, thinking=False), timeout=15)
    result = await PromptSynthesizer(_DeepSeekPromptSynthesisLLM(llm)).synthesize_image_prompt(request)
    return result.prompt


class _DeepSeekPromptSynthesisLLM:
    def __init__(self, llm: Any) -> None:
        self._llm = llm

    async def synthesize_image_prompt(self, request: dict[str, Any]) -> str:
        messages = [
            SystemMessage(
                content=(
                    "你是 Flova 提示词合成器。把角色圣经/元素定义、电影级规则和用户自然语言"
                    "融合成一段自然流畅的中文图片提示词。不要分标签段落，不要解释规则。"
                )
            ),
            HumanMessage(content=str(request)),
        ]
        response = await asyncio.wait_for(self._llm.ainvoke(messages), timeout=60)
        content = getattr(response, "content", response)
        return content if isinstance(content, str) else str(content)


def _run_registered_task(db: AsyncSession, task_kind: str, task_id: str) -> None:  # noqa: ARG001
    task_executor_registry.resolve(task_kind).run(task_id)


async def _maybe_await(value: Awaitable[None] | None) -> None:
    if value is not None:
        await value


async def _auto_confirm_l3(db: AsyncSession, chapter_id: str) -> Any:
    return await auto_confirm_chapter_candidates(db, chapter_id=chapter_id, level="L3")


async def _create_and_run_image_task(db: AsyncSession, target: ElementImageTarget, prompt: str) -> str:
    task_id = await create_image_task_and_link(
        db=db,
        model_id=None,
        relation_type=target.relation_type,
        relation_entity_id=target.relation_entity_id,
        prompt=prompt,
        target_ratio="9:16",
        resolution_profile="standard",
        purpose="asset_image",
        render_context={
            "agent_workflow": "phase6_auto_elements_chain",
            "element_kind": target.kind,
            "element_id": target.entity_id,
            "prompt_source": "prompt_synthesizer",
        },
        enqueue=False,
    )
    await db.commit()
    task = await db.get(GenerationTask, task_id)
    if task is None:
        raise RuntimeError(f"Image task not found: {task_id}")
    await db.refresh(task)
    run_args = dict((task.payload or {}).get("run_args") or {})
    await run_image_generation_task(task_id, run_args)
    await _task_result_or_raise(db, task_id, task_label="Seedream 出图")
    return task_id


async def _chain_action_exists(db: AsyncSession, *, session_id: str, idempotency_key: str) -> bool:
    stmt = select(AgentAction.id).where(
        AgentAction.session_id == session_id,
        AgentAction.idempotency_key == f"{idempotency_key}:auto_chain",
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def _create_action(
    db: AsyncSession,
    *,
    session: AgentSession,
    action_type: AgentActionType,
    target_type: str,
    target_id: str,
    idempotency_key: str,
    input_payload: dict[str, Any],
    output_payload: dict[str, Any] | None = None,
    task_id: str | None = None,
) -> AgentAction:
    existing = (
        await db.execute(select(AgentAction).where(AgentAction.idempotency_key == idempotency_key).limit(1))
    ).scalars().first()
    if existing is not None:
        return existing
    action = AgentAction(
        id=_new_id("agent_action"),
        session_id=session.id,
        project_id=session.project_id,
        action_type=action_type,
        target_type=target_type,
        target_id=target_id,
        idempotency_key=idempotency_key,
        status=AgentActionStatus.succeeded if output_payload is not None else AgentActionStatus.running,
        task_id=task_id,
        input=_json_safe(input_payload),
        output=_json_safe(output_payload) if output_payload is not None else None,
    )
    db.add(action)
    await db.flush()
    return action


async def _ensure_source_chapter(db: AsyncSession, *, project: Project) -> Chapter:
    existing = (
        await db.execute(select(Chapter).where(Chapter.project_id == project.id).order_by(Chapter.index.asc()).limit(1))
    ).scalars().first()
    if existing is not None:
        return existing
    source_prompt = str((project.stats or {}).get("source_prompt") or project.description or project.name).strip()
    chapter = Chapter(
        id=_new_id("chapter"),
        project_id=project.id,
        index=1,
        title=project.name[:120] or "第 1 章",
        summary=str((project.stats or {}).get("agent_summary_title") or project.name),
        raw_text=source_prompt,
        condensed_text=source_prompt,
        storyboard_count=0,
        status=ChapterStatus.draft,
    )
    db.add(chapter)
    await db.flush()
    return chapter


async def _chapter_has_shots(db: AsyncSession, *, chapter_id: str) -> bool:
    count = await db.scalar(select(func.count()).select_from(Shot).where(Shot.chapter_id == chapter_id))
    return int(count or 0) > 0


def _chapter_script_text(chapter: Chapter, *, project: Project) -> str:
    return (chapter.condensed_text or chapter.raw_text or project.description or project.name).strip()


async def _task_result_or_raise(db: AsyncSession, task_id: str, *, task_label: str) -> dict[str, Any]:
    task = await db.get(GenerationTask, task_id)
    if task is None:
        raise RuntimeError(f"{task_label} task not found: {task_id}")
    await db.refresh(task)
    status = task.status if isinstance(task.status, GenerationTaskStatus) else GenerationTaskStatus(str(task.status))
    if status != GenerationTaskStatus.succeeded:
        raise RuntimeError(f"{task_label} failed: {task.error or status.value}")
    result = task.result or {}
    if not isinstance(result, dict):
        raise RuntimeError(f"{task_label} result is not an object")
    return result


async def _collect_element_image_targets(db: AsyncSession, *, project_id: str) -> list[ElementImageTarget]:
    targets: list[ElementImageTarget] = []
    characters = (
        await db.execute(select(Character).where(Character.project_id == project_id).order_by(Character.id.asc()).limit(2))
    ).scalars().all()
    for item in characters:
        targets.append(
            ElementImageTarget(
                kind="character",
                entity_id=item.id,
                name=item.name,
                description=item.description,
                relation_type="character",
                relation_entity_id=item.id,
            )
        )

    if targets:
        return targets

    scene = (
        await db.execute(
            select(Scene)
            .join(ProjectSceneLink, ProjectSceneLink.scene_id == Scene.id)
            .where(ProjectSceneLink.project_id == project_id)
            .order_by(Scene.id.asc())
            .limit(1)
        )
    ).scalars().first()
    if scene is not None:
        row = await _ensure_image_slot(db, SceneImage, owner_field="scene_id", owner_id=scene.id)
        targets.append(_image_slot_target(kind="scene", entity=scene, image_row_id=row.id))

    prop = (
        await db.execute(
            select(Prop)
            .join(ProjectPropLink, ProjectPropLink.prop_id == Prop.id)
            .where(ProjectPropLink.project_id == project_id)
            .order_by(Prop.id.asc())
            .limit(1)
        )
    ).scalars().first()
    if prop is not None:
        row = await _ensure_image_slot(db, PropImage, owner_field="prop_id", owner_id=prop.id)
        targets.append(_image_slot_target(kind="prop", entity=prop, image_row_id=row.id))

    costume = (
        await db.execute(
            select(Costume)
            .join(ProjectCostumeLink, ProjectCostumeLink.costume_id == Costume.id)
            .where(ProjectCostumeLink.project_id == project_id)
            .order_by(Costume.id.asc())
            .limit(1)
        )
    ).scalars().first()
    if costume is not None:
        row = await _ensure_image_slot(db, CostumeImage, owner_field="costume_id", owner_id=costume.id)
        targets.append(_image_slot_target(kind="prop", entity=costume, image_row_id=row.id, relation_type="costume_image"))

    return targets


async def _ensure_image_slot(
    db: AsyncSession,
    model: type[SceneImage] | type[PropImage] | type[CostumeImage],
    *,
    owner_field: str,
    owner_id: str,
) -> SceneImage | PropImage | CostumeImage:
    owner_column = getattr(model, owner_field)
    existing = (
        await db.execute(
            select(model)
            .where(
                owner_column == owner_id,
                model.quality_level == AssetQualityLevel.low,
                model.view_angle == AssetViewAngle.front,
            )
            .order_by(model.id.asc())
            .limit(1)
        )
    ).scalars().first()
    if existing is not None:
        return existing
    row = model(
        **{
            owner_field: owner_id,
            "file_id": None,
            "quality_level": AssetQualityLevel.low,
            "view_angle": AssetViewAngle.front,
        }
    )
    db.add(row)
    await db.flush()
    return row


def _image_slot_target(
    *,
    kind: ElementKind,
    entity: Scene | Prop | Costume,
    image_row_id: int,
    relation_type: str | None = None,
) -> ElementImageTarget:
    return ElementImageTarget(
        kind=kind,
        entity_id=entity.id,
        name=entity.name,
        description=entity.description,
        relation_type=relation_type or f"{kind}_image",
        relation_entity_id=str(image_row_id),
    )


async def _final_video_spec(db: AsyncSession, *, project: Project) -> FinalVideoSpec:
    artifact = (
        await db.execute(
            select(AgentArtifact)
            .where(AgentArtifact.project_id == project.id, AgentArtifact.kind == AgentArtifactKind.story_summary)
            .order_by(AgentArtifact.version.desc())
            .limit(1)
        )
    ).scalars().first()
    raw = {}
    if artifact is not None:
        raw = dict((artifact.content_json or {}).get("final_video_spec") or {})
    raw = {**dict((project.stats or {}).get("final_video_spec") or {}), **raw}
    return FinalVideoSpec(
        title=str(raw.get("title") or project.name),
        output_language=str(raw.get("output_language") or "中文"),
        visual_style=str(raw.get("visual_style") or project.visual_style),
        aspect_ratio="9:16",
    )


def _image_prompt_request(*, spec: FinalVideoSpec, target: ElementImageTarget) -> ImagePromptRequest:
    description = target.description or target.name
    if target.kind == "character":
        element = ElementBible(
            element_id=target.entity_id,
            kind="character",
            name=target.name,
            identity=description,
            face_shape="与参考图一致的脸型",
            jawline="清晰稳定的 jawline",
            eye_shape="稳定可辨识的 eye shape",
            hairstyle="与参考图一致的 hairstyle",
            hair_color="与参考图一致的 hair color",
            clothing="与参考图一致的 clothing",
            temperament=description,
        )
    elif target.kind == "scene":
        element = ElementBible(
            element_id=target.entity_id,
            kind="scene",
            name=target.name,
            identity=description,
            spatial_layout=description,
            action_area="适合竖屏短剧人物行动的主表演区",
        )
    else:
        element = ElementBible(
            element_id=target.entity_id,
            kind="prop",
            name=target.name,
            identity=description,
            material=description,
            unique_marks=description,
        )
    return ImagePromptRequest(
        final_video_spec=spec,
        element=element,
        user_instruction="生成关键元素参考图，画面比例 9:16。",
        chinese_environment=True,
        extra_context={"phase": "phase6", "target_ratio": "9:16"},
    )


async def _upsert_storyboard_artifact(db: AsyncSession, *, project_id: str, result: dict[str, Any]) -> None:
    existing = (
        await db.execute(
            select(AgentArtifact)
            .where(AgentArtifact.project_id == project_id, AgentArtifact.kind == AgentArtifactKind.storyboard)
            .order_by(AgentArtifact.version.desc())
            .limit(1)
        )
    ).scalars().first()
    if existing is not None:
        existing.status = AgentArtifactStatus.confirmed
        existing.content_json = result
        existing.content_text = "DeepSeek 拆分镜结果"
        return
    db.add(
        AgentArtifact(
            id=_new_id("agent_artifact"),
            project_id=project_id,
            kind=AgentArtifactKind.storyboard,
            version=1,
            status=AgentArtifactStatus.confirmed,
            content_text="DeepSeek 拆分镜结果",
            content_json=result,
        )
    )
    await db.flush()


async def _load_storyboard_artifact(db: AsyncSession, *, project_id: str) -> dict[str, Any]:
    artifact = (
        await db.execute(
            select(AgentArtifact)
            .where(AgentArtifact.project_id == project_id, AgentArtifact.kind == AgentArtifactKind.storyboard)
            .order_by(AgentArtifact.version.desc())
            .limit(1)
        )
    ).scalars().first()
    if artifact is None or not isinstance(artifact.content_json, dict) or not artifact.content_json:
        raise RuntimeError("Chapter already has shots but no storyboard artifact is available")
    return artifact.content_json


async def _finish_at_elements_review(db: AsyncSession, session: AgentSession, *, image_task_ids: list[str]) -> None:
    await _advance_stage(session, AgentSessionStage.elements_review)
    session.status = AgentSessionStatus.waiting_user
    await _append_task_update(
        db,
        session_id=session.id,
        content="关键元素图已生成，请确认是否进入下一批。",
        payload={"stage": "elements_review", "image_task_ids": image_task_ids, "target_ratio": "9:16"},
    )
    message = AgentMessage(
        id=_new_id("agent_message"),
        session_id=session.id,
        sequence=await _next_message_sequence(db, session.id),
        role=AgentMessageRole.assistant,
        kind=AgentMessageKind.question_card,
        content="关键元素图已生成，请确认是否进入下一批。",
        payload={"stage": "elements_review", "image_task_ids": image_task_ids, "target_ratio": "9:16"},
    )
    db.add(message)
    await db.flush()
    db.add(
        AgentCheckpoint(
            id=_new_id("agent_checkpoint"),
            session_id=session.id,
            stage=AgentSessionStage.elements_review,
            status=AgentCheckpointStatus.pending,
            question="关键元素图已生成，请确认是否进入下一批。",
            options=[
                {"id": "confirm_element_images", "label": "确认元素图", "effect": "confirm_and_advance"},
                {"id": "regenerate_element_images", "label": "重生成", "effect": "stay_and_collect_feedback"},
            ],
            message_id=message.id,
        )
    )
    await db.flush()


async def _set_session_running(session: AgentSession, *, stage: AgentSessionStage) -> None:
    session.current_stage = stage
    session.status = AgentSessionStatus.running
    _merge_state(session, running_stage=stage.value)


async def _advance_stage(session: AgentSession, stage: AgentSessionStage) -> None:
    session.current_stage = stage
    session.status = AgentSessionStatus.running
    _merge_state(session, running_stage=stage.value)


async def _complete_stage(db: AsyncSession, session: AgentSession, stage: AgentSessionStage) -> None:
    state = dict(session.state or {})
    completed = set(state.get("completed_stages") or [])
    completed.add(stage.value)
    session.state = {**state, "completed_stages": sorted(completed)}
    await db.flush()


def _merge_state(session: AgentSession, **fields: Any) -> None:
    state = dict(session.state or {})
    confirmed = set(state.get("confirmed_stages") or [])
    confirmed.add(AgentSessionStage.spec_review.value)
    session.state = {**state, **fields, "confirmed_stages": sorted(confirmed)}


async def _append_task_update(
    db: AsyncSession,
    *,
    session_id: str,
    content: str,
    payload: dict[str, Any],
) -> AgentMessage:
    message = AgentMessage(
        id=_new_id("agent_message"),
        session_id=session_id,
        sequence=await _next_message_sequence(db, session_id),
        role=AgentMessageRole.assistant,
        kind=AgentMessageKind.task_update,
        content=content,
        payload=_json_safe(payload),
    )
    db.add(message)
    await db.flush()
    return message


async def _next_message_sequence(db: AsyncSession, session_id: str) -> int:
    result = await db.execute(select(func.max(AgentMessage.sequence)).where(AgentMessage.session_id == session_id))
    return int(result.scalar_one_or_none() or 0) + 1


def _model_dump(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        dumped = value.model_dump(mode="json")
        return _json_safe(dumped if isinstance(dumped, dict) else {"value": dumped})
    return _json_safe(value if isinstance(value, dict) else {"value": value})


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, list | tuple | set):
        return [_json_safe(item) for item in value]
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime | date):
        return value.isoformat()
    if hasattr(value, "model_dump"):
        return _json_safe(value.model_dump(mode="json"))
    return value


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"
