"""API Key API：签发、列表、详情用量、吊销与轮换。

安全约束：明文 Key 只在创建/轮换响应中出现一次；库中仅存 ``sha256`` 哈希与
``sk-xxxxxxxx`` 前缀。密钥详情用量来自 ``token_usage(scope='key')``，若计量层
尚未写入 Key 维度，则回退到 ``request_logs`` 按 Key 前缀汇总。
"""

from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import APIRouter, Body, Depends, Query, Response

from .. import config, db, security
from ..deps import get_db, require_permission
from ..errors import ApiError
from ..utils import day_key, month_key, now_str

router = APIRouter(tags=["keys"])


# ---------------------------------------------------------------------------
# 设置 / 策略辅助
# ---------------------------------------------------------------------------
def _setting_int(conn: sqlite3.Connection, key: str, fallback: int) -> int:
    value = db.get_setting(conn, key)
    try:
        return int(float(value)) if value is not None else int(fallback)
    except (TypeError, ValueError):
        return int(fallback)


def _default_limits(conn: sqlite3.Connection) -> dict[str, int]:
    return {
        "daily_quota": _setting_int(
            conn, "default_daily_quota", config.DEFAULT_DAILY_QUOTA
        ),
        "monthly_quota": _setting_int(
            conn, "default_monthly_quota", config.DEFAULT_MONTHLY_QUOTA
        ),
        "rpm_limit": _setting_int(conn, "default_rpm", config.DEFAULT_RPM),
        "tpm_limit": _setting_int(conn, "default_tpm", config.DEFAULT_TPM),
    }


def _policy(conn: sqlite3.Connection, scope: str, target_id: int):
    return conn.execute(
        "SELECT * FROM quota_policies WHERE scope = ? AND target_id = ?",
        (scope, target_id),
    ).fetchone()


def _resolve_limits(
    conn: sqlite3.Connection,
    key_row: sqlite3.Row | None,
    user_id: int,
    role_id: int,
) -> dict[str, int]:
    """合并优先级：Key 列 > 用户策略 > 角色策略 > 系统设置默认值。"""
    defaults = _default_limits(conn)
    user_policy = _policy(conn, "user", user_id)
    role_policy = _policy(conn, "role", role_id)
    resolved: dict[str, int] = {}
    for field in ("daily_quota", "monthly_quota", "rpm_limit", "tpm_limit"):
        value = key_row[field] if key_row is not None else None
        if value is None and user_policy is not None:
            value = user_policy[field]
        if value is None and role_policy is not None:
            value = role_policy[field]
        if value is None:
            value = defaults[field]
        resolved[field] = int(value)
    return resolved


# ---------------------------------------------------------------------------
# 序列化 / 计数辅助
# ---------------------------------------------------------------------------
def _fetch_key(conn: sqlite3.Connection, key_id: int) -> sqlite3.Row:
    row = conn.execute(
        """
        SELECT k.*, u.username AS username, u.role_id AS role_id, u.status AS user_status
        FROM api_keys k JOIN users u ON u.id = k.user_id
        WHERE k.id = ?
        """,
        (key_id,),
    ).fetchone()
    if row is None:
        raise ApiError(404, "not_found", "API Key 不存在")
    return row


def _serialize_key(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "userId": row["user_id"],
        "username": row["username"],
        "name": row["name"],
        "keyPrefix": row["key_prefix"],
        "status": row["status"],
        "rpmLimit": row["rpm_limit"],
        "tpmLimit": row["tpm_limit"],
        "dailyQuota": row["daily_quota"],
        "monthlyQuota": row["monthly_quota"],
        "createdAt": row["created_at"],
        "lastUsedAt": row["last_used_at"],
    }


def _token_usage(
    conn: sqlite3.Connection, scope: str, target_id: int, period: str
) -> int | None:
    row = conn.execute(
        "SELECT tokens FROM token_usage WHERE scope = ? AND target_id = ? AND period = ?",
        (scope, target_id, period),
    ).fetchone()
    return int(row["tokens"]) if row is not None else None


def _log_tokens(conn: sqlite3.Connection, key_prefix: str, since: str) -> int:
    row = conn.execute(
        "SELECT COALESCE(SUM(total_tokens), 0) AS total FROM request_logs "
        "WHERE key_prefix = ? AND ts >= ? AND status = 'success'",
        (key_prefix, since),
    ).fetchone()
    return int(row["total"] or 0)


def _key_usage(conn: sqlite3.Connection, key_row: sqlite3.Row) -> tuple[int, int]:
    day_period = f"day:{day_key()}"
    month_period = f"month:{month_key()}"
    day_used = _token_usage(conn, "key", key_row["id"], day_period)
    month_used = _token_usage(conn, "key", key_row["id"], month_period)
    if day_used is None and month_used is None:
        # 计量层尚未写 Key 维度时，退化为按 Key 前缀汇总成功请求日志。
        day_used = _log_tokens(conn, key_row["key_prefix"], f"{day_key()} 00:00:00")
        month_used = _log_tokens(
            conn, key_row["key_prefix"], f"{month_key()}-01 00:00:00"
        )
    return int(day_used or 0), int(month_used or 0)


