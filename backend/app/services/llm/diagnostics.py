"""供应商与模型真实连通性诊断。"""

from __future__ import annotations

import os
import time
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.bootstrap import bootstrap_all_registries
from app.core.contracts.image_generation import ImageGenerationInput
from app.core.contracts.provider import ProviderConfig
from app.core.integrations.volcengine.images import VolcengineImageApiAdapter
from app.models.llm import Model, ModelCategoryKey, Provider, ProviderStatus
from app.schemas.llm import LlmDiagnosticRead
from app.services.common import entity_not_found, get_or_404
from app.services.llm.provider_resolver import resolve_effective_base_url
from app.services.llm.provider_registry import resolve_provider_key_from_name


_DIAGNOSE_PROBE_COUNT = 0


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


def _diagnostic(
    status: str,
    message: str,
    *,
    url: str | None,
    provider: str | None,
    model_id: str | None,
    elapsed_ms: int | None = None,
    raw_error: Any | None = None,
) -> LlmDiagnosticRead:
    """统一构造诊断响应，保证前端三态处理稳定。"""
    return LlmDiagnosticRead(
        status=status,
        message=message,
        checked_url=_masked_url(url),
        provider=provider,
        model_id=model_id,
        elapsed_ms=elapsed_ms,
        raw_error=raw_error,
    )


def _raw_response_summary(response: httpx.Response) -> Any:
    """提取供应商原始错误摘要，保留排查价值同时控制体积。"""
    try:
        return response.json()
    except ValueError:
        return (response.text or "")[:1000]


def _diagnose_probe_cap() -> int:
    """读取诊断真实付费探测上限，避免反复点击烧掉额度。"""
    raw = os.getenv("NUWA_DIAGNOSE_PROBE_CAP", "3").strip()
    try:
        return int(raw)
    except ValueError:
        return 3


def _consume_paid_diagnose_probe() -> bool:
    """扣减本进程诊断付费探测额度；返回 False 表示已到上限。"""
    global _DIAGNOSE_PROBE_COUNT
    cap = _diagnose_probe_cap()
    if cap <= 0:
        return False
    if _DIAGNOSE_PROBE_COUNT >= cap:
        return False
    _DIAGNOSE_PROBE_COUNT += 1
    return True


async def _diagnose_volcengine_image_model(
    *,
    provider: Provider,
    model: Model,
    base_url: str | None,
    api_key: str,
) -> LlmDiagnosticRead:
    """火山图片模型用真实 ImageGenerations 最小请求诊断，不再探测不存在的 /models/{id}。"""
    endpoint = _join_url(base_url or "https://ark.cn-beijing.volces.com/api/v3", "/images/generations")
    if not _consume_paid_diagnose_probe():
        return _diagnostic(
            "error",
            f"诊断真实生图探测已达到 NUWA_DIAGNOSE_PROBE_CAP={_diagnose_probe_cap()}，请稍后重启服务或调高上限后再试。",
            url=endpoint,
            provider="volcengine",
            model_id=model.id,
        )

    adapter = VolcengineImageApiAdapter()
    inp = ImageGenerationInput(
        prompt="a gray square",
        model=model.name,
        target_ratio="1:1",
        resolution_profile="standard",
        purpose="generic",
        size="1024x1024",
        n=1,
        watermark=False,
        response_format="url",
    )
    started = time.perf_counter()
    try:
        result = await adapter.generate(
            cfg=ProviderConfig(provider="volcengine", api_key=api_key, base_url=base_url),
            inp=inp,
            timeout_s=180.0,
        )
    except httpx.TimeoutException:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return _diagnostic("error", "火山真实生图诊断超时。", url=endpoint, provider="volcengine", model_id=model.id, elapsed_ms=elapsed_ms)
    except httpx.HTTPStatusError as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return _diagnostic(
            "error",
            f"火山真实生图诊断失败：HTTP {exc.response.status_code}",
            url=endpoint,
            provider="volcengine",
            model_id=model.id,
            elapsed_ms=elapsed_ms,
            raw_error=_raw_response_summary(exc.response),
        )
    except Exception as exc:  # noqa: BLE001
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return _diagnostic(
            "error",
            f"火山真实生图诊断失败：{exc.__class__.__name__}: {exc}",
            url=endpoint,
            provider="volcengine",
            model_id=model.id,
            elapsed_ms=elapsed_ms,
            raw_error=str(exc)[:1000],
        )

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    first = result.images[0] if result.images else None
    if first and (first.url or first.b64_json):
        return _diagnostic(
            "ok",
            f"火山真实生图诊断成功：端点返回 1 张图片，耗时 {elapsed_ms}ms。",
            url=endpoint,
            provider="volcengine",
            model_id=model.id,
            elapsed_ms=elapsed_ms,
        )
    return _diagnostic(
        "error",
        "火山真实生图诊断失败：HTTP 成功但返回体没有可用图片 URL/base64。",
        url=endpoint,
        provider="volcengine",
        model_id=model.id,
        elapsed_ms=elapsed_ms,
        raw_error=result.model_dump(),
    )


async def _diagnose_text_chat_model(
    *,
    provider_key: str,
    provider: Provider,
    model: Model,
    base_url: str | None,
    api_key: str,
) -> LlmDiagnosticRead:
    """OpenAI-compatible 文本模型用最小 chat.completions 请求诊断。"""
    url = _join_url(base_url, "/chat/completions")
    if not url:
        return _diagnostic("error", "缺少 Base URL，无法执行文本模型真实诊断。", url=None, provider=provider_key, model_id=model.id)
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {
        "model": model.name,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 1,
        "temperature": 0,
    }
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(url, headers=headers, json=body)
    except httpx.TimeoutException:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return _diagnostic("error", "文本模型真实诊断超时。", url=url, provider=provider_key, model_id=model.id, elapsed_ms=elapsed_ms)
    except httpx.HTTPError as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return _diagnostic("error", f"文本模型真实诊断失败：{exc.__class__.__name__}", url=url, provider=provider_key, model_id=model.id, elapsed_ms=elapsed_ms)
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    if 200 <= response.status_code < 300:
        return _diagnostic("ok", f"文本模型真实诊断成功，耗时 {elapsed_ms}ms。", url=url, provider=provider_key, model_id=model.id, elapsed_ms=elapsed_ms)
    return _diagnostic(
        "error",
        f"文本模型真实诊断失败：HTTP {response.status_code}",
        url=url,
        provider=provider_key,
        model_id=model.id,
        elapsed_ms=elapsed_ms,
        raw_error=_raw_response_summary(response),
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
    """对模型执行真实诊断；不同类别走各自真实生成/兼容端点。"""
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

    if model.category == ModelCategoryKey.image and provider_key == "volcengine":
        return await _diagnose_volcengine_image_model(provider=provider, model=model, base_url=base_url, api_key=api_key)
    if model.category == ModelCategoryKey.text:
        return await _diagnose_text_chat_model(
            provider_key=provider_key,
            provider=provider,
            model=model,
            base_url=base_url,
            api_key=api_key,
        )
    if model.category == ModelCategoryKey.video:
        return _diagnostic(
            "warning",
            "视频模型未执行真实付费诊断：为避免诊断按钮触发视频费用，本接口不再使用虚假的 /models/{id} 探测；请通过视频 dry-run 或显式生成任务验证。",
            url=_join_url(base_url, "/contents/generations/tasks") if provider_key == "volcengine" else None,
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
