---
title: 前端图表与 Dashboard 组件
source_files:
  - src/components/KpiCard.vue
  - src/components/KpiIcon.vue
  - src/components/KpiSpark.vue
  - src/components/TrendCard.vue
  - src/components/TrendChart.vue
  - src/components/DonutCard.vue
  - src/components/DonutChart.vue
  - src/components/RequestTable.vue
  - src/components/OverviewCard.vue
  - src/components/OverviewTile.vue
  - src/components/OverviewIcon.vue
  - src/charts/svg.js
  - src/data/dashboard.js
updated: 2026-11-18
tags: [entity, frontend, charts]
---

> 所属模块：[[modules/frontend]]

# 前端图表与 Dashboard 组件

Dashboard 的视觉层由 10 个展示组件 + 1 个 SVG 工具模块组成，全部手写 SVG，不依赖 ECharts/Chart.js。它们只接收数据、不主动请求；数据由 [[entities/frontend-dashboard-view]] 注入，缺省时回落到 `data/dashboard.js` 的设计稿快照。

## 组件关系

```
KpiCard ── KpiIcon（内联图形）
        └─ KpiSpark（184×84 sparkline）
TrendCard ── TrendChart（命令式构建 SVG + 悬浮提示）
DonutCard ── DonutChart（220×220 环形 + 图例）
RequestTable（近期请求）
OverviewCard ── OverviewTile ── OverviewIcon（40×40 图形）
```

`charts/svg.js` 提供 `el(name, attrs)`（`createElementNS`）与 `monotonePath(pts)`（单调三次插值，保证曲线不过冲）；`TrendChart` 与 `KpiSpark` 共用后者。

## KpiCard / KpiSpark

**KpiCard** props：`label`（必填）、`value`（必填，String/Number）、`delta`、`deltaUnit`（默认 `%`，实际未使用）、`trend`（`up`/`down`）、`tone`（`blue/green/purple`）、`spark`（必填，内置键或数字数组）、`icon`（默认 `chat`）。

- 模板固定三段：`KpiIcon`、`kpi-body`（label/value/delta）、`KpiSpark`。
- `valueClass` 按字符串长度降字号：≥11 用 `kpi-value--xlong`，≥9 用 `kpi-value--long`，避免“3,714,984”压到右侧 sparkline。
- `trend === 'down'` 时箭头 `rotate(180deg)` 并加 `kpi-delta--down`（橙红），但文案仍显示正数（如 `12.5%`），方向靠颜色/箭头表达。

**KpiSpark** props：`spark`（字符串键或数组）、`tone`。

- viewBox `0 0 184 84`，x 从 11 到 179 均分，渐变 id 用 `useId()` 生成并清洗非法字符。
- 传入数组时过滤非有限值；**若 `max <= 84 && min >= 0` 视为“设计稿 y 坐标”直接绘制**，否则把数值归一化到 `top=4, bottom=56` 的带内。
- 内置曲线 `KPI_SPARKS.requests/tokens/success` 本身就是坐标序列（2~54），因此与设计稿逐点一致。
- 面积路径在 `y=84` 处闭合，下方渐变到透明。

## TrendCard / TrendChart

**TrendCard** 是纯壳：卡片标题“请求量趋势”+ 双色图例（总请求量/成功请求），把 `total/success/xLabels/yTicks/yLabels/range` 原样传给 `TrendChart`；所有 prop 都有默认值。

**TrendChart** props：`total`（默认 `TOTAL`）、`success`（默认 `SUCCESS`）、`xLabels`（默认 6 个整点标签）、`yTicks`/`yLabels`（默认设计稿 0~100k）、`range`（默认 `today`）。

渲染流程（`render()`）：

1. 读取容器宽高，`W = max(360, clientWidth)`、`H = max(200, clientHeight)`，设置 viewBox 后清空 SVG。
2. `seriesData()` 校验：total 必须全是有限数且 ≥2 点；success 长度不符或含非法值时退回 total。
3. 绘图区固定为 `left=44, right=W, top=17.5, bottom=215.5`；`MAX = max(yTicks, total, success, 1)`。
4. 今日横轴除以 `n`（96 个 15 分钟点铺满一天，末点略早于右边界），其它范围除以 `n-1`（首尾贴边）。
5. 画横向网格 + y 轴文案（优先用 `yLabels[v]`，否则 `compact()` 成 `1.5k/2M`）；今日且 6 个标签时，x 标签与竖网格用设计稿实测像素（`chart.xLabels/vGrid`）按 `plotW/752` 缩放，其余范围按标签均分。
6. 依次画蓝色总面积/折线、绿色总面积/折线（`monotonePath`），再画十字虚线、两个圆点与 HTML 浮层。
7. `placeTip(idx)` 更新浮层时间（`timeLabel`）、总量/成功量、左右夹取位置；今日默认停在第 80 点（20:00），其它范围停在 84% 处。
8. 鼠标移动按 `(mx - plotLeft) / plotW * xDenom` 反算索引；移出恢复默认点。

