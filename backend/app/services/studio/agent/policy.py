from __future__ import annotations

from dataclasses import dataclass, field

from app.models.types import AgentActionType, AgentMessageKind, AgentSessionStage, AgentSessionStatus
from app.services.studio.agent.types import (
    AgentDecision,
    AgentMessageView,
    AgentSessionState,
    AgentTurnCommand,
    PlannedAction,
    QuestionCard,
    QuestionOption,
)
from app.services.studio.agent.workflow import NEXT_STAGE, can_enter_stage


INTENT_TO_ACTION: dict[str, AgentActionType] = {
    "analyze": AgentActionType.analyze,
    "divide_shots": AgentActionType.divide_shots,
    "design_storyboard": AgentActionType.design_storyboard,
    "extract_assets": AgentActionType.extract_assets,
    "auto_confirm": AgentActionType.auto_confirm,
    "generate_element_image": AgentActionType.generate_element_image,
    "synthesize_prompt": AgentActionType.synthesize_prompt,
    "generate_voice_anchor": AgentActionType.generate_voice_anchor,
    "generate_shot_video": AgentActionType.generate_shot_video,
    "generate_audio_layer": AgentActionType.generate_audio_layer,
    "assemble_export": AgentActionType.assemble_export,
    "regenerate_target": AgentActionType.regenerate_target,
    "regenerate_element_image": AgentActionType.regenerate_target,
}

ACTION_ALLOWED_STAGE: dict[AgentActionType, frozenset[AgentSessionStage]] = {
    AgentActionType.analyze: frozenset({AgentSessionStage.intake}),
    AgentActionType.divide_shots: frozenset({AgentSessionStage.storyboard}),
    AgentActionType.design_storyboard: frozenset({AgentSessionStage.storyboard}),
    AgentActionType.extract_assets: frozenset({AgentSessionStage.extract}),
    AgentActionType.auto_confirm: frozenset({AgentSessionStage.auto_confirm}),
    AgentActionType.generate_element_image: frozenset({AgentSessionStage.elements_gen, AgentSessionStage.elements_review}),
    AgentActionType.synthesize_prompt: frozenset({AgentSessionStage.elements_gen, AgentSessionStage.elements_review}),
    AgentActionType.generate_voice_anchor: frozenset({AgentSessionStage.voice_anchor}),
    AgentActionType.generate_shot_video: frozenset({AgentSessionStage.shot_video}),
    AgentActionType.generate_audio_layer: frozenset({AgentSessionStage.audio_layer}),
    AgentActionType.assemble_export: frozenset({AgentSessionStage.assemble_export}),
    AgentActionType.regenerate_target: frozenset(
        {
            AgentSessionStage.elements_review,
            AgentSessionStage.voice_anchor,
            AgentSessionStage.shot_video,
            AgentSessionStage.audio_layer,
            AgentSessionStage.assemble_export,
        }
    ),
}

PROTECTED_ARGUMENT_MARKERS = (
    "ignore guard",
    "ignore guards",
    "bypass guard",
    "bypass policy",
    "跳过依赖",
    "绕过依赖",
    "忽略状态机",
)


@dataclass(frozen=True)
class PolicyResult:
    """Policy 校验结果。"""

    updated_state: AgentSessionState
    assistant_message: AgentMessageView
    question_card: QuestionCard | None = None
    actions: list[PlannedAction] = field(default_factory=list)


def _clarification(content: str) -> tuple[AgentMessageView, QuestionCard]:
    card = QuestionCard(
        question=content,
        options=[
            QuestionOption(
                id="stay-and-explain",
                label="补充说明",
                effect="stay_and_collect_feedback",
            )
        ],
    )
    message = AgentMessageView(
        role="assistant",
        kind=AgentMessageKind.question_card,
        content=content,
        payload={"question": card.question},
    )
    return message, card


def _has_prompt_injection(decision: AgentDecision) -> bool:
    text = " ".join(
        [
            decision.intent,
            decision.target_type,
            decision.target_id,
            decision.assistant_message,
            str(decision.arguments),
        ]
    ).lower()
    return any(marker in text for marker in PROTECTED_ARGUMENT_MARKERS)


