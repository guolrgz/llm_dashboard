---
title: 前身原生静态版（static/）
source_files:
  - static/index.html
  - static/styles.css
  - static/app.js
  - static/assets/fonts/inter-var.woff2
  - static/assets/fonts/noto-sans-sc-var.woff2
updated: 2026-11-18
tags: [module, legacy]
---

# 前身原生静态版（static/）

`static/` 是接入后端与 Vue 之前那一阶段的产物：一个**纯原生 HTML/CSS/JS 的单页 Dashboard**，按 `index.png` 做像素级还原，所有数据写死在脚本里。它现在只作为“不装 Node 也能看一眼设计稿效果”的历史快照保留。

## 职责

- 保存最早一版的视觉复刻结果，作为 SPA 重构前的对照物。
- 提供一个零依赖预览入口：直接 `file://` 打开即可看到 1672×941 的 Dashboard，不需要 Vite、FastAPI、数据库或登录。
- 记录设计 token、SVG 图标、字体子集在“无构建”条件下的实现方式。

它**不是**产品的第二套实现：没有登录、没有 API、没有用户/角色/模型/流量页面，也没有任何持久化。

## 历史来源

- 依据 `README.md` §5/§11 与 `docs/system-architecture.md`：项目分两阶段，先做 `index.png` / `users.jpg` 的静态还原，再按 OpenSpec 变更补后端与治理闭环；归档后的 `proposal.md` 的 Why 也明确写着“现有仓库只完成了像素级静态还原，页面数据全部写死在前端 mock 文件里”。
- 仓库只有两个 commit 且整棵树处于未跟踪状态，无法用 `git log --follow static/` 追溯更细的演进；关于“上一阶段”的判断只能依据文档叙述。
- 遗留文档存在指向漂移：`docs/system-architecture.md` 写“`src/users/` 历史静态版（已降级为兼容入口）”，但当前 `src/` 下没有 `users/`，真正的历史版本是这里的 `static/`；`users.html` 也不是静态用户页，而是 SPA 的跳转别名。

## 目录与文件

```text
static/
  index.html                     337 行：内联 SVG sprite + 完整 Dashboard DOM
  styles.css                     831 行：设计 token、布局、7 档媒体查询
  app.js                         423 行：IIFE，手绘趋势图/环形图/sparkline + 交互
  assets/fonts/
    inter-var.woff2              30 KB，可变字重
    noto-sans-sc-var.woff2       29 KB，中文字符子集
```

三者通过 `<link rel="stylesheet" href="styles.css">` 与 `<script src="app.js">` 相对引用，因此在 `file://` 下也能正常加载字体。

## 页面结构（唯一的 Dashboard）

- 侧栏：品牌区 + 6 个导航项（Dashboard/用户管理/角色管理/权限管理/流量监控/系统设置）+ 退出登录；全部 `href="#"`，点击只切换高亮，不换页面。
- 顶栏：汉堡按钮、通知铃（徽标 3）、用户 `admin`。
- 内容区：页头（标题/副标题/今日-近7天-近30天分段控件/日历按钮）、3 张 KPI 卡、趋势卡 + 环形图卡、近期请求表 + 系统概览。
- 数据全部硬编码：`128,960`、`1.24B`、`99.2%`、模型占比 `40.2/32.6/18.1/9.1`、概览 `128 / 5 / 4 / 15 天`、4 条 `2025-05-22` 的请求记录。

## 与 SPA 的关系

| 关注点 | `static/`（旧） | `src/` + `backend/`（现） |
|---|---|---|
| 入口 | 直接打开 `index.html` | `index.html` → Vite → `src/main.js` |
| 页面 | 仅 Dashboard | 登录 + Dashboard + 6 个治理页（hash 路由） |
| 数据 | `app.js` 内常量 | `/api/analytics/dashboard` 等接口 |
| 导航 | `href="#"` 视觉高亮 | Vue Router + 登录守卫 |
| 图表 | 手写 SVG（`monotonePath` 等） | Vue 组件（见 [[entities/frontend-charts]]） |
| 图标/字体 | 内联 sprite + 字面子集 | `IconsSprite.vue` + 更全的 Noto 子集 |
| 样式 | `static/styles.css` | `src/styles.css`（同源后代，新增业务页样式） |

