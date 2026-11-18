# Tasks

## 1. 后端基座与数据层

- [x] 1.1 创建 `backend/` 工程骨架（`requirements.txt`、`run.sh`、`install.sh`、`app/` 包、`.gitignore`），执行 `bash backend/install.sh` 后 `python3 -c "import fastapi"` 成功
- [x] 1.2 实现应用工厂、配置、CORS、统一错误结构、`GET /health`，`pytest` 中 `TestClient` 请求返回 200 且含 `status=ok`
- [x] 1.3 实现 SQLite 连接与幂等建表（users/roles/permissions/role_permissions/models/api_keys/quota_policies/request_logs/usage_buckets/alerts/settings/revoked_tokens），临时库初始化两次不报错且表齐全
- [x] 1.4 实现权重/单价等基础域常量与种子角色、权限目录（5 个角色 + 权限键中英文），`GET /api/roles`、`/api/permissions` 返回 5 个角色与分组权限
- [x] 1.5 实现密码哈希（PBKDF2）与 JWT 签发/校验工具，单元测试覆盖正确密码、错误密码、过期令牌、篡改令牌
- [x] 1.6 实现种子用户 128 个（前 48 个与用户设计稿一致）、4 个模型渠道、默认设置、15 天前启动时间；重跑种子幂等且用户数仍为 128
- [x] 1.7 实现种子流量（`usage_buckets` + `request_logs`）精确复现原型：今日 128,960 请求、1.24B Token、99.2% 成功率、96 点趋势、模型占比 40.2/32.6/18.1/9.1、近 4 条请求；种子脚本可重复执行且不重复插入

## 2. 认证与 RBAC

- [x] 2.1 实现 `POST /api/auth/login`（停用账号 403、错误凭据 401、成功返回 token+user 且无密码字段），pytest 覆盖三类分支
- [x] 2.2 实现 `GET /api/auth/me` 与 `POST /api/auth/logout`，退出后旧 token 返回 401；测试覆盖无 token/坏 token/有效 token
- [x] 2.3 实现权限依赖 `require_permission` 与超级管理员放行，测试覆盖 401/403/超管通过
- [x] 2.4 实现角色列表、权限列表、角色权限读取与更新接口（`PUT /api/roles/{id}/permissions`），测试覆盖更新生效与越权 403
- [x] 2.5 实现用户列表（分页/关键字/状态/角色筛选）与统计接口，测试覆盖分页、筛选、无权限
- [x] 2.6 实现用户创建/编辑/删除/启停/批量操作，测试覆盖重名 409、删除清理 Key、禁止删除自己、停用后登录 403
- [x] 2.7 实现 API Key 创建/列表/详情/吊销/轮换（明文仅一次、库存哈希），测试覆盖明文前缀、吊销后鉴权失败、列表不含明文

## 3. 模型、配额与设置

- [x] 3.1 实现模型渠道 CRUD 与启停（名称唯一 409、密钥掩码、停用不参与路由），pytest 覆盖
- [x] 3.2 实现模型流量权重与“启用模型数”统计，测试权重非负与概览数量一致
- [x] 3.3 实现配额/限流策略读写（用户覆盖、默认值来自设置），测试覆盖更新后立即生效
- [x] 3.4 实现 Key 用量视图（RPM/TPM、日/月配额、已用/剩余、最近使用），测试字段完整
- [x] 3.5 实现系统设置读取/更新持久化（默认配额、默认 RPM/TPM、告警阈值），测试重启应用后仍为新值

## 4. 流量网关与计量

- [x] 4.1 实现 `POST /v1/chat/completions` 非流式链路（Key 鉴权→用户状态→模型校验→配额→限流→模拟上游→计量），测试成功响应含 usage
- [x] 4.2 实现 OpenAI 兼容错误（缺 messages 400、未知模型 404、无 Key 401、停用用户 403），测试逐项覆盖
- [x] 4.3 实现 RPM/TPM 60 秒滑动窗口限流与 `Retry-After`，测试超限 429 且不产生成功计量
- [x] 4.4 实现日/月 Token 配额累计与超限 429、响应头剩余量，测试超限与跨周期恢复
- [x] 4.5 实现请求日志记录（成功/配额/限流/鉴权失败）与查询筛选分页，测试状态与用量一致
- [x] 4.6 实现 `stream=true` SSE 流式响应与最终计量，测试 `data: [DONE]` 与 usage 一致
- [x] 4.7 实现可配置上游转发（httpx，超时降级 502 并记录失败），测试上游 mock 转发与失败记录

