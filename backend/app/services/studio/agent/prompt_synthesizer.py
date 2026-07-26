from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol


ElementKind = Literal["character", "scene", "prop"]


@dataclass(frozen=True)
class FinalVideoSpec:
    """Final_Video_Spec 中提示词合成需要的最小字段。"""

    title: str
    output_language: str = "中文"
    visual_style: str = ""
    aspect_ratio: str = "9:16"


@dataclass(frozen=True)
class ElementBible:
    """关键元素的一致性定义，作为每次生成的稳定锚点。"""

    element_id: str
    kind: ElementKind
    name: str
    identity: str = ""
    face_shape: str = ""
    jawline: str = ""
    eye_shape: str = ""
    gaze: str = ""
    iris_color: str = ""
    hairstyle: str = ""
    hair_color: str = ""
    makeup: str = ""
    clothing: str = ""
    body: str = ""
    temperament: str = ""
    voice: str = ""
    material: str = ""
    color: str = ""
    size: str = ""
    condition: str = ""
    unique_marks: str = ""
    spatial_layout: str = ""
    action_area: str = ""


@dataclass(frozen=True)
class ImagePromptRequest:
    """图片提示词合成请求。"""

    final_video_spec: FinalVideoSpec
    element: ElementBible
    user_instruction: str = ""
    chinese_environment: bool = True
    allow_red_blue_neon: bool = False
    extra_context: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ImagePromptResult:
    """图片提示词合成结果。"""

    prompt: str
    model_category: Literal["text"] = "text"
    hard_rules: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class VideoPromptRequest:
    """视频提示词合成接口占位；执行接入留到视频批次。"""

    final_video_spec: FinalVideoSpec
    shot: dict[str, Any]
    user_instruction: str = ""
    chinese_environment: bool = True


@dataclass(frozen=True)
class VideoPromptResult:
    """视频提示词合成结果占位。"""

    prompt: str
    model_category: Literal["text"] = "text"


class PromptSynthesisLLM(Protocol):
    """提示词合成 LLM 协议；生产环境使用默认文本模型 resolver 注入。"""

    async def synthesize_image_prompt(self, request: dict[str, Any]) -> str:
        """把三源输入融合为自然流畅的一段图片提示词。"""


class PromptSynthesizer:
    """Flova 提示词合成器。

    LLM 负责把角色圣经、六条电影级规则和用户自然语言融合为自然表达；
    确定性代码负责补齐 Skill 硬规则，避免质量约束只停留在提示词模板里。
    """

    def __init__(self, llm: PromptSynthesisLLM) -> None:
        self._llm = llm

    async def synthesize_image_prompt(self, request: ImagePromptRequest) -> ImagePromptResult:
        """合成 Step 4 关键元素图片提示词。"""

        llm_payload = {
            "language_rule": _language_rule(request),
            "element_bible": _element_bible_source(request.element),
            "cinematic_rules": list(CINEMATIC_RULES),
            "user_instruction": request.user_instruction.strip(),
            "hard_rules": _hard_rules(request),
            "output_contract": "只输出一段自然流畅的提示词，不分标签段落，不解释规则。",
            "extra_context": request.extra_context,
        }
        raw_prompt = await self._llm.synthesize_image_prompt(llm_payload)
        prompt = _single_paragraph(raw_prompt)
        prompt = _provider_safe_prompt(prompt)
        hard_rules = _hard_rules(request)
        prompt = _append_missing_hard_rules(prompt, hard_rules)
        return ImagePromptResult(prompt=prompt, hard_rules=hard_rules)

    async def synthesize_video_prompt(self, request: VideoPromptRequest) -> VideoPromptResult:
        """视频提示词接口占位；Phase 3 不接 Seedance 执行链。"""

        raise NotImplementedError("视频提示词合成将在后续视频批次接入。")


CINEMATIC_RULES: tuple[str, ...] = (
    "专业风格术语：使用可执行的电影级构图、光影、镜头和调色锚点，不写泛泛的 film noir。",
    "构图与镜头：写清景别、角度和镜头构图，例如 close-up、over-the-shoulder、Dutch angle。",
    "光影：明确主光方向和质感，加入 negative fill 形成明暗对比。",
    "调色：好莱坞高级调色，约 90% 画面保持单一主色调；除非用户明确要求，禁止红蓝霓虹冲突。",
    "视觉渲染：写清材质、精细度、柔焦、颗粒或镜头质感。",
    "氛围与潜台词：只描述可见微表情、姿态和戏剧瞬间，不解释不可见心理。",
)


def _language_rule(request: ImagePromptRequest) -> str:
    prompt_language = "中文" if request.chinese_environment else "English"
    return (
        f"提示词使用{prompt_language}；旁白或对白内容必须严格使用 "
        f"Final_Video_Spec.output_language={request.final_video_spec.output_language}。"
    )