视觉基线（侧栏 `#19223a`、主蓝 `#3f7cf5`、卡片 12px 圆角、260px 侧栏、7 档断点）在两代之间保持一致，这是能用同一套像素工具对比的前提，详见 [[concepts/design-fidelity]]。

## 入口命令

```bash
# 直接预览（无需服务）
xdg-open static/index.html      # 或浏览器打开 file:///.../static/index.html

# 作为像素工具的目标（产物落在 tools/out/，不在 static/）
node tools/shot.mjs --url=file:///home/student/code/llm_dashboard/static/index.html \
  --out=tools/out/static-current.png --width=1672 --height=941
```

没有构建步骤、没有 npm script，也不会被 `start.sh`、`vite.config.js` 或 FastAPI 的 `dist/` 托管逻辑引用。

## 产出物

- 页面本身：一份可离线打开的 HTML 快照，无数据库、无 `localStorage`、无网络请求；刷新即回到初始数据。
- 派生证据：`tools/shot.mjs` 截出的 PNG 与 `current-meta.json`，再经 `tools/diff.mjs` 生成 `docs/diff*.png` 与视觉报告；这些属于 [[modules/tools]] 的产物。

## 保留原因

1. **可交付性**：评审者机器上没有 Node/Python 时，双击 `static/index.html` 就能看到设计还原度。
2. **回滚参照**：README §11 与 `design.md` 的 Migration Plan 都把“停止后端即回到纯前端静态版”写成回退路径。
3. **像素工具的历史输入**：`tools/shot.mjs` 的 `--url=file:///.../index.html` 用例、`tools/qa.sh` 的默认链路，本来就是对着这一版跑出来的。

## 设计要点与坑

- **“单文件”是误称**：README 写“单文件，可直接打开”，实际是 `index.html` + `styles.css` + `app.js` + 2 个字体，共 5 个文件；移动任一个都会破坏相对路径。
- **不要用仓库根 `index.html` 代替它**：根 `index.html` 只是 Vite 入口（`<div id="app">` + `/src/main.js`），`file://` 打开是空白；历史预览请用 `static/index.html`。
- **只有 Dashboard**：侧栏的“用户管理/角色管理/…”没有对应页面，点击只改 `is-active`，容易被误认为功能缺失。
- **数据自相矛盾**：趋势 y 轴写死 0–100k、曲线 96 点（0.25h 分辨率），与 KPI 128,960 并不自洽；环形图是 5 段（其中一段无图例），图例却只列 4 项——这正是后来 SPA 选择“以数据一致性为准”的原因。
- **重复的 SVG id**：`chatGrad` 在 `<defs>` sprite 与 KPI 卡内联 SVG 中各定义一次，`i-message` 定义后未被使用；浏览器通常取文档中第一个同名渐变，改动时不要以为两处独立。
- **字体子集更小、更易缺字**：`static` 的 Noto 子集 29 KB，`src/assets/fonts` 为 84 KB + 171 KB 扩展子集；把新文案搬进静态版可能出现方框字。
- **无登录/无接口**：`app.js` 不发任何请求，`localStorage` 也不使用；不要把它当作“离线降级模式”去验证业务逻辑。

## 相关页面

- [[entities/static-legacy-app]] — `app.js` 的数据、渲染函数与交互细节。
- [[modules/frontend]] — 现行 SPA 的模块划分。
- [[modules/tools]]、[[entities/tools-pixel-qa]] — 以它为对照对象的像素工具。
- [[concepts/design-fidelity]]
