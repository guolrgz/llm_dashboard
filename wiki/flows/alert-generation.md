---
title: 流程 — 告警生成、未读徽标与已读
source_files:
  - backend/app/services/alerts.py
  - backend/app/routers/alerts.py
  - backend/app/routers/traffic.py
  - backend/app/routers/analytics.py
  - src/components/AppTopbar.vue
  - src/views/TrafficView.vue
updated: 2026-11-18
tags: [flow, alerts, quota, rate-limit]
---

# 告警生成、未读徽标与已读

## 参与者

- 触发源：[[entities/backend-traffic-gateway]]（网关成功/限流路径）
- 服务/路由：[[entities/backend-alerts]]（`services/alerts.py` + `routers/alerts.py`）
- 展示：[[entities/frontend-shell]]（顶栏通知徽标）、[[entities/frontend-traffic-view]]（限流/配额事件）、[[entities/frontend-dashboard-view]]（`alerts.unread`）
- 数据：`alerts`、`settings.alert_threshold`、`token_usage`、`quota_policies`

## 触发条件（两类）

### A. 配额告警（`maybe_quota_alerts`）

在网关成功请求计量之后调用（`traffic.py` 第 8 步），传入合并后的 `limits` 与 `usage_for_user()`：

1. `alert_threshold(conn)` 读 `settings.alert_threshold`（默认 0.8）。
2. 计算日/月用量占配额比例：
   - 达到/超过阈值（>= threshold）→ `quota.warning`（“Token 日配额使用率 92.5%”）；
   - 达到/超过 100% → `quota.exceeded`（级别更高）。
3. 生成告警前做**去重**：同 type + 同 user 在 10 分钟窗口内已存在告警则跳过，避免每个请求刷屏。
4. `create_alert()` 写 `alerts`（type/level/title/message/user_id/read=0/created_at）。

### B. 限流告警（`maybe_rate_limit_alert`）

在网关判定 RPM/TPM 超限后、返回 429 之前调用：

1. 记录被限流的用户、Key 前缀、原因（rpm/tpm）、窗口内已用与限制值。
2. 同样按 type+user 去重后写入 `alerts`（`rate_limit`，级别 info/warning）。

## 展示链路

1. **顶栏徽标**：`AppTopbar` 挂载时调 `GET /api/alerts/unread-count` → `{unread}`；失败回落 3（原型徽标值）。页面监听 `llm:alerts-unread` 事件可刷新。
2. **Dashboard**：`/api/analytics/dashboard` 返回 `alerts.unread`，前端目前只用于数据（顶栏另有请求）。
3. **流量监控页**：告警与限流/配额事件一起展示（`/api/alerts`、`/api/traffic/rate-limit-events`、日志状态筛选）。
4. **告警列表接口**：`GET /api/alerts?unreadOnly=&page=&pageSize=` 返回 `items` + `unread` + `total`，按 `created_at DESC`。
5. **已读**：
   - `POST /api/alerts/{id}/read` → 单条置 `read=1`；
   - `POST /api/alerts/read-all` → 全部置已读；
   - 未读数随即减少，顶栏徽标下一轮刷新更新。

## 种子与初始状态

- 首次初始化写入 5 条告警：3 条未读（user123 日配额 92.5%、alice 月配额 88.1%、user123 Key 触发 RPM 限流）+ 2 条已读历史。
- 顶部徽标因此初始为 3，与设计稿一致（见 [[entities/backend-seed-data]]）。

## 时序（简化）

```text
gateway success → record_success → usage_for_user
  → maybe_quota_alerts(threshold) → [dedupe] → alerts(read=0)
gateway rate limited → maybe_rate_limit_alert → [dedupe] → alerts(read=0)
Topbar → GET /api/alerts/unread-count → badge
TrafficView → GET /api/alerts → 事件列表
User marks read → POST /api/alerts/{id}/read → unread-1
```

## 坑与注意点

- **去重窗口是进程内 SQL 查询**（同 type+user 最近 10 分钟）：多实例部署时去重不跨实例，可接受（演示单实例）。
- **阈值是 0–1 小数**：settings 存 `0.8`，前端展示 `80%`，保存时 `/100`；改语义时注意两端口径（见 [[entities/frontend-models-settings-views]]）。
- **告警不自动消失**：已读只改 `read`，历史保留；`alerts` 表增长需要运维清理策略（当前未实现自动归档）。
- **测试污染**：E2E 网关用例会真实生成告警，验收后 DB 重置会回到种子 3 条未读。

## 相关页面

- [[concepts/token-governance]]、[[concepts/metering-analytics]]
- [[entities/backend-alerts]]、[[entities/backend-traffic-gateway]]、[[entities/backend-seed-data]]
- [[entities/frontend-traffic-view]]、[[entities/frontend-shell]]
- [[flows/gateway-request]]
