"""推理网关（OpenAI 兼容）+ 流量日志查询。

``gateway_router`` 挂在根路径（``/v1/chat/completions``），``router`` 挂在
``/api``（流量日志/摘要/限流事件）。网关判定顺序严格遵循规格：

    API Key 有效 → 用户启用 → 请求体合法 → 模型可用 → 配额 → 限流 → 转发/模拟 → 计量

任何环节失败都会写一条审计日志（``request_logs``），但只有成功请求才累加
``usage_buckets`` / ``token_usage``。
"""

from __future__ import annotations

import random
import sqlite3
import time
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse

from .. import security, utils
from ..deps import get_db, require_permission
from ..errors import ApiError
from ..services import alerts as alert_service
from ..services import gateway, metering, rate_limit

router = APIRouter(tags=["traffic"])
gateway_router = APIRouter(tags=["gateway"])

RANGE_DAYS = {"today": 1, "7d": 7, "30d": 30}

STATUS_LABELS = {
    "success": "成功",
    "error": "失败",
    "rate_limited": "限流",
    "quota_exceeded": "配额超限",
    "unauthorized": "鉴权失败",
}


# ---------------------------------------------------------------------------
# shared helpers
# ---------------------------------------------------------------------------
def parse_range(range_key: str | None, *, default: str | None = None) -> str:
    value = (range_key or default or "").strip()
    if value not in RANGE_DAYS:
        raise ApiError(
            400,
            "validation_error",
            f"不支持的 range：{range_key}（可选 today/7d/30d）",
        )
    return value


def range_start(range_key: str, *, current_time=None) -> str:
    days = RANGE_DAYS[range_key]
    base = utils.day_start(current_time)
    return utils.iso(base - timedelta(days=days - 1))


def log_item(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "time": row["ts"],
        "userId": row["user_id"],
        "username": row["username"],
        "keyPrefix": row["key_prefix"],
        "model": row["model"],
        "promptTokens": row["prompt_tokens"],
        "completionTokens": row["completion_tokens"],
        "totalTokens": row["total_tokens"],
        "status": row["status"],
        "httpStatus": row["http_status"],
        "latencyMs": row["latency_ms"],
        "errorCode": row["error_code"],
    }


def _pick_model(models: list[sqlite3.Row]) -> sqlite3.Row:
    weights = [max(1, int(model["weight"] or 1)) for model in models]
    return random.choices(models, weights=weights, k=1)[0]


