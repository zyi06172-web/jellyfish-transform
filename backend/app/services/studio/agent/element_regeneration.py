from __future__ import annotations

import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.studio import (
    AgentAction,
    AgentMessage,
    AgentSession,
    Character,
    CharacterImage,
    Project,
)
from app.models.types import (
    AgentActionStatus,
    AgentActionType,
    AgentMessageKind,
    AgentMessageRole,
    AgentSessionStatus,
    AssetQualityLevel,
    AssetViewAngle,
)
from app.services.studio.agent.auto_elements_chain import _final_video_spec, _json_safe, _synthesize_prompt
from app.services.studio.agent.prompt_synthesizer import ElementBible, ImagePromptRequest
from app.services.studio.image_task_runner import create_image_task_and_link


logger = logging.getLogger(__name__)


@dataclass(slots=True)
class RegenerateElementServices:
    synthesize_prompt: Callable[[AsyncSession, ImagePromptRequest], Awaitable[str]]
    create_image_task: Callable[[AsyncSession, CharacterImage, str], Awaitable[str]]


def default_regenerate_element_services() -> RegenerateElementServices:
    return RegenerateElementServices(
        synthesize_prompt=_synthesize_prompt,
        create_image_task=_create_regeneration_image_task,
    )


async def regenerate_element_image(
    db: AsyncSession,
    *,
    project_id: str,
    session_id: str,
    action_idempotency_key: str,
    services: RegenerateElementServices | None = None,
) -> str | None:
    """执行单个关键元素图局部重生成；不推进/回退 Agent 阶段。"""

    services = services or default_regenerate_element_services()
    action = (
        await db.execute(
            select(AgentAction)
            .where(
                AgentAction.session_id == session_id,
                AgentAction.project_id == project_id,
                AgentAction.idempotency_key == action_idempotency_key,
                AgentAction.action_type == AgentActionType.regenerate_target,
            )
            .limit(1)
        )
    ).scalars().first()
    if action is None:
        return None
    if action.status == AgentActionStatus.succeeded and action.task_id:
        return action.task_id

    session = await db.get(AgentSession, session_id)
    project = await db.get(Project, project_id)
    if session is None or project is None:
        return None

    target_type = str(action.target_type or "")
    if target_type != "character":
        await _fail_action(db, session=session, action=action, error=f"Unsupported regeneration target_type: {target_type}")
        return None

    character = await _resolve_character(db, project_id=project_id, target_id=action.target_id)
    if character is None:
        await _fail_action(db, session=session, action=action, error=f"Character not found: {action.target_id}")
        return None

    action.status = AgentActionStatus.running
    await _append_task_update(
        db,
        session_id=session_id,
        content=f"开始重生成「{character.name}」的关键元素图。",
        payload={"target_type": "character", "target_id": character.id, "action_id": action.id},
    )
    await db.flush()

    image_slot = await _create_character_image_version(db, character_id=character.id)
    spec = await _final_video_spec(db, project=project)
    prompt_request = ImagePromptRequest(
        final_video_spec=spec,
        element=_character_element_bible(character),
        user_instruction=str((action.input or {}).get("user_instruction") or (action.input or {}).get("text") or ""),
        chinese_environment=True,
        extra_context={
            "phase": "phase7_regenerate_element_image",
            "target_ratio": "9:16",
            "regeneration_note": action.input or {},
        },
    )
    prompt = await services.synthesize_prompt(db, prompt_request)
    task_id = await services.create_image_task(db, image_slot, prompt)

    action.status = AgentActionStatus.succeeded
    action.task_id = task_id
    action.target_id = character.id
    action.output = _json_safe(
        {
            "task_id": task_id,
            "character_image_id": image_slot.id,
            "character_id": character.id,
            "target_ratio": "9:16",
            "prompt": prompt,
        }
    )
    session.status = AgentSessionStatus.waiting_user
    await _append_task_update(
        db,
        session_id=session_id,
        content=f"已为「{character.name}」创建新版关键元素图任务。",
        payload={
            "target_type": "character",
            "target_id": character.id,
            "task_id": task_id,
            "character_image_id": image_slot.id,
            "target_ratio": "9:16",
        },
    )
    await db.flush()
    logger.info(
        "Agent local regeneration: character image task created action_id=%s character_id=%s task_id=%s ratio=9:16",
        action.id,
        character.id,
        task_id,
    )
    return task_id


