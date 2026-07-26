from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.studio import (
    AgentAction,
    AgentArtifact,
    AgentCheckpoint,
    AgentMessage,
    AgentSession,
    Character,
)
from app.models.types import (
    AgentActionStatus,
    AgentCheckpointStatus,
    AgentMessageKind,
    AgentMessageRole,
    AgentSessionStage,
    AgentSessionStatus,
)
from app.services.studio.agent.types import (
    AgentMessageView,
    AgentSessionState,
    PlannedAction,
    QuestionCard,
    QuestionOption,
    WorkspaceSnapshot,
)


class DbAgentRepository:
    """真实 DB 仓储：把 Agent 深模块状态映射到 Phase 1 的 5 张表。"""

    def __init__(self, db: AsyncSession, *, command_idempotency_key: str = "") -> None:
        self._db = db
        self._command_idempotency_key = command_idempotency_key

    async def load(self, project_id: str, session_id: str) -> AgentSessionState:
        session = await self._db.get(AgentSession, session_id)
        if session is None or session.project_id != project_id:
            return AgentSessionState(project_id=project_id, session_id=session_id)
        checkpoint = await self._latest_pending_checkpoint(session.id)
        return AgentSessionState(
            project_id=project_id,
            session_id=session.id,
            stage=_stage(session.current_stage),
            status=_session_status(session.status),
            revision=session.revision,
            confirmed_stages=_stage_set((session.state or {}).get("confirmed_stages")),
            completed_stages=_stage_set((session.state or {}).get("completed_stages")),
            known_targets=await self._known_targets(project_id),
            running_action_types=frozenset(
                row.action_type
                for row in (
                    await self._db.execute(
                        select(AgentAction).where(
                            AgentAction.session_id == session.id,
                            AgentAction.status.in_([AgentActionStatus.pending, AgentActionStatus.running]),
                        )
                    )
                ).scalars()
            ),
            pending_question=_checkpoint_to_question_card(checkpoint) if checkpoint is not None else None,
        )

    async def save_turn(
        self,
        previous: AgentSessionState,
        updated: AgentSessionState,
        assistant_message: AgentMessageView,
        actions: list[PlannedAction],
    ) -> AgentSessionState:
        session = await self._db.get(AgentSession, previous.session_id)
        if session is None:
            raise ValueError("Agent session not found")

        session.current_stage = updated.stage
        session.status = updated.status
        session.revision = updated.revision
        session.state = {
            **(session.state or {}),
            "confirmed_stages": [item.value for item in sorted(updated.confirmed_stages, key=lambda x: x.value)],
            "completed_stages": [item.value for item in sorted(updated.completed_stages, key=lambda x: x.value)],
        }

        message = AgentMessage(
            id=_new_id("agent_message"),
            session_id=session.id,
            sequence=await self._next_message_sequence(session.id),
            role=AgentMessageRole.assistant,
            kind=assistant_message.kind,
            content=assistant_message.content,
            payload=assistant_message.payload,
        )
        self._db.add(message)
        await self._db.flush()

        await self._resolve_checkpoint(previous=previous, updated=updated, assistant_message_id=message.id)

        for index, planned in enumerate(actions):
            self._db.add(
                AgentAction(
                    id=_new_id("agent_action"),
                    session_id=session.id,
                    project_id=session.project_id,
                    message_id=message.id,
                    action_type=planned.action_type,
                    target_type=planned.target_type,
                    target_id=planned.target_id,
                    idempotency_key=self._action_idempotency_key(planned, index),
                    status=AgentActionStatus.pending,
                    input=planned.input,
                )
            )
        await self._db.flush()
        return updated

    async def snapshot(self, project_id: str) -> WorkspaceSnapshot:
        session = (
            await self._db.execute(
                select(AgentSession)
                .where(AgentSession.project_id == project_id)
                .order_by(AgentSession.updated_at.desc())
                .limit(1)
            )
        ).scalars().first()
        if session is None:
            return WorkspaceSnapshot(
                project_id=project_id,
                session_id="",
                stage=AgentSessionStage.intake,
                status=AgentSessionStatus.active,
                revision=0,
            )
        messages = (
            await self._db.execute(
                select(AgentMessage).where(AgentMessage.session_id == session.id).order_by(AgentMessage.sequence.asc())
            )
        ).scalars().all()
        artifacts = (
            await self._db.execute(
                select(AgentArtifact).where(AgentArtifact.project_id == project_id).order_by(AgentArtifact.kind, AgentArtifact.version)
            )
        ).scalars().all()
        checkpoint = await self._latest_pending_checkpoint(session.id)
        state = session.state or {}
        return WorkspaceSnapshot(
            project_id=project_id,
            session_id=session.id,
            stage=_stage(session.current_stage),
            status=_session_status(session.status),
            revision=session.revision,
            confirmed_stages=list(_stage_set(state.get("confirmed_stages"))),
            completed_stages=list(_stage_set(state.get("completed_stages"))),
            question_card=_checkpoint_to_question_card(checkpoint) if checkpoint is not None else None,
            messages=[
                AgentMessageView(
                    role=_message_role(row.role),
                    kind=_message_kind(row.kind),
                    content=row.content,
                    payload=row.payload or {},
                )
                for row in messages
            ],
            artifacts={
                _artifact_key(row): {
                    "id": row.id,
                    "kind": str(row.kind.value if hasattr(row.kind, "value") else row.kind),
                    "version": row.version,
                    "status": str(row.status.value if hasattr(row.status, "value") else row.status),
                    "content_text": row.content_text,
                    "content_json": row.content_json or {},
                }
                for row in artifacts
            },
        )

    async def append_user_message(self, *, session_id: str, content: str, payload: dict[str, Any]) -> None:
        self._db.add(
            AgentMessage(
                id=_new_id("agent_message"),
                session_id=session_id,
                sequence=await self._next_message_sequence(session_id),
                role=AgentMessageRole.user,
                kind=AgentMessageKind.text,
                content=content,
                payload=payload,
            )
        )
        await self._db.flush()

    async def _resolve_checkpoint(
        self,
        *,
        previous: AgentSessionState,
        updated: AgentSessionState,
        assistant_message_id: str,
    ) -> None:
        checkpoint = await self._latest_pending_checkpoint(previous.session_id)
        if checkpoint is None:
            return
        if updated.stage != previous.stage:
            checkpoint.status = AgentCheckpointStatus.confirmed
            checkpoint.resolved_option_id = (assistant_message_id if not checkpoint.resolved_option_id else checkpoint.resolved_option_id)
            checkpoint.resolution_payload = {"next_stage": updated.stage.value}
            return
        if updated.status == AgentSessionStatus.waiting_user:
            checkpoint.resolution_payload = {"effect": "stay_and_collect_feedback"}

    async def _latest_pending_checkpoint(self, session_id: str) -> AgentCheckpoint | None:
        return (
            await self._db.execute(
                select(AgentCheckpoint)
                .where(
                    AgentCheckpoint.session_id == session_id,
                    AgentCheckpoint.status == AgentCheckpointStatus.pending,
                )
                .order_by(AgentCheckpoint.updated_at.desc())
                .limit(1)
            )
        ).scalars().first()

    async def _next_message_sequence(self, session_id: str) -> int:
        result = await self._db.execute(select(func.max(AgentMessage.sequence)).where(AgentMessage.session_id == session_id))
        return int(result.scalar_one_or_none() or 0) + 1

    async def _known_targets(self, project_id: str) -> dict[str, frozenset[str]]:
        characters = (
            await self._db.execute(select(Character).where(Character.project_id == project_id).order_by(Character.id.asc()))
        ).scalars().all()
        character_keys: set[str] = set()
        for row in characters:
            character_keys.add(row.id)
            if row.name:
                character_keys.add(row.name)
        return {"character": frozenset(character_keys)}

    def _action_idempotency_key(self, planned: PlannedAction, index: int) -> str:
        base = self._command_idempotency_key or _new_id("agent_turn")
        return f"{base}:{planned.action_type.value}:{planned.target_type}:{planned.target_id}:{index}"


