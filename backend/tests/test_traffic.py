"""流量网关与日志链路测试。

覆盖：非流式/流式成功、401/403/404/400、RPM/TPM 限流、日配额超限、
上游转发与失败降级、日志筛选分页、流量摘要与限流事件。
"""

from __future__ import annotations

import json

import pytest

from app import db, utils
from app.services import gateway
from app.utils import day_key

ADMIN_KEY = "sk-demo-admin-2026"
USER_KEY = "sk-demo-user123-2026"
CHAT_BODY = {
    "model": "GPT-4o",
    "messages": [{"role": "user", "content": "请解释一下 Token 计量的原理"}],
}
SMALL_BODY = {"model": "GPT-4o", "messages": [{"role": "user", "content": "hi"}]}


def gateway_headers(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}"}


def connect(app):
    return db.connect(app.state.db_path)


def today_bucket_totals(app) -> tuple[int, int]:
    conn = connect(app)
    try:
        row = conn.execute(
            "SELECT COALESCE(SUM(requests), 0) AS r, COALESCE(SUM(total_tokens), 0) AS t "
            "FROM usage_buckets WHERE substr(bucket_start, 1, 10) = ?",
            (day_key(),),
        ).fetchone()
        return int(row["r"]), int(row["t"])
    finally:
        conn.close()


def latest_log(app) -> dict:
    conn = connect(app)
    try:
        row = conn.execute(
            "SELECT * FROM request_logs ORDER BY id DESC LIMIT 1"
        ).fetchone()
        return dict(row)
    finally:
        conn.close()