def _element_bible_source(element: ElementBible) -> dict[str, Any]:
    base: dict[str, Any] = {
        "element_id": element.element_id,
        "kind": element.kind,
        "name": element.name,
        "identity": element.identity,
        "voice": element.voice,
    }
    if element.kind == "character":
        base.update(
            {
                "face_shape": element.face_shape,
                "jawline": element.jawline,
                "eye_shape": element.eye_shape,
                "gaze": element.gaze,
                "iris_color": element.iris_color,
                "hairstyle": element.hairstyle,
                "hair_color": element.hair_color,
                "makeup": element.makeup,
                "clothing": element.clothing,
                "body": element.body,
                "temperament": element.temperament,
                "reference_layout": (
                    "标准角色设定表横向规整布局：左侧一张大幅正脸特写；右侧三张等大、整齐网格并列的"
                    "全身正面、全身侧面、全身背面。四视角同一角色、同服装、同发型、统一比例、统一光照，"
                    "全部 A-pose 标准站姿，pure white / clean white studio background。"
                ),
            }
        )
    elif element.kind == "prop":
        base.update(
            {
                "material": element.material,
                "color": element.color,
                "size": element.size,
                "condition": element.condition,
                "unique_marks": element.unique_marks,
            }
        )
    else:
        base.update(
            {
                "spatial_layout": element.spatial_layout,
                "action_area": element.action_area,
            }
        )
    return {key: value for key, value in base.items() if value not in ("", None)}


def build_character_bible_json(request: ImagePromptRequest) -> dict[str, Any]:
    """把角色提示词请求固化为可跨章节复用的结构化圣经。"""

    if request.element.kind != "character":
        raise ValueError("character bible can only be built for character elements")
    source = _element_bible_source(request.element)
    return {
        "schema_version": 1,
        "source": "prompt_synthesizer",
        "element_id": request.element.element_id,
        "name": request.element.name,
        "identity": request.element.identity,
        "visual_anchors": {
            "face_shape": request.element.face_shape,
            "jawline": request.element.jawline,
            "eye_shape": request.element.eye_shape,
            "gaze": request.element.gaze,
            "iris_color": request.element.iris_color,
            "hairstyle": request.element.hairstyle,
            "hair_color": request.element.hair_color,
            "makeup": request.element.makeup,
            "clothing": request.element.clothing,
            "body": request.element.body,
            "temperament": request.element.temperament,
        },
        "wearable_accessories": _wearable_accessories_from_character(request.element),
        "voice": request.element.voice,
        "reference_layout": source.get("reference_layout", ""),
        "hard_rules": list(_hard_rules(request)),
        "final_video_spec": {
            "title": request.final_video_spec.title,
            "output_language": request.final_video_spec.output_language,
            "visual_style": request.final_video_spec.visual_style,
            "aspect_ratio": request.final_video_spec.aspect_ratio,
        },
    }


def _wearable_accessories_from_character(element: ElementBible) -> list[dict[str, str]]:
    haystack = " ".join(
        [
            element.identity,
            element.clothing,
            element.makeup,
            element.temperament,
            element.unique_marks,
        ]
    )
    found = [term for term in WEARABLE_ACCESSORY_TERMS if term in haystack]
    return [
        {
            "name": term,
            "placement": _wearable_accessory_placement(term, haystack),
        }
        for term in found
    ]


def _wearable_accessory_placement(term: str, haystack: str) -> str:
    if term == "胸针" and ("胸前" in haystack or "胸口" in haystack):
        return "胸前/胸口固定佩戴"
    if term in {"戒指", "手表", "手链"}:
        return "手部/腕部固定佩戴"
    if term in {"项链"}:
        return "颈部固定佩戴"
    if term in {"耳环", "耳坠"}:
        return "耳部固定佩戴"
    if term in {"发饰", "头饰"}:
        return "发型上固定佩戴"
    return "随身穿戴，位置需跨图保持一致"


