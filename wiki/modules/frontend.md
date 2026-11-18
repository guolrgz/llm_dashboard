---
title: 前端模块 frontend
source_files:
  - index.html
  - users.html
  - vite.config.js
  - src/main.js
  - src/App.vue
  - src/router/index.js
  - src/api/client.js
  - src/api/analytics.js
  - src/stores/auth.js
  - src/styles.css
  - src/data/dashboard.js
  - src/charts/svg.js
updated: 2026-11-18
tags: [module, frontend]
---

# 前端模块 frontend

`src/` 是面向管理员的单页控制台：Vue 3 + Vite，负责登录、Dashboard 聚合展示、用户/角色/权限治理、流量日志与模型/系统配置。它只做展示与交互，Token 计量、配额、限流、RBAC 强制校验全部由 [[modules/backend]] 承担；前端通过 `/api` 与 `/v1` 两个前缀访问后端。

## 职责

- 渲染 8 个页面（登录 + Dashboard + 6 个治理页），维护侧栏/顶栏外壳与移动端抽屉。
- 保存登录令牌与用户快照，并在路由跳转前调用 `/api/auth/me` 校验会话。
- 统一封装 fetch（鉴权头、超时、错误归一化、401 跳转），页面不直接写 `fetch`。
- 用原生 SVG 手绘折线图/环形图/KPI sparkline，不引入任何图表库。
- 按权限隐藏操作入口（新增、编辑、删除、保存），形成“只读模式”体验。
- 还原 `index.png` / `users.jpg` 设计稿的版式、色彩、字号与间距。

## 页面与路由地图

路由使用 hash 模式（`createWebHashHistory`），因此静态托管到任意路径都能直接刷新。

| 路由 | 名称 | 视图 | 加载方式 | 说明 |
|---|---|---|---|---|
| `/login` | login | `LoginView.vue` | 同步 | `meta.public`，登录页不渲染外壳 |
| `/` | dashboard | `DashboardView.vue` | 同步 | KPI/趋势/分布/近期请求/系统概览 |
| `/users` | users | `UsersView.vue` | 同步 | 筛选、表格、批量操作、CRUD 弹窗 |
| `/roles` | roles | `RolesView.vue` | 懒加载 | 角色卡片 + 权限勾选弹窗 |
| `/permissions` | permissions | `PermissionsView.vue` | 懒加载 | 权限目录 + 角色×权限矩阵 |
| `/traffic` | traffic | `TrafficView.vue` | 懒加载 | 摘要、限流事件、请求日志 |
| `/models` | models | `ModelsView.vue` | 懒加载 | 渠道 CRUD；侧栏不直接暴露 |
| `/settings` | settings | `SettingsView.vue` | 懒加载 | 默认配额/限流/告警阈值 + 模型入口 |
| `/:pathMatch(.*)*` | — | — | — | 重定向到 `/` |

侧栏只保留设计稿的 6 项（Dashboard、用户、角色、权限、流量、设置），模型管理从系统设置页的入口卡片进入；因此 `/models` 没有对应的高亮项。路由守卫与页面元信息见 [[entities/frontend-router-guard]]。

## 目录结构

```
index.html / users.html        Vite 双入口；users.html 仅做 #/users 兼容跳转
src/main.js                    创建应用，等 router.isReady() 后再 mount
src/App.vue                    外壳：登录页分支、侧栏/顶栏、移动抽屉
src/router/index.js            8 条路由 + 登录守卫 + 标题
src/api/client.js              fetch 封装、token/localStorage、ApiError、401
src/api/analytics.js           Dashboard/告警/流量摘要的薄封装
src/stores/auth.js             reactive 认证状态与 hasPerm
src/views/                     8 个页面
src/components/                设计稿组件（KPI/趋势/环形/表格/概览）+ 外壳
src/components/console/        通用控制台套件：弹窗/分页/状态/Toast/状态胶囊
src/charts/svg.js              SVG 节点创建与单调三次平滑曲线
src/data/dashboard.js          设计稿静态兜底数据（KPI/曲线/环形/表格/导航）
src/styles.css                 设计 token、外壳、Dashboard、用户页、登录页、响应式
src/assets/fonts/              Inter + Noto Sans SC 子集（含 Ext 补充子集）
```

## 依赖与被依赖

- 依赖：`vue@^3.5`、`vue-router@^4.6`；构建期 `vite@^6` 与 `@vitejs/plugin-vue`。
- 有意不依赖：axios、Pinia、ECharts/Chart.js。状态用 `reactive` 单例，请求用原生 `fetch`，图表用 SVG 手写。
- 被依赖：FastAPI 生产模式直接托管 `dist/`（`/` 与 `/users.html` 回落到 SPA）；[[modules/tools]] 的 E2E/像素回归以 5173 页面为被测对象；[[modules/static-legacy]] 是无后端的旧静态版，仅供无 Node 环境预览。
- 对后端的接口约定见 `docs/api.md`；认证/RBAC 的协作方式见 [[concepts/auth-rbac]] 与 [[flows/login-session]]。

