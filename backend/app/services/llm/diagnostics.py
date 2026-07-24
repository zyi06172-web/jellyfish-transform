"""供应商与模型真实连通性诊断。"""

from __future__ import annotations

from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.bootstrap import bootstrap_all_registries
from app.models.llm import Model, ModelCategoryKey, Provider, ProviderStatus
from app.schemas.llm import LlmDiagnosticRead
from app.services.common import entity_not_found, get_or_404
from app.services.llm.provider_resolver import resolve_effective_base_url
from app.services.llm.provider_registry import resolve_provider_key_from_name


def _masked_url(url: str | None) -> str | None:
    """返回可展示 URL，避免把查询串或内部路径细节原样暴露在诊断里。"""
    if not url:
        return None
    parsed = httpx.URL(url)
    return str(parsed.copy_with(query=None))


def _join_url(base_url: str | None, path: str) -> str | None:
    """拼接 OpenAI-compatible API 路径。"""
    if not base_url:
        return None
    return f"{base_url.rstrip('/')}/{path.lstrip('/')}"


def _diagnostic(status: str, message: str, *, url: str | None, provider: str | None, model_id: str | None) -> LlmDiagnosticRead:
    """统一构造诊断响应，保证前端三态处理稳定。"""
    return LlmDiagnosticRead(
        status=status,
        message=message,
        checked_url=_masked_url(url),
        provider=provider,
        model_id=model_id,
    )


async def diagnose_provider_connection(db: AsyncSession, *, provider_id: str) -> LlmDiagnosticRead:
    """对供应商执行真实 HTTP 连通性检查，不再返回固定成功。"""
    bootstrap_all_registries()
    provider = await get_or_404(db, Provider, provider_id, detail=entity_not_found("Provider"))
    provider_key = resolve_provider_key_from_name(provider.name)
    if provider.status == ProviderStatus.disabled:
        return _diagnostic(
            "error",
            "供应商已禁用，请先启用后再测试。",
            url=None,
            provider=provider_key,
            model_id=None,
        )

    base_url = resolve_effective_base_url(provider=provider, category=ModelCategoryKey.text, provider_key=provider_key)
    url = _join_url(base_url, "/models")
    if not url:
        return _diagnostic(
            "error",
            "缺少 Base URL，无法发起真实连接测试。",
            url=None,
            provider=provider_key,
            model_id=None,
        )

    headers = {"Authorization": f"Bearer {(provider.api_key or '').strip()}"} if (provider.api_key or "").strip() else {}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers)
    except httpx.TimeoutException:
        return _diagnostic("error", "连接超时，请检查 Base URL 或网络。", url=url, provider=provider_key, model_id=None)
    except httpx.HTTPError as exc:
        return _diagnostic("error", f"连接失败：{exc.__class__.__name__}", url=url, provider=provider_key, model_id=None)

    if 200 <= response.status_code < 300:
        return _diagnostic("ok", "连接成功，供应商接口可访问。", url=url, provider=provider_key, model_id=None)
    if response.status_code in {401, 403}:
        return _diagnostic(
            "error",
            "接口可访问，但认证失败，请检查 API Key / Secret。",
            url=url,
            provider=provider_key,
            model_id=None,
        )
    if response.status_code == 404:
        return _diagnostic(
            "warning",
            "Base URL 可访问，但 /models 不存在；该供应商可能不是 OpenAI-compatible 接口。",
            url=url,
            provider=provider_key,
            model_id=None,
        )
    return _diagnostic(
        "warning",
        f"接口返回 HTTP {response.status_code}，请确认供应商配置。",
        url=url,
        provider=provider_key,
        model_id=None,
    )


async def diagnose_model_generation(db: AsyncSession, *, model_id: str) -> LlmDiagnosticRead:
    """对模型执行轻量真实诊断，优先检查模型 ID 是否能被供应商识别。"""
    bootstrap_all_registries()
    model = await get_or_404(db, Model, model_id, detail=entity_not_found("Model"))
    provider = await get_or_404(db, Provider, model.provider_id, detail=entity_not_found("Provider"))
    provider_key = resolve_provider_key_from_name(provider.name)
    if provider.status == ProviderStatus.disabled:
        return _diagnostic(
            "error",
            "模型所属供应商已禁用，请先启用供应商。",
            url=None,
            provider=provider_key,
            model_id=model.id,
        )

    base_url = resolve_effective_base_url(provider=provider, category=model.category, provider_key=provider_key)
    url = _join_url(base_url, f"/models/{model.name}")
    if not url:
        return _diagnostic(
            "error",
            "缺少 Base URL，无法验证模型。",
            url=None,
            provider=provider_key,
            model_id=model.id,
        )
    api_key = (provider.api_key or "").strip()
    if not api_key:
        return _diagnostic(
            "error",
            "缺少 API Key，无法执行真实模型测试。",
            url=url,
            provider=provider_key,
            model_id=model.id,
        )

    headers: dict[str, str] = {"Authorization": f"Bearer {api_key}"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers)
    except httpx.TimeoutException:
        return _diagnostic("error", "模型测试超时，请检查 Base URL 或网络。", url=url, provider=provider_key, model_id=model.id)
    except httpx.HTTPError as exc:
        return _diagnostic("error", f"模型测试失败：{exc.__class__.__name__}", url=url, provider=provider_key, model_id=model.id)

    if 200 <= response.status_code < 300:
        return _diagnostic(
            "ok",
            "模型 ID 已被供应商接口识别，可用于后续生成。",
            url=url,
            provider=provider_key,
            model_id=model.id,
        )
    if response.status_code == 404:
        return _diagnostic(
            "error",
            "供应商未识别该模型名称；请确认模型 ID 填写的是 API 使用的真实 model 字符串。",
            url=url,
            provider=provider_key,
            model_id=model.id,
        )
    if response.status_code in {401, 403}:
        return _diagnostic(
            "error",
            "认证失败，请检查供应商 API Key / Secret。",
            url=url,
            provider=provider_key,
            model_id=model.id,
        )
    detail: Any
    try:
        detail = response.json()
    except ValueError:
        detail = response.text[:120]
    return _diagnostic(
        "warning",
        f"模型接口返回 HTTP {response.status_code}：{detail}",
        url=url,
        provider=provider_key,
        model_id=model.id,
    )