# ---------------------------------------------------------------------------
# gateway: POST /v1/chat/completions
# ---------------------------------------------------------------------------
@gateway_router.post("/v1/chat/completions")
async def chat_completions(
    request: Request,
    authorization: str | None = Header(default=None),
    conn: sqlite3.Connection = Depends(get_db),
):
    started = time.perf_counter()

    def elapsed_ms() -> int:
        return int((time.perf_counter() - started) * 1000)

    def fail(
        status: str,
        http_status: int,
        code: str,
        message: str,
        *,
        user_id: int | None = None,
        username: str = "",
        key_prefix: str = "",
        model: str = "",
        error_code: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        """写失败审计日志后抛出统一 API 错误（日志与告警同事务提交）。"""
        metering.record_failure(
            conn,
            status=status,
            http_status=http_status,
            error_code=error_code or code,
            user_id=user_id,
            username=username,
            key_prefix=key_prefix,
            model=model,
            latency_ms=elapsed_ms(),
        )
        conn.commit()
        raise ApiError(http_status, code, message, headers=headers or {})

    # ---- 请求体 ---------------------------------------------------------
    try:
        payload: Any = await request.json()
    except Exception:  # noqa: BLE001 - any JSON parse failure is a 400
        fail("error", 400, "validation_error", "请求体不是合法 JSON", error_code="invalid_json")
    if not isinstance(payload, dict):
        fail("error", 400, "validation_error", "请求体必须是 JSON 对象")

    model_name = payload.get("model")
    model_for_log = model_name if isinstance(model_name, str) else ""
    stream = payload.get("stream", False)
    max_tokens = payload.get("max_tokens")
    temperature = payload.get("temperature")
    messages = payload.get("messages")

    # ---- 1. API Key ------------------------------------------------------
    if not authorization or not authorization.lower().startswith("bearer "):
        fail(
            "unauthorized",
            401,
            "unauthorized",
            "缺少 API Key，请在 Authorization 头中提供 Bearer sk-...",
            model=model_for_log,
        )
    raw_key = authorization.split(" ", 1)[1].strip()  # type: ignore[union-attr]
    key_prefix = security.api_key_prefix(raw_key) if raw_key.startswith("sk-") else ""
    key_row = conn.execute(
        "SELECT * FROM api_keys WHERE key_hash = ?", (security.hash_api_key(raw_key),)
    ).fetchone()
    if (
        key_row is None
        or not security.key_matches(raw_key, key_row["key_hash"])
        or key_row["status"] != "active"
    ):
        fail(
            "unauthorized",
            401,
            "invalid_api_key",
            "API Key 无效或已被吊销",
            key_prefix=key_prefix,
            model=model_for_log,
        )

    # ---- 2. 用户状态 -----------------------------------------------------
    user_row = conn.execute(
        "SELECT u.*, r.key AS role_key, r.is_super FROM users u "
        "JOIN roles r ON r.id = u.role_id WHERE u.id = ?",
        (key_row["user_id"],),
    ).fetchone()
    if user_row is None:
        fail(
            "unauthorized",
            401,
            "invalid_api_key",
            "API Key 对应的用户不存在",
            key_prefix=key_prefix,
            model=model_for_log,
        )
    if user_row["status"] != "enabled":
        fail(
            "error",
            403,
            "user_disabled",
            "账号已被停用，请联系管理员",
            user_id=user_row["id"],
            username=user_row["username"],
            key_prefix=key_prefix,
            model=model_for_log,
        )

    # ---- 3. 请求体校验 ---------------------------------------------------
    if not isinstance(messages, list) or not messages:
        fail(
            "error",
            400,
            "validation_error",
            "messages 不能为空，且必须是消息数组",
            user_id=user_row["id"],
            username=user_row["username"],
            key_prefix=key_prefix,
            model=model_for_log,
        )
    for message in messages:
        if not isinstance(message, dict) or not isinstance(message.get("role"), str):
            fail(
                "error",
                400,
                "validation_error",
                "messages 中每一项都必须是包含 role 字段的对象",
                user_id=user_row["id"],
                username=user_row["username"],
                key_prefix=key_prefix,
                model=model_for_log,
            )
        content = message.get("content")
        if content is not None and not isinstance(content, (str, list)):
            fail(
                "error",
                400,
                "validation_error",
                "messages[].content 必须是字符串或内容数组",
                user_id=user_row["id"],
                username=user_row["username"],
                key_prefix=key_prefix,
                model=model_for_log,
            )
    if not isinstance(stream, bool):
        fail(
            "error",
            400,
            "validation_error",
            "stream 必须是布尔值",
            user_id=user_row["id"],
            username=user_row["username"],
            key_prefix=key_prefix,
            model=model_for_log,
        )
    if max_tokens is not None and (not isinstance(max_tokens, int) or max_tokens <= 0):
        fail(
            "error",
            400,
            "validation_error",
            "max_tokens 必须是正整数",
            user_id=user_row["id"],
            username=user_row["username"],
            key_prefix=key_prefix,
            model=model_for_log,
        )
    if temperature is not None and not isinstance(temperature, (int, float)):
        fail(
            "error",
            400,
            "validation_error",
            "temperature 必须是数字",
            user_id=user_row["id"],
            username=user_row["username"],
            key_prefix=key_prefix,
            model=model_for_log,
        )

    # ---- 4. 模型可用性 ---------------------------------------------------
    enabled_models = conn.execute(
        "SELECT * FROM models WHERE status = 'enabled' ORDER BY id"
    ).fetchall()
    if model_name in (None, ""):
        if not enabled_models:
            fail(
                "error",
                404,
                "model_not_found",
                "当前没有可用的模型渠道，请联系管理员",
                user_id=user_row["id"],
                username=user_row["username"],
                key_prefix=key_prefix,
            )
        model_row = _pick_model(enabled_models)
    else:
        if not isinstance(model_name, str):
            fail(
                "error",
                400,
                "validation_error",
                "model 必须是字符串",
                user_id=user_row["id"],
                username=user_row["username"],
                key_prefix=key_prefix,
            )
        model_row = conn.execute(
            "SELECT * FROM models WHERE name = ?", (model_name,)
        ).fetchone()
        if model_row is None:
            fail(
                "error",
                404,
                "model_not_found",
                f"模型不存在：{model_name}",
                user_id=user_row["id"],
                username=user_row["username"],
                key_prefix=key_prefix,
                model=model_name,
            )
        if model_row["status"] != "enabled":
            fail(
                "error",
                404,
                "model_unavailable",
                f"模型已停用：{model_name}",
                user_id=user_row["id"],
                username=user_row["username"],
                key_prefix=key_prefix,
                model=model_name,
            )
    target_model = model_row["name"]

    # ---- 5. 配额 ---------------------------------------------------------
    limits = rate_limit.resolve_limits(
        conn,
        user_id=user_row["id"],
        role_id=user_row["role_id"],
        api_key=key_row,
    )
    quota = rate_limit.check_quota(conn, user_row["id"], limits)
    rate = rate_limit.check_rate_limit(conn, key_row["key_prefix"], limits)
    quota_headers = rate_limit.quota_headers(limits, quota)
    rate_headers = rate_limit.rate_headers(limits, rate)
    if not quota["allowed"]:
        alert_service.create_alert(
            conn,
            type="quota.exceeded",
            level=alert_service.LEVEL_ERROR,
            title="Token 配额已超限，请求被拒绝",
            message=(
                f"用户 {user_row['username']} 的"
                f"{'日' if quota['exceededPeriod'] == 'day' else '月'} Token 配额已用尽，"
                f"网关已拒绝本次推理请求。"
            ),
            user_id=user_row["id"],
        )
        fail(
            "quota_exceeded",
            429,
            "quota_exceeded",
            f"Token 配额已用尽（{quota['exceededPeriod']}），请稍后重试或联系管理员",
            user_id=user_row["id"],
            username=user_row["username"],
            key_prefix=key_prefix,
            model=target_model,
            headers={**quota_headers, **rate_headers},
        )

    # ---- 6. RPM / TPM ----------------------------------------------------
    response_headers = {**quota_headers, **rate_headers}
    if not rate["allowed"]:
        reason = "RPM" if rate["reason"] == "rpm" else "TPM"
        alert_service.maybe_rate_limit_alert(
            conn,
            user_id=user_row["id"],
            username=user_row["username"],
            key_prefix=key_row["key_prefix"],
            reason=rate["reason"] or "rpm",
            used=rate["used"] if rate["reason"] == "rpm" else rate["usedTokens"],
            limit=rate["limit"] if rate["reason"] == "rpm" else rate["tpm"],
        )
        fail(
            "rate_limited",
            429,
            "rate_limited",
            f"请求过于频繁：60 秒窗口内 {reason} 已超过限制（{rate['limit'] if rate['reason'] == 'rpm' else rate['tpm']}）",
            user_id=user_row["id"],
            username=user_row["username"],
            key_prefix=key_prefix,
            model=target_model,
            headers={**response_headers, **rate_limit.retry_after_headers(rate)},
        )

    # ---- 7. 上游转发 / 离线模拟 -----------------------------------------
    upstream_payload = {
        "model": target_model,
        "messages": messages,
        "stream": False,
    }
    if max_tokens is not None:
        upstream_payload["max_tokens"] = max_tokens
    if temperature is not None:
        upstream_payload["temperature"] = temperature
    try:
        if model_row["upstream_base_url"]:
            result = gateway.forward_chat(model_row, upstream_payload)
        else:
            result = gateway.simulate_completion(messages, max_tokens)
    except gateway.UpstreamError as exc:
        fail(
            "error",
            502,
            "upstream_error",
            f"上游模型服务不可用：{exc}",
            user_id=user_row["id"],
            username=user_row["username"],
            key_prefix=key_prefix,
            model=target_model,
            error_code="upstream_error",
        )

    # ---- 8. 计量 + 成功日志 ---------------------------------------------
    latency = elapsed_ms()
    metering.record_success(
        conn,
        user_id=user_row["id"],
        username=user_row["username"],
        key_prefix=key_row["key_prefix"],
        key_id=key_row["id"],
        model=target_model,
        prompt_tokens=result["promptTokens"],
        completion_tokens=result["completionTokens"],
        latency_ms=latency,
    )
    usage = metering.usage_for_user(conn, user_row["id"])
    alert_service.maybe_quota_alerts(
        conn,
        user_id=user_row["id"],
        username=user_row["username"],
        limits=limits,
        usage=usage,
    )
    conn.commit()

    completion_id = gateway.new_completion_id()
    created = gateway.now_seconds()
    if stream:
        chunks = gateway.build_sse_chunks(
            completion_id=completion_id,
            created=created,
            model=target_model,
            content=result["content"],
            prompt_tokens=result["promptTokens"],
            completion_tokens=result["completionTokens"],
        )
        return StreamingResponse(
            iter(chunks), media_type="text/event-stream", headers=response_headers
        )
    body = gateway.build_completion_body(
        completion_id=completion_id,
        created=created,
        model=target_model,
        content=result["content"],
        prompt_tokens=result["promptTokens"],
        completion_tokens=result["completionTokens"],
    )
    return JSONResponse(body, headers=response_headers)


# ---------------------------------------------------------------------------
# traffic logs / summary / rate-limit events (mounted under /api)
# ---------------------------------------------------------------------------
@router.get("/traffic/logs")
def list_logs(
    page: int = Query(1, ge=1),
    pageSize: int = Query(10, ge=1, le=100),
    status: str | None = None,
    userId: int | None = None,
    model: str | None = None,
    range: str | None = None,
    keyword: str | None = None,
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("traffic.view")),
):
    where: list[str] = []
    params: list[Any] = []
    if range:
        range_key = parse_range(range)
        where.append("ts >= ?")
        params.append(range_start(range_key))
    if status:
        where.append("status = ?")
        params.append(status)
    if userId is not None:
        where.append("user_id = ?")
        params.append(userId)
    if model:
        where.append("model = ?")
        params.append(model)
    if keyword:
        pattern = f"%{keyword.strip()}%"
        where.append(
            "(username LIKE ? OR model LIKE ? OR key_prefix LIKE ? OR error_code LIKE ?)"
        )
        params.extend([pattern, pattern, pattern, pattern])
    clause = f" WHERE {' AND '.join(where)}" if where else ""

    total = conn.execute(
        f"SELECT COUNT(*) AS c FROM request_logs{clause}", params
    ).fetchone()["c"]
    current_page, page_size = utils.paginate(page, pageSize)
    offset = (current_page - 1) * page_size
    rows = conn.execute(
        f"SELECT * FROM request_logs{clause} ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?",
        [*params, page_size, offset],
    ).fetchall()
    return {
        "items": [log_item(row) for row in rows],
        "total": int(total),
        "page": current_page,
        "pageSize": page_size,
    }