## 构建与运行

```bash
npm install
npm run dev        # 0.0.0.0:5173，strictPort
npm run build      # 产出 multi-entry dist（index.html + users.html）
npm run preview    # 0.0.0.0:4173
```

`vite.config.js` 把 `/api`、`/v1`、`/health` 代理到 `process.env.LLM_API_TARGET || http://127.0.0.1:8000`；`base: './'` 保证产物可放在子路径。后端未启动时页面进入错误态并提供“重试”，而不是白屏。

## 设计要点

- **设计稿还原**：Dashboard 以 1672×941 为基线，`styles.css` 顶部集中定义颜色/字体/侧栏宽度/圆角 token；卡片尺寸（KPI 132px、图表 335px、底部 209px）按设计稿固定。视图层只换数据，不改布局，参见 [[concepts/design-fidelity]]。
- **字体**：Inter 负责数字与拉丁字母，Noto Sans SC 负责汉字；`noto-sans-sc-extra.woff2` 是设计稿之外新增文案的补充子集，按 `font-family` 回退链使用。
- **响应式**：断点 1500/1280/1080/900/700/380。≤1080 侧栏 220px、KPI 两列；≤900 侧栏改为 off-canvas 抽屉（顶栏汉堡按钮控制，遮罩 + Esc 关闭 + `body.sidebar-locked` 锁滚动）；≤700 单列、图表降高。
- **权限可见性**：每个页面用 `safeHasPerm()` 包一层 `auth.hasPerm()`，只隐藏按钮/进入只读模式；真正拦截在 [[entities/backend-deps-authz]]。权限语义见 [[concepts/auth-rbac]]。
- **零图表依赖**：`charts/svg.js` 的 `monotonePath()` 生成不过冲的平滑曲线，趋势图/环形图/KPI spark 均复用它，详见 [[entities/frontend-charts]]。

## 坑与注意点

- **两套 UI 套件并存**：用户页沿用全局 `u-*` 类（自定义弹窗/分页），其余治理页用 `components/console/` 的 `ConsoleModal`/`ConsolePagination`/`ConsoleState`。样式来源不同（全局 vs scoped），改一处不会自动同步另一处。
- **`app--users` 外壳特例**：用户页在桌面端把侧栏压到 215px、顶栏压到 53px，其余页面是 260px/68px；页面切换时外壳宽度会跳变，这是为对齐 `users.jpg` 的刻意取舍。
- **路由守卫只鉴权不鉴权能**：没有 `meta.permission`，无权限用户仍可进入 `/traffic`、`/models`、`/settings`，由页面自己渲染“无权查看”；Dashboard 甚至没有显式 `dashboard.view` 门禁，只能靠后端 403 报错。
- **侧栏 6 项 ≠ 路由 8 条**：`/models` 可直达但不高亮；`activeNav` 返回 `models` 却不存在对应导航项。
- **双入口**：`users.html` 只是 `meta refresh` + JS 跳 `#/users`；构建配置必须保留该入口，否则旧链接失效。
- **标题写两遍**：`router.afterEach` 与 `App.vue` 的 `route.meta.title` watcher 都设置 `document.title`，逻辑重复但结果一致。
- **前端权限只是 UX**：`auth.permissions` 来自 localStorage 快照，可被篡改；任何“隐藏”都不构成安全边界，见 [[concepts/security-posture]]。
- **请求竞态**：只有 Dashboard 用 `AbortController` 取消旧请求；流量页快速切换范围时旧响应可能覆盖新状态。

## 相关页面

- 实体：[[entities/frontend-api-client]]、[[entities/frontend-auth-store]]、[[entities/frontend-router-guard]]、[[entities/frontend-shell]]、[[entities/frontend-login-view]]、[[entities/frontend-dashboard-view]]、[[entities/frontend-charts]]、[[entities/frontend-users-view]]、[[entities/frontend-roles-permissions-views]]、[[entities/frontend-traffic-view]]、[[entities/frontend-models-settings-views]]
- 概念：[[concepts/design-fidelity]]、[[concepts/auth-rbac]]、[[concepts/security-posture]]、[[concepts/metering-analytics]]
- 流程：[[flows/login-session]]、[[flows/dashboard-aggregation]]、[[flows/user-management]]、[[flows/role-permission-change]]
- 其他模块：[[modules/backend]]、[[modules/tools]]、[[modules/static-legacy]]