async def _resolve_character(db: AsyncSession, *, project_id: str, target_id: str) -> Character | None:
    row = await db.get(Character, target_id)
    if row is not None and row.project_id == project_id:
        return row
    return (
        await db.execute(
            select(Character)
            .where(Character.project_id == project_id, Character.name == target_id)
            .order_by(Character.id.asc())
            .limit(1)
        )
    ).scalars().first()


async def _create_character_image_version(db: AsyncSession, *, character_id: str) -> CharacterImage:
    existing = (
        await db.execute(
            select(CharacterImage)
            .where(CharacterImage.character_id == character_id, CharacterImage.view_angle == AssetViewAngle.front)
            .order_by(CharacterImage.id.asc())
        )
    ).scalars().all()
    used_quality = {
        row.quality_level if isinstance(row.quality_level, AssetQualityLevel) else AssetQualityLevel(str(row.quality_level))
        for row in existing
    }
    quality = next(
        (item for item in (AssetQualityLevel.low, AssetQualityLevel.medium, AssetQualityLevel.high, AssetQualityLevel.ultra) if item not in used_quality),
        AssetQualityLevel.ultra,
    )
    reusable = next((row for row in existing if row.quality_level == quality), None)
    if reusable is not None:
        row = reusable
        row.file_id = None
        row.is_primary = True
    else:
        row = CharacterImage(
            character_id=character_id,
            file_id=None,
            quality_level=quality,
            view_angle=AssetViewAngle.front,
            width=None,
            height=None,
            format="png",
            is_primary=True,
        )
        db.add(row)
        await db.flush()
    await db.execute(
        CharacterImage.__table__.update()
        .where(CharacterImage.character_id == character_id, CharacterImage.id != row.id)
        .values(is_primary=False)
    )
    await db.flush()
    await db.refresh(row)
    return row


def _character_element_bible(character: Character) -> ElementBible:
    description = character.description or character.name
    return ElementBible(
        element_id=character.id,
        kind="character",
        name=character.name,
        identity=description,
        face_shape="与参考图一致的脸型",
        jawline="稳定清晰的 jawline",
        eye_shape="稳定可辨识的 eye shape",
        hairstyle="与参考图一致的 hairstyle",
        hair_color="与参考图一致的 hair color",
        clothing="与参考图一致的 clothing",
        temperament=description,
    )


async def _create_regeneration_image_task(db: AsyncSession, image_slot: CharacterImage, prompt: str) -> str:
    return await create_image_task_and_link(
        db=db,
        model_id=None,
        relation_type="character_image",
        relation_entity_id=str(image_slot.id),
        prompt=prompt,
        target_ratio="9:16",
        resolution_profile="standard",
        purpose="asset_image",
        render_context={
            "agent_workflow": "phase7_regenerate_element_image",
            "element_kind": "character",
            "element_id": image_slot.character_id,
            "character_image_id": image_slot.id,
            "prompt_source": "prompt_synthesizer",
        },
        enqueue=True,
    )


async def _fail_action(db: AsyncSession, *, session: AgentSession, action: AgentAction, error: str) -> None:
    action.status = AgentActionStatus.failed
    action.error = error
    session.status = AgentSessionStatus.waiting_user
    await _append_task_update(
        db,
        session_id=session.id,
        content=f"局部重生成失败：{error}",
        payload={"action_id": action.id, "error": error},
    )
    await db.flush()


async def _append_task_update(
    db: AsyncSession,
    *,
    session_id: str,
    content: str,
    payload: dict[str, Any],
) -> AgentMessage:
    result = await db.execute(select(func.max(AgentMessage.sequence)).where(AgentMessage.session_id == session_id))
    message = AgentMessage(
        id=f"agent_message_{uuid.uuid4().hex}",
        session_id=session_id,
        sequence=int(result.scalar_one_or_none() or 0) + 1,
        role=AgentMessageRole.assistant,
        kind=AgentMessageKind.task_update,
        content=content,
        payload=_json_safe(payload),
    )
    db.add(message)
    await db.flush()
    return message
