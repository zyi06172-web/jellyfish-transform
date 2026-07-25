from __future__ import annotations

from app.services.studio.agent.policy import evaluate_turn
from app.services.studio.agent.repository import InMemoryAgentRepository
from app.services.studio.agent.types import (
    AgentDecision,
    AgentDecisionLLM,
    AgentRepository,
    AgentTurnCommand,
    AgentTurnResult,
    WorkspaceSnapshot,
)


class _ClarifyOnlyDecisionLLM:
    """默认安全 LLM：未注入真实适配器时只返回未知意图。"""

    async def decide(self, command: AgentTurnCommand, state) -> AgentDecision:  # noqa: ANN001
        return AgentDecision(
            intent="unknown",
            assistant_message="我需要更多信息才能安全继续。",
            confidence=0.0,
        )


class VideoCreationAgent:
    """Flova 式视频创作 Agent 深模块入口。"""

    def __init__(
        self,
        *,
        decision_llm: AgentDecisionLLM | None = None,
        repository: AgentRepository | None = None,
    ) -> None:
        self._decision_llm = decision_llm or _ClarifyOnlyDecisionLLM()
        self._repository = repository or InMemoryAgentRepository()

    async def handle_turn(self, command: AgentTurnCommand) -> AgentTurnResult:
        """处理用户单轮输入：LLM 只做决策，Policy 校验通过后才产生动作。"""

        state = await self._repository.load(command.project_id, command.session_id)
        decision = await self._decision_llm.decide(command, state)
        policy_result = evaluate_turn(command, state, decision)
        updated = await self._repository.save_turn(
            state,
            policy_result.updated_state,
            policy_result.assistant_message,
            policy_result.actions,
        )
        return AgentTurnResult(
            revision=updated.revision,
            stage=updated.stage,
            assistant_message=policy_result.assistant_message,
            question_card=policy_result.question_card,
            actions=policy_result.actions,
        )

    async def get_workspace_snapshot(self, project_id: str) -> WorkspaceSnapshot:
        """读取工作台聚合快照，供后续 API/前端刷新恢复使用。"""

        return await self._repository.snapshot(project_id)
