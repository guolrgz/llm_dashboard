"""用户管理 API（users.view / users.manage）。

端点：
* ``GET    /users``             分页列表（keyword / status / role 筛选）
* ``GET    /users/stats``       用户统计
* ``POST   /users``             创建用户（201）
* ``PUT    /users/{id}``        编辑用户（可重置密码）
* ``DELETE /users/{id}``        删除用户（级联清理 Key 与用量，204）
* ``POST   /users/{id}/status`` 启用 / 停用
* ``POST   /users/batch``       批量删除 / 启用 / 停用

``build_user`` 同时被 auth 路由复用以返回契约中的 ``user`` 结构。
"""

from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import APIRouter, Body, Depends, Query, Response

from .. import catalog, security
from ..deps import get_current_user, get_db, require_permission
from ..errors import ApiError
from ..utils import now_str

router = APIRouter(tags=["users"])

VALID_STATUSES = ("enabled", "disabled")


# ---------------------------------------------------------------------------
# 序列化 / 查询辅助
# ---------------------------------------------------------------------------
def permissions_for_role(
    conn: sqlite3.Connection, role_id: int, is_super: int | bool
) -> list[str]:
    """角色生效权限键列表；超级管理员固定拥有 ``*`` 与全部权限键。"""
    if is_super:
        return ["*", *catalog.ALL_PERMISSION_KEYS]
    rows = conn.execute(
        "SELECT permission_key FROM role_permissions WHERE role_id = ? "
        "ORDER BY permission_key",
        (role_id,),
    ).fetchall()
    return [row["permission_key"] for row in rows]


def build_user(conn: sqlite3.Connection, user_id: int) -> dict[str, Any]:
    """返回契约里的 ``user`` 结构（绝不包含密码哈希）。"""
    row = conn.execute(
        """
        SELECT u.*, r.key AS role_key, r.name AS role_name, r.is_super
        FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.id = ?
        """,
        (user_id,),
    ).fetchone()
    if row is None:
        raise ApiError(404, "not_found", "用户不存在")
    return {
        "id": row["id"],
        "username": row["username"],
        "nickname": row["nickname"] or row["username"],
        "userNo": row["user_no"],
        "email": row["email"],
        "status": row["status"],
        "roleId": row["role_id"],
        "role": row["role_key"],
        "roleName": row["role_name"],
        "permissions": permissions_for_role(conn, row["role_id"], row["is_super"]),
        "createdAt": row["created_at"],
        "lastLoginAt": row["last_login_at"],
    }


def _fetch_user_row(conn: sqlite3.Connection, user_id: int) -> sqlite3.Row:
    row = conn.execute(
        """
        SELECT u.*, r.key AS role_key, r.name AS role_name, r.is_super AS role_is_super
        FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.id = ?
        """,
        (user_id,),
    ).fetchone()
    if row is None:
        raise ApiError(404, "not_found", "用户不存在")
    return row


def _like_pattern(value: str) -> str:
    escaped = (
        value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    )
    return f"%{escaped}%"


def _text(payload: dict, key: str) -> str:
    value = payload.get(key)
    if value is None:
        return ""
    return str(value).strip()


def _one_of_text(payload: dict, *keys: str) -> str:
    for key in keys:
        text = _text(payload, key)
        if text:
            return text
    return ""


def _status_for_write(payload: dict, default: str | None) -> str | None:
    value = payload.get("status")
    if value is None or value == "":
        return default
    status = str(value).strip()
    if status not in VALID_STATUSES:
        raise ApiError(400, "validation_error", "status 只能是 enabled 或 disabled")
    return status


def _role_row_for_value(conn: sqlite3.Connection, value: Any) -> sqlite3.Row:
    if isinstance(value, str):
        text = value.strip()
    elif isinstance(value, int) and not isinstance(value, bool):
        text = str(value)
    else:
        text = ""
    if not text:
        raise ApiError(400, "validation_error", "无效的角色")
    if text.isdigit():
        row = conn.execute("SELECT * FROM roles WHERE id = ?", (int(text),)).fetchone()
        if row is not None:
            return row
    row = conn.execute(
        "SELECT * FROM roles WHERE key = ? OR name = ?", (text, text)
    ).fetchone()
    if row is not None:
        return row
    alias = catalog.ROLE_ALIASES.get(text) or catalog.ROLE_KEY_BY_NAME.get(text)
    if alias:
        row = conn.execute("SELECT * FROM roles WHERE key = ?", (alias,)).fetchone()
        if row is not None:
            return row
    raise ApiError(400, "validation_error", f"无效的角色：{value}")


