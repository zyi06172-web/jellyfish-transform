from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class AgentQuestionOptionRead(BaseModel):
    id: str
    label: str
    effect: Literal["confirm_and_advance", "stay_and_collect_feedback"]
    payload: dict[str, Any] = Field(default_factory=dict)


class AgentQuestionCardRead(BaseModel):
    question: str
    options: list[AgentQuestionOptionRead] = Field(default_factory=list)


class AgentMessageRead(BaseModel):
    role: Literal["assistant", "user", "system"]
    kind: str
    content: str
    payload: dict[str, Any] = Field(default_factory=dict)


class AgentWorkspaceSnapshotRead(BaseModel):
    project_id: str
    session_id: str
    stage: str
    status: str
    revision: int
    confirmed_stages: list[str] = Field(default_factory=list)
    completed_stages: list[str] = Field(default_factory=list)
    question_card: AgentQuestionCardRead | None = None
    messages: list[AgentMessageRead] = Field(default_factory=list)
    artifacts: dict[str, Any] = Field(default_factory=dict)


class AgentTurnInputRead(BaseModel):
    type: Literal["text", "choice"]
    text: str = ""
    choice_id: str = ""


class AgentTurnRequest(BaseModel):
    session_id: str
    expected_revision: int
    idempotency_key: str = Field(..., min_length=8, max_length=128)
    input: AgentTurnInputRead


class AgentTurnRead(BaseModel):
    revision: int
    stage: str
    assistant_message: AgentMessageRead
    question_card: AgentQuestionCardRead | None = None
    actions: list[dict[str, Any]] = Field(default_factory=list)
    workspace_patch: dict[str, Any] = Field(default_factory=dict)
