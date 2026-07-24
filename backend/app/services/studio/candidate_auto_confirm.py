"""镜头资产候选自动确认服务。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.studio import (
    Chapter,
    Character,
    Costume,
    Project,
    Prop,
    Scene,
    Shot,
    ShotCandidateStatus,
    ShotCandidateType,
    ShotCharacterLink,
    ShotExtractedCandidate,
)
from app.schemas.studio.cast import ShotCharacterLinkCreate
from app.schemas.studio.shots import (
    ChapterCandidateAutoConfirmResultRead,
    ProjectAssetLinkCreate,
    ShotCandidateAutoConfirmResultRead,
)
from app.services.common import entity_not_found
from app.services.studio.shot_extracted_candidates import mark_linked
from app.services.studio.shot_assets import create_project_asset_link
from app.services.studio.shot_character_links import upsert as upsert_shot_character_link
from app.services.studio.shot_preparation_state import build_shot_preparation_state

AutoConfirmLevel = Literal["L1", "L2", "L3"]

_ASSET_MODEL_BY_TYPE = {
    ShotCandidateType.scene: Scene,
    ShotCandidateType.prop: Prop,
    ShotCandidateType.costume: Costume,
}


@dataclass(slots=True)
class AutoConfirmRunCache:
    """一次自动确认运行内的名称缓存，保证串行去重。"""

    resolved: dict[tuple[str, str], str] = field(default_factory=dict)


def _norm_name(value: str) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _candidate_type(value: ShotCandidateType | str) -> ShotCandidateType:
    return value if isinstance(value, ShotCandidateType) else ShotCandidateType(value)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:16]}"


def _candidate_description(row: ShotExtractedCandidate) -> str:
    payload = row.payload or {}
    for key in ("description", "desc", "summary"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return f"由分镜候选自动创建：{row.candidate_name}"


async def _get_project_and_chapter(db: AsyncSession, *, shot: Shot) -> tuple[Project, Chapter]:
    chapter = await db.get(Chapter, shot.chapter_id)
    if chapter is None:
        raise ValueError(entity_not_found("Chapter"))
    project = await db.get(Project, chapter.project_id)
    if project is None:
        raise ValueError(entity_not_found("Project"))
    return project, chapter


async def _find_existing_entity(
    db: AsyncSession,
    *,
    project_id: str,
    candidate_type: ShotCandidateType,
    name: str,
) -> str | None:
    normalized = _norm_name(name)
    if not normalized:
        return None
    if candidate_type == ShotCandidateType.character:
        stmt = (
            select(Character.id)
            .where(Character.project_id == project_id)
            .where(func.lower(Character.name) == normalized)
            .limit(1)
        )
    else:
        model = _ASSET_MODEL_BY_TYPE[candidate_type]
        stmt = select(model.id).where(func.lower(model.name) == normalized).limit(1)
    row = (await db.execute(stmt)).scalar_one_or_none()
    return str(row) if row is not None else None


async def _link_character_to_shot(db: AsyncSession, *, shot_id: str, character_id: str) -> None:
    max_index = (
        await db.execute(
            select(ShotCharacterLink.index)
            .where(ShotCharacterLink.shot_id == shot_id)
            .order_by(ShotCharacterLink.index.desc())
            .limit(1)
        )
    ).scalars().first()
    await upsert_shot_character_link(
        db,
        body=ShotCharacterLinkCreate(
            shot_id=shot_id,
            character_id=character_id,
            index=(max_index if isinstance(max_index, int) else -1) + 1,
            note="auto-confirm",
        ),
    )


async def _create_entity_from_candidate(
    db: AsyncSession,
    *,
    project: Project,
    chapter: Chapter,
    shot: Shot,
    row: ShotExtractedCandidate,
) -> str:
    name = row.candidate_name.strip()
    candidate_type = _candidate_type(row.candidate_type)
    if candidate_type == ShotCandidateType.character:
        entity = Character(
            id=_new_id("char"),
            project_id=project.id,
            name=name,
            description=_candidate_description(row),
            style=project.style,
            visual_style=project.visual_style,
            actor_id=None,
            costume_id=None,
        )
        db.add(entity)
        await db.flush()
        await _link_character_to_shot(db, shot_id=shot.id, character_id=entity.id)
        return entity.id

    model = _ASSET_MODEL_BY_TYPE[candidate_type]
    entity = model(
        id=_new_id(candidate_type.value),
        name=name,
        description=_candidate_description(row),
        style=project.style,
        visual_style=project.visual_style,
        view_count=1,
        tags=[],
        prompt_template_id=None,
    )
    db.add(entity)
    await db.flush()
    await create_project_asset_link(
        db,
        entity_type=candidate_type.value,
        body=ProjectAssetLinkCreate(
            project_id=project.id,
            chapter_id=chapter.id,
            shot_id=shot.id,
            asset_id=entity.id,
        ),
    )
    return entity.id


async def _link_existing_entity(
    db: AsyncSession,
    *,
    project: Project,
    chapter: Chapter,
    shot: Shot,
    row: ShotExtractedCandidate,
    entity_id: str,
) -> None:
    candidate_type = _candidate_type(row.candidate_type)
    if candidate_type == ShotCandidateType.character:
        await _link_character_to_shot(db, shot_id=shot.id, character_id=entity_id)
        return
    await create_project_asset_link(
        db,
        entity_type=candidate_type.value,
        body=ProjectAssetLinkCreate(
            project_id=project.id,
            chapter_id=chapter.id,
            shot_id=shot.id,
            asset_id=entity_id,
        ),
    )


async def auto_confirm_shot_candidates(
    db: AsyncSession,
    *,
    shot_id: str,
    level: AutoConfirmLevel,
    run_cache: AutoConfirmRunCache | None = None,
) -> ShotCandidateAutoConfirmResultRead:
    """按级别自动确认单镜头资产候选；不调用 LLM。"""
    shot = await db.get(Shot, shot_id)
    if shot is None:
        raise ValueError(entity_not_found("Shot"))
    project, chapter = await _get_project_and_chapter(db, shot=shot)
    cache = run_cache or AutoConfirmRunCache()
    create_missing = level in {"L2", "L3"}

    rows = (
        await db.execute(
            select(ShotExtractedCandidate)
            .where(ShotExtractedCandidate.shot_id == shot_id)
            .where(ShotExtractedCandidate.candidate_status == ShotCandidateStatus.pending)
            .order_by(ShotExtractedCandidate.id.asc())
        )
    ).scalars().all()

    linked_existing = 0
    created_and_linked = 0
    skipped = 0
    processed_candidate_ids: list[int] = []
    messages: list[str] = []

    for row in rows:
        name_key = _norm_name(row.candidate_name)
        if not name_key:
            skipped += 1
            messages.append(f"候选 {row.id} 名称为空，已跳过")
            continue
        candidate_type = _candidate_type(row.candidate_type)
        cache_key = (candidate_type.value, name_key)
        entity_id = cache.resolved.get(cache_key)
        created_now = False
        if entity_id is None:
            entity_id = await _find_existing_entity(
                db,
                project_id=project.id,
                candidate_type=candidate_type,
                name=row.candidate_name,
            )
        if entity_id is None and create_missing:
            entity_id = await _create_entity_from_candidate(
                db,
                project=project,
                chapter=chapter,
                shot=shot,
                row=row,
            )
            created_now = True
        if entity_id is None:
            skipped += 1
            messages.append(f"L1 未找到精确同名资产：{candidate_type.value}/{row.candidate_name}")
            continue

        cache.resolved[cache_key] = entity_id
        if not created_now:
            await _link_existing_entity(
                db,
                project=project,
                chapter=chapter,
                shot=shot,
                row=row,
                entity_id=entity_id,
            )
        await mark_linked(db, candidate_id=row.id, linked_entity_id=entity_id)
        processed_candidate_ids.append(row.id)
        if created_now:
            created_and_linked += 1
        else:
            linked_existing += 1

    state = await build_shot_preparation_state(db, shot_id=shot_id)
    return ShotCandidateAutoConfirmResultRead(
        shot_id=shot_id,
        level=level,
        linked_existing=linked_existing,
        created_and_linked=created_and_linked,
        skipped=skipped,
        processed_candidate_ids=processed_candidate_ids,
        messages=messages,
        state=state,
    )


async def auto_confirm_chapter_candidates(
    db: AsyncSession,
    *,
    chapter_id: str,
    level: AutoConfirmLevel,
) -> ChapterCandidateAutoConfirmResultRead:
    """章节级串行自动确认；L3 会跨镜头复用同名资产。"""
    chapter = await db.get(Chapter, chapter_id)
    if chapter is None:
        raise ValueError(entity_not_found("Chapter"))
    cache = AutoConfirmRunCache()
    shots = (
        await db.execute(select(Shot).where(Shot.chapter_id == chapter_id).order_by(Shot.index.asc()))
    ).scalars().all()
    results: list[ShotCandidateAutoConfirmResultRead] = []
    for shot in shots:
        results.append(
            await auto_confirm_shot_candidates(
                db,
                shot_id=shot.id,
                level=level,
                run_cache=cache,
            )
        )
    return ChapterCandidateAutoConfirmResultRead(
        chapter_id=chapter_id,
        level=level,
        shot_count=len(results),
        linked_existing=sum(item.linked_existing for item in results),
        created_and_linked=sum(item.created_and_linked for item in results),
        skipped=sum(item.skipped for item in results),
        results=results,
    )