def _hard_rules(request: ImagePromptRequest) -> tuple[str, ...]:
    neon_rule = (
        "除非用户明确要求，禁止红蓝霓虹冲突。"
        if not request.allow_red_blue_neon
        else "用户允许红蓝霓虹冲突时，仍需保持主体身份清晰。"
    )
    rules = [
        "角色跨镜头必须保持 eye shape、jawline、hairstyle、hair color、clothing 与参考图一致。",
        "关键元素图不要出现任何文字、字幕、logo、水印或可读字符，保持画面干净。",
        f"调色约 90% 画面保持单一主色调，{neon_rule}",
    ]
    if request.element.kind == "character":
        rules.append(
            "角色参考图必须是标准角色设定表规整布局：左侧仅一张大幅正脸特写确认身份、肤色、眼型、眼神、"
            "发际线和五官比例；右侧三张等大、整齐网格并列的全身正面、全身侧面、全身背面，确认服装正面、"
            "侧脸轮廓、发型侧面、身形、发型背面和服装背面；全部 A-pose、统一光照、统一比例，"
            "禁止大小不一、位置散乱的拼贴。"
        )
        rules.append(
            "穿戴类配饰必须并入角色圣经并画在人物四视图身上，不单独生成资产图；胸针、戒指、项链、耳环、"
            "发饰、手表、领带夹等随身佩戴物要固定在对应身体/服装位置，例如沈知夏胸前别着旧胸针。"
        )
    if request.element.kind == "character":
        rules.append(
            "人物资产背景必须统一纯白 pure white / clean white studio background，不是浅灰，不含任何场景、环境、家具或背景元素。"
        )
    elif request.element.kind == "prop":
        if _is_wearable_accessory(request.element):
            rules.append(
                "该元素是穿戴类配饰，不要单独生成道具资产图；必须作为角色圣经的一部分穿戴在人物身上，固定在对应身体/服装位置。"
            )
        else:
            rules.append(
                "独立道具资产图必须使用纯白 pure white / clean white studio background，不是浅灰，不含任何场景、环境、家具或背景元素。"
            )
    return tuple(rules)


WEARABLE_ACCESSORY_TERMS: tuple[str, ...] = (
    "胸针",
    "戒指",
    "项链",
    "耳环",
    "耳坠",
    "发饰",
    "头饰",
    "手表",
    "手链",
    "袖扣",
    "领带夹",
    "别针",
)


def _is_wearable_accessory(element: ElementBible) -> bool:
    """判断道具是否属于应并入角色圣经的穿戴类配饰。"""

    haystack = " ".join(
        [
            element.name,
            element.identity,
            element.material,
            element.color,
            element.size,
            element.condition,
            element.unique_marks,
        ]
    )
    return any(term in haystack for term in WEARABLE_ACCESSORY_TERMS)


def _append_missing_hard_rules(prompt: str, hard_rules: tuple[str, ...]) -> str:
    result = prompt.strip()
    for rule in hard_rules:
        key_terms = _rule_key_terms(rule)
        if not all(term in result for term in key_terms):
            result = f"{result} {rule}".strip()
    return _single_paragraph(result)


def _rule_key_terms(rule: str) -> tuple[str, ...]:
    if "eye shape" in rule:
        return ("eye shape", "jawline", "hairstyle", "hair color", "clothing")
    if "不要出现任何文字" in rule:
        return ("不要出现任何文字",)
    if "90%" in rule:
        return ("90%", "单一主色调")
    if "标准角色设定表规整布局" in rule:
        return ("标准角色设定表", "左侧", "大幅正脸特写", "右侧", "等大", "全身正面", "全身侧面", "全身背面", "A-pose")
    if "穿戴类配饰必须并入角色圣经" in rule:
        return ("穿戴类配饰", "并入角色圣经", "人物四视图身上", "不单独生成资产图")
    if "pure white / clean white studio background" in rule:
        return ("pure white", "clean white studio background", "不是浅灰")
    if "不要单独生成道具资产图" in rule:
        return ("穿戴类配饰", "不要单独生成道具资产图", "角色圣经")
    return (rule,)


def _single_paragraph(text: str) -> str:
    return " ".join(text.replace("\r", "\n").split())


_PROVIDER_SENSITIVE_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    ("王家卫", "高密度暖色都市怀旧影像"),
    ("Wong Kar-wai", "高密度暖色都市怀旧影像"),
    ("Wong Kar Wai", "高密度暖色都市怀旧影像"),
    ("韦斯·安德森", "精确对称构图与低饱和复古调色"),
    ("韦斯-安德森", "精确对称构图与低饱和复古调色"),
    ("Wes Anderson", "精确对称构图与低饱和复古调色"),
    ("罗伯特·约曼", "精确构图与柔和胶片质感"),
    ("Robert Yeoman", "精确构图与柔和胶片质感"),
    ("《花样年华》", "暖琥珀色都市怀旧影像"),
    ("In the Mood for Love", "暖琥珀色都市怀旧影像"),
    ("Kodak 5219", "柔和 35mm 胶片质感"),
)


def _provider_safe_prompt(prompt: str) -> str:
    """把易触发商用图像平台版权风格拦截的专名转写为可执行视觉特征。"""

    result = prompt
    for source, replacement in _PROVIDER_SENSITIVE_REPLACEMENTS:
        result = result.replace(source, replacement)
    result = re.sub(r"参考[^，。；]{0,24}(导演|掌镜|作品)[^，。；]{0,24}[，。；]?", "参考电影级视觉语言，", result)
    return _single_paragraph(result)
