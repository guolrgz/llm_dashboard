---
title: 前端流量监控页
source_files:
  - src/views/TrafficView.vue
  - src/components/console/ConsoleState.vue
  - src/components/console/ConsolePagination.vue
  - src/components/console/StatusPill.vue
  - src/components/console/useToast.js
updated: 2026-11-18
tags: [entity, frontend, traffic]
---

> 所属模块：[[modules/frontend]]

# 前端流量监控页

`TrafficView.vue` 把推理网关的“结果面”集中到一页：4 个概览指标、限流/配额事件、可筛选分页的请求日志。它只读，不提供任何写操作；数据来自 `/api/traffic/summary`、`/api/traffic/rate-limit-events`、`/api/traffic/logs`。

## 页面结构

```
main.content.console-page.traffic-page
├─ .page-head：标题 + 今日/近7天/近30天 + 刷新
├─ ConsoleState（!canView 时“无权查看流量监控”）
└─ template（有权限）
   ├─ error-banner（摘要失败 + 重试）
   ├─ section.kpi-row：总请求量 / 成功率 / Token 使用量 / 平均延迟
   ├─ section.card.events-card：限流与配额事件（最多 8 条）
   └─ section.card.logs-card
      ├─ 筛选表单：关键字 / 状态 / 用户 / 模型 + 查询/重置
      ├─ ConsoleState（加载/错误/空）
      ├─ 日志表格（时间/用户/模型/Token/延迟/状态/HTTP·错误码）
      └─ ConsolePagination
```

## 权限与进入

- `canView = auth.hasPerm('traffic.view')`；无权限时整页只渲染一个错误态，`onMounted` 直接 return，不发任何请求。
- 路由守卫不拦截，所以 URL 直达会看到“无权查看”而不是 404/登录页。
- 页面没有使用 `traffic.manage`，全部能力都是只读查询。

## 数据流

| 数据块 | 请求 | 状态 |
|---|---|---|
| 摘要 | `GET /api/traffic/summary?range=` | `summary`（reactive）、`summaryLoading`、`summaryError` |
| 事件 | `GET /api/traffic/rate-limit-events` | `events`、`eventsLoading`、`eventsError` |
| 日志 | `GET /api/traffic/logs?page&pageSize&range&keyword&status&userId&model` | `logs`、`total`、`page`、`logsLoading`、`logsError` |
| 用户下拉 | `GET /api/users?page=1&pageSize=100` | `userOptions`；失败静默为空 |
| 模型下拉 | `GET /api/models` | `modelOptions`；失败静默为空 |

- `onMounted` 一次性并发拉五路；`refreshAll()` 重拉摘要、事件、日志。
- `setRange(next)`：更新 `range`、`page=1`，只重拉摘要与日志（事件不随范围变化）。
- `fetchLogs()` 会校正页码：若当前页超过总页数则改成最大页并递归一次。
- `fetchSummary()` 把 `requests/successRequests/failedRequests/tokens/avgLatencyMs/rateLimited/quotaExceeded` 全部 `Number()` 后写入。
- 事件接口容忍 `Array`、`{items}`、`{events}` 三种形状，统一 `slice(0, 8)`。
- 模型下拉在首次日志返回后从当前页日志补全（`mergeModelOptionsFromLogs`）。

摘要与日志同源于 `usage_buckets` / `request_logs`，口径见 [[concepts/metering-analytics]]；数据由网关写入，见 [[flows/gateway-request]] 与 [[entities/backend-traffic-gateway]]。

## 格式化与状态映射

- `formatInt` 用 `Intl.NumberFormat('en-US')`；`formatTokens` 按 ≥1e9→B、≥1e6→M、≥1e3→k 压缩；`formatLatency` 四舍五入加 `ms`。
- `formatPercent` 优先用 `successRequests / requests` 计算，只有请求数为 0 时才读后端 `successRate`。
- `STATUS_META`：`success→绿/成功`、`error→红/失败`、`quota_exceeded→琥珀/配额超限`、`rate_limited→紫/限流`、`unauthorized→红/鉴权失败`、`disabled→灰/停用用户`；未知状态原样显示、灰色。
- 状态胶囊统一用 `StatusPill`（`label` + `tone`）；错误码用紫色小标签。

## 组件细节

- `ConsoleState`：`type=loading|error|empty`、`title`、`message`、`retryText`，错误态发 `retry` 事件；三种态的中心图标/加载动画由组件内置。
- `ConsolePagination`：props `total/page/pageSize`，emit `change(next)`；页码规则与用户页相同（≤5 全列、当前靠左/靠右/居中三种省略号布局），自身不做请求。
- `StatusPill`：`label` + `tone`（green/red/amber/blue/purple/gray），仅样式组件。

## 错误/加载/空态

- 摘要失败：顶部 `error-banner` + “重试”，但 4 张 KPI 仍渲染 `0`/`0 ms`（`summary` 初值是 0），看起来像真实零流量。
- 事件失败/空：卡片内一行灰字“加载中…/错误文案/暂无配额超限或限流事件”，没有重试按钮。
- 日志：首次加载显示 `ConsoleState` loading；错误态带重试；空态文案“当前筛选条件下没有匹配的推理请求”。
- 分页在加载中不禁用，快速翻页可能同时发出多个请求。

## 坑与注意点

- **没有请求取消**：切范围/翻页/筛选都直接发新请求，旧响应可能后到并覆盖新状态；Dashboard 用了 `AbortController`，这里没有。
- **用户下拉只取前 100 个**：种子有 128 个用户，`pageSize=100` 导致后 28 人无法被选为筛选条件。
- **下拉依赖额外权限**：`/api/users` 需要 `users.view`、`/api/models` 需要 `models.view`；只有 `traffic.view` 的角色会看到“全部用户/全部模型”的禁用或空下拉，且没有任何提示。
- **事件只显示 8 条**：接口返回全量后前端截断，标题“最近 X 条”的 X 是截断后的数量，不是服务端总数。
- **“实时”并不自动刷新**：没有轮询/SSE，只有手动“刷新”和切换范围；页面标题与副标题的“实时”是产品措辞。
- **范围只影响摘要与日志**：限流/配额事件始终是“最近”全局事件，切到近30天不会过滤事件。
- **成功率口径**：页面自己算 `success/requests`，与 Dashboard 的 `successRate` 可能因四舍五入/统计源不同出现 0.1pp 差异。
- **平均延迟 0 显示 `0 ms`**：没有延迟数据时不会落到 `—`，因为 `Number(0)` 是有限数；空数据与真实 0ms 不可区分。
- **分页组件无 loading 锁**：`ConsolePagination` 不接收 `disabled`，查询中仍可点页码；与用户页自研分页的行为不一致。