@router.get("/traffic/summary")
def traffic_summary(
    range: str = Query("today"),
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("traffic.view")),
):
    """流量摘要：请求/Token 与 Dashboard 同源（usage_buckets），
    限流/配额/延迟来自 request_logs 审计日志。"""
    range_key = parse_range(range)
    days = RANGE_DAYS[range_key]
    today_start = utils.day_start()
    period_start = today_start - timedelta(days=days - 1)
    period_end = today_start + timedelta(days=1)
    bucket = conn.execute(
        """
        SELECT
            COALESCE(SUM(requests), 0) AS requests,
            COALESCE(SUM(success_requests), 0) AS success,
            COALESCE(SUM(total_tokens), 0) AS tokens
        FROM usage_buckets WHERE bucket_start >= ? AND bucket_start < ?
        """,
        (utils.iso(period_start), utils.iso(period_end)),
    ).fetchone()
    requests = int(bucket["requests"])
    success = int(bucket["success"])
    tokens = int(bucket["tokens"])

    log_row = conn.execute(
        """
        SELECT
            COALESCE(SUM(CASE WHEN status = 'quota_exceeded' THEN 1 ELSE 0 END), 0) AS quota,
            COALESCE(SUM(CASE WHEN status = 'rate_limited' THEN 1 ELSE 0 END), 0) AS limited,
            COALESCE(AVG(latency_ms), 0) AS avg_latency
        FROM request_logs WHERE ts >= ?
        """,
        (utils.iso(period_start),),
    ).fetchone()
    quota_exceeded = int(log_row["quota"])
    rate_limited = int(log_row["limited"])
    failed = max(0, requests - success)
    error_count = max(0, failed - rate_limited - quota_exceeded)
    return {
        "requests": requests,
        "successRequests": success,
        "failedRequests": failed,
        "tokens": tokens,
        "avgLatencyMs": int(round(float(log_row["avg_latency"] or 0))),
        "rateLimited": rate_limited,
        "quotaExceeded": quota_exceeded,
        "statusBreakdown": {
            "success": success,
            "error": error_count,
            "quota_exceeded": quota_exceeded,
            "rate_limited": rate_limited,
        },
    }


@router.get("/traffic/rate-limit-events")
def rate_limit_events(
    limit: int = Query(20, ge=1, le=200),
    range: str | None = None,
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("traffic.view")),
):
    where = ["status IN ('rate_limited', 'quota_exceeded')"]
    params: list[Any] = []
    if range:
        range_key = parse_range(range)
        where.append("ts >= ?")
        params.append(range_start(range_key))
    clause = f" WHERE {' AND '.join(where)}"
    total = conn.execute(
        f"SELECT COUNT(*) AS c FROM request_logs{clause}", params
    ).fetchone()["c"]
    rows = conn.execute(
        f"SELECT * FROM request_logs{clause} ORDER BY ts DESC, id DESC LIMIT ?",
        [*params, limit],
    ).fetchall()
    return {"items": [log_item(row) for row in rows], "total": int(total)}
