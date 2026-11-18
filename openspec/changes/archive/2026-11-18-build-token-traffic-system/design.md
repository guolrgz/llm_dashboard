# Design

## Context

见 `proposal.md` 的 Why。当前约束：

- 前端是 Vue 3 + Vite 的像素级静态还原（`src/`），Dashboard 与用户管理页已有成熟组件和视觉基线；工程里没有后端服务、没有数据库，数据来自 `src/data/*.js` 与 `src/users/data/users.js`。
- 运行环境是单机 Linux，无 Docker/外部数据库/外网模型服务；Node 24 与 Python 3.14 可用，`node_modules` 与 vendored Python 包可离线运行。
- 设计稿 `index.png`（1672×941）既是视觉基线也是产品信息架构基线：侧栏 6 个入口 + 退出登录，顶栏通知/用户，Dashboard 的 7 个卡片。
- 交付需要可复现、可自测：后端 API 单测 + 浏览器 E2E + 像素回归。

## Goals / Non-Goals

**Goals:**
- 一条真实可跑的 Token 流量治理闭环：登录 → 管理用户/角色/权限/模型/Key/配额 → 通过 OpenAI 兼容网关消耗 Token → 计量/日志 → Dashboard 聚合/告警。
- 前后端同仓库、单命令启动；SQLite 单文件，首次启动自动建表与种子数据。
- 原型默认视图在种子数据下复现设计稿数值与视觉；有真实数据时平滑变化。
- 后端关键路径有自动化测试；前端可构建、可 E2E 验证。

**Non-Goals:**
- 不接入真实公网 LLM（支持配置上游，但默认离线模拟上游）。
- 不做多租户/计费结算/发票、不做分布式限流（单实例内存+SQLite 即可）。
- 不重写现有视觉基线；不引入 ECharts 等图表库。
- 不做 OAuth/SSO、密码找回、邮件服务。

## Decisions

### D1. 后端技术栈：FastAPI + SQLite（stdlib sqlite3）
用户指定 Python FastAPI。SQLite 用标准库 `sqlite3`，`check_same_thread=False` + 每请求连接（WAL 模式），避免 ORM 与迁移工具复杂度。**替代方案**：SQLAlchemy/Alembic（依赖重、对本次规模过度）；JSON 文件（并发与查询能力不足，否决）。
- FastAPI 依赖以 `backend/requirements.txt` + `backend/vendor/`（gitignore）方式提供，`start.sh` 在缺失时自动安装；测试用 `pytest` + `fastapi.testclient`（httpx）。
- 应用工厂 `create_app()` 便于测试注入临时数据库路径。

### D2. 数据模型（SQLite 表）
- `users`：id、username 唯一、nickname、password_hash、role_id、email、status、created_at、last_login_at。
- `roles`（5 个种子）、`permissions`（权限目录，带 group/label）、`role_permissions`。
- `models`：id、name 唯一、provider、upstream_base_url、upstream_api_key、input_price、output_price、weight、status、is_mock。
- `api_keys`：id、user_id、name、key_hash 唯一、key_prefix、status、rpm_limit、tpm_limit、daily_quota、monthly_quota、created_at、last_used_at、revoked_at。
- `quota_policies`：scope（user/role/key）+ target_id + daily_quota/tpm/rpm（可按用户覆盖）。
- `request_logs`：id、ts、user_id、username、model、key_prefix、prompt_tokens、completion_tokens、total_tokens、status、http_status、latency_ms、error_code。
- `usage_buckets`：bucket_start（小时）、model、requests、success_requests、prompt_tokens、completion_tokens、total_tokens；Dashboard 聚合主数据源。
- `alerts`：id、type、level、title、message、user_id、read、created_at。
- `settings`：key/value JSON（默认配额、默认 RPM/TPM、告警阈值、系统启动时间等）。
- `sessions`：jti/黑名单 + 过期时间，用于退出登录使令牌失效。

种子策略：`usage_buckets` 与 `request_logs` 按原型数值预生成（今日 128,960 请求、1.24B Token、99.2% 成功率、趋势曲线 96 点、模型占比 40.2/32.6/18.1/9.1，近 4 条请求与原型一致），真实网关请求写入同表并自然叠加；种子用户 128 个（前 48 个与用户设计稿一致），角色 5 个，模型 4 个，系统启动时间 15 天前。**替代方案**：只存原始请求行（128k 行写入慢、聚合成本高、原型数值难精确复现，否决）。

### D3. 安全模型
- 密码 PBKDF2-HMAC-SHA256 + 随机盐，迭代 260000；令牌为自实现 JWT（HS256：header.payload.signature，base64url），包含 `sub`、`role`、`jti`、`exp`（8h）。**替代方案**：引入 PyJWT（多一个依赖，收益低）。
- `sessions`/`revoked_tokens` 表记录退出登录的 jti；鉴权依赖每次校验签名、过期、jti 未吊销、用户仍启用。
- API Key 明文仅返回一次，库存 `sha256(key)`，比较用 `hmac.compare_digest`；Key 前缀（`sk-` + 12 字符）用于展示。
- 权限校验通过 FastAPI `Depends(require_permission("key"))`；超级管理员（`role.super` 或拥有 `*`）短路放行。错误统一 `{error: {code, message}}` 结构。

