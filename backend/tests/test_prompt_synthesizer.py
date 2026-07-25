from __future__ import annotations

import pytest

from app.services.studio.agent.prompt_synthesizer import (
    CINEMATIC_RULES,
    ElementBible,
    FinalVideoSpec,
    ImagePromptRequest,
    PromptSynthesizer,
    VideoPromptRequest,
)


class FakePromptLLM:
    """Fake LLM adapter：记录合成输入，并返回一段单段落提示词。"""

    def __init__(self, response: str) -> None:
        self.response = response
        self.calls: list[dict] = []

    async def synthesize_image_prompt(self, request: dict) -> str:
        self.calls.append(request)
        user_instruction = request["user_instruction"]
        element = request["element_bible"]
        return self.response.format(
            name=element["name"],
            user_instruction=user_instruction or "无额外用户输入",
        )


def _character_request(user_instruction: str = "女主更清冷、更年轻") -> ImagePromptRequest:
    return ImagePromptRequest(
        final_video_spec=FinalVideoSpec(
            title="婚礼协议",
            output_language="中文",
            visual_style="写实短剧",
            aspect_ratio="9:16",
        ),
        element=ElementBible(
            element_id="Element_沈知夏",
            kind="character",
            name="沈知夏",
            identity="二十四岁伴娘，被迫签下一年婚姻协议",
            face_shape="小鹅蛋脸",
            jawline="清晰但柔和的下颌线",
            eye_shape="细长杏眼",
            gaze="克制、微红但不失防备",
            iris_color="深棕色",
            hairstyle="低盘发，碎发贴近脸侧",
            hair_color="黑色",
            makeup="淡妆，眼尾微红",
            clothing="浅香槟色伴娘礼服，缎面材质，收腰剪裁",
            body="纤细挺直",
            temperament="清冷、压抑、倔强",
            voice="轻而紧绷的年轻女声",
        ),
        user_instruction=user_instruction,
        chinese_environment=True,
    )


async def test_image_prompt_synthesizer_sends_three_sources_to_fake_llm() -> None:
    """合成器向 LLM 提供角色圣经、六条电影级规则和用户自然语言三源。"""

    llm = FakePromptLLM("电影级角色参考图，{name}，{user_instruction}，横向并列构图。")
    synthesizer = PromptSynthesizer(llm)

    result = await synthesizer.synthesize_image_prompt(_character_request())

    assert len(llm.calls) == 1
    payload = llm.calls[0]
    assert payload["element_bible"]["eye_shape"] == "细长杏眼"
    assert payload["element_bible"]["jawline"] == "清晰但柔和的下颌线"
    assert payload["element_bible"]["hairstyle"] == "低盘发，碎发贴近脸侧"
    assert payload["element_bible"]["hair_color"] == "黑色"
    assert payload["element_bible"]["clothing"] == "浅香槟色伴娘礼服，缎面材质，收腰剪裁"
    assert payload["cinematic_rules"] == list(CINEMATIC_RULES)
    assert payload["user_instruction"] == "女主更清冷、更年轻"
    assert "提示词使用中文" in payload["language_rule"]
    assert "Final_Video_Spec.output_language=中文" in payload["language_rule"]
    assert "沈知夏" in result.prompt


async def test_image_prompt_contains_consistency_anchors_clean_screen_and_color_constraints() -> None:
    """LLM 漏写硬规则时，合成器仍补齐一致性锚点、无文字和单主色调约束。"""

    llm = FakePromptLLM("写实短剧剧照质感，{name}站在婚礼大堂边缘，negative fill 强化面部阴影。")
    synthesizer = PromptSynthesizer(llm)

    result = await synthesizer.synthesize_image_prompt(_character_request())
    prompt = result.prompt

    assert "eye shape" in prompt
    assert "jawline" in prompt
    assert "hairstyle" in prompt
    assert "hair color" in prompt
    assert "clothing" in prompt
    assert "不要出现任何文字" in prompt
    assert "字幕" in prompt
    assert "logo" in prompt
    assert "水印" in prompt
    assert "90%" in prompt
    assert "单一主色调" in prompt
    assert "禁止红蓝霓虹冲突" in prompt
    assert "左侧脸部近景" in prompt
    assert "右侧全身" in prompt
    assert "\n" not in prompt


async def test_image_prompt_zero_user_input_still_produces_complete_prompt() -> None:
    """用户零输入时，角色圣经和固定规则仍能生成完整提示词。"""

    llm = FakePromptLLM("横向并列角色参考图，{name}，左脸近景和右全身，{user_instruction}。")
    synthesizer = PromptSynthesizer(llm)

    result = await synthesizer.synthesize_image_prompt(_character_request(user_instruction=""))

    assert "沈知夏" in result.prompt
    assert "无额外用户输入" in result.prompt
    assert "eye shape" in result.prompt
    assert "不要出现任何文字" in result.prompt
    assert "90%" in result.prompt
    assert len(result.prompt) > 80


async def test_image_prompt_respects_red_blue_neon_user_override() -> None:
    """用户明确允许红蓝霓虹时，不再注入禁止冲突，但仍保留身份清晰约束。"""

    request = ImagePromptRequest(
        final_video_spec=FinalVideoSpec(title="霓虹广告", output_language="中文"),
        element=_character_request().element,
        user_instruction="允许红蓝霓虹对撞",
        allow_red_blue_neon=True,
    )
    llm = FakePromptLLM("红蓝霓虹中的{name}，但身份清楚。")
    synthesizer = PromptSynthesizer(llm)

    result = await synthesizer.synthesize_image_prompt(request)

    assert "禁止红蓝霓虹冲突" not in result.prompt
    assert "用户允许红蓝霓虹冲突" in result.prompt
    assert "主体身份清晰" in result.prompt


async def test_video_prompt_interface_is_signature_only_for_this_phase() -> None:
    """Phase 3 只保留视频提示词接口，不接 Seedance。"""

    synthesizer = PromptSynthesizer(FakePromptLLM("不会被调用"))

    with pytest.raises(NotImplementedError, match="后续视频批次"):
        await synthesizer.synthesize_video_prompt(
            VideoPromptRequest(
                final_video_spec=FinalVideoSpec(title="婚礼协议", output_language="中文"),
                shot={"shot_id": "shot-1"},
            )
        )
