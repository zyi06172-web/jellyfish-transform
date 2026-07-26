from __future__ import annotations

import json

from app.chains.agents.script_divider_agent import ScriptDividerAgent


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
