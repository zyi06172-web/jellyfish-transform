from __future__ import annotations

from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.core.db import Base
from app.models.studio import AgentAction, AgentMessage, AgentSession, Character, CharacterImage, Project
from app.models.task import GenerationDeliveryMode, GenerationTask, GenerationTaskStatus
from app.models.types import (
    AgentActionStatus,
    AgentActionType,
    AgentMessageKind,
    AgentSessionStage,
    AgentSessionStatus,
    AssetQualityLevel,
    AssetViewAngle,
    ProjectStyle,
    ProjectVisualStyle,
)
from app.services.studio.agent.element_regeneration import RegenerateElementServices, regenerate_element_image
from app.services.studio.agent.prompt_synthesizer import ImagePromptRequest


async def _build_session() -> tuple[AsyncSession, object]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)

    @event.listens_for(engine.sync_engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _connection_record) -> None:  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_local = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return session_local(), engine


async def _seed_regeneration_case(db: AsyncSession) -> None:
    project = Project(
        id="proj-phase7",
        name="豪门雨夜",
        description="女主沈知夏在雨夜反转。",
        style=ProjectStyle.real_people_city,
        visual_style=ProjectVisualStyle.live_action,
        seed=0,
        unify_style=True,
        progress=80,
        default_video_ratio="9:16",
        stats={},
    )
    session = AgentSession(
        id="session-phase7",
        project_id=project.id,
        current_stage=AgentSessionStage.elements_review,
        status=AgentSessionStatus.waiting_user,
        revision=6,
        state={
            "confirmed_stages": ["intake", "spec_review"],
            "completed_stages": ["storyboard", "extract", "auto_confirm", "elements_gen"],
        },
    )
    shen = Character(
        id="char-shen",
        project_id=project.id,
        name="沈知夏",
        description="原本偏甜美的女主",
        style=ProjectStyle.real_people_city,
        visual_style=ProjectVisualStyle.live_action,
    )
    gu = Character(
        id="char-gu",
        project_id=project.id,
        name="顾霆琛",
        description="男主",
        style=ProjectStyle.real_people_city,
        visual_style=ProjectVisualStyle.live_action,
    )
    old_image = CharacterImage(
        character_id=shen.id,
        file_id=None,
        quality_level=AssetQualityLevel.low,
        view_angle=AssetViewAngle.front,
        width=720,
        height=1280,
        format="png",
        is_primary=True,
    )
    other_image = CharacterImage(
        character_id=gu.id,
        file_id=None,
        quality_level=AssetQualityLevel.low,
        view_angle=AssetViewAngle.front,
        width=720,
        height=1280,
        format="png",
        is_primary=True,
    )
    action = AgentAction(
        id="action-regenerate",
        session_id=session.id,
        project_id=project.id,
        action_type=AgentActionType.regenerate_target,
        target_type="character",
        target_id="沈知夏",
        idempotency_key="turn-regenerate:regenerate_target:character:沈知夏:0",
        status=AgentActionStatus.pending,
        input={"user_instruction": "女主不好看换清冷点"},
    )
    db.add(project)
    await db.flush()
    db.add(session)
    await db.flush()
    db.add_all([shen, gu])
    await db.flush()
    db.add_all([old_image, other_image, action])
    await db.flush()


async def test_regenerate_element_image_only_creates_new_version_for_target_character() -> None:
    db, engine = await _build_session()
    calls: list[str] = []
    try:
        await _seed_regeneration_case(db)

        async def fake_prompt(_db: AsyncSession, request: ImagePromptRequest) -> str:
            calls.append("prompt")
            assert request.element.name == "沈知夏"
            assert request.user_instruction == "女主不好看换清冷点"
            return "清冷新版沈知夏角色参考图，无画面文字，9:16 竖图。"

        async def fake_image_task(_db: AsyncSession, image_slot: CharacterImage, prompt: str) -> str:
            calls.append("image")
            assert image_slot.character_id == "char-shen"
            assert "清冷新版沈知夏" in prompt
            task = GenerationTask(
                id="task-regenerate-image",
                mode=GenerationDeliveryMode.async_polling,
                task_kind="image_generation",
                status=GenerationTaskStatus.succeeded,
                progress=100,
                payload={"run_args": {"target_ratio": "9:16", "purpose": "asset_image"}},
                result={"width": 720, "height": 1280},
            )
            _db.add(task)
            await _db.flush()
            return task.id

        task_id = await regenerate_element_image(
            db,
            project_id="proj-phase7",
            session_id="session-phase7",
            action_idempotency_key="turn-regenerate:regenerate_target:character:沈知夏:0",
            services=RegenerateElementServices(synthesize_prompt=fake_prompt, create_image_task=fake_image_task),
        )

        session = await db.get(AgentSession, "session-phase7")
        action = await db.get(AgentAction, "action-regenerate")
        action_count = await db.scalar(select(func.count(AgentAction.id)).where(AgentAction.session_id == "session-phase7"))
        shen_images = (
            await db.execute(select(CharacterImage).where(CharacterImage.character_id == "char-shen").order_by(CharacterImage.id.asc()))
        ).scalars().all()
        gu_images = (await db.execute(select(CharacterImage).where(CharacterImage.character_id == "char-gu"))).scalars().all()
        messages = (
            await db.execute(
                select(AgentMessage)
                .where(AgentMessage.session_id == "session-phase7", AgentMessage.kind == AgentMessageKind.task_update)
                .order_by(AgentMessage.sequence.asc())
            )
        ).scalars().all()

        assert task_id == "task-regenerate-image"
        assert calls == ["prompt", "image"]
        assert action_count == 1
        assert action is not None
        assert action.status == AgentActionStatus.succeeded
        assert action.action_type == AgentActionType.regenerate_target
        assert action.target_id == "char-shen"
        assert action.output is not None
        assert action.output["target_ratio"] == "9:16"
        assert session is not None
        assert session.current_stage == AgentSessionStage.elements_review
        assert session.status == AgentSessionStatus.waiting_user
        assert session.revision == 6
        assert len(shen_images) == 2
        assert [row.is_primary for row in shen_images].count(True) == 1
        assert shen_images[-1].quality_level == AssetQualityLevel.medium
        assert shen_images[-1].is_primary is True
        assert shen_images[0].is_primary is False
        assert len(gu_images) == 1
        assert gu_images[0].is_primary is True
        assert [message.content for message in messages] == [
            "开始重生成「沈知夏」的关键元素图。",
            "已为「沈知夏」创建新版关键元素图任务。",
        ]
    finally:
        await db.close()
        await engine.dispose()
