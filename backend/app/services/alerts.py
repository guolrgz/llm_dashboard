"""告警生成服务。

配额使用率触及 ``settings.alert_threshold``、配额超限、以及 RPM/TPM 限流触发时
生成告警。同一 ``type + 用户`` 在去重窗口（默认 10 分钟）内不重复生成，避免
持续超限时把告警列表刷屏。
"""

from __future__ import annotations

import sqlite3
from datetime import timedelta

from .. import db, utils
from . import metering

DEDUPE_MINUTES = 10

LEVEL_INFO = "info"
LEVEL_WARNING = "warning"
LEVEL_ERROR = "error"


def _now_str() -> str:
    return utils.now_str()


def alert_threshold(conn: sqlite3.Connection) -> float:
    raw = db.get_setting(conn, "alert_threshold", "0.8")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return 0.8
    if value > 1:  # tolerate 80 meaning 80%
        value = value / 100.0
    return min(max(value, 0.0), 1.0)


def create_alert(
    conn: sqlite3.Connection,
    *,
    type: str,
    level: str,
    title: str,
    message: str = "",
    user_id: int | None = None,
    dedupe_minutes: int | None = DEDUPE_MINUTES,
) -> int | None:
    """插入一条告警；去重窗口内存在同 type + 用户的告警时返回 ``None``。

    Caller 负责 commit（与请求日志/用量写入放在同一事务里）。
    """
    if dedupe_minutes and dedupe_minutes > 0:
        threshold = (
            utils.now() - timedelta(minutes=dedupe_minutes)
        ).strftime("%Y-%m-%d %H:%M:%S")
        existing = conn.execute(
            "SELECT id FROM alerts WHERE type = ? "
            "AND COALESCE(user_id, 0) = COALESCE(?, 0) AND created_at >= ? LIMIT 1",
            (type, user_id, threshold),
        ).fetchone()
        if existing is not None:
            return None
    cursor = conn.execute(
        "INSERT INTO alerts(type, level, title, message, user_id, read, created_at) "
        "VALUES(?, ?, ?, ?, ?, 0, ?)",
        (type, level, title, message, user_id, _now_str()),
    )
    return int(cursor.lastrowid)


def maybe_quota_alerts(
    conn: sqlite3.Connection,
    *,
    user_id: int | None,
    username: str,
    limits: dict[str, int],
    usage: dict[str, int] | None = None,
) -> list[int]:
    """按日/月用量生成配额阈值或超限告警，返回新告警 id 列表。"""
    if user_id is None:
        return []
    usage = usage or metering.usage_for_user(conn, user_id)
    threshold = alert_threshold(conn)
    created: list[int] = []
    day_limit = int(limits.get("dailyQuota") or 0)
    month_limit = int(limits.get("monthlyQuota") or 0)
    for period, used, limit, label in (
        ("day", usage["dayUsed"], day_limit, "日"),
        ("month", usage["monthUsed"], month_limit, "月"),
    ):
        if limit <= 0:
            continue
        ratio = used / limit
        if used >= limit:
            alert_id = create_alert(
                conn,
                type="quota.exceeded",
                level=LEVEL_ERROR,
                title=f"Token {label}配额已超限",
                message=(
                    f"用户 {username} {label}已使用 {metering.format_int(used)} / "
                    f"{metering.format_int(limit)} Token，已超出 {label}配额上限。"
                ),
                user_id=user_id,
            )
            if alert_id is not None:
                created.append(alert_id)
        elif ratio >= threshold:
            alert_id = create_alert(
                conn,
                type="quota.warning",
                level=LEVEL_WARNING,
                title=f"Token {label}配额使用率 {ratio * 100:.1f}%",
                message=(
                    f"用户 {username} {label}已使用 {metering.format_int(used)} / "
                    f"{metering.format_int(limit)} Token，请关注配额余量。"
                ),
                user_id=user_id,
            )
            if alert_id is not None:
                created.append(alert_id)
    return created


def maybe_rate_limit_alert(
    conn: sqlite3.Connection,
    *,
    user_id: int | None,
    username: str,
    key_prefix: str,
    reason: str,
    used: int,
    limit: int,
) -> int | None:
    """限流触发时生成告警（同用户 10 分钟内去重）。"""
    scope = "RPM" if reason == "rpm" else "TPM"
    return create_alert(
        conn,
        type="rate_limit",
        level=LEVEL_INFO,
        title=f"API Key 触发 {scope} 限流",
        message=(
            f"用户 {username} 的 Key {key_prefix or '-'} 在 60 秒窗口内"
            f" {scope} 达到 {used} / {limit}，已触发限流保护。"
        ),
        user_id=user_id,
    )
