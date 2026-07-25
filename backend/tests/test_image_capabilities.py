from __future__ import annotations

import pytest

from app.core.contracts.image_generation import ImageGenerationInput
from app.core.integrations.image_capabilities import resolve_image_size
from app.core.integrations.volcengine.image_capabilities import validate_volcengine_image_options


def test_seedream_5_pro_resolves_legal_9_16_size_for_video_reference() -> None:
    size = resolve_image_size(
        provider="volcengine",
        model="doubao-seedream-5-0-pro-260628",
        purpose="video_reference",
        target_ratio="9:16",
        resolution_profile=None,
        requested_size=None,
    )

    assert size == "1584x2816"


def test_seedream_5_pro_validates_9_16_size() -> None:
    validate_volcengine_image_options(
        ImageGenerationInput(
            prompt="竖屏短剧女主角参考图",
            model="doubao-seedream-5-0-pro-260628",
            purpose="video_reference",
            target_ratio="9:16",
            size="1584x2816",
            n=1,
        )
    )


def test_seedream_5_pro_rejects_legacy_9_16_size() -> None:
    with pytest.raises(ValueError) as exc_info:
        validate_volcengine_image_options(
            ImageGenerationInput(
                prompt="竖屏短剧女主角参考图",
                model="doubao-seedream-5-0-pro-260628",
                purpose="video_reference",
                target_ratio="9:16",
                size="1600x2848",
                n=1,
            )
        )

    assert "Unsupported size" in str(exc_info.value)


def test_seedream_5_pro_limits_batch_size_to_one() -> None:
    with pytest.raises(ValueError) as exc_info:
        validate_volcengine_image_options(
            ImageGenerationInput(
                prompt="竖屏短剧女主角参考图",
                model="doubao-seedream-5-0-pro-260628",
                purpose="video_reference",
                target_ratio="9:16",
                size="1584x2816",
                n=2,
            )
        )

    assert "n must be <= 1" in str(exc_info.value)
