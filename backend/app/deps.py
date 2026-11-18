"""FastAPI dependencies: database connection, current user, permission checks."""

from __future__ import annotations

import sqlite3
from typing import Iterator

from fastapi import Depends, Header, Request

from . import catalog, db, security
from .errors import ApiError


def get_db(request: Request) -> Iterator[sqlite3.Connection]:
    conn = db.connect(request.app.state.db_path)
    try:
        yield conn
    finally:
        conn.close()


def _build_user(conn: sqlite3.Connection, user_id: int) -> dict:
    row = conn.execute(
        """
        SELECT u.*, r.key AS role_key, r.name AS role_name, r.is_super
        FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.id = ?
        """,
        (user_id,),
    ).fetchone()
    if row is None:
        raise ApiError(401, "unauthorized", "账号不存在或已被删除")
    if row["status"] != "enabled":
        raise ApiError(403, "user_disabled", "账号已被停用，请联系管理员")
    if row["is_super"]:
        permissions = ["*", *catalog.ALL_PERMISSION_KEYS]
    else:
        permissions = [
            perm["permission_key"]
            for perm in conn.execute(
                "SELECT permission_key FROM role_permissions WHERE role_id = ?",
                (row["role_id"],),
            )
        ]
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
        "permissions": permissions,
        "createdAt": row["created_at"],
        "lastLoginAt": row["last_login_at"],
    }


def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    conn: sqlite3.Connection = Depends(get_db),
) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError(401, "unauthorized", "缺少访问令牌，请先登录")
    token = authorization.split(" ", 1)[1].strip()
    payload = security.decode_token(token)
    revoked = conn.execute(
        "SELECT jti FROM revoked_tokens WHERE jti = ?", (payload["jti"],)
    ).fetchone()
    if revoked is not None:
        raise ApiError(401, "token_revoked", "访问令牌已退出登录，请重新登录")
    request.state.token_payload = payload
    return _build_user(conn, int(payload["sub"]))


def require_permission(permission_key: str):
    """Return a dependency that enforces a single permission key."""

    def _dependency(user: dict = Depends(get_current_user)) -> dict:
        if not catalog.has_permission(user["permissions"], permission_key):
            raise ApiError(403, "forbidden", f"缺少权限：{permission_key}")
        return user

    return _dependency


def load_user(conn: sqlite3.Connection, user_id: int) -> dict:
    return _build_user(conn, user_id)