def _role_row_for_payload(
    conn: sqlite3.Connection, payload: dict, default_key: str | None = None
) -> sqlite3.Row | None:
    """按 ``roleId`` / ``role``（key 或中文名称）解析角色，均缺省时用默认角色。"""
    role_id = payload.get("roleId")
    if role_id is not None and role_id != "":
        return _role_row_for_value(conn, role_id)
    role_value = payload.get("role")
    if role_value is not None and role_value != "":
        return _role_row_for_value(conn, role_value)
    if default_key is None:
        return None
    row = conn.execute("SELECT * FROM roles WHERE key = ?", (default_key,)).fetchone()
    if row is None:  # pragma: no cover - 目录种子保证存在
        raise ApiError(500, "internal_error", "默认角色不存在")
    return row


def _next_user_no(conn: sqlite3.Connection) -> str:
    row = conn.execute("SELECT MAX(CAST(user_no AS INTEGER)) AS m FROM users").fetchone()
    candidate = int(row["m"] or 10000) + 1
    while conn.execute(
        "SELECT 1 FROM users WHERE user_no = ?", (str(candidate),)
    ).fetchone():
        candidate += 1
    return str(candidate)


def _ensure_unique(
    conn: sqlite3.Connection,
    username: str | None = None,
    user_no: str | None = None,
    exclude_id: int | None = None,
) -> None:
    if username is not None:
        row = conn.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
        if row is not None and row["id"] != exclude_id:
            raise ApiError(409, "conflict", "用户名已存在")
    if user_no is not None:
        row = conn.execute(
            "SELECT id FROM users WHERE user_no = ?", (user_no,)
        ).fetchone()
        if row is not None and row["id"] != exclude_id:
            raise ApiError(409, "conflict", "用户ID已存在")


def _enabled_super_count(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        """
        SELECT COUNT(*) AS c FROM users u JOIN roles r ON r.id = u.role_id
        WHERE r.is_super = 1 AND u.status = 'enabled'
        """
    ).fetchone()
    return int(row["c"])


def _delete_user_cascade(conn: sqlite3.Connection, user_id: int) -> None:
    """删除用户并清理其 Key / 用量 / 配额覆盖；请求历史日志保留。"""
    key_ids = [
        row["id"]
        for row in conn.execute("SELECT id FROM api_keys WHERE user_id = ?", (user_id,))
    ]
    for key_id in key_ids:
        conn.execute(
            "DELETE FROM token_usage WHERE scope = 'key' AND target_id = ?", (key_id,)
        )
        conn.execute(
            "DELETE FROM quota_policies WHERE scope = 'key' AND target_id = ?",
            (key_id,),
        )
    conn.execute("DELETE FROM api_keys WHERE user_id = ?", (user_id,))
    conn.execute(
        "DELETE FROM token_usage WHERE scope = 'user' AND target_id = ?", (user_id,)
    )
    conn.execute(
        "DELETE FROM quota_policies WHERE scope = 'user' AND target_id = ?",
        (user_id,),
    )
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


