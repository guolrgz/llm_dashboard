"""Dashboard 聚合测试：原型基线复现、三种时间范围、非法范围、数据联动。"""

from __future__ import annotations

import pytest

ADMIN_KEY = "sk-demo-admin-2026"
CHAT_BODY = {
    "model": "GPT-4o",
    "messages": [{"role": "user", "content": "你好"}],
}


def dashboard(client, headers, range_key: str | None = None) -> dict:
    url = "/api/analytics/dashboard"
    if range_key:
        url += f"?range={range_key}"
    response = client.get(url, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_dashboard_today_reproduces_prototype_baseline(client, auth_headers):
    body = dashboard(client, auth_headers)

    assert body["range"] == "today"
    requests, tokens, success = body["kpis"]
    assert requests["id"] == "requests"
    assert requests["label"] == "总请求量"
    assert requests["value"] == 128_960
    assert requests["display"] == "128,960"
    assert requests["delta"] == 12.5
    assert requests["deltaUnit"] == "%"
    assert requests["tone"] == "blue" and requests["icon"] == "chat"
    assert isinstance(requests["spark"], list) and len(requests["spark"]) > 0

    assert tokens["id"] == "tokens"
    assert tokens["label"] == "Token 使用量"
    assert tokens["value"] == 1_240_000_000
    assert tokens["display"] == "1.24B"
    assert tokens["delta"] == 18.7
    assert tokens["deltaUnit"] == "%"
    assert tokens["tone"] == "green" and tokens["icon"] == "database"

    assert success["id"] == "success"
    assert success["label"] == "成功率"
    assert success["value"] == 99.2
    assert success["display"] == "99.2%"
    assert success["delta"] == 0.1
    assert success["deltaUnit"] == "pp"
    assert success["tone"] == "purple" and success["icon"] == "check"

    # 今日趋势：96 个 15 分钟点 + 6 个小时刻度
    trend = body["trend"]
    assert len(trend["total"]) == 96
    assert len(trend["success"]) == 96
    assert sum(trend["total"]) == 128_960
    assert sum(trend["success"]) == 127_928
    assert trend["xLabels"] == ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"]
    # 约 5~6 个 nice 刻度（原型图表 5 条横网格线）：0/500/.../2500
    assert trend["yTicks"] == [0, 500, 1000, 1500, 2000, 2500]
    assert trend["yTicks"] == sorted(trend["yTicks"])
    assert trend["yTicks"][0] == 0
    assert trend["yTicks"][-1] >= max(trend["total"])
    assert trend["yLabels"] == {
        "0": "0",
        "500": "500",
        "1000": "1k",
        "1500": "1.5k",
        "2000": "2k",
        "2500": "2.5k",
    }

    # 模型分布：40.2 / 32.6 / 18.1 / 9.1，合计 100%
    distribution = body["distribution"]
    assert distribution["total"] == 1_240_000_000
    assert distribution["display"] == "1.24B"
    segments = distribution["segments"]
    assert [segment["name"] for segment in segments] == [
        "GPT-4o",
        "Claude-3.5",
        "Qwen-Max",
        "其他",
    ]
    assert [segment["percent"] for segment in segments] == [40.2, 32.6, 18.1, 9.1]
    assert round(sum(segment["percent"] for segment in segments), 1) == 100.0
    assert [segment["color"] for segment in segments] == [
        "#518af6",
        "#97d486",
        "#f1ad7c",
        "#a6baf9",
    ]

    # 近期请求：原型表格 4 行，时间倒序
    recent = body["recentRequests"]
    assert len(recent) == 4
    assert [item["user"] for item in recent] == ["user123", "alice", "bob", "admin"]
    assert [item["model"] for item in recent] == [
        "GPT-4o",
        "Claude-3.5",
        "Qwen-Max",
        "GPT-4o",
    ]
    assert [item["tokens"] for item in recent] == [2048, 1024, 4096, 768]
    assert recent[0]["tokensDisplay"] == "2,048"
    assert recent[0]["status"] == "成功"
    assert recent[0]["statusKey"] == "success"

    assert body["overview"] == {
        "users": 128,
        "roles": 5,
        "models": 4,
        "uptimeDays": 15,
    }
    assert body["alerts"]["unread"] == 3


@pytest.mark.parametrize("range_key,points", [("7d", 7), ("30d", 30)])
def test_dashboard_week_and_month_ranges(client, auth_headers, range_key, points):
    body = dashboard(client, auth_headers, range_key)
    assert body["range"] == range_key

    requests, tokens, success = body["kpis"]
    trend = body["trend"]
    assert len(trend["total"]) == points == len(trend["success"])
    assert sum(trend["total"]) == requests["value"]
    expected_rate = round(sum(trend["success"]) / sum(trend["total"]) * 100, 1)
    assert expected_rate == success["value"]
    assert requests["value"] > 128_960  # 多日累计大于单日基线
    assert tokens["value"] > 1_240_000_000
    assert len(requests["spark"]) == points
    assert 0 < success["value"] <= 100
    y_ticks = trend["yTicks"]
    assert 4 <= len(y_ticks) <= 7  # 约 5~6 个 nice 刻度
    assert y_ticks == sorted(y_ticks) and y_ticks[0] == 0
    assert y_ticks[-1] >= max(trend["total"])
    assert set(trend["yLabels"]) == {str(value) for value in y_ticks}
    assert trend["yLabels"]["0"] == "0"
    assert len(trend["xLabels"]) >= 1

    segments = body["distribution"]["segments"]
    assert round(sum(segment["percent"] for segment in segments), 1) == 100.0
    assert all(segment["percent"] >= 0 for segment in segments)


def test_invalid_range_returns_400(client, auth_headers):
    response = client.get("/api/analytics/dashboard?range=year", headers=auth_headers)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"


def test_dashboard_requires_login(client):
    assert client.get("/api/analytics/dashboard").status_code == 401


def test_dashboard_updates_after_gateway_request(client, auth_headers):
    before = dashboard(client, auth_headers)
    response = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {ADMIN_KEY}"},
        json=CHAT_BODY,
    )
    assert response.status_code == 200
    usage = response.json()["usage"]
    after = dashboard(client, auth_headers)

    assert after["kpis"][0]["value"] == before["kpis"][0]["value"] + 1
    assert after["kpis"][1]["value"] == before["kpis"][1]["value"] + usage["total_tokens"]
    assert len(after["trend"]["total"]) == 96
    assert after["recentRequests"][0]["user"] == "admin"
    assert after["recentRequests"][0]["tokens"] == usage["total_tokens"]
