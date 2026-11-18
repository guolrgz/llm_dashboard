"""配额 / 限流策略 API。

* ``GET /quota/policies``                    默认值 + 覆盖策略列表
* ``PUT /quota/policies/{scope}/{targetId}`` 新增/更新策略（upsert）
* ``GET /quota/usage``                       按用户汇总今日/本月 Token 用量
"""

from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import APIRouter, Body, Depends

from .. import config, db
from ..deps import get_db, require_permission
from ..errors import ApiError
from ..utils import day_key, month_key, now_str

router = APIRouter(tags=["quota"])

VALID_SCOPES = ("user", "role", "key")
POLICY_FIELDS = ("daily_quota", "monthly_quota", "rpm_limit", "tpm_limit")
JSON_TO_COLUMN = {
    "dailyQuota": "daily_quota",
    "monthlyQuota": "monthly_quota",
    "rpmLimit": "rpm_limit",
    "tpmLimit": "tpm_limit",
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


def _defaults(conn: sqlite3.Connection) -> dict[str, Any]:
    return {
        "dailyQuota": _setting_int(
            conn, "default_daily_quota", config.DEFAULT_DAILY_QUOTA
        ),
        "monthlyQuota": _setting_int(
            conn, "default_monthly_quota", config.DEFAULT_MONTHLY_QUOTA
        ),
        "rpm": _setting_int(conn, "default_rpm", config.DEFAULT_RPM),
        "tpm": _setting_int(conn, "default_tpm", config.DEFAULT_TPM),
        "alertThreshold": _setting_float(
            conn, "alert_threshold", config.ALERT_THRESHOLD
        ),
    }


def _target_name(conn: sqlite3.Connection, scope: str, target_id: int) -> str:
    if scope == "user":
        row = conn.execute(
            "SELECT username FROM users WHERE id = ?", (target_id,)
        ).fetchone()
        if row is not None:
            return row["username"]
        return f"用户 #{target_id}"
    if scope == "role":
        row = conn.execute("SELECT name FROM roles WHERE id = ?", (target_id,)).fetchone()
        if row is not None:
            return row["name"]
        return f"角色 #{target_id}"
    row = conn.execute("SELECT name FROM api_keys WHERE id = ?", (target_id,)).fetchone()
    if row is not None:
        return row["name"]
    return f"Key #{target_id}"


def _serialize_policy(conn: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "scope": row["scope"],
        "targetId": row["target_id"],
        "targetName": _target_name(conn, row["scope"], row["target_id"]),
        "dailyQuota": row["daily_quota"],
        "monthlyQuota": row["monthly_quota"],
        "rpmLimit": row["rpm_limit"],
        "tpmLimit": row["tpm_limit"],
        "updatedAt": row["updated_at"],
    }


def _target_exists(conn: sqlite3.Connection, scope: str, target_id: int) -> bool:
    table = {"user": "users", "role": "roles", "key": "api_keys"}[scope]
    row = conn.execute(f"SELECT 1 FROM {table} WHERE id = ?", (target_id,)).fetchone()
    return row is not None


def _policy_row(conn: sqlite3.Connection, scope: str, target_id: int):
    return conn.execute(
        "SELECT * FROM quota_policies WHERE scope = ? AND target_id = ?",
        (scope, target_id),
    ).fetchone()


def _non_negative_int(value: Any, label: str) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ApiError(400, "validation_error", f"{label} 必须是整数") from None
    if number < 0:
        raise ApiError(400, "validation_error", f"{label} 不能为负数")
    return number


@router.get("/quota/policies")
def list_policies(
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("quota.view")),
) -> dict:
    defaults = _defaults(conn)
    rows = conn.execute("SELECT * FROM quota_policies ORDER BY id ASC").fetchall()
    return {
        "defaults": defaults,
        "items": [_serialize_policy(conn, row) for row in rows],
    }