def _optional_non_negative_int(payload: dict, key: str) -> int | None:
    if key not in payload or payload[key] is None or payload[key] == "":
        return None
    try:
        value = int(payload[key])
    except (TypeError, ValueError):
        raise ApiError(400, "validation_error", f"{key} 必须是整数") from None
    if value < 0:
        raise ApiError(400, "validation_error", f"{key} 不能为负数")
    return value


# ---------------------------------------------------------------------------
# 端点
# ---------------------------------------------------------------------------
@router.get("/keys")
def list_keys(
    userId: int | None = Query(default=None),
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("keys.view")),
) -> dict:
    sql = """
        SELECT k.*, u.username AS username, u.role_id AS role_id, u.status AS user_status
        FROM api_keys k JOIN users u ON u.id = k.user_id
    """
    params: list[Any] = []
    if userId is not None:
        sql += " WHERE k.user_id = ?"
        params.append(int(userId))
    sql += " ORDER BY k.id ASC"
    rows = conn.execute(sql, params).fetchall()
    return {"items": [_serialize_key(row) for row in rows]}


@router.post("/keys", status_code=201)
def create_key(
    payload: dict = Body(...),
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("keys.manage")),
) -> dict:
    if not isinstance(payload, dict):
        raise ApiError(400, "validation_error", "请求体格式错误")
    try:
        user_id = int(payload.get("userId"))
    except (TypeError, ValueError):
        raise ApiError(400, "validation_error", "userId 必须是整数") from None
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if user is None:
        raise ApiError(404, "not_found", "用户不存在")

    name = str(payload.get("name") or "").strip()
    if not name:
        raise ApiError(400, "validation_error", "Key 名称不能为空")

    resolved = _resolve_limits(conn, None, user["id"], user["role_id"])
    rpm_limit = _optional_non_negative_int(payload, "rpmLimit")
    tpm_limit = _optional_non_negative_int(payload, "tpmLimit")
    daily_quota = _optional_non_negative_int(payload, "dailyQuota")
    monthly_quota = _optional_non_negative_int(payload, "monthlyQuota")

    plaintext = security.generate_api_key()
    cursor = conn.execute(
        """
        INSERT INTO api_keys
        (user_id, name, key_hash, key_prefix, status, rpm_limit, tpm_limit,
         daily_quota, monthly_quota, created_at)
        VALUES(?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
        """,
        (
            user["id"],
            name,
            security.hash_api_key(plaintext),
            security.api_key_prefix(plaintext),
            rpm_limit if rpm_limit is not None else resolved["rpm_limit"],
            tpm_limit if tpm_limit is not None else resolved["tpm_limit"],
            daily_quota if daily_quota is not None else resolved["daily_quota"],
            monthly_quota if monthly_quota is not None else resolved["monthly_quota"],
            now_str(),
        ),
    )
    conn.commit()
    row = _fetch_key(conn, int(cursor.lastrowid))
    return {"key": _serialize_key(row), "apiKey": plaintext}


@router.get("/keys/{key_id}")
def get_key(
    key_id: int,
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("keys.view")),
) -> dict:
    row = _fetch_key(conn, key_id)
    resolved = _resolve_limits(conn, row, row["user_id"], row["role_id"])
    day_used, month_used = _key_usage(conn, row)
    day_quota = resolved["daily_quota"]
    month_quota = resolved["monthly_quota"]
    return {
        "key": _serialize_key(row),
        "usage": {
            "dayUsed": day_used,
            "dayQuota": day_quota,
            "monthUsed": month_used,
            "monthQuota": month_quota,
            "dayRemaining": max(0, day_quota - day_used),
            "monthRemaining": max(0, month_quota - month_used),
        },
    }


@router.delete("/keys/{key_id}", status_code=204)
def revoke_key(
    key_id: int,
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("keys.manage")),
) -> Response:
    _fetch_key(conn, key_id)
    conn.execute(
        "UPDATE api_keys SET status = 'revoked', revoked_at = ? WHERE id = ?",
        (now_str(), key_id),
    )
    conn.commit()
    return Response(status_code=204)


@router.post("/keys/{key_id}/rotate")
def rotate_key(
    key_id: int,
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("keys.manage")),
) -> dict:
    _fetch_key(conn, key_id)
    plaintext = security.generate_api_key()
    conn.execute(
        """
        UPDATE api_keys
        SET key_hash = ?, key_prefix = ?, status = 'active', revoked_at = NULL
        WHERE id = ?
        """,
        (security.hash_api_key(plaintext), security.api_key_prefix(plaintext), key_id),
    )
    conn.commit()
    row = _fetch_key(conn, key_id)
    return {"key": _serialize_key(row), "apiKey": plaintext}
