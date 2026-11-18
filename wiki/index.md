# Wiki Index

> 本文件是知识库的内容目录：每个页面一行（链接 + 一句话摘要），按类别分组。
> 查询时先读本文件定位页面，再深入具体页面。最后更新：2026-11-18。

## Overview

- [[overview]] — 系统一句话定位、运行时拓扑、仓库布局、核心领域模型、关键设计决策与推荐阅读路径。

## Modules

- [[modules/backend]] — FastAPI + SQLite 执行侧：`/api` 管理面、`/v1` 推理网关、11 张表与种子数据。
- [[modules/frontend]] — Vue 3 + Vite 控制台：8 个页面、原生 SVG 图表、设计稿像素基线与响应式。
- [[modules/tools]] — 开发期 QA 工具链：Playwright E2E、像素 diff、几何测量/裁剪、旧交互测试。
- [[modules/static-legacy]] — 接入后端前的原生静态 Dashboard 版（设计参考 / 无后端预览）。
- [[modules/openspec]] — 规格驱动流程与目录：proposal/specs/design/tasks、归档与 7 份主规格。

## Entities

### Backend

- [[entities/backend-app-factory]] — `create_app()` 装配路由、错误处理、CORS、静态托管与 `/health`。
- [[entities/backend-db-schema]] — SQLite `SCHEMA`、连接/事务管理、`settings` 与 `app_meta`。
- [[entities/backend-security]] — PBKDF2 密码、手写 HS256 JWT、API Key 生成与 SHA-256 哈希。
- [[entities/backend-deps-authz]] — `get_db` / `get_current_user` / `require_permission` 与权限目录。
- [[entities/backend-auth-router]] — `/api/auth`：登录换令牌、当前用户、退出登录 jti 吊销。
- [[entities/backend-users-router]] — `/api/users`：分页筛选、CRUD、启停、批量与保护规则。
- [[entities/backend-rbac-router]] — `/api/roles`、`/api/permissions`：角色、权限目录、角色-权限绑定。
- [[entities/backend-admin-routes]] — 模型 / API Key / 配额 / 设置 / 告警管理路由族。
- [[entities/backend-traffic-gateway]] — `/v1/chat/completions`：准入顺序、错误矩阵、SSE、响应头。
- [[entities/backend-metering-rate-limit]] — 计量记账、配额合并、60s 滑动窗口、模拟/真实上游。
- [[entities/backend-analytics]] — `/api/analytics/dashboard`：KPI、趋势、分布、近期请求、概览、spark。
- [[entities/backend-alerts]] — 告警生成服务与告警列表/未读数/已读接口。
- [[entities/backend-seed-data]] — 128 用户 / 4 模型 / 60 天用量 / 原型基线 / 演示 Key。

### Frontend

- [[entities/frontend-api-client]] — 统一 fetch 封装：Bearer、超时、`ApiError`、401 清态跳转。
- [[entities/frontend-auth-store]] — reactive 登录态：`login` / `fetchMe` / `logout` / `hasPerm`。
- [[entities/frontend-router-guard]] — 8 条 hash 路由 + 全局登录守卫 + 页面标题。
- [[entities/frontend-shell]] — `App.vue`/侧栏/顶栏/图标精灵：登录页裸渲染、未读徽标、响应式抽屉。
- [[entities/frontend-login-view]] — 深色品牌区 + 白色登录卡、错误提示、安全 redirect 回跳。
- [[entities/frontend-dashboard-view]] — Dashboard 真实数据加载、三态、时间范围切换与 props 注入。
- [[entities/frontend-charts]] — 10 个手写 SVG 展示组件：KPI/sparkline/趋势/环形/表格/概览。
- [[entities/frontend-users-view]] — 用户管理页：筛选/表格/分页/弹窗/Toast（`users.jpg` 基线）。
- [[entities/frontend-roles-permissions-views]] — 角色卡 + 权限勾选弹窗 + 只读权限矩阵。
- [[entities/frontend-traffic-view]] — 流量监控：概览指标、限流/配额事件、日志筛选分页。
- [[entities/frontend-models-settings-views]] — 模型渠道 CRUD 与系统设置（含 `/models` 入口）。

### Tooling / Legacy / Process

- [[entities/tools-e2e-harness]] — `tools/e2e`：console/gateway/pixel/responsive 四个验收脚本与编排。
- [[entities/tools-pixel-qa]] — 截图/diff/测量/裁剪脚本，服务于 `index.png` / `users.jpg` 基线。
- [[entities/static-legacy-app]] — 静态版 `index.html`/`styles.css`/`app.js` 的 DOM、图表与写死数据。
- [[entities/openspec-change]] — 已归档 change 的四类产物、7 个 capability 与 56 个任务的落地映射。

## Concepts

- [[concepts/auth-rbac]] — 登录、JWT 会话、5 角色 17 权限、接口级授权与前端守卫。
- [[concepts/token-governance]] — 网关准入顺序、配额优先级、RPM/TPM 滑动窗口、响应头与失败审计。
- [[concepts/metering-analytics]] — `usage_buckets` vs `request_logs` 两条事实、周期累计、聚合口径、种子基线。
- [[concepts/design-fidelity]] — 像素还原方法、设计稿不自洽时的“数据一致性”取舍、字体/响应式/测量。
- [[concepts/testing-verification]] — pytest 86 例 + E2E/像素/响应式验收的分层、运行方式与测试副作用。
- [[concepts/security-posture]] — 安全审查结论、问题优先级、公网部署前加固清单。
- [[concepts/openspec-workflow]] — propose → apply → archive 流程、7 个 capability、后续变更发起方式。
- [[concepts/known-issues]] — 已验证的实现坑与文档漂移：seed 版本、限流自放大、策略不一致、前端启发式等。

## Flows

- [[flows/login-session]] — 未登录跳转 → 登录换令牌 → 守卫与 401 → 退出吊销的完整生命周期。
- [[flows/gateway-request]] — API Key → 用户 → 模型 → 配额 → 限流 → 模拟/上游 → 计量 → SSE/JSON 响应。
- [[flows/dashboard-aggregation]] — 范围切换 → 聚合接口 → KPI/趋势/分布/近期请求 → 图表 props 渲染。
- [[flows/user-management]] — 列表/搜索/新增/编辑/启停/删除（单条+批量）与后端保护规则。
- [[flows/role-permission-change]] — 角色权限勾选保存、事务替换、服务端即时生效与前端快照滞后。
- [[flows/alert-generation]] — 配额阈值/超限/限流触发告警、去重、未读徽标与已读操作。
