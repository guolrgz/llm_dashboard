"""推理网关的上游调用与离线模拟。

默认没有外网依赖：模型渠道 ``upstream_base_url`` 为空时使用确定性模拟上游：

* ``prompt_tokens = max(1, ceil(所有 messages 文本字符数 / 4))``
* ``completion_tokens`` 由固定模板长度确定（可用 ``max_tokens`` 截断）
* 非流式返回 OpenAI 兼容 JSON；``stream=true`` 时把同一份内容切成 SSE 分块

模型渠道配置了上游地址时用 ``httpx`` 转发，把上游 ``usage`` 透传给计量链路；
网络错误 / 超时 / 非 200 统一抛 ``UpstreamError``，由路由层降级为 502。
"""

from __future__ import annotations

import json
import math
import secrets
import time
from typing import Any

import httpx

from ..errors import ApiError

UPSTREAM_TIMEOUT_SECONDS = 10.0

# 固定模板：模拟上游的输出长度可复现（约 30 token），用于展示 Token 计量。
SIMULATED_CONTENT = (
    "这是本地模拟上游生成的确定性回复。系统已收到本次推理请求，"
    "并完成 Token 计量、配额校验与 RPM/TPM 限流检查；"
    "如需接入真实模型，请在模型渠道中配置上游地址与密钥。"
)

SSE_CHUNK_CHARS = 8


class UpstreamError(Exception):
    """上游不可用（网络、超时或非 200 响应）。"""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


# ---------------------------------------------------------------------------
# token estimation
# ---------------------------------------------------------------------------
def estimate_tokens(text: str) -> int:
    """确定性估算：4 个字符约 1 个 Token，至少 1。"""
    return max(1, math.ceil(len(text) / 4))


def message_text(message: dict[str, Any]) -> str:
    content = message.get("content")
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    # 多模态 content 数组等情况：稳定序列化后计字符
    return json.dumps(content, ensure_ascii=False, sort_keys=True)


def estimate_prompt_tokens(messages: list[dict[str, Any]]) -> int:
    chars = sum(len(message_text(message or {})) for message in messages)
    return max(1, math.ceil(chars / 4))


def completion_plan(max_tokens: int | None = None) -> tuple[str, int]:
    """返回 (content, completion_tokens)，max_tokens 只截断不放大。"""
    full_tokens = estimate_tokens(SIMULATED_CONTENT)
    tokens = full_tokens
    if isinstance(max_tokens, int) and max_tokens > 0:
        tokens = min(tokens, max_tokens)
    content = SIMULATED_CONTENT[: tokens * 4] if tokens < full_tokens else SIMULATED_CONTENT
    return content, max(1, tokens)


def simulate_completion(
    messages: list[dict[str, Any]], max_tokens: int | None = None
) -> dict[str, Any]:
    content, completion_tokens = completion_plan(max_tokens)
    prompt_tokens = estimate_prompt_tokens(messages)
    return {
        "content": content,
        "promptTokens": prompt_tokens,
        "completionTokens": completion_tokens,
        "totalTokens": prompt_tokens + completion_tokens,
    }


# ---------------------------------------------------------------------------
# OpenAI-compatible payload helpers
# ---------------------------------------------------------------------------
def new_completion_id() -> str:
    return f"chatcmpl-{secrets.token_hex(12)}"


def build_completion_body(
    *,
    completion_id: str,
    created: int,
    model: str,
    content: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> dict[str, Any]:
    return {
        "id": completion_id,
        "object": "chat.completion",
        "created": created,
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": int(prompt_tokens),
            "completion_tokens": int(completion_tokens),
            "total_tokens": int(prompt_tokens) + int(completion_tokens),
        },
    }


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def build_sse_chunks(
    *,
    completion_id: str,
    created: int,
    model: str,
    content: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> list[str]:
    """把完整回复切分成 OpenAI 风格的 SSE 分块，最后以 ``[DONE]`` 结束。"""
    base = {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
    }
    chunks = [
        _sse(
            {
                **base,
                "choices": [
                    {"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}
                ],
            }
        )
    ]
    for index in range(0, len(content), SSE_CHUNK_CHARS):
        piece = content[index: index + SSE_CHUNK_CHARS]
        chunks.append(
            _sse(
                {
                    **base,
                    "choices": [
                        {"index": 0, "delta": {"content": piece}, "finish_reason": None}
                    ],
                }
            )
        )
    chunks.append(
        _sse(
            {
                **base,
                "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                "usage": {
                    "prompt_tokens": int(prompt_tokens),
                    "completion_tokens": int(completion_tokens),
                    "total_tokens": int(prompt_tokens) + int(completion_tokens),
                },
            }
        )
    )
    chunks.append("data: [DONE]\n\n")
    return chunks


# ---------------------------------------------------------------------------
# upstream forwarding
# ---------------------------------------------------------------------------
def post_upstream(url: str, headers: dict[str, str], payload: dict[str, Any]) -> httpx.Response:
    """Thin wrapper so tests can monkeypatch upstream calls."""
    return httpx.post(url, headers=headers, json=payload, timeout=UPSTREAM_TIMEOUT_SECONDS)


def upstream_url(base_url: str) -> str:
    base = (base_url or "").rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    return f"{base}/chat/completions"


def forward_chat(
    model_row: Any,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """把请求转发到真实上游并返回 OpenAI 响应；失败抛 ``UpstreamError``。"""
    model = dict(model_row)
    url = upstream_url(model.get("upstream_base_url", ""))
    headers = {"Content-Type": "application/json"}
    api_key = model.get("upstream_api_key") or ""
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    # 流式统一按非流式转发，再在本地切分为 SSE（保证计量与响应一致）
    upstream_payload = dict(payload)
    upstream_payload["stream"] = False
    try:
        response = post_upstream(url, headers, upstream_payload)
    except httpx.HTTPError as exc:  # pragma: no cover - depends on environment
        raise UpstreamError(f"上游请求失败：{exc}") from None
    if response.status_code != 200:
        raise UpstreamError(
            f"上游返回 HTTP {response.status_code}", status_code=response.status_code
        )
    try:
        body = response.json()
    except (ValueError, json.JSONDecodeError):
        raise UpstreamError("上游返回内容不是合法 JSON") from None
    content = ""
    choices = body.get("choices") or []
    if choices:
        message = choices[0].get("message") or {}
        content = message.get("content") or ""
    usage = body.get("usage") or {}
    prompt_tokens = usage.get("prompt_tokens")
    completion_tokens = usage.get("completion_tokens")
    if not isinstance(prompt_tokens, int) or prompt_tokens < 0:
        prompt_tokens = estimate_prompt_tokens(payload.get("messages") or [])
    if not isinstance(completion_tokens, int) or completion_tokens < 0:
        completion_tokens = estimate_tokens(content)
    return {
        "content": content,
        "promptTokens": prompt_tokens,
        "completionTokens": completion_tokens,
        "totalTokens": int(prompt_tokens) + int(completion_tokens),
    }


def upstream_error_to_api_error(exc: UpstreamError) -> ApiError:
    return ApiError(
        502,
        "upstream_error",
        f"上游模型服务不可用：{exc}",
        {"upstreamStatus": exc.status_code},
    )


def now_seconds() -> int:
    return int(time.time())