def day_tokens(app, user_id: int) -> int:
    conn = connect(app)
    try:
        row = conn.execute(
            "SELECT tokens FROM token_usage WHERE scope = 'user' "
            "AND target_id = ? AND period = ?",
            (user_id, f"day:{day_key()}"),
        ).fetchone()
        return int(row["tokens"]) if row else 0
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# success paths
# ---------------------------------------------------------------------------
def test_non_stream_success_and_metering(client, auth_headers, app):
    before_requests, before_tokens = today_bucket_totals(app)
    response = client.post(
        "/v1/chat/completions", headers=gateway_headers(ADMIN_KEY), json=CHAT_BODY
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["object"] == "chat.completion"
    assert body["id"].startswith("chatcmpl-")
    assert body["model"] == "GPT-4o"
    assert body["choices"][0]["message"]["role"] == "assistant"
    assert body["choices"][0]["message"]["content"]
    assert body["choices"][0]["finish_reason"] == "stop"
    usage = body["usage"]
    assert usage["prompt_tokens"] >= 1
    assert usage["completion_tokens"] > 0
    assert usage["total_tokens"] == usage["prompt_tokens"] + usage["completion_tokens"]

    # 观测性响应头
    assert int(response.headers["X-RateLimit-Limit"]) > 0
    assert int(response.headers["X-RateLimit-Remaining"]) >= 0
    assert int(response.headers["X-RateLimit-Reset"]) > 0
    assert int(response.headers["X-Quota-Limit"]) > 0
    assert int(response.headers["X-Quota-Remaining"]) >= 0

    # usage_buckets 同步
    after_requests, after_tokens = today_bucket_totals(app)
    assert after_requests == before_requests + 1
    assert after_tokens == before_tokens + usage["total_tokens"]

    # 成功日志字段与响应一致
    log = latest_log(app)
    assert log["status"] == "success" and log["http_status"] == 200
    assert log["username"] == "admin" and log["model"] == "GPT-4o"
    assert log["prompt_tokens"] == usage["prompt_tokens"]
    assert log["completion_tokens"] == usage["completion_tokens"]
    assert log["total_tokens"] == usage["total_tokens"]
    assert log["key_prefix"] == "sk-demo-adm"

    # 日志查询接口
    items = client.get("/api/traffic/logs?pageSize=1", headers=auth_headers).json()["items"]
    assert items[0]["id"] == log["id"]
    assert items[0]["totalTokens"] == usage["total_tokens"]
    assert items[0]["status"] == "success"


def test_stream_success_and_final_metering(client, auth_headers, app):
    response = client.post(
        "/v1/chat/completions",
        headers=gateway_headers(ADMIN_KEY),
        json={**CHAT_BODY, "stream": True},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    text = response.text
    assert "data: [DONE]" in text
    lines = [
        line[len("data: "):]
        for line in text.splitlines()
        if line.startswith("data: ") and line != "data: [DONE]"
    ]
    chunks = [json.loads(line) for line in lines]
    content = "".join(
        chunk["choices"][0]["delta"].get("content", "") for chunk in chunks
    )
    assert content
    assert chunks[0]["choices"][0]["delta"]["role"] == "assistant"
    final_usage = next(chunk["usage"] for chunk in reversed(chunks) if "usage" in chunk)
    assert final_usage["total_tokens"] > 0

    log = latest_log(app)
    assert log["status"] == "success"
    assert log["prompt_tokens"] == final_usage["prompt_tokens"]
    assert log["completion_tokens"] == final_usage["completion_tokens"]
    assert log["total_tokens"] == final_usage["total_tokens"]


def test_default_model_selection(client):
    response = client.post(
        "/v1/chat/completions",
        headers=gateway_headers(ADMIN_KEY),
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert response.status_code == 200
    assert response.json()["model"] in {
        "GPT-4o",
        "Claude-3.5",
        "Qwen-Max",
        "DeepSeek-V3",
    }


# ---------------------------------------------------------------------------
# auth / status codes
# ---------------------------------------------------------------------------
def test_missing_or_invalid_api_key(client, app):
    no_key = client.post("/v1/chat/completions", json=CHAT_BODY)
    assert no_key.status_code == 401
    assert no_key.json()["error"]["code"] == "unauthorized"

    bad_key = client.post(
        "/v1/chat/completions",
        headers=gateway_headers("sk-not-issued-key"),
        json=CHAT_BODY,
    )
    assert bad_key.status_code == 401
    assert bad_key.json()["error"]["code"] == "invalid_api_key"

    conn = connect(app)
    try:
        rows = conn.execute(
            "SELECT status, http_status, total_tokens FROM request_logs "
            "WHERE status = 'unauthorized' ORDER BY id DESC LIMIT 2"
        ).fetchall()
    finally:
        conn.close()
    assert len(rows) == 2
    assert all(row["total_tokens"] == 0 and row["http_status"] == 401 for row in rows)


def test_disabled_user_gets_403(client, app):
    conn = connect(app)
    try:
        conn.execute("UPDATE users SET status = 'disabled' WHERE username = 'user123'")
        conn.commit()
    finally:
        conn.close()

    response = client.post(
        "/v1/chat/completions", headers=gateway_headers(USER_KEY), json=CHAT_BODY
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "user_disabled"

    log = latest_log(app)
    assert log["status"] == "error"
    assert log["http_status"] == 403
    assert log["username"] == "user123"
    assert log["total_tokens"] == 0


def test_model_not_found_and_disabled(client, app):
    unknown = client.post(
        "/v1/chat/completions",
        headers=gateway_headers(ADMIN_KEY),
        json={**CHAT_BODY, "model": "Not-Exist"},
    )
    assert unknown.status_code == 404
    assert unknown.json()["error"]["code"] == "model_not_found"

    conn = connect(app)
    try:
        conn.execute("UPDATE models SET status = 'disabled' WHERE name = 'Claude-3.5'")
        conn.commit()
    finally:
        conn.close()
    disabled = client.post(
        "/v1/chat/completions",
        headers=gateway_headers(ADMIN_KEY),
        json={**CHAT_BODY, "model": "Claude-3.5"},
    )
    assert disabled.status_code == 404
    assert disabled.json()["error"]["code"] == "model_unavailable"

    log = latest_log(app)
    assert log["status"] == "error" and log["http_status"] == 404


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"messages": []},
        {"messages": "not-a-list"},
        {"messages": [{"role": "user", "content": 123}]},
        {"messages": [{"role": 1, "content": "x"}]},
        {"messages": [{"role": "user", "content": "x"}], "max_tokens": "lots"},
        {"messages": [{"role": "user", "content": "x"}], "stream": "yes"},
        {"messages": [{"role": "user", "content": "x"}], "temperature": "hot"},
    ],
)
def test_invalid_payload_returns_400_without_usage(client, app, payload):
    before = today_bucket_totals(app)
    response = client.post(
        "/v1/chat/completions", headers=gateway_headers(ADMIN_KEY), json=payload
    )
    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "validation_error"
    assert today_bucket_totals(app) == before
    assert latest_log(app)["status"] == "error"


def test_invalid_json_body_returns_400(client):
    response = client.post(
        "/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {ADMIN_KEY}",
            "Content-Type": "application/json",
        },
        content=b"{not-json",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"


# ---------------------------------------------------------------------------
# rate limiting / quota
# ---------------------------------------------------------------------------
def test_rpm_limit_returns_429(client, auth_headers, app):
    for _ in range(30):
        assert (
            client.post(
                "/v1/chat/completions",
                headers=gateway_headers(USER_KEY),
                json=SMALL_BODY,
            ).status_code
            == 200
        )

    rejected = client.post(
        "/v1/chat/completions", headers=gateway_headers(USER_KEY), json=SMALL_BODY
    )
    assert rejected.status_code == 429
    assert rejected.json()["error"]["code"] == "rate_limited"
    assert rejected.headers["Retry-After"].isdigit()
    assert int(rejected.headers["X-RateLimit-Remaining"]) == 0

    rejected_log = latest_log(app)
    assert rejected_log["status"] == "rate_limited"
    assert rejected_log["http_status"] == 429
    assert rejected_log["total_tokens"] == 0

    success_logs = client.get(
        "/api/traffic/logs?status=success&keyword=sk-demo-use&pageSize=100",
        headers=auth_headers,
    ).json()
    assert success_logs["total"] == 30

    events = client.get("/api/traffic/rate-limit-events", headers=auth_headers).json()
    assert events["total"] >= 1
    assert events["items"][0]["httpStatus"] == 429

    unread = client.get("/api/alerts/unread-count", headers=auth_headers).json()["unread"]
    assert unread >= 4


def test_tpm_limit_returns_429(client, app):
    conn = connect(app)
    try:
        user_id = conn.execute(
            "SELECT id FROM users WHERE username = 'user123'"
        ).fetchone()["id"]
        conn.execute("UPDATE api_keys SET tpm_limit = 10 WHERE user_id = ?", (user_id,))
        conn.commit()
    finally:
        conn.close()

    first = client.post(
        "/v1/chat/completions", headers=gateway_headers(USER_KEY), json=SMALL_BODY
    )
    assert first.status_code == 200
    second = client.post(
        "/v1/chat/completions", headers=gateway_headers(USER_KEY), json=SMALL_BODY
    )
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "rate_limited"
    assert second.headers["Retry-After"].isdigit()


def test_daily_quota_exceeded_returns_429(client, auth_headers, app):
    conn = connect(app)
    try:
        user_id = conn.execute(
            "SELECT id FROM users WHERE username = 'user123'"
        ).fetchone()["id"]
        # user123 种子已用 1,850,000；把 Key 日配额收紧到已用量即触发超限
        conn.execute(
            "UPDATE api_keys SET daily_quota = 1850000 WHERE user_id = ?", (user_id,)
        )
        conn.commit()
    finally:
        conn.close()
    before = day_tokens(app, user_id)

    response = client.post(
        "/v1/chat/completions", headers=gateway_headers(USER_KEY), json=SMALL_BODY
    )
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "quota_exceeded"
    assert response.headers["X-Quota-Remaining"] == "0"

    log = latest_log(app)
    assert log["status"] == "quota_exceeded"
    assert log["http_status"] == 429
    assert log["total_tokens"] == 0
    assert day_tokens(app, user_id) == before


def test_key_level_quota_policy_overrides_key_columns(client, app):
    """quota_policies(scope='key') 是 Key 级显式策略，优先于签发时固化的列值。"""
    conn = connect(app)
    try:
        key_id = conn.execute(
            "SELECT k.id FROM api_keys k JOIN users u ON u.id = k.user_id "
            "WHERE u.username = 'user123'"
        ).fetchone()["id"]
        conn.execute(
            "INSERT OR REPLACE INTO quota_policies"
            "(scope, target_id, daily_quota, monthly_quota, rpm_limit, tpm_limit, updated_at) "
            "VALUES('key', ?, 1850000, 50000000, 30, 20000, ?)",
            (key_id, utils.now_str()),
        )
        conn.commit()
    finally:
        conn.close()

    response = client.post(
        "/v1/chat/completions", headers=gateway_headers(USER_KEY), json=SMALL_BODY
    )
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "quota_exceeded"
    assert response.headers["X-Quota-Limit"] == "1850000"


# ---------------------------------------------------------------------------
# upstream forwarding
# ---------------------------------------------------------------------------
def test_upstream_forwarding_and_failure_degrade(client, app, monkeypatch):
    conn = connect(app)
    try:
        conn.execute(
            "UPDATE models SET upstream_base_url = 'http://mock.local/v1', "
            "upstream_api_key = 'sk-upstream' WHERE name = 'GPT-4o'"
        )
        conn.commit()
    finally:
        conn.close()

    calls: dict = {}

    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "model": "GPT-4o",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": "upstream answer"},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {
                    "prompt_tokens": 111,
                    "completion_tokens": 222,
                    "total_tokens": 333,
                },
            }

    def fake_post(url, headers, payload):
        calls["url"] = url
        calls["headers"] = headers
        calls["payload"] = payload
        return FakeResponse()

    monkeypatch.setattr(gateway, "post_upstream", fake_post)
    response = client.post(
        "/v1/chat/completions", headers=gateway_headers(ADMIN_KEY), json=CHAT_BODY
    )
    assert response.status_code == 200
    body = response.json()
    assert body["choices"][0]["message"]["content"] == "upstream answer"
    assert body["usage"] == {
        "prompt_tokens": 111,
        "completion_tokens": 222,
        "total_tokens": 333,
    }
    assert calls["url"].endswith("/chat/completions")
    assert calls["headers"]["Authorization"] == "Bearer sk-upstream"
    log = latest_log(app)
    assert log["total_tokens"] == 333
    assert log["prompt_tokens"] == 111

    class FailResponse:
        status_code = 500

        def json(self):
            return {}

    monkeypatch.setattr(gateway, "post_upstream", lambda *args, **kwargs: FailResponse())
    failed = client.post(
        "/v1/chat/completions", headers=gateway_headers(ADMIN_KEY), json=CHAT_BODY
    )
    assert failed.status_code == 502
    assert failed.json()["error"]["code"] == "upstream_error"
    fail_log = latest_log(app)
    assert fail_log["status"] == "error"
    assert fail_log["http_status"] == 502
    assert fail_log["error_code"] == "upstream_error"
    assert fail_log["total_tokens"] == 0


