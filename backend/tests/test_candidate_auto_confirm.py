"""资产候选自动确认测试。"""

from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models.studio import (
    CameraAngle,
    CameraMovement,
    CameraShotType,
    Chapter,
    Project,
    ProjectStyle,
    ProjectVisualStyle,
    Prop,
    ProjectPropLink,
    Shot,
    ShotCandidateStatus,
    ShotCandidateType,
    ShotDetail,
    ShotExtractedCandidate,
)
from app.services.studio.candidate_auto_confirm import (
    auto_confirm_chapter_candidates,
    auto_confirm_shot_candidates,
)


async def _build_session() -> tuple[AsyncSession, object]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    session_local = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return session_local(), engine


def _seed_shot(shot_id: str, *, index: int) -> Shot:
    return Shot(
        id=shot_id,
        chapter_id="ch1",
        index=index,
        title=f"镜头 {index}",
        script_excerpt="角色拿起合同。",
    )


def _seed_detail(shot_id: str) -> ShotDetail:
    return ShotDetail(
        id=shot_id,
        camera_shot=CameraShotType.ms,
        angle=CameraAngle.eye_level,
        movement=CameraMovement.static,
        duration=5,
        action_beats=["拿起合同"],
    )


@pytest.mark.asyncio
async def test_l1_auto_confirm_links_existing_exact_asset() -> None:
    db, engine = await _build_session()
    async with db:
        db.add(Project(id="p1", name="短剧", style=ProjectStyle.real_people_city, visual_style=ProjectVisualStyle.live_action))
        db.add(Chapter(id="ch1", project_id="p1", index=1, title="第一集"))
        db.add(_seed_shot("s1", index=1))
        db.add(_seed_detail("s1"))
        db.add(Prop(id="prop-contract", name="合同", description="", style=ProjectStyle.real_people_city))
        db.add(
            ShotExtractedCandidate(
                shot_id="s1",
                candidate_type=ShotCandidateType.prop,
                candidate_name="合同",
                candidate_status=ShotCandidateStatus.pending,
                source="test",
                payload={},
            )
        )
        await db.commit()

        result = await auto_confirm_shot_candidates(db, shot_id="s1", level="L1")

        assert result.linked_existing == 1
        assert result.created_and_linked == 0
        candidate = (await db.execute(select(ShotExtractedCandidate))).scalars().one()
        assert candidate.candidate_status == ShotCandidateStatus.linked
        assert candidate.linked_entity_id == "prop-contract"
        link_count = await db.scalar(select(func.count(ProjectPropLink.id)))
        assert link_count == 1
    await engine.dispose()


@pytest.mark.asyncio
async def test_l3_auto_confirm_reuses_created_asset_across_chapter() -> None:
    db, engine = await _build_session()
    async with db:
        db.add(Project(id="p1", name="短剧", style=ProjectStyle.real_people_city, visual_style=ProjectVisualStyle.live_action))
        db.add(Chapter(id="ch1", project_id="p1", index=1, title="第一集"))
        db.add_all([_seed_shot("s1", index=1), _seed_shot("s2", index=2)])
        db.add_all([_seed_detail("s1"), _seed_detail("s2")])
        db.add_all(
            [
                ShotExtractedCandidate(
                    shot_id="s1",
                    candidate_type=ShotCandidateType.prop,
                    candidate_name="戒指",
                    candidate_status=ShotCandidateStatus.pending,
                    source="test",
                    payload={"description": "一枚银色戒指"},
                ),
                ShotExtractedCandidate(
                    shot_id="s2",
                    candidate_type=ShotCandidateType.prop,
                    candidate_name="戒指",
                    candidate_status=ShotCandidateStatus.pending,
                    source="test",
                    payload={},
                ),
            ]
        )
        await db.commit()

        result = await auto_confirm_chapter_candidates(db, chapter_id="ch1", level="L3")

        assert result.shot_count == 2
        assert result.created_and_linked == 1
        assert result.linked_existing == 1
        prop_count = await db.scalar(select(func.count(Prop.id)).where(Prop.name == "戒指"))
        assert prop_count == 1
        link_count = await db.scalar(select(func.count(ProjectPropLink.id)))
        assert link_count == 2
    await engine.dispose()
