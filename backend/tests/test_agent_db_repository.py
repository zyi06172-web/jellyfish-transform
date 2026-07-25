from __future__ import annotations

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.core.db import Base
from app.models.studio import AgentCheckpoint, AgentMessage, AgentSession, Project
from app.models.types import (
    AgentCheckpointStatus,
    AgentMessageKind,
    AgentMessageRole,
    AgentSessionStage,
    AgentSessionStatus,
    ProjectStyle,
    ProjectVisualStyle,
)
from app.services.studio.agent.db_repository import DbAgentRepository
from app.services.studio.agent.types import AgentTurnCommand, AgentTurnInput
from app.services.studio.agent.video_creation_agent import VideoCreationAgent


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


async def _seed_spec_review_session(db: AsyncSession) -> None:
    project = Project(
        id="proj-agent",
        name="契约新娘的豪门反转夜",
        description="剧情",
        style=ProjectStyle.real_people_city,
        visual_style=ProjectVisualStyle.live_action,
        seed=0,
        unify_style=True,
        progress=12,
        default_video_ratio="9:16",
        stats={},
    )
    session = AgentSession(
        id="session-agent",
        project_id=project.id,
        current_stage=AgentSessionStage.spec_review,
        status=AgentSessionStatus.waiting_user,
        revision=3,
        state={"confirmed_stages": ["intake"], "completed_stages": []},
    )
    message = AgentMessage(
        id="message-question",
        session_id=session.id,
        sequence=1,
        role=AgentMessageRole.assistant,
        kind=AgentMessageKind.question_card,
        content="请确认成片规格，确认后我会进入拆分镜阶段。",
        payload={},
    )
    checkpoint = AgentCheckpoint(
        id="checkpoint-spec",
        session_id=session.id,
        stage=AgentSessionStage.spec_review,
        status=AgentCheckpointStatus.pending,
        question="请确认成片规格，确认后我会进入拆分镜阶段。",
        options=[
            {"id": "confirm_final_video_spec", "label": "确认规格", "effect": "confirm_and_advance"},
            {"id": "revise_final_video_spec", "label": "调整规格", "effect": "stay_and_collect_feedback"},
        ],
        message_id=message.id,
    )
    db.add(project)
    await db.flush()
    db.add(session)
    await db.flush()
    db.add(message)
    await db.flush()
    db.add(checkpoint)
    await db.flush()


async def test_db_repository_snapshot_restores_real_question_card() -> None:
    db, engine = await _build_session()
    try:
        await _seed_spec_review_session(db)
        snapshot = await VideoCreationAgent(repository=DbAgentRepository(db)).get_workspace_snapshot("proj-agent")

        assert snapshot.project_id == "proj-agent"
        assert snapshot.session_id == "session-agent"
        assert snapshot.stage == AgentSessionStage.spec_review
        assert snapshot.revision == 3
        assert snapshot.confirmed_stages == [AgentSessionStage.intake]
        assert snapshot.question_card is not None
        assert snapshot.question_card.options[0].effect == "confirm_and_advance"
        assert snapshot.messages[0].content.startswith("请确认成片规格")
    finally:
        await db.close()
        await engine.dispose()


async def test_db_repository_negative_choice_stays_on_spec_review() -> None:
    db, engine = await _build_session()
    try:
        await _seed_spec_review_session(db)
        result = await VideoCreationAgent(repository=DbAgentRepository(db, command_idempotency_key="turn-neg")).handle_turn(
            AgentTurnCommand(
                project_id="proj-agent",
                session_id="session-agent",
                expected_revision=3,
                input=AgentTurnInput(type="choice", choice_id="revise_final_video_spec"),
                idempotency_key="turn-neg",
            )
        )
        session = await db.get(AgentSession, "session-agent")
        checkpoint = await db.get(AgentCheckpoint, "checkpoint-spec")

        assert result.stage == AgentSessionStage.spec_review
        assert result.revision == 4
        assert session is not None
        assert session.current_stage == AgentSessionStage.spec_review
        assert session.status == AgentSessionStatus.waiting_user
        assert checkpoint is not None
        assert checkpoint.status == AgentCheckpointStatus.pending
    finally:
        await db.close()
        await engine.dispose()


async def test_db_repository_confirm_choice_advances_to_storyboard() -> None:
    db, engine = await _build_session()
    try:
        await _seed_spec_review_session(db)
        result = await VideoCreationAgent(repository=DbAgentRepository(db, command_idempotency_key="turn-ok")).handle_turn(
            AgentTurnCommand(
                project_id="proj-agent",
                session_id="session-agent",
                expected_revision=3,
                input=AgentTurnInput(type="choice", choice_id="confirm_final_video_spec"),
                idempotency_key="turn-ok",
            )
        )
        session = await db.get(AgentSession, "session-agent")
        checkpoint = await db.get(AgentCheckpoint, "checkpoint-spec")

        assert result.stage == AgentSessionStage.storyboard
        assert result.revision == 4
        assert session is not None
        assert session.current_stage == AgentSessionStage.storyboard
        assert "spec_review" in session.state["confirmed_stages"]
        assert checkpoint is not None
        assert checkpoint.status == AgentCheckpointStatus.confirmed
    finally:
        await db.close()
        await engine.dispose()
