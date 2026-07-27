from __future__ import annotations

import pytest

from app.services.studio.agent.prompt_synthesizer import (
    CINEMATIC_RULES,
    ElementBible,
    FinalVideoSpec,
    ImagePromptRequest,
    KeyframeImagePromptRequest,
    PromptSynthesizer,
    VideoPromptRequest,
)

pytestmark = pytest.mark.asyncio


class FakePromptLLM:
    """Fake LLM adapter：记录合成输入，并返回一段单段落提示词。"""

    def __init__(self, response: str) -> None:
        self.response = response
        self.calls: list[dict] = []

    async def synthesize_image_prompt(self, request: dict) -> str:
        self.calls.append(request)
        user_instruction = request["user_instruction"]
        element = request.get("element_bible") or {"name": request.get("panel", {}).get("title", "关键帧")}
        return self.response.format(
            name=element.get("name", "关键帧"),
            user_instruction=user_instruction or "无额外用户输入",
        )

    async def synthesize_video_prompt(self, request: dict) -> str:
        self.calls.append(request)
        shot = request["shot"]
        return self.response.format(
            name=shot.get("title", "镜头"),
            user_instruction=request["user_instruction"] or "无额外用户输入",
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


def _prop_request(user_instruction: str = "更精致一点") -> ImagePromptRequest:
    return ImagePromptRequest(
        final_video_spec=FinalVideoSpec(
            title="婚礼协议",
            output_language="中文",
            visual_style="写实短剧",
            aspect_ratio="9:16",
        ),
        element=ElementBible(
            element_id="Element_旧胸针",
            kind="prop",
            name="旧胸针",
            identity="沈知夏母亲留下的旧胸针",
            material="暗金色金属和微旧珍珠",
            color="暖金与象牙白",
            size="掌心大小",
            condition="有轻微岁月磨损",
            unique_marks="边缘有一处细小刻痕",
        ),
        user_instruction=user_instruction,
        chinese_environment=True,
    )


def _independent_prop_request(user_instruction: str = "更精致一点") -> ImagePromptRequest:
    return ImagePromptRequest(
        final_video_spec=FinalVideoSpec(
            title="婚礼协议",
            output_language="中文",
            visual_style="写实短剧",
            aspect_ratio="9:16",
        ),
        element=ElementBible(
            element_id="Element_捧花",
            kind="prop",
            name="捧花",
            identity="沈知夏手持的白色婚礼捧花，会作为独立手持道具出现在镜头里",
            material="白玫瑰、丝带和少量绿叶",
            color="象牙白与淡绿色",
            size="双手可握的花束大小",
            condition="新鲜完整",
            unique_marks="丝带尾端自然垂落",
        ),
        user_instruction=user_instruction,
        chinese_environment=True,
    )


def _scene_request(user_instruction: str = "更庄重") -> ImagePromptRequest:
    return ImagePromptRequest(
        final_video_spec=FinalVideoSpec(
            title="婚礼协议",
            output_language="中文",
            visual_style="写实短剧",
            aspect_ratio="9:16",
        ),
        element=ElementBible(
            element_id="Element_婚礼大堂",
            kind="scene",
            name="婚礼大堂",
            identity="仪式举行的大堂",
            spatial_layout="中央红毯，两侧宾客席，远端舞台与巨幕",
            action_area="红毯中央与舞台前方",
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
    assert "标准角色设定表" in payload["element_bible"]["reference_layout"]
    assert "大幅正脸特写" in payload["element_bible"]["reference_layout"]
    assert "全身正面" in payload["element_bible"]["reference_layout"]
    assert "全身侧面" in payload["element_bible"]["reference_layout"]
    assert "全身背面" in payload["element_bible"]["reference_layout"]
    assert "pure white / clean white studio background" in payload["element_bible"]["reference_layout"]
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
    assert "标准角色设定表" in prompt
    assert "大幅正脸特写" in prompt
    assert "全身正面" in prompt
    assert "全身侧面" in prompt
    assert "全身背面" in prompt
    assert "A-pose" in prompt
    assert "等大" in prompt
    assert "统一光照" in prompt
    assert "统一比例" in prompt
    assert "禁止大小不一" in prompt
    assert "pure white" in prompt
    assert "clean white studio background" in prompt
    assert "不是浅灰" in prompt
    assert "不含任何场景" in prompt
    assert "穿戴类配饰" in prompt
    assert "并入角色圣经" in prompt
    assert "人物四视图身上" in prompt
    assert "不单独生成资产图" in prompt
    assert "\n" not in prompt


async def test_wearable_accessory_prompt_merges_into_character_bible() -> None:
    """穿戴类配饰不单独出图，改为并入角色圣经。"""

    llm = FakePromptLLM("写实道具资产图，{name}置于画面中央，材质清晰。")
    synthesizer = PromptSynthesizer(llm)

    result = await synthesizer.synthesize_image_prompt(_prop_request())
    prompt = result.prompt

    assert "旧胸针" in prompt
    assert "穿戴类配饰" in prompt
    assert "不要单独生成道具资产图" in prompt
    assert "角色圣经" in prompt
    assert "穿戴在人物身上" in prompt
    assert "pure white" not in prompt
    assert "clean featureless soft grey" not in prompt
    assert "大幅正脸特写" not in prompt
    assert "全身背面" not in prompt


async def test_independent_prop_prompt_gets_clean_white_background() -> None:
    """独立道具仍单独出图，并使用纯白背景。"""

    llm = FakePromptLLM("写实道具资产图，{name}置于画面中央，材质清晰。")
    synthesizer = PromptSynthesizer(llm)

    result = await synthesizer.synthesize_image_prompt(_independent_prop_request())
    prompt = result.prompt

    assert "捧花" in prompt
    assert "独立道具资产图" in prompt
    assert "pure white" in prompt
    assert "clean white studio background" in prompt
    assert "不是浅灰" in prompt
    assert "不含任何场景" in prompt
    assert "不要单独生成道具资产图" not in prompt
    assert "大幅正脸特写" not in prompt


async def test_scene_prompt_keeps_environment_background() -> None:
    """场景图不注入角色/道具空白背景规则，保留正常环境出图空间。"""

    llm = FakePromptLLM("婚礼大堂全景，中央红毯、宾客席、舞台和巨幕，空间层次清楚。")
    synthesizer = PromptSynthesizer(llm)

    result = await synthesizer.synthesize_image_prompt(_scene_request())
    prompt = result.prompt

    assert "婚礼大堂" in prompt
    assert "中央红毯" in prompt
    assert "pure white" not in prompt
    assert "clean white studio background" not in prompt
    assert "clean featureless soft grey" not in prompt
    assert "不含任何场景" not in prompt
    assert "全身正面" not in prompt


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


async def test_image_prompt_rewrites_provider_sensitive_style_names() -> None:
    """出图前把具体导演、作品、胶片品牌转写成平台更稳定的视觉描述。"""

    llm = FakePromptLLM("参考王家卫《花样年华》式调色，Wes Anderson 对称构图，Kodak 5219 胶片，{name}。")
    synthesizer = PromptSynthesizer(llm)

    result = await synthesizer.synthesize_image_prompt(_character_request())

    assert "王家卫" not in result.prompt
    assert "花样年华" not in result.prompt
    assert "Wes Anderson" not in result.prompt
    assert "Kodak 5219" not in result.prompt
    assert "暖琥珀色都市怀旧影像" in result.prompt
    assert "精确对称构图" in result.prompt
    assert "35mm 胶片质感" in result.prompt


async def test_video_prompt_synthesizer_outputs_motion_prompt_with_hard_rules() -> None:
    """视频提示词合成器把运动逻辑、时长画幅和负向约束确定性补齐。"""

    llm = FakePromptLLM("冷司寒入场镜头，镜头缓慢推近，人物从门口走向红毯中央。")
    synthesizer = PromptSynthesizer(llm)

    result = await synthesizer.synthesize_video_prompt(
        VideoPromptRequest(
            final_video_spec=FinalVideoSpec(title="婚礼协议", output_language="中文", aspect_ratio="9:16"),
            shot={"shot_id": "shot-1", "title": "冷司寒入场", "movement": "DOLLY_IN"},
            seconds=2,
            ratio="9:16",
            action_beats=["冷司寒推门入场", "全场目光转向他"],
            movement_delta="从门口逆光剪影推进到红毯中央",
            screen_direction="沿红毯纵深保持 180° 轴线",
            composition_anchor="以宴会厅大门和红毯为构图锚点",
        )
    )
    prompt = result.prompt

    assert "冷司寒" in prompt
    assert "2 秒" in prompt
    assert "9:16" in prompt
    assert "谁动" in prompt
    assert "怎么动" in prompt
    assert "速度" in prompt
    assert "轨迹" in prompt
    assert "screen_direction" in prompt
    assert "composition_anchor" in prompt
    assert "180°" in prompt
    assert "不要新增无关人物" in prompt
    assert "不要改变角色身份" in prompt
    assert "画面闪烁" in prompt
    assert "\n" not in prompt


async def test_keyframe_prompt_synthesizer_locks_single_realistic_frame() -> None:
    """关键帧图片提示词输出单段自然提示，并补齐单秒画面与无文字约束。"""

    llm = FakePromptLLM("超写实电影剧照，{name}，人物站在婚礼大堂红毯上。")
    synthesizer = PromptSynthesizer(llm)

    result = await synthesizer.synthesize_keyframe_image_prompt(
        KeyframeImagePromptRequest(
            final_video_spec=FinalVideoSpec(title="婚礼协议", visual_style="写实短剧", aspect_ratio="9:16"),
            panel={
                "title": "冷司寒入场",
                "six_elements": {
                    "shot_size": {"value": "MS"},
                    "camera": {"value": "DOLLY_IN"},
                    "lighting": {"value": "门口逆光"},
                },
            },
            character_bible={"name": "冷司寒", "clothing": "黑色西装"},
            character_references=["图1"],
            scene_asset={"name": "婚礼大堂", "description": "中央红毯"},
            screen_direction="沿红毯纵深保持 180° 轴线",
            composition_anchor="门口和红毯为构图锚点",
        )
    )

    assert "超写实" in result.prompt
    assert "电影级光影" in result.prompt
    assert "只画" in result.prompt
    assert "这一秒" in result.prompt
    assert "不要分镜框" in result.prompt
    assert "画面文字" in result.prompt
    assert "screen_direction" in result.prompt
    assert "composition_anchor" in result.prompt
    assert "\n" not in result.prompt
