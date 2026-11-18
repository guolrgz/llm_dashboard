"""告警列表 / 未读数 / 标记已读接口。"""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from .. import utils
from ..deps import get_current_user, get_db, require_permission
from ..errors import ApiError

router = APIRouter(tags=["alerts"])

ALERT_SELECT = (
    "SELECT a.*, u.username AS username FROM alerts a "
    "LEFT JOIN users u ON u.id = a.user_id"
)


def alert_item(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "type": row["type"],
        "level": row["level"],
        "title": row["title"],
        "message": row["message"],
        "userId": row["user_id"],
        "username": row["username"],
        "read": bool(row["read"]),
        "createdAt": row["created_at"],
    }


def _unread_count(conn: sqlite3.Connection) -> int:
    return int(
        conn.execute("SELECT COUNT(*) AS c FROM alerts WHERE read = 0").fetchone()["c"]
    )


@router.get("/alerts")
def list_alerts(
    unreadOnly: bool = Query(False),
    page: int = Query(1, ge=1),
    pageSize: int = Query(10, ge=1, le=100),
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("alerts.view")),
):
    where = " WHERE a.read = 0" if unreadOnly else ""
    total = int(
        conn.execute(f"SELECT COUNT(*) AS c FROM alerts a{where}").fetchone()["c"]
    )
    current_page, page_size = utils.paginate(page, pageSize)
    offset = (current_page - 1) * page_size
    rows = conn.execute(
        f"{ALERT_SELECT}{where} ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?",
        (page_size, offset),
    ).fetchall()
    return {
        "items": [alert_item(row) for row in rows],
        "unread": _unread_count(conn),
        "total": total,
        "page": current_page,
        "pageSize": page_size,
    }


@router.get("/alerts/unread-count")
def unread_count(
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    return {"unread": _unread_count(conn)}


@router.post("/alerts/read-all")
def read_all_alerts(
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("alerts.manage")),
):
    cursor = conn.execute("UPDATE alerts SET read = 1 WHERE read = 0")
    conn.commit()
    return {"ok": True, "affected": int(cursor.rowcount or 0)}


@router.post("/alerts/{alert_id}/read")
def read_alert(
    alert_id: int,
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("alerts.manage")),
):
    row = conn.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,)).fetchone()
    if row is None:
        raise ApiError(404, "not_found", f"告警不存在：{alert_id}")
    conn.execute("UPDATE alerts SET read = 1 WHERE id = ?", (alert_id,))
    conn.commit()
    updated = conn.execute(f"{ALERT_SELECT} WHERE a.id = ?", (alert_id,)).fetchone()
    return {"alert": alert_item(updated)}
