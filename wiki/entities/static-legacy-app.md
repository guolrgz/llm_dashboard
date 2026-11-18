---
title: 静态版 Dashboard 脚本（static/app.js + index.html + styles.css）
source_files:
  - static/app.js
  - static/index.html
  - static/styles.css
  - static/assets/fonts/inter-var.woff2
  - static/assets/fonts/noto-sans-sc-var.woff2
updated: 2026-11-18
tags: [entity, legacy, frontend]
---

# 静态版 Dashboard 脚本（static/app.js + index.html + styles.css）

> 所属模块：[[modules/static-legacy]]

`static/` 的唯一一页：一个不依赖框架与后端的 Dashboard。`index.html` 提供内联 SVG sprite 与完整 DOM，`styles.css` 承担像素级布局，`app.js` 用 IIFE 手绘趋势图/环形图/sparkline 并绑定少量交互。它是“无构建时代”的实现样本，也是像素 QA 最早的被拍对象。

## 用途

- 在没有 Node、没有数据库的机器上双击即可看到 1672×941 的设计还原。
- 保留早期“手写 SVG 图表 + 原生 DOM”的做法，便于对比后来 Vue 组件的实现差异。
- 作为 [[modules/tools]] 中 `shot.mjs --url=file://...` 链路的对照页面。

## 三个文件的分工

| 文件 | 内容 |
|---|---|
| `static/index.html` | `<svg class="svg-defs">` 内联图标 sprite（logo、导航、KPI、概览图标）、侧栏/顶栏/内容区 DOM、KPI 卡与图表容器、4 行近期请求、系统概览、`<script src="app.js">` |
| `static/styles.css` | `@font-face`（Inter / Noto Sans SC 可变字重）、`:root` 设计 token、侧栏固定 260px、卡片/表格/图例样式、7 档媒体查询（1500/1280/1080/900/700/380/860-701px） |
| `static/app.js` | 423 行 IIFE：数据常量、`el()`/`monotonePath()` 工具、三个渲染函数、交互初始化、`boot()` |

## 数据（全部硬编码）

- `HOURS`/`TOTAL`/`SUCCESS`：96 个点，按 0.25 小时覆盖 24 小时（`HOURS.push(i * 0.25)`）；数值从 9,900 爬到 82,800 再回落，20:00 点固定为 `78,230 / 77,102`（与 tooltip 默认展示一致）。
- `KPI_SPARKS`：`requests` / `tokens` / `success` 三条 33–34 点的小序列（归一化后的形状值，不是真实 Token 数）。
- `SPARK_TONES`：`blue/green/purple` 三组描边色（`#3b82f6`/`#10b981`/`#8b5cf6`）。
- 环形图分段写死在 `renderDonut()` 里：`0–145`（GPT-4o）、`145–228`（Qwen-Max）、`228–274`（Claude-3.5）、`274–326`（无图例色块）、`326–360`（其他），共 5 段。
- 页面文本：`128,960` / `1.24B` / `99.2%`，概览 `128 / 5 / 4 / 15 天`，顶栏徽标 `3`，近期请求时间戳为 `2025-05-22`。

## 关键函数

| 函数 | 作用 |
|---|---|
| `el(name, attrs)` | `createElementNS` 快捷构造 SVG 节点 |
| `monotonePath(pts)` | 单调三次样条转 `M/C` 路径，折线平滑的核心；sparkline 与趋势图共用 |
| `renderLineChart()` | 按 `#chartWrap` 实际尺寸设 viewBox；`MAX = 100000`；y 轴 `[0,25000,50000,75000,100000]`（标签 `0/25k/50k/75k/100k`）；x 网格按设计稿参考宽度 752 缩放（`sx = plotW / 752`），标签每 4 小时一个；画两条面积+描边曲线、十字准线与两个圆点；绑定 `mousemove`/`mouseleave` |
| `placeTip(hour)` | 把 hover 吸附到最近 0.25h 点，更新 tooltip 时间与两行数值，限制 left 在 4..W-161，top 固定 7px |
| `renderDonut()` | `C=110, R=92, SW=35`，用 5 段 `stroke` 圆弧 + 0.8° 间隙拼环，中心文字由 HTML 提供 |
| `renderSparklines()` | 遍历 `.kpi-spark`，按 `data-spark`/`data-tone` 取数据与色，W184×H84、x 11→179，渐变面积 + 2px 描边 |
| `initInteractions()` | 时间范围 `seg-btn` 单选、侧栏 `nav-item` 高亮、汉堡按钮桌面折叠/移动抽屉、遮罩与 Esc 关闭、`matchMedia('(max-width: 900px)')` 变化时复位 |
| `boot()` | 依次 `renderSparklines → renderDonut → renderLineChart → initInteractions`，并挂 `resize` 与 `ResizeObserver` 重绘趋势图 |