# ---------------------------------------------------------------------------
# 列表 / 统计
# ---------------------------------------------------------------------------
@router.get("/users")
def list_users(
    page: int = Query(1),
    pageSize: int = Query(10),
    keyword: str | None = Query(default=None),
    status: str | None = Query(default=None),
    role: str | None = Query(default=None),
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("users.view")),
) -> dict:
    page = max(1, int(page or 1))
    page_size = min(100, max(1, int(pageSize or 10)))

    where: list[str] = []
    params: list[Any] = []

    keyword = (keyword or "").strip()
    if keyword:
        pattern = _like_pattern(keyword)
        where.append(
            "(u.username LIKE ? ESCAPE '\\' OR u.user_no LIKE ? ESCAPE '\\' "
            "OR u.email LIKE ? ESCAPE '\\' OR u.nickname LIKE ? ESCAPE '\\')"
        )
        params.extend([pattern] * 4)

    status = (status or "").strip()
    if status and status.lower() not in ("all", "全部"):
        if status not in VALID_STATUSES:
            raise ApiError(400, "validation_error", "status 只能是 enabled 或 disabled")
        where.append("u.status = ?")
        params.append(status)

    role = (role or "").strip()
    if role and role.lower() not in ("all", "全部"):
        role_row = _role_row_for_value(conn, role)
        where.append("u.role_id = ?")
        params.append(role_row["id"])

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    total = conn.execute(
        f"SELECT COUNT(*) AS c FROM users u {where_sql}", params
    ).fetchone()["c"]

    rows = conn.execute(
        f"""
        SELECT u.*, r.key AS role_key, r.name AS role_name,
               (SELECT COUNT(*) FROM api_keys k
                 WHERE k.user_id = u.id AND k.status = 'active') AS key_count
        FROM users u JOIN roles r ON r.id = u.role_id
        {where_sql}
        ORDER BY u.id ASC
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()

    items = [
        {
            "id": row["id"],
            "username": row["username"],
            "userNo": row["user_no"],
            "nickname": row["nickname"] or row["username"],
            "email": row["email"],
            "role": row["role_key"],
            "roleName": row["role_name"],
            "roleId": row["role_id"],
            "status": row["status"],
            "createdAt": row["created_at"],
            "lastLoginAt": row["last_login_at"],
            "keyCount": row["key_count"],
        }
        for row in rows
    ]
    return {"items": items, "total": total, "page": page, "pageSize": page_size}


@router.get("/users/stats")
def user_stats(
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("users.view")),
) -> dict:
    counts = {
        row["status"]: row["c"]
        for row in conn.execute("SELECT status, COUNT(*) AS c FROM users GROUP BY status")
    }
    total = sum(counts.values())
    by_role = [
        {
            "role": row["role"],
            "roleName": row["role_name"],
            "count": row["count"],
        }
        for row in conn.execute(
            """
            SELECT r.key AS role, r.name AS role_name, COUNT(u.id) AS count
            FROM roles r LEFT JOIN users u ON u.role_id = r.id
            GROUP BY r.id
            ORDER BY r.id ASC
            """
        )
    ]
    return {
        "total": total,
        "enabled": counts.get("enabled", 0),
        "disabled": counts.get("disabled", 0),
        "byRole": by_role,
    }


# ---------------------------------------------------------------------------
# 创建 / 编辑 / 删除
# ---------------------------------------------------------------------------
@router.post("/users", status_code=201)
def create_user(
    payload: dict = Body(...),
    conn: sqlite3.Connection = Depends(get_db),
    _current: dict = Depends(require_permission("users.manage")),
) -> dict:
    if not isinstance(payload, dict):
        raise ApiError(400, "validation_error", "请求体格式错误")

    username = _text(payload, "username")
    password = "" if payload.get("password") is None else str(payload.get("password"))
    if not username:
        raise ApiError(400, "validation_error", "用户名不能为空")
    if not password:
        raise ApiError(400, "validation_error", "密码不能为空")

    user_no = _one_of_text(payload, "userNo", "user_no")
    if not user_no:
        user_no = _next_user_no(conn)

    role_row = _role_row_for_payload(conn, payload, default_key="viewer")
    assert role_row is not None  # 默认角色保证存在
    status = _status_for_write(payload, "enabled") or "enabled"
    nickname = _text(payload, "nickname") or username
    email = str(payload.get("email") or "").strip()

    _ensure_unique(conn, username=username, user_no=user_no)
    cursor = conn.execute(
        """
        INSERT INTO users
        (username, user_no, nickname, email, password_hash, role_id, status, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            username,
            user_no,
            nickname,
            email,
            security.hash_password(password),
            role_row["id"],
            status,
            now_str(),
        ),
    )
    conn.commit()
    return {"user": build_user(conn, int(cursor.lastrowid))}


