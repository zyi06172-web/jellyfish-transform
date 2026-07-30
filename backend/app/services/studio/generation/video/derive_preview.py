from __future__ import annotations

import asyncio
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.schemas.studio.shots import ShotVideoPromptPackRead, ShotVideoPromptPreviewRead
from app.services.llm.resolver import build_default_text_llm
from app.services.studio.agent.prompt_synthesizer import FinalVideoSpec, PromptSynthesizer, VideoPromptRequest
from app.services.studio.generation.shared.types import GenerationDerivedPreview
from app.services.studio.generation.video.build_base import VideoBaseDraft
from app.services.studio.generation.video.build_context import VideoGenerationContext
from app.services.studio.shot_video_prompt_pack import (
    _fallback_video_prompt,
    _pack_variables,
    _render_template,
    _resolve_video_prompt_template,
    build_shot_video_prompt_pack,
    enrich_rendered_video_prompt,
)


class VideoDerivedPreview(GenerationDerivedPreview):
    """视频生成预览结果。"""

    kind: str = "video"
    shot_id: str
    reference_mode: str
    rendered_prompt: str
    images: list[str]
    pack: ShotVideoPromptPackRead
    template_id: str | None = None
    template_name: str | None = None


async def derive_video_preview(
    db,
    *,
    base: VideoBaseDraft,
    context: VideoGenerationContext,
) -> VideoDerivedPreview:
    pack = await build_shot_video_prompt_pack(db, shot_id=base.shot_id)
    if base.prompt:
        rendered_prompt = enrich_rendered_video_prompt(
            rendered_prompt=base.prompt,
            pack=pack,
        )
        return VideoDerivedPreview(
            shot_id=base.shot_id,
            reference_mode=context.reference_mode,
            rendered_prompt=rendered_prompt,
            images=context.images,
            pack=pack,
            template_id=context.template_id,
            template_name=None,
            warnings=[],
        )

    synthesized_prompt = await _try_synthesize_video_prompt(db, base=base, pack=pack)
    if synthesized_prompt:
        rendered_prompt = enrich_rendered_video_prompt(
            rendered_prompt=synthesized_prompt,
            pack=pack,
        )
        return VideoDerivedPreview(
            shot_id=base.shot_id,
            reference_mode=context.reference_mode,
            rendered_prompt=rendered_prompt,
            images=context.images,
            pack=pack,
            template_id=context.template_id,
            template_name=None,
            warnings=[],
        )

    template = await _resolve_video_prompt_template(db, template_id=context.template_id)
    warnings: list[str] = []
    if template is None:
        warnings.append("未配置视频提示词模板，已使用系统默认拼装提示词")
        rendered_prompt = _fallback_video_prompt(pack)
    else:
        rendered_prompt = _render_template(template.content, _pack_variables(pack))
        if not rendered_prompt:
            warnings.append("视频提示词模板渲染结果为空，已使用系统默认拼装提示词")
            rendered_prompt = _fallback_video_prompt(pack)
        else:
            rendered_prompt = enrich_rendered_video_prompt(
                rendered_prompt=rendered_prompt,
                pack=pack,
            )

    return VideoDerivedPreview(
        shot_id=base.shot_id,
        reference_mode=context.reference_mode,
        rendered_prompt=rendered_prompt.strip(),
        images=context.images,
        pack=pack,
        template_id=template.id if template else None,
        template_name=template.name if template else None,
        warnings=warnings,
    )


async def _try_synthesize_video_prompt(
    db,
    *,
    base: VideoBaseDraft,
    pack: ShotVideoPromptPackRead,
) -> str:
    """优先用文本模型合成视频运动提示词，失败时交给模板 fallback。"""

    try:
        llm = await asyncio.wait_for(build_default_text_llm(db, thinking=False), timeout=15)
        request = _build_video_prompt_request(base=base, pack=pack)
        result = await PromptSynthesizer(_DeepSeekVideoPromptSynthesisLLM(llm)).synthesize_video_prompt(request)
        return result.prompt.strip()
    except Exception:  # noqa: BLE001
        return ""