更新机制：`watch` 深度监听所有 props（`flush:'post'`）重绘；`ResizeObserver` + `window.resize` 走 `requestAnimationFrame`；卸载时移除监听、断开 observer、取消 rAF。

## DonutCard / DonutChart

**DonutCard** props：`distribution`（`{total, display, segments:[{key,name,percent,color}]}`）。它把 segments 映射为图例（`value = percent + '%'`），并传 `totalDisplay`。

**DonutChart** props：`segments`、`legend`、`totalDisplay`。

- 圆环几何：中心 `(110,110)`、半径 92、线宽 35、段间 `GAP_DEG = 0.8`；`arcPath()` 用 `A` 弧生成每段，`large-arc` 按角度差 >180 判断。
- API 段按 `percent * 360 / 100` 累加角度；`percent` 非法则丢弃；无有效段时回落到 `donutSegments`（设计稿的 **5 段**）。
- 图例：API 图例优先；否则 `donutLegend`（**4 项**）。颜色优先 `item.color`，否则按名称映射 `GPT-4o→blue`、`Claude-3.5→green`、`Qwen-Max→orange`、`其他→lavender`。
- 中心文案：`totalDisplay || '1.24B'`，副标题“总使用量”。

## RequestTable / OverviewCard

- **RequestTable** props `rows`：`null` → 用设计稿 4 行；空数组 → 显示“暂无请求记录”；`tokensDisplay` 优先，否则 `Number(tokens).toLocaleString()`。状态徽标通过 `STATUS_TONE` 把 `success/成功`、`error/失败/unauthorized`、`quota_exceeded/rate_limited/not_found` 映射为 success/error/warning，未知为 info。
- **OverviewCard** props `overview`：无对象时用设计稿 4 个 tile；有数据时按 `users/roles/models/uptimeDays` 生成“用户总数/角色数量/接入模型/系统运行时长（天）”，数字 `toLocaleString`。
- **OverviewTile** props：`type/label/value/unit`；`toneMap` 把 `users/roles/cube/clock` 映射为蓝/紫/绿/橙，输出 `ov-tile--<tone>`；`OverviewIcon` 按 type 内联 40×40 图形，未知类型回落到时钟。

## 坑与注意点

- **spark 坐标启发式有歧义**：任何真实序列只要 `max ≤ 84` 就会被当成 y 坐标而非数值。真实的“成功率”序列通常 >84 会走归一化，但小流量计数（如 0~50）会被画成一条贴顶的折线。
- **TrendChart 绘图区高度写死**：`bottom=215.5` 不随 `H` 变化；卡片被拉高时图只占上半部分，压得很矮时可能裁切。`H` 只影响 viewBox。
- **yTicks 缺省是设计稿的 0~100k**：若后端不返回 `yTicks`，网格文案与实际总量（如 128,960）不匹配；`MAX` 会取序列最大值，所以曲线仍能铺满。
- **今日横轴除以 n 而不是 n-1**：最后一个点与右边界留出约一个步长的空隙，这是为贴合设计稿；切到 7d/30d 后首尾贴边，视觉节奏不同。
- **浮层默认值硬编码**：模板初始文案是 `20:00 / 78,230 / 77,102`，在数据加载前会短暂显示；`render()` 成功后立即覆盖。
- **环形图两套默认数据段数不一致**：兜底 5 段弧、4 项图例是设计稿原样（有一段未标注色块），而真实 API 返回 4 段；不要把它当 bug 修成一致，否则像素基线会变，参见 [[concepts/design-fidelity]]。
- **中心总数默认 `1.24B`**：`distribution` 缺失时仍显示设计稿值，容易让空数据看起来“有数”。
- **重复渐变 id**：`KpiIcon` 内联的 `chatGrad` 与 `IconsSprite` 中的同名渐变共存于一个文档，属于无效的重复 id；目前配色相同才未显形。
- **样式全在全局 CSS**：这些组件几乎没有 scoped 样式，依赖 `styles.css` 的 `.kpi-*`、`.chart-*`、`.donut-*`、`.ov-*`；单独复用组件时必须带上全局样式，否则布局全塌。
- **无障碍**：图表是 `role="img"` + 固定 `aria-label`，屏幕阅读器只能听到“请求量趋势折线图/Token 使用量分布环形图”，读不到具体数值；数据表也没有 caption。
