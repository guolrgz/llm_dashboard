# Proposal

## Why

现有仓库只完成了 `index.png` / `users.jpg` 的像素级静态还原，页面数据全部写死在前端 mock 文件里，没有后端、没有账号体系，也没有任何真实的 Token 流量治理能力。它看起来像一个 Dashboard，但不能登录、不能管理用户与模型、不能签发 API Key、不能限制或统计推理流量。

要成为真正的 **LLM 推理 Token 流量管理系统**，需要从 0 到 1 补齐服务端与治理闭环：以 OpenAI 兼容网关作为流量入口，鉴权 → 限流/配额校验 → 上游转发/模拟 → Token 计量 → 请求日志 → 聚合分析 → 告警，并让控制台所有页面读取真实数据。原型 `index.png` 的视觉与信息架构保持不变，作为系统的产品基线。

## What Changes

- 新增 **FastAPI + SQLite** 后端服务，提供 REST API 与 OpenAI 兼容推理入口，SQLite 单文件持久化，零外部服务依赖。
- 新增 **登录与会话**：管理员账号、密码哈希（PBKDF2）、HMAC-SHA256 签名令牌、登录态校验、退出登录。
- 新增 **RBAC 权限体系**：权限目录、角色（5 个）、用户-角色、角色-权限、接口级权限校验、前端路由/按钮守卫。
- 新增 **用户管理后端能力**：用户增删改查、启用/停用、批量操作、关键字与状态/角色筛选、分页，替换用户页的 localStorage mock。
- 新增 **模型渠道管理**：接入模型（GPT-4o / Claude-3.5 / Qwen-Max / 其他）、上游地址与密钥、单价、状态、权重；控制台提供模型管理入口。
- 新增 **API Key 与配额/限流**：Key 签发/吊销/轮换（仅展示一次明文、库存哈希）、Token 配额（日/月）、RPM/TPM 限流策略，支持按用户/角色/Key 生效。
- 新增 **Token 流量网关**：`/v1/chat/completions` OpenAI 兼容入口，API Key 鉴权、配额与限流拦截、Token 计量与记账、请求日志、上游转发（未配置上游时使用内置确定性模拟上游，保证离线可运行）。
- 新增 **流量分析与告警**：Dashboard 所需的 KPI、请求量趋势、模型 Token 占比、近期请求、系统概览、告警/通知；支持 今日/近7天/近30天 聚合；配额与限流事件生成告警。
- 新增 **控制台页面**：登录页、Dashboard 接真实数据、用户管理接真实 API、角色管理、权限管理、流量监控、系统设置；保留并复用既有像素级视觉基线、深色侧栏、组件与响应式行为。
- 新增 **系统设置**：限流默认值、配额默认值、告警阈值、运行时长等信息，并支持持久化。
- 新增 **自动化验证**：后端 API/网关测试、前端构建、浏览器端到端冒烟、原型像素回归截图。

## Capabilities

### New Capabilities

- `auth-rbac`: 登录、令牌会话、退出登录、权限目录、角色、用户-角色与角色-权限绑定、接口级授权校验。
- `user-management`: 系统用户生命周期管理（增删改查、启停、批量操作、筛选分页与统计）。
- `model-channel`: 上游模型渠道的注册、定价、启停与流量分配。
- `api-key-quota`: API Key 生命周期、Token 配额策略、RPM/TPM 限流策略及其强制执行。
- `traffic-gateway`: OpenAI 兼容流量入口、Token 计量记账、请求日志、上游转发与离线模拟上游。
- `traffic-analytics`: 流量聚合分析（KPI/趋势/模型分布/近期请求/系统概览）与配额/限流告警。
- `management-console`: 控制台前端的信息架构、页面、真实数据接入、鉴权守卫与设计稿视觉/响应式基线。

### Modified Capabilities

（无。当前 `openspec/specs/` 为空，本次全部为新增能力。）

## Impact

- **新增代码**：`backend/`（FastAPI 应用、SQLite schema 与种子数据、路由、服务、测试）、`src/api/`、`src/views/` 新增页面、`src/components/` 新增治理组件、`start.sh` / `package.json` 脚本。
- **修改代码**：`src/App.vue`（导航与页面切换）、`src/router/index.js`（登录守卫 + 新路由）、`src/views/DashboardView.vue` 与相关图表组件（改为 API 驱动）、`src/views/UsersView.vue` 与用户组件（改为 API 驱动）、`vite.config.js`（`/api`、`/v1` 代理）。
- **修改数据**：新增 `backend/data/app.db`（运行期生成、gitignore）；前端 mock 文件保留为离线降级/演示数据，但不再作为主数据源。
- **接口**：新增 `/api/*` REST 接口、`/v1/chat/completions`、`/health`。
- **依赖**：后端新增 FastAPI / Uvicorn / Pydantic（vendored，`backend/requirements.txt` 可重建）；前端不新增运行时依赖。
- **兼容性**：已有 Dashboard 与用户页视觉基线（1672×941、1376×768）与响应式行为不得回退；原型默认数据在种子数据下仍能复现设计稿数值。
