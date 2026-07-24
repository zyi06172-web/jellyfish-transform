"""LLM 诊断服务测试：确保连接/模型测试基于真实 HTTP 响应。"""

from __future__ import annotations

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models.llm import Model, ModelCategoryKey, Provider
from app.services.llm.diagnostics import diagnose_model_generation, diagnose_provider_connection


async def _build_session() -> tuple[AsyncSession, object]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    session_local = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return session_local(), engine


def _patch_httpx_client(monkeypatch: pytest.MonkeyPatch, transport: httpx.MockTransport) -> None:
    """让诊断服务的真实 HTTP 调用在测试中走 MockTransport。"""
    real_client = httpx.AsyncClient

    def factory(**kwargs: object) -> httpx.AsyncClient:
        kwargs["transport"] = transport
        return real_client(**kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", factory)


@pytest.mark.asyncio
async def test_diagnose_provider_connection_uses_models_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    seen_paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen_paths.append(request.url.path)
        assert request.headers["authorization"] == "Bearer sk-test"
        return httpx.Response(200, json={"data": []})

    _patch_httpx_client(monkeypatch, httpx.MockTransport(handler))
    db, engine = await _build_session()
    async with db:
        db.add(Provider(id="p1", name="OpenAI", base_url="https://api.example.com/v1", api_key="sk-test"))
        await db.commit()

        result = await diagnose_provider_connection(db, provider_id="p1")

        assert result.status == "ok"
        assert result.checked_url == "https://api.example.com/v1/models"
        assert seen_paths == ["/v1/models"]
    await engine.dispose()


@pytest.mark.asyncio
async def test_diagnose_model_generation_reports_unknown_model(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/models/not-real"
        return httpx.Response(404, json={"error": {"message": "model not found"}})

    _patch_httpx_client(monkeypatch, httpx.MockTransport(handler))
    db, engine = await _build_session()
    async with db:
        db.add(Provider(id="p1", name="OpenAI", base_url="https://api.example.com/v1", api_key="sk-test"))
        db.add(Model(id="m1", name="not-real", category=ModelCategoryKey.text, provider_id="p1"))
        await db.commit()

        result = await diagnose_model_generation(db, model_id="m1")

        assert result.status == "error"
        assert "模型名称" in result.message
        assert result.checked_url == "https://api.example.com/v1/models/not-real"
    await engine.dispose()