def _build_video_prompt_request(
    *,
    base: VideoBaseDraft,
    pack: ShotVideoPromptPackRead,
) -> VideoPromptRequest:
    """把现有 video prompt pack 转成 LLM 合成器输入。"""

    character_assets = [item.model_dump() for item in pack.characters]
    scene_asset = pack.scene.model_dump() if pack.scene else None
    seconds = base.seconds if base.seconds not in (None, "") else pack.camera.duration
    ratio = base.ratio or "16:9"
    action_beats = list(pack.action_beats)
    movement_delta = _movement_delta_from_pack(pack)
    return VideoPromptRequest(
        final_video_spec=FinalVideoSpec(
            title=pack.title,
            output_language="中文",
            visual_style=", ".join(part for part in [pack.visual_style, pack.style] if part),
            aspect_ratio=ratio,
        ),
        shot={
            "shot_id": pack.shot_id,
            "title": pack.title,
            "script_excerpt": pack.script_excerpt,
            "camera_shot": pack.camera.camera_shot,
            "angle": pack.camera.angle,
            "movement": pack.camera.movement,
            "atmosphere": pack.atmosphere,
        },
        seconds=seconds,
        ratio=ratio,
        shot_six_elements={
            "camera_shot": pack.camera.camera_shot,
            "angle": pack.camera.angle,
            "movement": pack.camera.movement,
            "lighting": pack.atmosphere,
        },
        action_beats=action_beats,
        previous_shot=pack.previous_shot_summary,
        next_shot=pack.next_shot_goal,
        continuity_guidance=pack.continuity_guidance,
        screen_direction=pack.screen_direction_guidance,
        composition_anchor=pack.composition_anchor,
        character_assets=character_assets,
        scene_asset=scene_asset,
        first_frame=action_beats[0] if action_beats else pack.script_excerpt,
        last_frame=action_beats[-1] if action_beats else pack.script_excerpt,
        movement_delta=movement_delta,
    )


def _movement_delta_from_pack(pack: ShotVideoPromptPackRead) -> str:
    """从动作拍点中推导首帧到尾帧的可见运动差异。"""

    if len(pack.action_beats) >= 2:
        return f"从“{pack.action_beats[0]}”推进到“{pack.action_beats[-1]}”"
    if pack.action_beats:
        return f"围绕“{pack.action_beats[0]}”做持续状态内的细微推进"
    return pack.script_excerpt


class _DeepSeekVideoPromptSynthesisLLM:
    """把默认文本模型适配成 PromptSynthesizer 需要的协议。"""

    def __init__(self, llm: Any) -> None:
        self._llm = llm

    async def synthesize_image_prompt(self, request: dict[str, Any]) -> str:  # noqa: ARG002
        raise NotImplementedError("video preview only uses synthesize_video_prompt")

    async def synthesize_video_prompt(self, request: dict[str, Any]) -> str:
        messages = [
            SystemMessage(
                content=(
                    "你是 Flova 视频运动提示词合成器。把镜头六要素、首尾帧差异、动作拍点、"
                    "连续性、构图和资产信息融合成一段自然、专业、可执行的中文图生视频提示词。"
                    "只输出一段，不分标签段落，不解释规则。"
                )
            ),
            HumanMessage(content=str(request)),
        ]
        response = await asyncio.wait_for(self._llm.ainvoke(messages), timeout=60)
        content = getattr(response, "content", response)
        return content if isinstance(content, str) else str(content)


def to_shot_video_prompt_preview_read(
    *,
    derived: VideoDerivedPreview,
) -> ShotVideoPromptPreviewRead:
    return ShotVideoPromptPreviewRead(
        shot_id=derived.shot_id,
        template_id=derived.template_id,
        template_name=derived.template_name,
        rendered_prompt=derived.rendered_prompt,
        pack=derived.pack,
        warnings=derived.warnings,
    )
