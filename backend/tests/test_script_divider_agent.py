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
