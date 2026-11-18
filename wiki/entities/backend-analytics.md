---
title: Dashboard 聚合分析路由（/api/analytics/dashboard）
source_files:
  - backend/app/routers/analytics.py
  - backend/app/services/metering.py
  - backend/app/utils.py
  - backend/app/db.py
updated: 2026-11-18
tags: [entity, backend, analytics]
---

> 所属模块：[[modules/backend]]

# Dashboard 聚合分析路由（`/api/analytics/dashboard`）

`analytics.py` 只有一个对外端点，却承担控制台首页的全部数据：KPI、趋势、模型分布、近期请求、
系统概览、未读告警数。它不做实时计算，而是把 `usage_buckets` 的 15 分钟桶按时间范围聚合成
前端图表需要的形状，并把"原型基线"与"真实流量"自然叠加。

## 端点与权限

| 方法 | 路径 | 函数 | 权限 |
|---|---|---|---|
| GET | `/api/analytics/dashboard?range=today\|7d\|30d` | `dashboard(range="today", conn, _user)` | `dashboard.view` |

`range` 非法时 400 `validation_error`；缺省按 `today`。响应结构：

```json
{
  "range": "today",
  "kpis": [{"id","label","value","display","delta","deltaUnit","spark","tone","icon"}],
  "trend": {"xLabels": [], "total": [], "success": [], "yTicks": [], "yLabels": {}},
  "distribution": {"total": 0, "display": "0", "segments": []},
  "recentRequests": [],
  "overview": {"users": 0, "roles": 0, "models": 0, "uptimeDays": 0},
  "alerts": {"unread": 0}
}
```

## 关键函数

| 函数 | 说明 |
|---|---|
| `_validate_range` | 只接受 `today/7d/30d`（`RANGE_DAYS`） |
| `_period_bounds` | 返回 `(本期start, 本期endExclusive, 上期start, 上期endExclusive)`，用于环比 |
| `_load_buckets` / `_totals` | 按 `bucket_start` 范围取桶，汇总 requests/success/tokens |
| `_kpi` | 组装 KPI 卡片字段，`deltaUnit` 为 `%` 或 `pp`（成功率用百分点） |
| `_today_trend` | 生成 96 个 15 分钟点，返回 total/success 序列与固定 6 个 x 标签 |
| `_daily_series` / `_sampled_x_labels` | 7d/30d 按天聚合，抽取 ≤6 个日期标签（`MM-DD`） |
| `_delta_percent` | 环比百分比，上期为 0 时返回 0 |
| `_distribution` | 按模型聚合 Token，取前 3 名 + "其他"，保证百分比合计 100.0 |
| `_recent_requests` | 取 `request_logs` 最新 4 条，状态转中文并保留 `statusKey` |
| `_overview` | `COUNT(users)`、`COUNT(roles)`、启用模型数、`uptimeDays` |
| `_spark_from_settings` | 读 `settings.spark_today`（JSON），给今日 KPI 卡片提供设计稿 sparkline |
| `_ticks` / `_nice_step` / `_tick_label` | 生成 1/1.5/2/2.5/3/4/5/7.5/10×10ⁿ 的"好看"刻度 |

## 聚合口径

- **today**：从 `day_start()` 起 96 个 15 分钟槽；`usage_buckets.bucket_start[:16]` 作为槽键。
  `xLabels` 固定为 `["00:00","04:00","08:00","12:00","16:00","20:00"]`，**不是** 96 个点一一对应
  ——前端按索引比例映射，这是有意的设计稿还原。
- **7d/30d**：把桶按 `bucket_start[:10]` 归并到自然日，缺失日期补 0；`xLabels` 从序列中抽样。
- **环比**：`today` 与"前一天"比，`7d` 与"前 7 天"比，`30d` 与"前 30 天"比；成功率用
  `当前 - 上期` 的百分点差。
- **spark**：`today` 优先用 `settings.spark_today` 中约 33–34 点的设计稿数据；缺失时分别用
  请求序列、桶 Token 序列、桶成功率序列兜底。7d/30d 直接用日序列。
- **模型分布**：当前周期的 `usage_buckets`，前 3 名按 Token 降序，其余归"其他"；若不足 4 个
  模型则没有"其他"段。颜色由 `MODEL_COLORS` 固定，未知模型用 `FALLBACK_PALETTE`。
- **近期请求**：与时间范围无关，始终取全表最新 4 条。

## 调用链与数据来源

```
GET /api/analytics/dashboard
  ├─ require_permission("dashboard.view")
  ├─ usage_buckets ×2（本期 + 上期）→ KPI / trend / distribution
  ├─ request_logs（LIMIT 4）→ recentRequests
  ├─ users/roles/models/settings → overview
  └─ alerts WHERE read=0 → alerts.unread
```

写入侧完全由网关的 `metering.record_success` 负责；本模块只读，不产生任何副作用。

## 边界与错误处理

- `range` 大小写敏感，`Today` 会 400。
- 空库（无种子）时所有序列为 0，`_ticks(0)` 返回 `[0, 1]`，不会抛除零。
- 成功率为 0 请求时 `metering.success_rate` 返回 `0.0`，不是 NaN。
- `settings.system_started_at` 解析失败时 `uptimeDays` 回退 0。
- `_spark_from_settings` 对非法 JSON、非 dict、非 list 值都静默忽略。

## 坑与注意点

- **趋势与 KPI 依赖不同字段**：KPI/趋势的 `requests` 来自 `usage_buckets.requests`，而该字段
  只累加成功请求；`request_logs` 里的失败请求不进入趋势。"失败请求"只在流量摘要里用
  `requests - success` 推算，纯真实流量下会得到 0。
- **今日 spark 可能"不跟数据走"**：只要 `settings.spark_today` 存在，KPI 卡片就显示设计稿的
  34 点曲线，而不是当天真实序列；只有当天序列被用作兜底时才反映真实流量。
- **xLabels 与数据点数量不匹配**：today 是 96 点 + 6 标签，前端必须按"标签是轴刻度"处理，
  不能 `zip`。
- **`_distribution` 的 100% 是"凑"出来的**：先四舍五入到 1 位，再把误差加到最大分段；
  因此某一段的百分比可能与其 Token 占比略有出入。
- **`recentRequests` 不随 range 变化**：选"近 30 天"时近期请求仍是全局最新 4 条。
- **未读告警是全局计数**：不按当前用户过滤，与 `/api/alerts/unread-count` 同源。
- **`uptimeDays` 与 `/health.uptimeSeconds` 不同源**：前者来自种子写入的
  `settings.system_started_at`（默认 15 天前），后者是进程启动时间。

## 相关页面

[[modules/backend]] · [[entities/backend-metering-rate-limit]] · [[entities/backend-alerts]] ·
[[entities/backend-db-schema]] · [[entities/backend-seed-data]] · [[concepts/metering-analytics]] ·
[[flows/dashboard-aggregation]]
