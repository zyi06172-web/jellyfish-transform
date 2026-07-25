from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

from app.models.types import AgentActionType, AgentMessageKind, AgentSessionStage, AgentSessionStatus


TurnInputType = Literal["text", "choice"]


@dataclass(frozen=True)
class AgentTurnInput:
    """用户单轮输入，文本与问题卡选择共用同一命令载荷。"""

    type: TurnInputType
    text: str = ""
    choice_id: str = ""


@dataclass(frozen=True)
class AgentTurnCommand:
    """Agent 对外 turn 命令；revision 用于后续 API 乐观锁校验。"""

    project_id: str
    session_id: str
    expected_revision: int
    input: AgentTurnInput
    idempotency_key: str = ""


@dataclass(frozen=True)
class QuestionOption:
    """问题卡选项，effect 决定 Policy 是否允许推进。"""

    id: str
    label: str
    effect: Literal["confirm_and_advance", "stay_and_collect_feedback"]
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class QuestionCard:
    """澄清或确认问题卡。"""

    question: str
    options: list[QuestionOption] = field(default_factory=list)


@dataclass(frozen=True)
class AgentMessageView:
    """返回给调用方展示的单条 Agent 消息。"""

    role: Literal["assistant", "user", "system"]
    kind: AgentMessageKind
    content: str
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class AgentDecision:
    """LLM 只能输出的结构化决策，执行前必须经过 Policy 校验。"""

    intent: str
    target_type: str = ""
    target_id: str = ""
    arguments: dict[str, Any] = field(default_factory=dict)
    assistant_message: str = ""
    confidence: float = 0.0


@dataclass(frozen=True)
class PlannedAction:
    """Policy 校验后允许创建的动作记录。"""

    action_type: AgentActionType
    target_type: str = ""
    target_id: str = ""
    input: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class AgentTurnResult:
    """Agent 单轮处理结果。"""

    revision: int
    stage: AgentSessionStage
    assistant_message: AgentMessageView
    question_card: QuestionCard | None = None
    actions: list[PlannedAction] = field(default_factory=list)
    workspace_patch: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class AgentSessionState:
    """Policy 所需的最小会话状态快照。"""

    project_id: str
    session_id: str
    stage: AgentSessionStage = AgentSessionStage.intake
    status: AgentSessionStatus = AgentSessionStatus.active
    revision: int = 0
    confirmed_stages: frozenset[AgentSessionStage] = frozenset()
    completed_stages: frozenset[AgentSessionStage] = frozenset()
    known_targets: dict[str, frozenset[str]] = field(default_factory=dict)
    running_action_types: frozenset[AgentActionType] = frozenset()
    pending_question: QuestionCard | None = None


@dataclass(frozen=True)
class WorkspaceSnapshot:
    """工作台四栏恢复所需的聚合快照骨架。"""

    project_id: str
    session_id: str
    stage: AgentSessionStage
    status: AgentSessionStatus
    revision: int
    confirmed_stages: list[AgentSessionStage] = field(default_factory=list)
    completed_stages: list[AgentSessionStage] = field(default_factory=list)
    question_card: QuestionCard | None = None
    messages: list[AgentMessageView] = field(default_factory=list)
    artifacts: dict[str, Any] = field(default_factory=dict)


class AgentDecisionLLM(Protocol):
    """结构化决策 LLM 协议，方便测试使用 fake adapter。"""

    async def decide(self, command: AgentTurnCommand, state: AgentSessionState) -> AgentDecision:
        """根据用户输入与状态返回结构化决策，不执行任何副作用。"""


class AgentRepository(Protocol):
    """Agent 内部状态仓储协议；外部不直接依赖具体实现。"""

    async def load(self, project_id: str, session_id: str) -> AgentSessionState:
        """读取会话状态。"""

    async def save_turn(
        self,
        previous: AgentSessionState,
        updated: AgentSessionState,
        assistant_message: AgentMessageView,
        actions: list[PlannedAction],
    ) -> AgentSessionState:
        """保存一次 Policy 处理后的状态、消息和动作。"""

    async def snapshot(self, project_id: str) -> WorkspaceSnapshot:
        """读取工作台快照。"""
