from pathlib import Path

from sqlalchemy import create_engine, inspect

from app.core.db import Base
from app.models.studio import (
    AgentAction,
    AgentActionType,
    AgentArtifact,
    AgentArtifactKind,
    AgentCheckpoint,
    AgentMessage,
    AgentSession,
)


EXPECTED_AGENT_TABLES = {
    "agent_sessions",
    "agent_messages",
    "agent_checkpoints",
    "agent_artifacts",
    "agent_actions",
}

EXPECTED_ACTION_TYPES = {
    "analyze",
    "divide_shots",
    "design_storyboard",
    "extract_assets",
    "auto_confirm",
    "generate_element_image",
    "synthesize_prompt",
    "generate_voice_anchor",
    "generate_shot_video",
    "generate_audio_layer",
    "assemble_export",
    "regenerate_target",
}


def test_agent_models_register_five_tables_without_audio_voice_anchor_table() -> None:
    """Agent Phase 1 只注册 5 张工作台表，不提前创建音色锚点表。"""

    table_names = set(Base.metadata.tables)

    assert EXPECTED_AGENT_TABLES <= table_names
    assert "character_voice_anchors" not in table_names


def test_agent_session_revision_and_agent_action_type_reserve_full_skill_actions() -> None:
    """会话乐观锁与完整 Skill 动作枚举是后续状态机 guard 的基础契约。"""

    assert "revision" in AgentSession.__table__.columns
    assert AgentSession.__table__.columns["revision"].nullable is False
    assert AgentSession.__table__.columns["revision"].default is not None
    assert AgentSession.__table__.columns["revision"].server_default is not None

    assert {item.value for item in AgentActionType} == EXPECTED_ACTION_TYPES
    first_batch_actions = {
        AgentActionType.analyze,
        AgentActionType.divide_shots,
        AgentActionType.design_storyboard,
        AgentActionType.extract_assets,
        AgentActionType.auto_confirm,
        AgentActionType.generate_element_image,
    }
    assert len(first_batch_actions) == 6


def test_agent_models_preserve_required_constraints_and_indexes() -> None:
    """关键唯一约束和索引落在 metadata 中，避免幂等和版本化后续返工。"""

    assert AgentMessage.__table__.columns["sequence"].nullable is False
    assert "uq_agent_messages_session_sequence" in {
        constraint.name for constraint in AgentMessage.__table__.constraints
    }
    assert "uq_agent_artifacts_project_kind_version" in {
        constraint.name for constraint in AgentArtifact.__table__.constraints
    }
    assert AgentAction.__table__.columns["idempotency_key"].unique is True
    assert AgentAction.__table__.columns["input"].nullable is False
    assert AgentAction.__table__.columns["output"].nullable is True
    assert AgentCheckpoint.__table__.columns["message_id"].nullable is True
    assert {item.value for item in AgentArtifactKind} == {
        "story_summary",
        "final_video_spec",
        "storyboard",
    }


def test_agent_models_create_all_in_sqlite() -> None:
    """轻量数据库建表验证，覆盖 ORM 字段类型与外键声明的基本可执行性。"""

    engine = create_engine("sqlite:///:memory:", future=True)

    import app.models.studio  # noqa: F401
    import app.models.task  # noqa: F401
    import app.models.task_links  # noqa: F401

    Base.metadata.create_all(engine)
    inspector = inspect(engine)

    assert EXPECTED_AGENT_TABLES <= set(inspector.get_table_names())

    session_columns = {column["name"] for column in inspector.get_columns("agent_sessions")}
    action_columns = {column["name"] for column in inspector.get_columns("agent_actions")}

    assert {
        "id",
        "project_id",
        "current_stage",
        "status",
        "revision",
        "state",
        "workflow_version",
        "created_at",
        "updated_at",
    } <= session_columns
    assert {
        "id",
        "session_id",
        "project_id",
        "message_id",
        "action_type",
        "target_type",
        "target_id",
        "idempotency_key",
        "status",
        "task_id",
        "input",
        "output",
        "error",
    } <= action_columns


def test_agent_sql_migration_declares_five_tables_and_rollback_notes() -> None:
    """SQL 迁移文件本身声明 5 张表、回滚说明和本批不建音色锚点表。"""

    migration = Path(__file__).resolve().parents[1] / "sql" / "010-create-agent-workflow-tables.sql"
    sql = migration.read_text(encoding="utf-8")

    assert migration.name.startswith("010-")
    for table_name in EXPECTED_AGENT_TABLES:
        assert f"CREATE TABLE IF NOT EXISTS {table_name}" in sql
        assert f"DROP TABLE IF EXISTS {table_name}" in sql
    assert "Rollback:" in sql
    assert "character_voice_anchors" not in sql
