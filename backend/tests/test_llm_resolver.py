from __future__ import annotations

import sys
import types

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models.llm import Model, ModelCategoryKey, ModelSettings, Provider
from app.services.llm import (
    build_default_text_llm,
    build_chat_model_from_provider,
    get_default_model_by_category,
    get_model_by_category,
    get_provider_by_id_or_obj,
    get_provider_by_model_or_id,
)
from app.services.llm.provider_resolver import resolve_effective_base_url
from app.core.contracts.image_generation import ImageGenerationInput, ImageGenerationResult, ImageItem
from app.core.contracts.provider import ProviderConfig
from app.core.contracts.video_generation import VideoGenerationInput, VideoGenerationResult
from app.core.tasks.image_generation_tasks import ImageGenerationTask
from app.core.tasks.video_generation_tasks import VideoGenerationTask


@pytest.mark.asyncio
async def test_get_default_model_by_category_uses_model_settings() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    session_local = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_local() as db:
        provider = Provider(id="p1", name="OpenAI", base_url="https://api.openai.com/v1", api_key="k")
        model = Model(id="m_text", name="gpt-4o-mini", category=ModelCategoryKey.text, provider_id="p1")
        settings = ModelSettings(id=1, default_text_model_id="m_text")
        db.add_all([provider, model, settings])
        await db.commit()

        resolved = await get_default_model_by_category(db, ModelCategoryKey.text)
        assert resolved.id == "m_text"

    await engine.dispose()


@pytest.mark.asyncio
async def test_get_default_model_by_category_requires_model_settings_entry() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    session_local = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_local() as db:
        provider = Provider(id="p1", name="OpenAI", base_url="https://api.openai.com/v1", api_key="k")
        model = Model(
            id="m_text",
            name="gpt-4o-mini",
            category=ModelCategoryKey.text,
            provider_id="p1",
        )
        db.add_all([provider, model])
        await db.commit()

        with pytest.raises(HTTPException) as exc_info:
            await get_default_model_by_category(db, ModelCategoryKey.text)
        assert "No default model configured for category=text" in str(exc_info.value)

    await engine.dispose()


@pytest.mark.asyncio
async def test_get_provider_by_model_or_id_supports_both_inputs() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    session_local = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_local() as db:
        provider = Provider(id="p1", name="OpenAI", base_url="https://api.openai.com/v1", api_key="k")
        model = Model(id="m_text", name="gpt-4o-mini", category=ModelCategoryKey.text, provider_id="p1")
        db.add_all([provider, model])
        await db.commit()

        by_id = await get_provider_by_model_or_id(db, "m_text")
        by_model = await get_provider_by_model_or_id(db, model)
        assert by_id.id == "p1"
        assert by_model.id == "p1"

    await engine.dispose()


@pytest.mark.asyncio
async def test_get_model_by_category_supports_explicit_id_without_default_fallback() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    session_local = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_local() as db:
        provider = Provider(id="p1", name="OpenAI", base_url="https://api.openai.com/v1", api_key="k")
        model = Model(id="m_img", name="gpt-image-1", category=ModelCategoryKey.image, provider_id="p1")
        db.add_all([provider, model])
        await db.commit()

        resolved = await get_model_by_category(
            db,
            ModelCategoryKey.image,
            model_or_id="m_img",
            allow_default_fallback=False,
        )
        assert resolved.id == "m_img"

    await engine.dispose()


@pytest.mark.asyncio
async def test_get_provider_by_id_or_obj_supports_both_inputs() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    session_local = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_local() as db:
        provider = Provider(id="p1", name="OpenAI", base_url="https://api.openai.com/v1", api_key="k")
        db.add(provider)
        await db.commit()

        by_id = await get_provider_by_id_or_obj(db, "p1")
        by_obj = await get_provider_by_id_or_obj(db, provider)
        assert by_id.id == "p1"
        assert by_obj.id == "p1"

    await engine.dispose()


