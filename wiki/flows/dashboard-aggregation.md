---
title: 流程 — Dashboard 数据聚合与渲染
source_files:
  - src/views/DashboardView.vue
  - src/api/analytics.js
  - src/components/TrendCard.vue
  - src/components/TrendChart.vue
  - src/components/DonutCard.vue
  - backend/app/routers/analytics.py
  - backend/app/seed.py
updated: 2026-11-18
tags: [flow, dashboard, analytics, frontend]
---

# Dashboard 数据聚合与渲染

## 参与者

- 前端：[[entities/frontend-dashboard-view]]（`DashboardView.vue` + `PageHeader`）、[[entities/frontend-charts]]（KpiCard/TrendCard/TrendChart/DonutCard/DonutChart/RequestTable/OverviewCard）、[[entities/frontend-api-client]]
- 后端：[[entities/backend-analytics]]（`GET /api/analytics/dashboard`）
- 数据：`usage_buckets`（KPI/趋势/分布）、`request_logs`（近期请求）、`settings`（spark 基线/启动时间）、`users`/`roles`/`models`/`alerts`（概览与未读）

## 步骤（按调用顺序）

### 1. 进入 Dashboard

1. 路由守卫确认登录态后渲染 `DashboardView`。
2. `range` 初始为 `today`；`watch(range)` 触发 `fetchDashboard(range)`（`src/api/analytics.js` → `GET /api/analytics/dashboard?range=...`，使用 `AbortController` 取消上一次未完成请求，避免竞态）。
3. 加载态：页面顶部进度条 + 卡片骨架；失败态：保留完整布局 + 错误提示 + 重试按钮（`loading/error/空态` 三态，不白屏）。

### 2. 后端聚合

`analytics.dashboard(range)`：

1. `_validate_range`：只接受 `today|7d|30d`，否则 400。
2. `_period_bounds(range)`：算出当前周期起止与上一等长周期（环比用）。
3. `_load_buckets`：从 `usage_buckets` 取当前周期行（今日为 96 个 15 分钟桶 × 模型）。
4. `_totals` → `_kpi`：请求量、Token、成功率；`_delta_percent` 计算环比；成功率 delta 为百分点。
5. 趋势：`_today_trend`（96 点，`_sampled_x_labels` 取 6 个每 4 小时标签）或 `_daily_series`（7/30 天）；`_ticks` 生成 5–6 个 nice y 刻度与 `yLabels`（今日 0–2.5k）。
6. 分布：`_distribution` 按模型 Token 占比，前三固定颜色、其余归“其他”，百分比保留 1 位、合计 100。
7. 近期请求：`_recent_requests` 取 `request_logs` 最新 4 条，映射 `time/user/model/tokensDisplay/status/statusKey`。
8. 概览：`_overview` 统计用户数、角色数、启用模型数、`uptimeDays`（settings.system_started_at）。
9. spark：`_spark_from_settings` 读 `settings.spark_today`（今日优先，保证原型 KPI sparkline 形状）；其他范围从日序列采样。
10. 告警未读：`alerts read=0` 计数。
11. 返回 `{range, kpis, trend, distribution, recentRequests, overview, alerts}`。

### 3. 前端渲染（props 注入）

- `DashboardView` 把响应分发给子组件：`KpiCard`（label/value/display/delta/tone/spark）、`TrendCard` → `TrendChart`（96 点双曲线 + xLabels/yTicks/yLabels + hover tooltip）、`DonutCard` → `DonutChart`（4 段 + 图例百分比）、`RequestTable`（近期请求行与状态徽标）、`OverviewCard`（4 个统计瓦片）。
- 图表全部原生 SVG；`TrendChart` 用 `yTicks` 画横向网格线、`yLabels` 取文案，`xLabels` 沿 x 轴等距分布；hover 时十字准星 + tooltip 显示该点请求/成功请求。
- KPI 长数值（如 30 天 3,714,984）自动缩字号，避免与 sparkline 重叠。

### 4. 时间范围切换

1. 用户点「近7天/近30天」→ `range` 变化 → 新请求 `?range=7d|30d`。
2. 后端返回 7/30 个日点、对应 y 刻度与环比；页面 KPI/曲线/分布/近期请求重渲染。
3. 旧请求若未完成则被 Abort 取消（不会出现旧数据覆盖新数据）。

## 关键口径（容易对不上的数字）

- Dashboard 的请求/Token/成功率来自 `usage_buckets`，**不是** `request_logs`（后者只用于近期请求/日志/限流窗口）。见 [[concepts/metering-analytics]]。
- 今日基线由种子精确复现原型：128,960 / 1.24B / 99.2%；真实网关流量会 +n（预期）。
- “其他 9.1%”是模型中非前三名的合计（当前种子为 DeepSeek-V3）。
- 7d/30d 环比接近 0% 是因为历史日由确定性随机生成、量级相近，不是 bug。

## 坑与注意点

- **不要在前端硬编码数值**：所有 display/数值来自接口，像素验收时数据差异属预期。
- **图表库禁止**：保持原生 SVG；改图表时同时跑 `pixel-check.mjs` 与 Dashboard E2E。
- **sparkline 今日是“原型形状”**：`settings.spark_today` 里的数组是为了视觉基线；真实数据趋势以主曲线为准。
- **接口失败必须保留布局**：错误态由 `DashboardView` 处理，子组件不假设数据一定存在（保留默认值兜底）。

## 相关页面

- [[concepts/metering-analytics]]、[[concepts/design-fidelity]]
- [[entities/backend-analytics]]、[[entities/backend-seed-data]]
- [[entities/frontend-dashboard-view]]、[[entities/frontend-charts]]、[[entities/frontend-api-client]]
- [[flows/gateway-request]]（数据来源）
