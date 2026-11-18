"""Foundation smoke tests: the app boots, health works and the seed baseline
reproduces the prototype numbers."""

from __future__ import annotations

from app import db


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"


def test_seed_counts(app):
    conn = db.connect(app.state.db_path)
    try:
        assert conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"] == 128
        assert conn.execute("SELECT COUNT(*) c FROM roles").fetchone()["c"] == 5
        assert conn.execute("SELECT COUNT(*) c FROM models").fetchone()["c"] == 4
    finally:
        conn.close()


def test_seed_today_baseline(app):
    conn = db.connect(app.state.db_path)
    try:
        day = conn.execute(
            "SELECT substr(bucket_start, 1, 10) AS d FROM usage_buckets "
            "ORDER BY bucket_start DESC LIMIT 1"
        ).fetchone()["d"]
        row = conn.execute(
            "SELECT SUM(requests) req, SUM(success_requests) ok, SUM(total_tokens) tok "
            "FROM usage_buckets WHERE substr(bucket_start, 1, 10) = ?",
            (day,),
        ).fetchone()
        assert row["req"] == 128_960
        assert row["tok"] == 1_240_000_000
        assert round(row["ok"] / row["req"] * 100, 1) == 99.2
    finally:
        conn.close()