@pytest.mark.asyncio
async def test_build_chat_model_from_provider_builds_chatopenai_with_model_params(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeChatOpenAI:
        def __init__(self, **kwargs):  # noqa: ANN003, ANN204
            self.kwargs = kwargs

    fake_module = types.ModuleType("langchain_openai")
    fake_module.ChatOpenAI = FakeChatOpenAI
    monkeypatch.setitem(sys.modules, "langchain_openai", fake_module)

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    session_local = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_local() as db:
        provider = Provider(id="p1", name="OpenAI", base_url="https://api.openai.com/v1", api_key="k")
        model = Model(
            id="m_text",
            name="gpt-4o-mini",
            category=ModelCategoryKey.text,
            provider_id="p1",
            params={"temperature": 0.2, "max_tokens": 256},
        )
        db.add_all([provider, model])
        await db.commit()

        chat_model = await build_chat_model_from_provider(db, "p1")

        assert isinstance(chat_model, FakeChatOpenAI)
        assert chat_model.kwargs["model"] == "gpt-4o-mini"
        assert chat_model.kwargs["api_key"] == "k"
        assert chat_model.kwargs["base_url"] == "https://api.openai.com/v1"
        assert chat_model.kwargs["temperature"] == 0.2
        assert chat_model.kwargs["max_tokens"] == 256

    await engine.dispose()


@pytest.mark.asyncio
async def test_build_default_text_llm_supports_thinking_toggle(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeChatOpenAI:
        def __init__(self, **kwargs):  # noqa: ANN003, ANN204
            self.kwargs = kwargs

    fake_module = types.ModuleType("langchain_openai")
    fake_module.ChatOpenAI = FakeChatOpenAI
    monkeypatch.setitem(sys.modules, "langchain_openai", fake_module)

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    session_local = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_local() as db:
        provider = Provider(id="p1", name="OpenAI", base_url="https://api.openai.com/v1", api_key="k")
        model = Model(
            id="m_text",
            name="gpt-4o-mini",
            category=ModelCategoryKey.text,
            provider_id="p1",
            params={"temperature": 0.2},
        )
        settings = ModelSettings(id=1, default_text_model_id="m_text")
        db.add_all([provider, model, settings])
        await db.commit()

        thinking_llm = await build_default_text_llm(db, thinking=True)
        nothinking_llm = await build_default_text_llm(db, thinking=False)

        assert isinstance(thinking_llm, FakeChatOpenAI)
        assert "extra_body" not in thinking_llm.kwargs
        assert isinstance(nothinking_llm, FakeChatOpenAI)
        assert nothinking_llm.kwargs["extra_body"]["enable_thinking"] is False

    await engine.dispose()


@pytest.mark.asyncio
async def test_build_default_text_llm_uses_volcengine_seed_thinking_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeChatOpenAI:
        def __init__(self, **kwargs):  # noqa: ANN003, ANN204
            self.kwargs = kwargs

    fake_module = types.ModuleType("langchain_openai")
    fake_module.ChatOpenAI = FakeChatOpenAI
    monkeypatch.setitem(sys.modules, "langchain_openai", fake_module)

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    session_local = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_local() as db:
        provider = Provider(id="p1", name="火山引擎", base_url="https://ark.cn-beijing.volces.com/api/v3", api_key="k")
        model = Model(
            id="m_text",
            name="doubao-seed-2-0-lite-260215",
            category=ModelCategoryKey.text,
            provider_id="p1",
        )
        settings = ModelSettings(id=1, default_text_model_id="m_text")
        db.add_all([provider, model, settings])
        await db.commit()

        thinking_llm = await build_default_text_llm(db, thinking=True)
        nothinking_llm = await build_default_text_llm(db, thinking=False)

        assert thinking_llm.kwargs["extra_body"]["thinking"] == {"type": "enabled"}
        assert nothinking_llm.kwargs["extra_body"]["thinking"] == {"type": "disabled"}
        assert "enable_thinking" not in thinking_llm.kwargs["extra_body"]
        assert "enable_thinking" not in nothinking_llm.kwargs["extra_body"]

    await engine.dispose()


@pytest.mark.asyncio
async def test_build_default_text_llm_uses_deepseek_thinking_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeChatOpenAI:
        def __init__(self, **kwargs):  # noqa: ANN003, ANN204
            self.kwargs = kwargs

    fake_module = types.ModuleType("langchain_openai")
    fake_module.ChatOpenAI = FakeChatOpenAI
    monkeypatch.setitem(sys.modules, "langchain_openai", fake_module)

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    session_local = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_local() as db:
        provider = Provider(id="p1", name="openai", base_url="https://api.deepseek.com/v1", api_key="k")
        model = Model(
            id="m_text",
            name="deepseek-v4-pro",
            category=ModelCategoryKey.text,
            provider_id="p1",
        )
        settings = ModelSettings(id=1, default_text_model_id="m_text")
        db.add_all([provider, model, settings])
        await db.commit()

        thinking_llm = await build_default_text_llm(db, thinking=True)
        nothinking_llm = await build_default_text_llm(db, thinking=False)

        assert thinking_llm.kwargs["extra_body"]["thinking"] == {"type": "enabled"}
        assert nothinking_llm.kwargs["extra_body"]["thinking"] == {"type": "disabled"}
        assert "enable_thinking" not in thinking_llm.kwargs["extra_body"]
        assert "enable_thinking" not in nothinking_llm.kwargs["extra_body"]

    await engine.dispose()


@pytest.mark.asyncio
async def test_seedream_image_path_does_not_apply_text_thinking_params(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def _fail_if_text_thinking_path_is_used(*_args, **_kwargs) -> None:
        calls.append("called")
        raise AssertionError("image generation must not call text thinking resolver")

    async def _fake_generate(*, cfg: ProviderConfig, inp: ImageGenerationInput, timeout_s: float):
        assert cfg.provider == "volcengine"
        assert inp.model == "doubao-seedream-5-0-pro-260628"
        assert timeout_s == 10
        return ImageGenerationResult(
            provider="volcengine",
            images=[ImageItem(url="https://example.test/image.png")],
            status="succeeded",
        )

    monkeypatch.setattr("app.services.llm.resolver.apply_thinking_params", _fail_if_text_thinking_path_is_used)
    monkeypatch.setattr("app.core.integrations.volcengine.images.VolcengineImageApiAdapter.generate", _fake_generate)

    task = ImageGenerationTask(
        provider_config=ProviderConfig(provider="volcengine", base_url="https://ark.example/api/v3", api_key="k"),
        input_=ImageGenerationInput(
            prompt="竖屏短剧角色图",
            model="doubao-seedream-5-0-pro-260628",
            target_ratio="9:16",
            purpose="video_reference",
        ),
        timeout_s=10,
    )

    await task.run()

    result = await task.get_result()
    assert result is not None
    assert result.images[0].url == "https://example.test/image.png"
    assert calls == []


@pytest.mark.asyncio
async def test_seedance_video_path_does_not_apply_text_thinking_params(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def _fail_if_text_thinking_path_is_used(*_args, **_kwargs) -> None:
        calls.append("called")
        raise AssertionError("video generation must not call text thinking resolver")

    async def _fake_create(*, cfg: ProviderConfig, input_: VideoGenerationInput, timeout_s: float):
        assert cfg.provider == "volcengine"
        assert input_.model == "doubao-seedance-2-0-260128"
        assert timeout_s == 10
        return "task-video-1"

    async def _fake_get(*, cfg: ProviderConfig, task_id: str, timeout_s: float):
        assert task_id == "task-video-1"
        return {"status": "succeeded", "content": {"video_url": "https://example.test/video.mp4"}}

    monkeypatch.setattr("app.services.llm.resolver.apply_thinking_params", _fail_if_text_thinking_path_is_used)
    monkeypatch.setattr(
        "app.core.integrations.volcengine.video.VolcengineVideoApiAdapter.create_contents_task",
        _fake_create,
    )
    monkeypatch.setattr(
        "app.core.integrations.volcengine.video.VolcengineVideoApiAdapter.get_contents_task",
        _fake_get,
    )

    task = VideoGenerationTask(
        provider_config=ProviderConfig(provider="volcengine", base_url="https://ark.example/api/v3", api_key="k"),
        input_=VideoGenerationInput(
            prompt="女主走进雨夜",
            model="doubao-seedance-2-0-260128",
            ratio="9:16",
        ),
        poll_interval_s=0,
        timeout_s=10,
    )

    await task.run()

    result = await task.get_result()
    assert result is not None
    assert result.url == "https://example.test/video.mp4"
    assert calls == []


def test_resolve_effective_base_url_prefers_category_specific_url() -> None:
    provider = Provider(
        id="p1",
        name="OpenAI",
        base_url="https://gateway.example/v1",
        image_base_url="https://image-gateway.example/v1",
        video_base_url="https://video-gateway.example/v1",
        api_key="k",
    )
    assert (
        resolve_effective_base_url(provider=provider, category=ModelCategoryKey.text)
        == "https://gateway.example/v1"
    )
    assert (
        resolve_effective_base_url(provider=provider, category=ModelCategoryKey.image)
        == "https://image-gateway.example/v1"
    )
    assert (
        resolve_effective_base_url(provider=provider, category=ModelCategoryKey.video)
        == "https://video-gateway.example/v1"
    )
