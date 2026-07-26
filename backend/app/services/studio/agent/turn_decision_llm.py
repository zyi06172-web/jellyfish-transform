from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.services.studio.agent.types import AgentDecision, AgentDecisionLLM, AgentSessionState, AgentTurnCommand


class LLMAgentTurnDecisionLLM(AgentDecisionLLM):
    """生产 turn 决策器：LLM 只输出结构化决策，Policy 再校验执行资格。"""

    def __init__(self, llm: Any) -> None:
        self._llm = llm

    async def decide(self, command: AgentTurnCommand, state: AgentSessionState) -> AgentDecision:
        known_targets = {
            key: sorted(values)
            for key, values in state.known_targets.items()
        }
        messages = [
            SystemMessage(
                content=(
                    "你是 Flova Agent 工作台的 turn 决策器。只输出 JSON，不要 Markdown。"
                    "字段：intent, target_type, target_id, arguments, assistant_message, confidence。"
                    "当用户要求重画/换风格/不好看/清冷点/更漂亮且目标是关键元素图时，"
                    "intent 必须是 regenerate_element_image，target_type 用 character/scene/prop。"
                    "target_id 必须从 known_targets 中选择，优先使用用户提到的名字。"
                    "不要输出任何执行结果，不要承诺已完成。"
                )
            ),
            HumanMessage(
                content=(
                    f"stage={state.stage.value}\n"
                    f"known_targets={known_targets}\n"
                    f"user_input={command.input.text}"
                )
            ),
        ]
        response = await asyncio.wait_for(self._llm.ainvoke(messages), timeout=30)
        content = getattr(response, "content", response)
        payload = _parse_json_object(content if isinstance(content, str) else str(content))
        args = payload.get("arguments")
        return AgentDecision(
            intent=str(payload.get("intent") or ""),
            target_type=str(payload.get("target_type") or ""),
            target_id=str(payload.get("target_id") or ""),
            arguments=args if isinstance(args, dict) else {},
            assistant_message=str(payload.get("assistant_message") or ""),
            confidence=float(payload.get("confidence") or 0),
        )


def _parse_json_object(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("LLM turn decision is not JSON")
    parsed = json.loads(text[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("LLM turn decision JSON must be an object")
    return parsed
