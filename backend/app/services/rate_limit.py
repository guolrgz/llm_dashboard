"""限流 / 配额判定。

* 配额：读取 ``token_usage`` 的 user scope 日/月累计，与合并后的策略比较。
* 限流：60 秒滑动窗口，统计 ``request_logs`` 中该 ``key_prefix`` 的请求数与
  Token 数，返回 429 所需的 remaining / reset。
* 策略合并优先级：Key 级（``quota_policies.scope='key'`` > ``api_keys`` 列）>
  用户级 ``quota_policies`` > 角色级 ``quota_policies`` > ``settings`` 默认值。
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta

from .. import db, utils
from . import metering

WINDOW_SECONDS = 60


# ---------------------------------------------------------------------------
# policy resolution
# ---------------------------------------------------------------------------
def _as_int(value) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _setting_int(conn: sqlite3.Connection, key: str, default: int) -> int:
    value = _as_int(db.get_setting(conn, key))
    return default if value is None or value < 0 else value


def settings_defaults(conn: sqlite3.Connection) -> dict[str, int]:
    return {
        "dailyQuota": _setting_int(conn, "default_daily_quota", 2_000_000),
        "monthlyQuota": _setting_int(conn, "default_monthly_quota", 50_000_000),
        "rpm": _setting_int(conn, "default_rpm", 60),
        "tpm": _setting_int(conn, "default_tpm", 120_000),
    }


def _policy(conn: sqlite3.Connection, scope: str, target_id: int) -> dict | None:
    row = conn.execute(
        "SELECT daily_quota, monthly_quota, rpm_limit, tpm_limit "
        "FROM quota_policies WHERE scope = ? AND target_id = ?",
        (scope, int(target_id)),
    ).fetchone()
    return db.row_to_dict(row)


def resolve_limits(
    conn: sqlite3.Connection,
    *,
    user_id: int,
    role_id: int | None,
    api_key: sqlite3.Row | dict | None,
) -> dict[str, int]:
    """合并出本次请求实际生效的日/月配额与 RPM/TPM。"""
    defaults = settings_defaults(conn)
    role_policy = _policy(conn, "role", role_id) if role_id is not None else None
    user_policy = _policy(conn, "user", user_id)
    key_row = dict(api_key) if api_key is not None else {}
    key_policy = (
        _policy(conn, "key", key_row["id"]) if key_row.get("id") is not None else None
    )

    def pick(key_col: str, policy_key: str, default_value: int) -> int:
        # 1) quota_policies scope='key'（管理员对单个 Key 的显式策略）
        # 2) api_keys 列（签发 Key 时固化的 Key 级策略）
        # 3) 用户级 / 角色级 quota_policies
        # 4) settings 默认值
        if key_policy is not None:
            value = _as_int(key_policy.get(policy_key))
            if value is not None and value >= 0:
                return value
        if key_row:
            value = _as_int(key_row.get(key_col))
            if value is not None and value >= 0:
                return value
        for policy in (user_policy, role_policy):
            if not policy:
                continue
            value = _as_int(policy.get(policy_key))
            if value is not None and value >= 0:
                return value
        return default_value

    return {
        "dailyQuota": pick("daily_quota", "daily_quota", defaults["dailyQuota"]),
        "monthlyQuota": pick("monthly_quota", "monthly_quota", defaults["monthlyQuota"]),
        "rpm": pick("rpm_limit", "rpm_limit", defaults["rpm"]),
        "tpm": pick("tpm_limit", "tpm_limit", defaults["tpm"]),
    }


# ---------------------------------------------------------------------------
# token quota
# ---------------------------------------------------------------------------
def check_quota(
    conn: sqlite3.Connection, user_id: int, limits: dict[str, int]
) -> dict:
    usage = metering.usage_for_user(conn, user_id)
    day_limit = int(limits["dailyQuota"])
    month_limit = int(limits["monthlyQuota"])
    exceeded = None
    if usage["dayUsed"] >= day_limit:
        exceeded = "day"
    elif usage["monthUsed"] >= month_limit:
        exceeded = "month"
    return {
        "allowed": exceeded is None,
        "exceededPeriod": exceeded,
        "dayUsed": usage["dayUsed"],
        "dayLimit": day_limit,
        "dayRemaining": max(0, day_limit - usage["dayUsed"]),
        "monthUsed": usage["monthUsed"],
        "monthLimit": month_limit,
        "monthRemaining": max(0, month_limit - usage["monthUsed"]),
    }


def quota_headers(limits: dict[str, int], quota: dict) -> dict[str, str]:
    return {
        "X-Quota-Limit": str(int(limits["dailyQuota"])),
        "X-Quota-Remaining": str(int(quota["dayRemaining"])),
    }


# ---------------------------------------------------------------------------
# RPM / TPM sliding window
# ---------------------------------------------------------------------------
def window_start(now: datetime | None = None) -> str:
    base = now or utils.now()
    return utils.iso(base - timedelta(seconds=WINDOW_SECONDS))


def window_stats(
    conn: sqlite3.Connection, key_prefix: str, now: datetime | None = None
) -> dict[str, int]:
    """60 秒窗口内该 Key 的请求数与 Token 数（真实发出的请求）。"""
    if not key_prefix:
        return {"count": 0, "tokens": 0, "reset": WINDOW_SECONDS}
    start = window_start(now)
    row = conn.execute(
        "SELECT COUNT(*) AS c, COALESCE(SUM(total_tokens), 0) AS t, MIN(ts) AS first "
        "FROM request_logs WHERE key_prefix = ? AND ts >= ?",
        (key_prefix, start),
    ).fetchone()
    count = int(row["c"] or 0)
    tokens = int(row["t"] or 0)
    reset = WINDOW_SECONDS
    if row["first"]:
        elapsed = int((utils.now() - utils.parse_iso(row["first"])).total_seconds())
        reset = max(1, min(WINDOW_SECONDS, WINDOW_SECONDS - elapsed))
    return {"count": count, "tokens": tokens, "reset": reset}


def check_rate_limit(
    conn: sqlite3.Connection,
    key_prefix: str,
    limits: dict[str, int],
    now: datetime | None = None,
) -> dict:
    rpm = int(limits["rpm"])
    tpm = int(limits["tpm"])
    stats = window_stats(conn, key_prefix, now)
    reason = None
    if stats["count"] >= rpm:
        reason = "rpm"
    elif stats["tokens"] >= tpm:
        reason = "tpm"
    return {
        "allowed": reason is None,
        "reason": reason,
        "limit": rpm,
        "remaining": max(0, rpm - stats["count"]),
        "tpm": tpm,
        "tpmRemaining": max(0, tpm - stats["tokens"]),
        "used": stats["count"],
        "usedTokens": stats["tokens"],
        "reset": stats["reset"],
    }


def rate_headers(limits: dict[str, int], rate: dict) -> dict[str, str]:
    return {
        "X-RateLimit-Limit": str(int(limits["rpm"])),
        "X-RateLimit-Remaining": str(int(rate["remaining"])),
        "X-RateLimit-Reset": str(int(rate["reset"])),
    }


def retry_after_headers(rate: dict) -> dict[str, str]:
    return {"Retry-After": str(int(max(1, rate["reset"])))}
