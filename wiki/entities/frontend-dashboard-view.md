---
title: 前端 Dashboard 页
source_files:
  - src/views/DashboardView.vue
  - src/components/PageHeader.vue
  - src/data/dashboard.js
updated: 2026-11-18
tags: [entity, frontend, dashboard]
---

> 所属模块：[[modules/frontend]]

# 前端 Dashboard 页

`DashboardView.vue` 是登录后的首页：3 个 KPI、请求量趋势、Token 分布、近期请求与系统概览，支持“今日/近7天/近30天”切换。数据来自 `/api/analytics/dashboard`，设计稿静态数据仅作兜底。`PageHeader.vue` 是它的页头与时间范围切换器。

## 页面结构

```
main.content
├─ div.load-bar                     loading 时的顶部 3px 进度条
├─ PageHeader v-model="range"       标题 + 今日/近7天/近30天 + 日历按钮
├─ state-alert（error / empty）
├─ section.kpi-grid                 KpiCard × 3
├─ section.mid-grid                 TrendCard + DonutCard
└─ section.bottom-grid              RequestTable + OverviewCard
```

布局比例来自设计稿：KPI 三列等宽、中排 `840fr / 512fr`、底排 `715fr / 631fr`；≤1080px 全部塌成单列。视觉细节见 [[concepts/design-fidelity]]。

## 数据流

1. `onMounted` 调 `load()`；`watch(range)` 在切换时再调。
2. `load()` 先 `abort()` 上一个 `AbortController`，新建一个并置 `loading = true`、清空错误。
3. `fetchDashboard(range, { signal })` → [[entities/frontend-api-client]] → `GET /api/analytics/dashboard?range=...` → [[entities/backend-analytics]]。
4. 成功后写 `dashboard.value`，计算 `empty`，并 `announceUnread()` 广播未读数；401 时静默（客户端已跳登录），其余错误写 `errorMessage`。
5. `finally` 里只有未中止才关 loading；组件卸载时 abort，避免离页后 setState。

请求/聚合的后端细节见 [[flows/dashboard-aggregation]]，指标口径见 [[concepts/metering-analytics]]。

## 响应映射

- **KPI**（`kpis` computed）：无 `data.kpis` 时用 `data/dashboard.js` 的 `kpis` 兜底（并补 `trend:'up'`）。每个卡片取 `id/label/display/value/delta/deltaUnit/tone/spark/icon`：
  - `value` 优先用后端 `display`（如 `128,960`、`1.24B`），否则 `toLocaleString`；
  - `deltaUnit === 'pp'` 时显示成 `%`（成功率环比用百分点但视觉按百分比）；
  - `trend` 由 `delta < 0` 推导；
  - `tone`/`icon`/`spark` 缺失时按 id 查表（`requests→blue/chat`、`tokens→green/database`、`success→purple/check`）。
- **趋势**（`trend` computed）：要求 `trend.total` 至少 2 个点，否则返回 `null`；`success` 长度不一致时退回 `total`；`xLabels/yTicks/yLabels` 原样透传给 `TrendCard`。
- **近期请求**（`recentRows`）：后端无数组时返回 `null`，`RequestTable` 据此展示设计稿的 4 行默认数据；返回空数组时展示“暂无请求记录”。
- **分布/概览**：`distribution` 与 `overview` 原样传给 `DonutCard` / `OverviewCard`，由组件内部兜底。

## PageHeader

- Prop `modelValue`（默认 `'today'`），emit `update:modelValue`；`DashboardView` 用 `v-model="range"` 绑定。
- “今日”是独立按钮（`.seg-btn--solo`），另外两项来自 `ranges.filter(r => r.id !== 'today')`，渲染在 `.seg` 里。
- 标题与副标题是**硬编码**的“Dashboard / 实时监控 LLM 推理服务的 Token 流量与使用情况”，并非通用页头；其它页面各自写了 `.page-head`。
- 右侧日历按钮只有样式与 `aria-label`，没有点击处理，也没有日期选择器。

## 错误/加载/空态

- **加载**：顶部固定进度条；已有数据时不清空，避免切换范围时页面闪烁。
- **错误**：`state-alert--error` 展示“Dashboard 数据加载失败 + 原因 + 重试”，重试直接调 `load()`；同时下方仍会渲染兜底 KPI（因为 `kpis` 在无 API 数据时回落静态值），因此错误与“假数据”可能同屏。
- **空态**：仅当既无 KPI 又无趋势时显示“`{{ rangeLabel }}`暂无统计数据”；若只有 KPI 没有趋势，会显示 KPI + 空白图表卡。
- **401**：不显示错误条，交由客户端清 token 并跳登录。

## 状态与副作用

- `controller` 是模块级（组件实例内）变量，保证同一时刻只有一个在途请求。
- `announceUnread()` 在每次成功加载后执行：读 `dashboard.alerts.unread`，`window.dispatchEvent(new CustomEvent('llm:alerts-unread', { detail }))`，[[entities/frontend-shell]] 的顶栏监听并刷新徽标。
- 切换范围不会重置 `page` 之外的外部状态；Dashboard 没有分页。

## 坑与注意点

- **错误态仍显示兜底数据**：网络失败时 KPI 仍是 `128,960 / 1.24B / 99.2%`，容易被误读为实时值；只有顶部红条提示失败。
- **趋势与 KPI 不同源风险**：KPI 用后端 `display`，趋势用后端数组；若两者不一致（如后端只更新其一时），页面会同时展示矛盾数字。
- **`deltaUnit` 未在卡片内使用**：`KpiCard` 声明了 `deltaUnit`，但 `DashboardView` 已把单位拼进 `delta` 字符串，prop 实际是死参数。
- **默认兜底可能过时**：`data/dashboard.js` 的曲线/环形/表格数据是设计稿快照（时间戳 2025-05-22），仅在接口缺字段时出现；不要把它当成当前数据源。
- **日历按钮是装饰**：点击无反应，用户可能期待自定义日期范围；后端也只支持 `today/7d/30d`。
- **区间切换的竞态已处理**：旧请求被 abort，但 `fetch` 已到达后端的请求仍会完成并写库（查询类无害）。
- **`PageHeader` 不可复用**：把标题写死在组件里，新增页面若想复用需先改成 props。