## 5. 分析与告警

- [x] 5.1 实现 `GET /api/analytics/dashboard?range=today|7d|30d` KPI 聚合（请求/Token/成功率/环比/sparkline），测试三种范围与非法范围 400
- [x] 5.2 实现趋势序列、模型分布百分比（合计 100%）、近期请求、系统概览，测试种子基线复现原型数值
- [x] 5.3 实现告警生成（配额阈值/超限、限流触发）与未读数统计，测试生成与未读计数
- [x] 5.4 实现告警列表与标记已读接口，测试未读数递减
- [x] 5.5 实现 `GET /api/traffic/logs` 与日志统计接口（时间/用户/模型/状态筛选），测试与网关产生的日志一致

## 6. 前端基座与登录

- [x] 6.1 实现 `src/api/client.js`（token 持久化、统一错误、401 跳转）与 `src/stores/auth.js`（登录/登出/权限判断），单测/手工验证 401 行为
- [x] 6.2 实现登录页（原型视觉风格、错误提示、回车提交），浏览器登录 admin 成功跳转 Dashboard
- [x] 6.3 配置路由 `/login` 与登录守卫，未登录访问任意业务路由重定向登录页；登出后回登录页
- [x] 6.4 配置 Vite `/api`、`/v1` 代理与 `start.sh` 同时启动前后端，`curl` 经 5173 代理可访问 `/health`
- [x] 6.5 顶栏/侧栏接入当前用户、权限可见性与退出登录，验证 admin 显示与登出流程

## 7. Dashboard 真实数据

- [x] 7.1 改造 `DashboardView` 使用 `/api/analytics/dashboard` 数据并支持今日/近7天/近30天切换，浏览器切换后数值变化
- [x] 7.2 图表组件支持外部数据 props（KPI/趋势/分布/近期请求/概览）且保留默认视觉，1672×941 布局不变
- [x] 7.3 Dashboard 加载/错误/空态与降级提示，模拟接口失败不白屏
- [x] 7.4 Dashboard 像素回归截图对照 `index.png`：结构区域差异不高于既有基线，记录 `docs/qa-report.md`

## 8. 用户管理与角色权限页面

- [x] 8.1 用户管理页改为 API 驱动（列表/搜索/筛选/分页），浏览器验证与后端数据一致
- [x] 8.2 用户新增/编辑/删除/启停/批量操作接 API 并 Toast 反馈，验证重名错误提示
- [x] 8.3 实现角色管理页（角色列表、权限勾选保存），浏览器验证保存后重新加载生效
- [x] 8.4 实现权限管理页（权限目录分组、角色映射矩阵），浏览器验证只读/可管理状态
- [x] 8.5 统一 `users.html` 为 SPA 重定向并保留用户页 1376×768 视觉基线，截图对比 `users.jpg`

## 9. 流量监控、模型与系统设置页面

- [x] 9.1 实现流量监控页（请求日志筛选分页、配额用量、限流事件、告警摘要），浏览器验证筛选生效
- [x] 9.2 实现模型管理页（渠道 CRUD、启停、权重、单价），浏览器验证新增/停用
- [x] 9.3 实现系统设置页（默认配额/限流/告警阈值保存），刷新后配置仍在
- [x] 9.4 侧栏导航补齐 Dashboard/用户/角色/权限/流量监控/模型/设置并高亮当前页，浏览器逐项点击验证
- [x] 9.5 响应式检查 1672/1440/1024/768/390 无横向溢出，移动端侧栏抽屉可用

## 10. 集成验证与文档

- [x] 10.1 后端全量 `pytest` 通过并输出覆盖率摘要，`docs/backend-test-report.md` 记录结果
- [x] 10.2 `npm run build` 通过且产物可预览；`bash start.sh` 一键启动前后端
- [x] 10.3 Playwright E2E 覆盖登录→Dashboard→用户 CRUD→角色→流量监控→设置→登出，报告落盘
- [x] 10.4 网关端到端验证：用真实签发的 Key 连续请求触发限流/配额并核对 Dashboard 与日志，写入 `docs/qa-report.md`
- [x] 10.5 编写 `docs/api.md`、`docs/system-architecture.md` 与 README 更新（启动方式、默认账号、接口与默认端口）
- [x] 10.6 `openspec validate build-token-traffic-system --strict` 通过且所有任务勾选完成

## Workflow follow-up

- 归档该 change：`openspec archive build-token-traffic-system`，将 delta specs 合并到 `openspec/specs/`