## 运行方式

```bash
# 直接预览（无需服务）
xdg-open static/index.html      # 或浏览器打开 file:///.../static/index.html

# 作为像素工具的目标
node tools/shot.mjs --url=file:///home/student/code/llm_dashboard/static/index.html \
  --out=tools/out/static-current.png --width=1672 --height=941
node tools/diff.mjs --current=tools/out/static-current.png --report=tools/out/static-qa.md
```

没有构建步骤、没有接口请求、没有 `localStorage` 写入；刷新即回到初始数据。

## 与源码/文档的对应

- `monotonePath` 与 `src/charts/svg.js` 中的曲线生成同源；Vue 化后由 [[entities/frontend-charts]] 的 `TrendChart`/`DonutChart`/`KpiSpark` 承担。
- 侧栏/顶栏 DOM 对应 [[entities/frontend-shell]] 的 `AppSidebar`/`AppTopbar`；导航 6 项与 `src/data/dashboard.js` 的 `navItems` 一致。
- `styles.css` 的 token 与 `src/styles.css` 的 `:root` 基本一致，是 [[concepts/design-fidelity]] 的“同源基线”。
- 设计坐标来源见 `docs/design-spec.md`，测量方法见 [[entities/tools-pixel-qa]]。

## 坑与注意点

1. **趋势图 y 轴与 KPI 不自洽**：曲线最大值 8 万多、y 轴上限 100k，而 KPI 写 128,960；这是设计稿本身的问题，SPA 改成真实聚合后 y 轴变成 0–2.5k，属预期差异。
2. **环形图 5 段 vs 图例 4 项**：`274–326` 是设计稿里存在的无标注色块，`renderDonut()` 忠实保留；不要按图例把它删掉，否则像素差异反而变大。
3. **分段顺序不是图例顺序**：绘制顺序是 GPT-4o → Qwen-Max → Claude-3.5 → 无标注 → 其他，颜色与图例的对应关系要读 `segments` 数组，不能按 legend 顺序推断。
4. **tooltip 初始位置是伪造的 20:00**：页面加载即调用 `placeTip(20)`，即使鼠标没动也显示浮层；`mouseleave` 也回到 20:00。截图时这是“设计稿状态”，不是交互残留。
5. **hover 事件只绑一次**：靠 `wrap.dataset.bound` 防重复绑定，但 `renderLineChart()` 每次重绘都会重建 SVG 节点；新增交互时要区分“容器事件”和“图元事件”。
6. **桌面汉堡是折叠、移动端才是抽屉**：`max-width: 900px` 分支走 `sidebar-open` + `body.sidebar-locked`，桌面走 `sidebar-collapsed`；两套 class 不要混用。
7. **导航不发请求也不换页**：所有 `nav-item` 都是 `href="#"` + `preventDefault()`，只切 `is-active`；看到“用户管理点不动”不是 bug，是这一版的边界。
8. **重复的 SVG id**：`chatGrad` 在 sprite 与 KPI 卡内联 SVG 中各定义一次，`i-message` 定义后未被引用；修改渐变时注意浏览器取的是文档里第一个同名定义。

## 相关页面

- [[modules/static-legacy]] — 历史来源、保留原因与整体评价。
- [[modules/frontend]]、[[entities/frontend-charts]]、[[entities/frontend-shell]]
- [[concepts/design-fidelity]]、[[modules/tools]]