@router.put("/quota/policies/{scope}/{target_id}")
def upsert_policy(
    scope: str,
    target_id: int,
    payload: dict = Body(...),
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("quota.manage")),
) -> dict:
    if not isinstance(payload, dict):
        raise ApiError(400, "validation_error", "请求体格式错误")
    if scope not in VALID_SCOPES:
        raise ApiError(400, "validation_error", "scope 只能是 user / role / key")
    if not _target_exists(conn, scope, target_id):
        raise ApiError(404, "not_found", "目标不存在")

    provided: dict[str, Any] = {}
    for json_key, column in JSON_TO_COLUMN.items():
        if json_key not in payload:
            continue
        value = payload[json_key]
        provided[column] = (
            None
            if value is None or value == ""
            else _non_negative_int(value, json_key)
        )

    existing = _policy_row(conn, scope, target_id)
    if existing is None:
        values = {column: provided.get(column) for column in POLICY_FIELDS}
        conn.execute(
            """
            INSERT INTO quota_policies
            (scope, target_id, daily_quota, monthly_quota, rpm_limit, tpm_limit, updated_at)
            VALUES(?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scope,
                target_id,
                values["daily_quota"],
                values["monthly_quota"],
                values["rpm_limit"],
                values["tpm_limit"],
                now_str(),
            ),
        )
        conn.commit()
    elif provided:
        assignments = ", ".join(f"{column} = ?" for column in provided)
        conn.execute(
            f"UPDATE quota_policies SET {assignments}, updated_at = ? "
            "WHERE scope = ? AND target_id = ?",
            [*provided.values(), now_str(), scope, target_id],
        )
        conn.commit()

    row = _policy_row(conn, scope, target_id)
    assert row is not None
    return {"policy": _serialize_policy(conn, row)}


@router.get("/quota/usage")
def quota_usage(
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("quota.view")),
) -> dict:
    day_period = f"day:{day_key()}"
    month_period = f"month:{month_key()}"
    usage_rows = conn.execute(
        "SELECT target_id, period, tokens FROM token_usage "
        "WHERE scope = 'user' AND period IN (?, ?)",
        (day_period, month_period),
    ).fetchall()
    day_used: dict[int, int] = {}
    month_used: dict[int, int] = {}
    for row in usage_rows:
        if row["period"] == day_period:
            day_used[row["target_id"]] = int(row["tokens"])
        else:
            month_used[row["target_id"]] = int(row["tokens"])

    user_policies = {
        row["target_id"]: row
        for row in conn.execute("SELECT * FROM quota_policies WHERE scope = 'user'")
    }
    role_policies = {
        row["target_id"]: row
        for row in conn.execute("SELECT * FROM quota_policies WHERE scope = 'role'")
    }
    defaults = _defaults(conn)

    def pick(user_policy, role_policy, field: str, fallback: int) -> int:
        if user_policy is not None and user_policy[field] is not None:
            return int(user_policy[field])
        if role_policy is not None and role_policy[field] is not None:
            return int(role_policy[field])
        return int(fallback)

    items: list[dict[str, Any]] = []
    for user in conn.execute(
        "SELECT id, username, role_id FROM users ORDER BY id ASC"
    ):
        user_policy = user_policies.get(user["id"])
        role_policy = role_policies.get(user["role_id"])
        daily_quota = pick(
            user_policy, role_policy, "daily_quota", defaults["dailyQuota"]
        )
        monthly_quota = pick(
            user_policy, role_policy, "monthly_quota", defaults["monthlyQuota"]
        )
        used_day = day_used.get(user["id"], 0)
        used_month = month_used.get(user["id"], 0)
        percent = round(used_day / daily_quota * 100, 1) if daily_quota else 0.0
        month_percent = (
            round(used_month / monthly_quota * 100, 1) if monthly_quota else 0.0
        )
        items.append(
            {
                "userId": user["id"],
                "username": user["username"],
                "dailyQuota": daily_quota,
                "dayUsed": used_day,
                "monthlyQuota": monthly_quota,
                "monthUsed": used_month,
                "percent": percent,
                "monthPercent": month_percent,
            }
        )

    items.sort(key=lambda item: (-item["percent"], item["userId"]))
    return {"items": items}
