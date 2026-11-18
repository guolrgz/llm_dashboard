"""系统设置 API：默认配额 / 限流 / 告警阈值 / 站点信息。

设置持久化在 ``settings`` 表（key/value 文本），``uptimeDays`` 由
``settings.system_started_at`` 与当前时间计算。
"""

from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import APIRouter, Body, Depends

from .. import config, db
from ..deps import get_db, require_permission
from ..errors import ApiError
from ..utils import now, now_str, parse_iso

router = APIRouter(tags=["settings"])

DEFAULT_SITE_NAME = "LLM推理 · Token 流量管理系统"

# JSON 字段 -> settings 表 key
FIELD_TO_SETTING = {
    "siteName": "site_name",
    "defaultDailyQuota": "default_daily_quota",
    "defaultMonthlyQuota": "default_monthly_quota",
    "defaultRpm": "default_rpm",
    "defaultTpm": "default_tpm",
    "alertThreshold": "alert_threshold",
}


def _setting_int(conn: sqlite3.Connection, key: str, fallback: int) -> int:
    value = db.get_setting(conn, key)
    try:
        return int(float(value)) if value is not None else int(fallback)
    except (TypeError, ValueError):
        return int(fallback)


def _setting_float(conn: sqlite3.Connection, key: str, fallback: float) -> float:
    value = db.get_setting(conn, key)
    try:
        return float(value) if value is not None else float(fallback)
    except (TypeError, ValueError):
        return float(fallback)


def _read_settings(conn: sqlite3.Connection) -> dict[str, Any]:
    site_name = db.get_setting(conn, "site_name", DEFAULT_SITE_NAME)
    started_raw = db.get_setting(conn, "system_started_at", None)
    system_started_at = str(started_raw) if started_raw else now_str()

    uptime_days = 0
    try:
        started = parse_iso(system_started_at)
        uptime_days = max(0, int((now() - started).total_seconds() // 86400))
    except (TypeError, ValueError):
        uptime_days = 0

    return {
        "siteName": str(site_name) if site_name is not None else DEFAULT_SITE_NAME,
        "defaultDailyQuota": _setting_int(
            conn, "default_daily_quota", config.DEFAULT_DAILY_QUOTA
        ),
        "defaultMonthlyQuota": _setting_int(
            conn, "default_monthly_quota", config.DEFAULT_MONTHLY_QUOTA
        ),
        "defaultRpm": _setting_int(conn, "default_rpm", config.DEFAULT_RPM),
        "defaultTpm": _setting_int(conn, "default_tpm", config.DEFAULT_TPM),
        "alertThreshold": _setting_float(
            conn, "alert_threshold", config.ALERT_THRESHOLD
        ),
        "systemStartedAt": system_started_at,
        "uptimeDays": uptime_days,
    }


def _non_negative_int(value: Any, label: str) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ApiError(400, "validation_error", f"{label} 必须是整数") from None
    if number < 0:
        raise ApiError(400, "validation_error", f"{label} 不能为负数")
    return number


@router.get("/settings")
def get_settings(
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("settings.view")),
) -> dict:
    return _read_settings(conn)


@router.put("/settings")
def update_settings(
    payload: dict = Body(...),
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("settings.manage")),
) -> dict:
    if not isinstance(payload, dict):
        raise ApiError(400, "validation_error", "请求体格式错误")

    updates: dict[str, str] = {}

    if "siteName" in payload:
        site_name = str(payload.get("siteName") or "").strip()
        if not site_name:
            raise ApiError(400, "validation_error", "站点名称不能为空")
        updates["site_name"] = site_name

    for json_key, label in (
        ("defaultDailyQuota", "默认日配额"),
        ("defaultMonthlyQuota", "默认月配额"),
        ("defaultRpm", "默认 RPM"),
        ("defaultTpm", "默认 TPM"),
    ):
        if json_key in payload:
            setting_key = FIELD_TO_SETTING[json_key]
            number = _non_negative_int(payload[json_key], label)
            updates[setting_key] = str(number)

    if "alertThreshold" in payload:
        raw = payload.get("alertThreshold")
        try:
            threshold = float(raw)
        except (TypeError, ValueError):
            raise ApiError(400, "validation_error", "告警阈值必须是数字") from None
        if not 0 <= threshold <= 1:
            raise ApiError(
                400, "validation_error", "告警阈值必须在 0 到 1 之间（例如 0.8）"
            )
        updates["alert_threshold"] = str(threshold)

    timestamp = now_str()
    for key, value in updates.items():
        db.set_setting(conn, key, value, timestamp)
    if updates:
        conn.commit()
    return _read_settings(conn)
