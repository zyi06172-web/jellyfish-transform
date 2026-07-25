from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import TimestampMixin
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
)


class AgentSession(Base, TimestampMixin):
    """Flova Agent 工作台会话。

    每个项目通常对应一个当前会话；`revision` 用作前端 turn 请求的乐观锁，
    防止旧问题卡或并发提交静默覆盖最新状态。
    """

    __tablename__ = "agent_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, comment="Agent 会话 ID")
    project_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="所属项目 ID",
    )
    current_stage: Mapped[AgentSessionStage] = mapped_column(
        String(32),
        nullable=False,
        default=AgentSessionStage.intake,
        comment="当前工作流阶段",
    )
    status: Mapped[AgentSessionStatus] = mapped_column(
        String(32),
        nullable=False,
        default=AgentSessionStatus.active,
        index=True,
        comment="会话状态",
    )
    revision: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
        comment="乐观锁版本号，每次状态变更递增",
    )
    state: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
        comment="会话状态快照（JSON）",
    )
    workflow_version: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="flova-v2",
        comment="工作流版本",
    )

    __table_args__ = (
        Index("ix_agent_sessions_project_stage", "project_id", "current_stage"),
        Index("ix_agent_sessions_updated_at", "updated_at"),
    )


class AgentMessage(Base):
    """Agent 对话消息，只追加不原地改写。"""

    __tablename__ = "agent_messages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, comment="消息 ID")
    session_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("agent_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Agent 会话 ID",
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, comment="会话内递增序号")
    role: Mapped[AgentMessageRole] = mapped_column(String(16), nullable=False, comment="消息角色")
    kind: Mapped[AgentMessageKind] = mapped_column(
        String(32),
        nullable=False,
        default=AgentMessageKind.text,
        comment="消息类型",
    )
    content: Mapped[str] = mapped_column(Text, nullable=False, default="", comment="消息正文")
    payload: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
        comment="消息结构化载荷（JSON）",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        comment="创建时间",
    )

    __table_args__ = (
        UniqueConstraint("session_id", "sequence", name="uq_agent_messages_session_sequence"),
        Index("ix_agent_messages_session_created", "session_id", "created_at"),
    )


class AgentCheckpoint(Base, TimestampMixin):
    """Agent 阶段确认点。"""

    __tablename__ = "agent_checkpoints"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, comment="确认点 ID")
    session_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("agent_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Agent 会话 ID",
    )
    stage: Mapped[AgentSessionStage] = mapped_column(String(32), nullable=False, comment="确认点所属阶段")
    status: Mapped[AgentCheckpointStatus] = mapped_column(
        String(32),
        nullable=False,
        default=AgentCheckpointStatus.pending,
        index=True,
        comment="确认点状态",
    )
    question: Mapped[str] = mapped_column(Text, nullable=False, default="", comment="确认问题")
    options: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
        comment="问题卡选项（JSON 数组）",
    )
    resolved_option_id: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
        comment="已选择的选项 ID",
    )
    resolution_payload: Mapped[dict[str, Any] | None] = mapped_column(
        JSON,
        nullable=True,
        comment="确认结果结构化载荷（JSON）",
    )
    message_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("agent_messages.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="对应问题卡消息 ID",
    )

    __table_args__ = (
        Index("ix_agent_checkpoints_session_stage", "session_id", "stage"),
        Index("ix_agent_checkpoints_session_status", "session_id", "status"),
    )


class AgentArtifact(Base, TimestampMixin):
    """Agent 生成的结构化产物版本。"""

    __tablename__ = "agent_artifacts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, comment="产物 ID")
    project_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="所属项目 ID",
    )
    kind: Mapped[AgentArtifactKind] = mapped_column(String(32), nullable=False, comment="产物类型")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, comment="同类产物版本号")
    status: Mapped[AgentArtifactStatus] = mapped_column(
        String(32),
        nullable=False,
        default=AgentArtifactStatus.draft,
        index=True,
        comment="产物状态",
    )
    content_text: Mapped[str] = mapped_column(Text, nullable=False, default="", comment="产物文本内容")
    content_json: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
        comment="产物结构化内容（JSON）",
    )
    created_by_message_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("agent_messages.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="创建该产物的消息 ID",
    )

    __table_args__ = (
        UniqueConstraint("project_id", "kind", "version", name="uq_agent_artifacts_project_kind_version"),
        Index("ix_agent_artifacts_project_kind_status", "project_id", "kind", "status"),
    )


class AgentAction(Base, TimestampMixin):
    """Agent 发起的确定性动作记录。

    `action_type` 只记录动作意图，真正的模型选择由后续服务按动作类别路由；
    `idempotency_key` 全局唯一，保证自动链与重试不会重复创建同一动作。
    """

    __tablename__ = "agent_actions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, comment="动作 ID")
    session_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("agent_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Agent 会话 ID",
    )
    project_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="所属项目 ID",
    )
    message_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("agent_messages.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="触发该动作的消息 ID",
    )
    action_type: Mapped[AgentActionType] = mapped_column(String(64), nullable=False, index=True, comment="动作类型")
    target_type: Mapped[str] = mapped_column(String(64), nullable=False, default="", comment="目标类型")
    target_id: Mapped[str] = mapped_column(String(64), nullable=False, default="", comment="目标 ID")
    idempotency_key: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        unique=True,
        comment="幂等键，全局唯一",
    )
    status: Mapped[AgentActionStatus] = mapped_column(
        String(32),
        nullable=False,
        default=AgentActionStatus.pending,
        index=True,
        comment="动作状态",
    )
    task_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("generation_tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="关联异步生成任务 ID",
    )
    input: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict, comment="动作输入（JSON）")
    output: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True, comment="动作输出（JSON）")
    error: Mapped[str] = mapped_column(Text, nullable=False, default="", comment="失败原因")

    __table_args__ = (
        Index("ix_agent_actions_session_status", "session_id", "status"),
        Index("ix_agent_actions_project_type_status", "project_id", "action_type", "status"),
        Index("ix_agent_actions_target", "target_type", "target_id"),
    )


__all__ = [
    "AgentSession",
    "AgentMessage",
    "AgentCheckpoint",
    "AgentArtifact",
    "AgentAction",
]
