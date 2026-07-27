from __future__ import annotations

import json
import importlib.util
import sys
import types
from pathlib import Path

from pydantic import BaseModel, Field


class ShotDivision(BaseModel):
    """测试用分镜结构，避免导入完整 schema 包。"""

    index: int
    start_line: int | None = None
    end_line: int | None = None
    script_excerpt: str
    shot_name: str = ""
    time_of_day: str | None = None


class ScriptDivisionResult(BaseModel):
    """测试用分镜结果，只覆盖当前单测读取的字段。"""

    shots: list[ShotDivision] = Field(default_factory=list)
    total_shots: int = 0


class AgentBase:
    """测试用 AgentBase，保留构造和泛型接口即可。"""

    def __init__(self, llm: object) -> None:
        self.llm = llm

    def extract(self, **_: object) -> object:
        raise AssertionError("extract should not be called in unit tests")

    async def aextract(self, **_: object) -> object:
        raise AssertionError("aextract should not be called in unit tests")

    def __class_getitem__(cls, _: object) -> type["AgentBase"]:
        return cls


def _extract_json_from_text(raw: str) -> str:
    return raw.strip()


def _load_script_divider_agent() -> type:
    """按文件加载脚本拆分 agent，避免重型 package __init__。"""

    base_module = types.ModuleType("app.chains.agents.base")
    base_module.AgentBase = AgentBase
    base_module._extract_json_from_text = _extract_json_from_text

    schema_module = types.ModuleType("app.schemas.skills.script_processing")
    schema_module.ScriptDivisionResult = ScriptDivisionResult

    for name, module in {
        "app.chains": types.ModuleType("app.chains"),
        "app.chains.agents": types.ModuleType("app.chains.agents"),
        "app.chains.agents.base": base_module,
        "app.schemas": types.ModuleType("app.schemas"),
        "app.schemas.skills": types.ModuleType("app.schemas.skills"),
        "app.schemas.skills.script_processing": schema_module,
    }.items():
        module.__dict__.setdefault("__path__", [])
        sys.modules.setdefault(name, module)

    module_path = Path(__file__).resolve().parents[1] / "app/chains/agents/script_divider_agent.py"
    spec = importlib.util.spec_from_file_location("script_divider_agent_under_test", module_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module.ScriptDividerAgent


ScriptDividerAgent = _load_script_divider_agent()


def test_script_divider_normalizes_common_time_of_day_synonyms() -> None:
    result = ScriptDividerAgent(None).format_output(  # type: ignore[arg-type]
        json.dumps(
            {
                "shots": [
                    {
                        "index": 1,
                        "start_line": 1,
                        "end_line": 1,
                        "shot_name": "白天婚礼入口",
                        "script_excerpt": "婚礼当天，沈知夏站在入口。",
                        "time_of_day": "白天",
                    },
                    {
                        "index": 2,
                        "start_line": 2,
                        "end_line": 2,
                        "shot_name": "夜晚婚宴厅",
                        "script_excerpt": "夜晚婚宴厅灯火通明。",
                        "time_of_day": "夜晚",
                    },
                ]
            },
            ensure_ascii=False,
        )
    )

    assert result.shots[0].time_of_day == "日"
    assert result.shots[1].time_of_day == "夜"


def test_script_divider_prompt_requires_fidelity_and_timeline_order() -> None:
    prompt = ScriptDividerAgent(None).system_prompt  # type: ignore[arg-type]

    assert "脚本忠实度是最高优先级" in prompt
    assert "严格忠实用户输入的原剧本，只做技术性的镜头拆分" in prompt
    assert "禁止自行扩展、改写、补写或添加" in prompt
    assert "shot_name 只能概括对应 script_excerpt 中已经出现的画面/动作" in prompt
    assert "分镜必须按原剧本时间先后顺序排列" in prompt
    assert "剧情要紧凑，不注水" in prompt
    assert "故事板 v2 只实现 5 秒档" in prompt
    assert "第 1-5 格各代表 1 秒画面时间，第 6 格留空" in prompt
    assert "同一状态可跨秒 hold" in prompt
