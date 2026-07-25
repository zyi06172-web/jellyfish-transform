from __future__ import annotations

from app.models.types import AgentSessionStage, AgentSessionStatus
from app.services.studio.agent.types import (
    AgentMessageView,
    AgentRepository,
    AgentSessionState,
    PlannedAction,
    WorkspaceSnapshot,
)


class InMemoryAgentRepository(AgentRepository):
    """测试与早期集成用仓储；真实 DB 仓储会在 API 接入阶段替换。"""

    def __init__(self, initial_state: AgentSessionState | None = None) -> None:
        self._states: dict[tuple[str, str], AgentSessionState] = {}
        self._messages: dict[tuple[str, str], list[AgentMessageView]] = {}
        self._actions: dict[tuple[str, str], list[PlannedAction]] = {}
        if initial_state is not None:
            key = (initial_state.project_id, initial_state.session_id)
            self._states[key] = initial_state
            self._messages[key] = []
            self._actions[key] = []

    async def load(self, project_id: str, session_id: str) -> AgentSessionState:
        """读取或创建最小会话状态。"""

        key = (project_id, session_id)
        if key not in self._states:
            self._states[key] = AgentSessionState(project_id=project_id, session_id=session_id)
            self._messages[key] = []
            self._actions[key] = []
        return self._states[key]

    async def save_turn(
        self,
        previous: AgentSessionState,
        updated: AgentSessionState,
        assistant_message: AgentMessageView,
        actions: list[PlannedAction],
    ) -> AgentSessionState:
        """保存状态并追加消息/动作；revision 冲突由调用前 Policy 负责。"""

        key = (previous.project_id, previous.session_id)
        self._states[key] = updated
        self._messages.setdefault(key, []).append(assistant_message)
        self._actions.setdefault(key, []).extend(actions)
        return updated

    async def snapshot(self, project_id: str) -> WorkspaceSnapshot:
        """返回项目下第一个会话快照。"""

        for (state_project_id, session_id), state in self._states.items():
            if state_project_id != project_id:
                continue
            return WorkspaceSnapshot(
                project_id=project_id,
                session_id=session_id,
                stage=state.stage,
                status=state.status,
                revision=state.revision,
                confirmed_stages=list(state.confirmed_stages),
                completed_stages=list(state.completed_stages),
                question_card=state.pending_question,
                messages=list(self._messages.get((state_project_id, session_id), [])),
            )
        return WorkspaceSnapshot(
            project_id=project_id,
            session_id="",
            stage=AgentSessionStage.intake,
            status=AgentSessionStatus.active,
            revision=0,
        )