@router.put("/users/{user_id}")
def update_user(
    user_id: int,
    payload: dict = Body(...),
    conn: sqlite3.Connection = Depends(get_db),
    _current: dict = Depends(require_permission("users.manage")),
) -> dict:
    if not isinstance(payload, dict):
        raise ApiError(400, "validation_error", "请求体格式错误")
    _fetch_user_row(conn, user_id)

    updates: dict[str, Any] = {}

    if "username" in payload:
        username = _text(payload, "username")
        if not username:
            raise ApiError(400, "validation_error", "用户名不能为空")
        _ensure_unique(conn, username=username, exclude_id=user_id)
        updates["username"] = username

    user_no = _one_of_text(payload, "userNo", "user_no")
    if "userNo" in payload or "user_no" in payload:
        if not user_no:
            raise ApiError(400, "validation_error", "用户ID不能为空")
        _ensure_unique(conn, user_no=user_no, exclude_id=user_id)
        updates["user_no"] = user_no

    if "nickname" in payload:
        updates["nickname"] = _text(payload, "nickname")
    if "email" in payload:
        updates["email"] = str(payload.get("email") or "").strip()

    role_row = _role_row_for_payload(conn, payload)
    if role_row is not None:
        updates["role_id"] = role_row["id"]

    password = payload.get("password")
    if password is not None and str(password) != "":
        updates["password_hash"] = security.hash_password(str(password))

    new_status = _status_for_write(payload, None)
    if new_status is not None:
        updates["status"] = new_status

    if updates:
        assignments = ", ".join(f"{column} = ?" for column in updates)
        conn.execute(
            f"UPDATE users SET {assignments} WHERE id = ?",
            [*updates.values(), user_id],
        )
        conn.commit()
    return {"user": build_user(conn, user_id)}


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    conn: sqlite3.Connection = Depends(get_db),
    current: dict = Depends(require_permission("users.manage")),
) -> Response:
    row = _fetch_user_row(conn, user_id)
    if user_id == int(current["id"]):
        raise ApiError(409, "conflict", "不能删除当前登录用户")
    if row["role_is_super"] and row["status"] == "enabled":
        if _enabled_super_count(conn) <= 1:
            raise ApiError(409, "conflict", "不能删除最后一个启用中的超级管理员")
    _delete_user_cascade(conn, user_id)
    conn.commit()
    return Response(status_code=204)


@router.post("/users/{user_id}/status")
def update_user_status(
    user_id: int,
    payload: dict = Body(...),
    conn: sqlite3.Connection = Depends(get_db),
    _current: dict = Depends(require_permission("users.manage")),
) -> dict:
    _fetch_user_row(conn, user_id)
    status = _status_for_write(payload, None)
    if status is None:
        raise ApiError(400, "validation_error", "status 不能为空")
    conn.execute("UPDATE users SET status = ? WHERE id = ?", (status, user_id))
    conn.commit()
    return {"user": build_user(conn, user_id)}


@router.post("/users/batch")
def batch_users(
    payload: dict = Body(...),
    conn: sqlite3.Connection = Depends(get_db),
    current: dict = Depends(require_permission("users.manage")),
) -> dict:
    raw_ids = payload.get("ids")
    if not isinstance(raw_ids, list):
        raise ApiError(400, "validation_error", "ids 必须是用户 ID 数组")
    ids: list[int] = []
    for value in raw_ids:
        try:
            ids.append(int(value))
        except (TypeError, ValueError):
            raise ApiError(400, "validation_error", "ids 必须是用户 ID 数组") from None

    action = str(payload.get("action") or "").strip()
    if action not in ("delete", "enable", "disable"):
        raise ApiError(400, "validation_error", "action 只能是 delete / enable / disable")

    affected = 0
    if action == "delete":
        for uid in dict.fromkeys(ids):
            row = conn.execute(
                """
                SELECT u.id, u.status, r.is_super AS role_is_super
                FROM users u JOIN roles r ON r.id = u.role_id
                WHERE u.id = ?
                """,
                (uid,),
            ).fetchone()
            if row is None:
                continue
            if uid == int(current["id"]):
                continue
            if row["role_is_super"] and row["status"] == "enabled":
                if _enabled_super_count(conn) <= 1:
                    continue
            _delete_user_cascade(conn, uid)
            affected += 1
        conn.commit()
    else:
        target_status = "enabled" if action == "enable" else "disabled"
        for uid in dict.fromkeys(ids):
            cursor = conn.execute(
                "UPDATE users SET status = ? WHERE id = ?", (target_status, uid)
            )
            if cursor.rowcount:
                affected += 1
        conn.commit()

    return {"ok": True, "affected": affected}
