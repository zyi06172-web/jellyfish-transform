from __future__ import annotations

from app.services.studio.generation.shared.types import GenerationBaseDraft


class VideoBaseDraft(GenerationBaseDraft):
    """视频生成的基础真值。"""

    kind: str = "video"
    shot_id: str
    prompt: str
    ratio: str = ""
    seconds: int | float | None = None


def build_video_base_draft(
    *,
    shot_id: str,
    prompt: str | None,
    ratio: str | None = None,
    seconds: int | float | None = None,
) -> VideoBaseDraft:
    return VideoBaseDraft(
        shot_id=shot_id,
        prompt=(prompt or "").strip(),
        ratio=(ratio or "").strip(),
        seconds=seconds,
    )
