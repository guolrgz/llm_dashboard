"""Token 计量服务。

网关每受理一次请求都会在这里落审计日志（``request_logs``）；只有真正成功
完成的推理请求才会累加用量：

* ``request_logs``：每次请求（成功 / 配额超限 / 限流 / 鉴权失败 / 上游失败）
  都写一条，失败记录的 ``total_tokens`` 为 0。
* ``usage_buckets``：按当前 15 分钟桶 + 模型 upsert，成功请求同时计入
  ``requests`` 与 ``success_requests``（Dashboard 趋势/分布的主数据源）。
* ``token_usage``：按 ``day:YYYY-MM-DD`` / ``month:YYYY-MM`` 累计用户与 Key 的
  Token 与请求数（配额判定读 user scope）。
* ``api_keys.last_used_at``：记录 Key 最近一次成功使用时间。
"""

from __future__ import annotations

import sqlite3
from datetime import datetime

from .. import utils

BUCKET_MINUTES = 15


# ---------------------------------------------------------------------------
# time / formatting helpers
# ---------------------------------------------------------------------------
def bucket_start(dt: datetime | None = None) -> datetime:
    """Floor ``dt`` to the 15-minute aggregation bucket start."""
    base = dt or utils.now()
    return base.replace(
        minute=base.minute - base.minute % BUCKET_MINUTES, second=0, microsecond=0
    )


def bucket_key(dt: datetime | None = None) -> str:
    return utils.iso(bucket_start(dt))


def success_rate(success: int | float, requests: int | float) -> float:
    """Success percentage with one decimal (99.2). 0 requests -> 0.0."""
    if not requests:
        return 0.0
    return round(float(success) / float(requests) * 100, 1)


def percent(part: int | float, whole: int | float) -> float:
    if not whole:
        return 0.0
    return float(part) / float(whole) * 100


def format_tokens(value: int | float) -> str:
    return utils.format_tokens(value)


def format_int(value: int | float) -> str:
    return utils.format_int(value)


# ---------------------------------------------------------------------------
# audit log
# ---------------------------------------------------------------------------
def log_request(
    conn: sqlite3.Connection,
    *,
    status: str,
    http_status: int,
    user_id: int | None = None,
    username: str = "",
    key_prefix: str = "",
    model: str = "",
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    latency_ms: int = 0,
    error_code: str | None = None,
    source: str = "gateway",
    ts: str | None = None,
) -> int:
    """Append one audit row and return its id (caller commits)."""
    total = int(prompt_tokens) + int(completion_tokens)
    if status != "success":
        total = 0
    cursor = conn.execute(
        """
        INSERT INTO request_logs
        (ts, user_id, username, key_prefix, model, prompt_tokens,
         completion_tokens, total_tokens, status, http_status, latency_ms,
         error_code, source)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            ts or utils.now_str(),
            user_id,
            username or "",
            key_prefix or "",
            model or "",
            int(prompt_tokens),
            int(completion_tokens),
            total,
            status,
            int(http_status),
            int(latency_ms),
            error_code,
            source,
        ),
    )
    return int(cursor.lastrowid)


def record_failure(
    conn: sqlite3.Connection,
    *,
    status: str,
    http_status: int,
    error_code: str | None = None,
    user_id: int | None = None,
    username: str = "",
    key_prefix: str = "",
    model: str = "",
    latency_ms: int = 0,
    source: str = "gateway",
) -> int:
    """审计被拒绝/失败的请求：写日志但不产生任何 Token 用量。"""
    return log_request(
        conn,
        status=status,
        http_status=http_status,
        error_code=error_code,
        user_id=user_id,
        username=username,
        key_prefix=key_prefix,
        model=model,
        latency_ms=latency_ms,
        source=source,
    )


# ---------------------------------------------------------------------------
# usage accounting (success only)
# ---------------------------------------------------------------------------
def apply_usage(
    conn: sqlite3.Connection,
    *,
    user_id: int | None,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    key_id: int | None = None,
) -> int:
    """累加成功请求的 Token 用量，返回本次总 Token。"""
    prompt_tokens = int(prompt_tokens)
    completion_tokens = int(completion_tokens)
    total = prompt_tokens + completion_tokens
    now = utils.now()
    stamp = utils.iso(now)

    # 15-minute bucket per model
    conn.execute(
        """
        INSERT INTO usage_buckets
        (bucket_start, model, requests, success_requests, prompt_tokens,
         completion_tokens, total_tokens)
        VALUES(?, ?, 1, 1, ?, ?, ?)
        ON CONFLICT(bucket_start, model) DO UPDATE SET
            requests = requests + 1,
            success_requests = success_requests + 1,
            prompt_tokens = prompt_tokens + excluded.prompt_tokens,
            completion_tokens = completion_tokens + excluded.completion_tokens,
            total_tokens = total_tokens + excluded.total_tokens
        """,
        (bucket_key(now), model, prompt_tokens, completion_tokens, total),
    )

    # period counters for quota checks / usage views
    periods = (f"day:{utils.day_key(now)}", f"month:{utils.month_key(now)}")
    targets: list[tuple[str, int]] = []
    if user_id is not None:
        targets.append(("user", int(user_id)))
    if key_id is not None:
        targets.append(("key", int(key_id)))
    for scope, target_id in targets:
        for period in periods:
            conn.execute(
                """
                INSERT INTO token_usage(scope, target_id, period, tokens, requests)
                VALUES(?, ?, ?, ?, 1)
                ON CONFLICT(scope, target_id, period) DO UPDATE SET
                    tokens = tokens + excluded.tokens,
                    requests = requests + excluded.requests
                """,
                (scope, target_id, period, total),
            )

    if key_id is not None:
        conn.execute(
            "UPDATE api_keys SET last_used_at = ? WHERE id = ?", (stamp, int(key_id))
        )
    return total


def record_success(
    conn: sqlite3.Connection,
    *,
    user_id: int | None,
    username: str,
    key_prefix: str,
    key_id: int | None,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    latency_ms: int = 0,
    source: str = "gateway",
) -> int:
    """记录一次成功请求：审计日志 + 用量累计，返回总 Token。"""
    total = int(prompt_tokens) + int(completion_tokens)
    log_request(
        conn,
        status="success",
        http_status=200,
        user_id=user_id,
        username=username,
        key_prefix=key_prefix,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        latency_ms=latency_ms,
        source=source,
    )
    apply_usage(
        conn,
        user_id=user_id,
        key_id=key_id,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
    )
    return total


# ---------------------------------------------------------------------------
# usage lookups
# ---------------------------------------------------------------------------
def usage_for_user(conn: sqlite3.Connection, user_id: int) -> dict[str, int]:
    """当前自然日 / 自然月的 Token 与请求数（配额判定用 user scope）。"""
    now = utils.now()
    day = conn.execute(
        "SELECT tokens, requests FROM token_usage "
        "WHERE scope = 'user' AND target_id = ? AND period = ?",
        (int(user_id), f"day:{utils.day_key(now)}"),
    ).fetchone()
    month = conn.execute(
        "SELECT tokens, requests FROM token_usage "
        "WHERE scope = 'user' AND target_id = ? AND period = ?",
        (int(user_id), f"month:{utils.month_key(now)}"),
    ).fetchone()
    return {
        "dayUsed": int(day["tokens"]) if day else 0,
        "dayRequests": int(day["requests"]) if day else 0,
        "monthUsed": int(month["tokens"]) if month else 0,
        "monthRequests": int(month["requests"]) if month else 0,
    }