def _apply_choice(command: AgentTurnCommand, state: AgentSessionState) -> PolicyResult:
    question = state.pending_question
    option = next((item for item in (question.options if question else []) if item.id == command.input.choice_id), None)
    if option is None:
        message, card = _clarification("这个选项已经失效，请重新选择当前问题卡。")
        return PolicyResult(state, message, card)
    if option.effect == "stay_and_collect_feedback":
        updated = AgentSessionState(
            **{
                **state.__dict__,
                "status": AgentSessionStatus.waiting_user,
                "revision": state.revision + 1,
            }
        )
        message = AgentMessageView(
            role="assistant",
            kind=AgentMessageKind.text,
            content="已停在当前阶段，请继续补充修改意见。",
            payload={"choice_id": option.id},
        )
        return PolicyResult(updated, message)

    next_stage = NEXT_STAGE.get(state.stage, state.stage)
    guard = can_enter_stage(next_stage, confirmed_stages=state.confirmed_stages | {state.stage}, completed_stages=state.completed_stages)
    if not guard.allowed:
        message, card = _clarification(guard.reason)
        return PolicyResult(state, message, card)
    updated = AgentSessionState(
        **{
            **state.__dict__,
            "stage": next_stage,
            "status": AgentSessionStatus.active,
            "revision": state.revision + 1,
            "confirmed_stages": state.confirmed_stages | {state.stage},
            "pending_question": None,
        }
    )
    message = AgentMessageView(
        role="assistant",
        kind=AgentMessageKind.text,
        content=f"已确认，进入「{next_stage.value}」。",
        payload={"choice_id": option.id, "next_stage": next_stage.value},
    )
    return PolicyResult(updated, message)


def evaluate_turn(command: AgentTurnCommand, state: AgentSessionState, decision: AgentDecision) -> PolicyResult:
    """把 LLM 决策转为确定性状态变化；所有副作用都必须通过此函数校验。"""

    if command.expected_revision != state.revision:
        message, card = _clarification(f"当前版本已更新到 {state.revision}，请基于最新问题卡继续。")
        return PolicyResult(state, message, card)

    if command.input.type == "choice":
        return _apply_choice(command, state)

    if _has_prompt_injection(decision):
        message, card = _clarification("这条指令试图绕过工作流约束，我会保持当前阶段，请改为具体修改需求。")
        return PolicyResult(state, message, card)

    action_type = INTENT_TO_ACTION.get(decision.intent)
    if action_type is None:
        message, card = _clarification("我还不能安全识别这个动作，请明确你要修改的对象和目标。")
        return PolicyResult(state, message, card)

    allowed_stages = ACTION_ALLOWED_STAGE[action_type]
    if state.stage not in allowed_stages:
        message, card = _clarification(f"当前阶段是「{state.stage.value}」，不能执行「{action_type.value}」。")
        return PolicyResult(state, message, card)

    guard = can_enter_stage(state.stage, confirmed_stages=state.confirmed_stages, completed_stages=state.completed_stages)
    if not guard.allowed:
        message, card = _clarification(guard.reason)
        return PolicyResult(state, message, card)

    if action_type in state.running_action_types:
        message, card = _clarification(f"「{action_type.value}」已经在运行中，请等待当前任务完成。")
        return PolicyResult(state, message, card)

    if decision.target_type and decision.target_id and decision.target_type != "project":
        known_ids = state.known_targets.get(decision.target_type, frozenset())
        if decision.target_id not in known_ids:
            message, card = _clarification(f"找不到目标「{decision.target_id}」，请从已有元素中选择。")
            return PolicyResult(state, message, card)

    planned = PlannedAction(
        action_type=action_type,
        target_type=decision.target_type,
        target_id=decision.target_id,
        input=decision.arguments,
    )
    updated = AgentSessionState(
        **{
            **state.__dict__,
            "revision": state.revision + 1,
            "running_action_types": state.running_action_types | {action_type},
        }
    )
    message = AgentMessageView(
        role="assistant",
        kind=AgentMessageKind.text,
        content=decision.assistant_message or "已通过工作流校验，准备执行。",
        payload={"intent": decision.intent},
    )
    return PolicyResult(updated, message, actions=[planned])