def _checkpoint_to_question_card(checkpoint: AgentCheckpoint) -> QuestionCard:
    return QuestionCard(
        question=checkpoint.question,
        options=[
            QuestionOption(
                id=str(item.get("id") or ""),
                label=str(item.get("label") or item.get("id") or ""),
                effect=_option_effect(str(item.get("effect") or "")),
                payload=item.get("payload") if isinstance(item.get("payload"), dict) else {},
            )
            for item in (checkpoint.options or [])
        ],
    )


def _option_effect(effect: str) -> str:  # type: ignore[return-value]
    if effect in {"confirm_and_advance", "advance"}:
        return "confirm_and_advance"
    return "stay_and_collect_feedback"


def _stage(value: AgentSessionStage | str) -> AgentSessionStage:
    return value if isinstance(value, AgentSessionStage) else AgentSessionStage(str(value))


def _session_status(value: AgentSessionStatus | str) -> AgentSessionStatus:
    return value if isinstance(value, AgentSessionStatus) else AgentSessionStatus(str(value))


def _message_kind(value: AgentMessageKind | str) -> AgentMessageKind:
    return value if isinstance(value, AgentMessageKind) else AgentMessageKind(str(value))


def _message_role(value: AgentMessageRole | str) -> str:  # type: ignore[return-value]
    role = value.value if hasattr(value, "value") else str(value)
    return role if role in {"assistant", "user", "system"} else "assistant"


def _stage_set(values: Any) -> frozenset[AgentSessionStage]:
    if not isinstance(values, list):
        return frozenset()
    result: set[AgentSessionStage] = set()
    for value in values:
        try:
            result.add(AgentSessionStage(str(value)))
        except ValueError:
            continue
    return frozenset(result)


def _artifact_key(row: AgentArtifact) -> str:
    kind = row.kind.value if hasattr(row.kind, "value") else str(row.kind)
    return f"{kind}:v{row.version}"


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"