### D4. 限流与配额
- RPM/TPM 采用 60 秒滑动窗口：查询 `request_logs` 中该 Key 近 60s 的请求数与 Token 数（SQLite 索引 + 单实例足够）；配额用 `usage_buckets`/`request_logs` 的日/月累计。
- 判定顺序按 spec：Key 有效 → 用户启用 → 模型可用 → 配额 → 限流 → 转发；拒绝记录 `request_logs`（status=quota_exceeded/rate_limited），成功才累加 Token 用量与桶。
- 限流返回 429 + `Retry-After: 60`；配额返回 429/`quota_exceeded`。所有响应带 `X-RateLimit-*`/`X-Quota-Remaining` 头便于观测。

### D5. 网关与离线模拟
- `POST /v1/chat/completions`：解析 OpenAI 请求；若模型渠道 `upstream_base_url` 非空则用 httpx 转发并透传 usage（超时/异常降级为 502 并记录失败日志）；否则走内置模拟上游。
- 模拟上游：prompt_tokens 由 messages 文本长度按 `max(1, ceil(chars/4))` 计算，completion_tokens 由固定模板长度确定性计算；返回符合 OpenAI 结构的 JSON；`stream=true` 时按 token 分块 SSE 输出并写回总 usage（保证计量与响应一致）。
- 支持 `model` 省略时按启用模型权重加权随机选择，响应记录实际模型。

### D6. 前端集成
- 单 SPA：`index.html` 为唯一入口，`users.html` 保留为兼容别名（跳转到 `/#/users`）。路由新增 `/login`、`/roles`、`/permissions`、`/traffic`、`/models`、`/settings`；全局前置守卫读取 auth store，未登录跳 `/login`。
- `src/api/client.js`：读写 localStorage token、统一错误规范化、401 自动跳登录；`src/stores/auth.js`：登录/登出/当前用户/权限判断（`hasPerm`）。组件内权限控制按钮可见性。
- Dashboard：新增 `src/api/analytics.js`，`DashboardView` 拉取聚合数据后以 props 注入现有图表组件（TrendChart/DonutChart 增加数据 props，保留默认值与 SVG 手绘渲染），保证视觉不变、数据可切换；加载失败保留骨架 + 提示。
- 用户管理：`UsersView.vue` 改为 API 驱动（复用现有表格/弹窗 DOM 与样式）；`src/users/*` 独立入口退役为兼容重定向，避免双份数据源。
- 新页面复用现有设计 token（侧栏 `#19223a`、主蓝 `#3f7cf5`、卡片白底/12px 圆角）与 `IconsSprite`；每页提供加载/空/错误三态与 Toast 反馈。
- Vite dev 代理 `/api`、`/v1` → `http://127.0.0.1:8000`；生产构建产物由 FastAPI 静态托管（`backend/app/static` 可选）或独立静态服务器，`start.sh` 负责同时启动前后端。

### D7. 测试与验证
- 后端：pytest 覆盖登录/鉴权、用户与角色、模型与 Key、配额/限流、网关成功/拒绝/流式、分析聚合与原型数值、设置持久化；使用临时 SQLite 文件隔离。
- 前端：`npm run build` 必须通过；Playwright（tools/ 现有 chromium）跑 E2E：登录→Dashboard 数据→用户 CRUD→角色权限→流量监控→设置→登出；并截图对比 `index.png`（沿用 tools/diff.mjs 阈值思路，数据变化区域允许差异）。
- 性能预算：Dashboard 聚合接口 P95 < 300ms（本地种子数据），网关模拟上游 P95 < 100ms；种子初始化 < 10s。

## Risks / Trade-offs

- [Python 3.14 无 venv，依赖需 vendored] → `backend/vendor` + 自动安装脚本；`requirements.txt` 固定版本，README 说明离线恢复方式。
- [SQLite 并发写锁] → WAL + 每请求短连接 + 写入事务化；单实例演示规模足够。
- [种子数值与原型像素对齐冲突：真实数据接入后图表/数值变化导致 diff 上升] → 种子数据精确复现原型数值，默认“今日”视图逐像素接近；真实请求叠加后只改变数值文本，布局/尺寸不变；QA 报告区分“结构差异”与“数据差异”。
- [FastAPI 版本较新、Pydantic 行为差异] → 使用 Pydantic v2 基本模型，不依赖冷门特性；测试锁定接口契约。
- [前端既有组件的常量/样式耦合] → 图表组件以 props 扩展并保留默认值，先集成 Dashboard 再逐页替换 mock；每步跑 build 与截图。
- [用户管理双入口（index/users）造成两套数据逻辑] → 统一到 SPA 路由，`users.html` 仅重定向；测试覆盖两个 URL。
- [网关为单机内存限流，重启清零] → 接受（演示/单实例），设计文档标注；配额用量落库不受影响。

## Migration Plan

1. 后端按 `create_app()` 初始化：启动时检测 `backend/data/app.db`，不存在则建表+种子；已有库则只做幂等补种（缺表/缺设置）。
2. 前端先接 API client 与 login，再逐页替换 mock；旧 mock 文件与 `users.html` 保留一版作为降级，全部页面验证后清理/重定向。
3. 回滚：后端停止即回到纯前端静态版（README 保留 `static/` 用法）；前端可通过 `VITE_API_BASE` 配置指向旧 mock 适配层（保留一个 `USE_MOCK` 开关）。
4. 归档 OpenSpec change 前必须完成 `openspec validate --strict` 与全部 tasks 勾选。

## Open Questions

无（遗留细节如告警去重窗口、模型权重算法可在实现中按需微调，不影响规格与任务拆分）。