# ---------------------------------------------------------------------------
# query interfaces
# ---------------------------------------------------------------------------
def test_logs_filters_pagination_and_summary(client, auth_headers):
    baseline = client.get("/api/traffic/logs?pageSize=1", headers=auth_headers).json()[
        "total"
    ]
    for _ in range(2):
        assert (
            client.post(
                "/v1/chat/completions",
                headers=gateway_headers(ADMIN_KEY),
                json=SMALL_BODY,
            ).status_code
            == 200
        )
    assert (
        client.post(
            "/v1/chat/completions",
            headers=gateway_headers(ADMIN_KEY),
            json={**SMALL_BODY, "model": "Missing-Model"},
        ).status_code
        == 404
    )

    page = client.get("/api/traffic/logs?page=1&pageSize=2", headers=auth_headers).json()
    assert page["total"] == baseline + 3
    assert page["page"] == 1 and page["pageSize"] == 2
    assert len(page["items"]) == 2

    errors = client.get(
        "/api/traffic/logs?status=error&pageSize=100", headers=auth_headers
    ).json()
    assert errors["total"] >= 1
    assert all(item["status"] == "error" for item in errors["items"])

    by_model = client.get(
        "/api/traffic/logs?model=GPT-4o&pageSize=100", headers=auth_headers
    ).json()
    assert by_model["total"] >= 1
    assert all(item["model"] == "GPT-4o" for item in by_model["items"])

    keyword = client.get(
        "/api/traffic/logs?keyword=Missing-Model&pageSize=100", headers=auth_headers
    ).json()
    assert keyword["total"] >= 1

    me = client.get("/api/auth/me", headers=auth_headers).json()["user"]
    by_user = client.get(
        f"/api/traffic/logs?userId={me['id']}&pageSize=100", headers=auth_headers
    ).json()
    assert by_user["total"] >= 1
    assert all(item["userId"] == me["id"] for item in by_user["items"])

    today = client.get(
        "/api/traffic/logs?range=today&pageSize=100", headers=auth_headers
    ).json()
    assert today["total"] >= 3
    assert client.get(
        "/api/traffic/logs?range=year", headers=auth_headers
    ).status_code == 400

    summary = client.get(
        "/api/traffic/summary?range=today", headers=auth_headers
    ).json()
    # 请求/Token 与 Dashboard 同源（usage_buckets），避免两个页面数值矛盾
    analytics = client.get(
        "/api/analytics/dashboard?range=today", headers=auth_headers
    ).json()
    assert summary["requests"] == analytics["kpis"][0]["value"]
    assert summary["tokens"] == analytics["kpis"][1]["value"]
    assert summary["requests"] >= 3
    assert (
        summary["successRequests"] + summary["failedRequests"] == summary["requests"]
    )
    assert sum(summary["statusBreakdown"].values()) == summary["requests"]
    assert summary["tokens"] > 0
    assert summary["avgLatencyMs"] >= 0
    assert client.get(
        "/api/traffic/summary?range=bogus", headers=auth_headers
    ).status_code == 400


def test_traffic_endpoints_require_login(client):
    assert client.get("/api/traffic/logs").status_code == 401
    assert client.get("/api/traffic/summary").status_code == 401
    assert client.get("/api/traffic/rate-limit-events").status_code == 401
