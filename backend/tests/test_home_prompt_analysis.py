from __future__ import annotations

from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.core.db import Base
from app.models.studio import (
    AgentAction,
    AgentArtifact,
    AgentCheckpoint,
    AgentSession,
    Project,
)
from app.models.types import (
    AgentActionStatus,
    AgentArtifactStatus,
    AgentArtifactKind,
    AgentCheckpointStatus,
    AgentSessionStage,
    AgentSessionStatus,
)
from app.services.studio.agent.home_prompt_analysis import (
    ANALYSIS_FAILED_LABEL,
    HomePromptAnalysis,
    create_home_project_from_prompt,
    run_home_prompt_analysis,
)


class FakeHomePromptAnalyzer:
    def __init__(self, result: HomePromptAnalysis | None = None, error: Exception | None = None) -> None:
        self.result = result
        self.error = error
        self.calls: list[dict[str, str]] = []

    async def analyze(self, *, prompt: str, skill_key: str) -> HomePromptAnalysis:
        self.calls.append({"prompt": prompt, "skill_key": skill_key})
        if self.error is not None:
            raise self.error
        assert self.result is not None
        return self.result


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


async def test_home_prompt_analysis_success_writes_real_title_summary_artifact_and_spec_card() -> None:
    db, engine = await _build_session()
    try:
        created = await create_home_project_from_prompt(
            db,
            prompt="女主被迫签下一年婚姻协议，婚礼当晚发现男主身份反转",
            skill_key="short_drama",
            idempotency_key="idem-success-001",
        )
        analyzer = FakeHomePromptAnalyzer(
            HomePromptAnalysis(
                title="契约婚礼的身份反转",
                story_summary="女主在婚礼危机中被迫签约，随后发现男主真实身份，形成短剧反转钩子。",
                final_video_spec={
                    "output_language": "中文",
                    "aspect_ratio": "9:16",
                    "visual_style": "现实短剧",
                },
            )
        )

        await run_home_prompt_analysis(db, action_id=created.action_id, analyzer=analyzer)

        project = await db.get(Project, created.project_id)
        session = await db.get(AgentSession, created.session_id)
        action = await db.get(AgentAction, created.action_id)
        artifact = (
            await db.execute(
                select(AgentArtifact).where(
                    AgentArtifact.project_id == created.project_id,
                    AgentArtifact.kind == AgentArtifactKind.story_summary,
                )
            )
        ).scalar_one()
        checkpoint = (
            await db.execute(
                select(AgentCheckpoint).where(
                    AgentCheckpoint.session_id == created.session_id,
                    AgentCheckpoint.stage == AgentSessionStage.spec_review,
                )
            )
        ).scalar_one()

        assert project is not None
        assert project.name == "契约婚礼的身份反转"
        assert not project.name.startswith("女主被迫签下一年婚姻协议")
        assert project.stats["agent_analysis_status"] == "succeeded"
        assert project.stats["agent_analysis_title_source"] == "llm_summary"
        assert session is not None
        assert session.current_stage == AgentSessionStage.spec_review
        assert session.status == AgentSessionStatus.waiting_user
        assert session.revision == 1
        assert artifact.content_text.startswith("女主在婚礼危机")
        assert artifact.status == AgentArtifactStatus.confirmed
        assert checkpoint.status == AgentCheckpointStatus.pending
        assert checkpoint.options[0]["id"] == "confirm_final_video_spec"
        assert action is not None
        assert action.status == AgentActionStatus.succeeded
        assert analyzer.calls == [
            {
                "prompt": "女主被迫签下一年婚姻协议，婚礼当晚发现男主身份反转",
                "skill_key": "short_drama",
            }
        ]
    finally:
        await db.close()
        await engine.dispose()


async def test_home_prompt_analysis_failure_keeps_project_and_marks_retryable_without_artifact() -> None:
    db, engine = await _build_session()
    try:
        created = await create_home_project_from_prompt(
            db,
            prompt="一个很短的广告创意",
            skill_key="commercial",
            idempotency_key="idem-fail-001",
        )
        analyzer = FakeHomePromptAnalyzer(error=RuntimeError("LLM provider unavailable"))

        await run_home_prompt_analysis(db, action_id=created.action_id, analyzer=analyzer)

        project = await db.get(Project, created.project_id)
        session = await db.get(AgentSession, created.session_id)
        action = await db.get(AgentAction, created.action_id)
        artifacts = (
            await db.execute(select(AgentArtifact).where(AgentArtifact.project_id == created.project_id))
        ).scalars().all()
        checkpoints = (
            await db.execute(select(AgentCheckpoint).where(AgentCheckpoint.session_id == created.session_id))
        ).scalars().all()

        assert project is not None
        assert ANALYSIS_FAILED_LABEL in project.name
        assert project.stats["agent_analysis_status"] == "failed_retryable"
        assert project.stats["agent_analysis_label"] == ANALYSIS_FAILED_LABEL
        assert session is not None
        assert session.status == AgentSessionStatus.failed
        assert session.state["analysis_status"] == "failed_retryable"
        assert action is not None
        assert action.status == AgentActionStatus.failed
        assert "LLM provider unavailable" in action.error
        assert artifacts == []
        assert checkpoints == []
    finally:
        await db.close()
        await engine.dispose()


async def test_home_prompt_creation_is_idempotent_by_action_key() -> None:
    db, engine = await _build_session()
    try:
        first = await create_home_project_from_prompt(
            db,
            prompt="第一版输入",
            skill_key="short_drama",
            idempotency_key="idem-repeat-001",
        )
        second = await create_home_project_from_prompt(
            db,
            prompt="第二版输入不应重复创建",
            skill_key="short_drama",
            idempotency_key="idem-repeat-001",
        )
        projects = (await db.execute(select(Project))).scalars().all()
        sessions = (await db.execute(select(AgentSession))).scalars().all()
        actions = (await db.execute(select(AgentAction))).scalars().all()

        assert second.project_id == first.project_id
        assert second.session_id == first.session_id
        assert len(projects) == 1
        assert len(sessions) == 1
        assert len(actions) == 1
    finally:
        await db.close()
        await engine.dispose()
