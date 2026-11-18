# LLM 推理 · Token 流量管理系统

从 0 到 1、按 **OpenSpec** 规格驱动流程实现的 LLM 推理 Token 流量管理系统：以 `index.png` 产品原型为视觉与信息架构基线，提供 **登录鉴权 → 用户/角色/权限治理 → 模型渠道 → API Key/配额/限流 → OpenAI 兼容推理网关 → Token 计量/日志 → Dashboard 分析/告警** 的完整闭环。

- 后端：**Python FastAPI + SQLite（WAL）**，OpenAI 兼容网关，离线模拟上游可独立运行
- 前端：**Vue 3 + Vite**，8 个页面，延续设计稿深色侧栏 + 白色卡片视觉，原生 SVG 图表，零图表依赖
- 规格：`openspec/changes/build-token-traffic-system/`（proposal / 7 份 capability specs / design / tasks）
- 验证：后端 **pytest 86 passed**；浏览器 E2E、网关端到端、像素回归、五档响应式全部通过

---

## 1. 核心能力

| 能力 | 说明 |
|---|---|
| 登录与 RBAC | 密码 PBKDF2 哈希、HS256 令牌（8h）、退出登录令牌吊销、5 个角色 / 17 项权限、接口级鉴权 |
| 用户管理 | 128 个种子用户（前 48 个与 `users.jpg` 一致）、增删改查、启停、批量操作、关键字/状态/角色筛选、分页 |
| 模型渠道 | 4 个接入模型（GPT-4o / Claude-3.5 / Qwen-Max / DeepSeek-V3）、上游地址与密钥、单价、权重、启停 |
| API Key | 签发/列表/详情/吊销/轮换；明文仅返回一次，库存 SHA-256 哈希；列表只显示前缀 |
| 配额与限流 | 用户/角色/Key 三级配额策略、60 秒滑动窗口 RPM/TPM、超限 429 + `Retry-After`、用量与剩余响应头 |
| 推理网关 | `POST /v1/chat/completions`（OpenAI 兼容）、流式 SSE、离线确定性模拟上游、可配置真实上游转发 |
| Token 计量 | 成功请求同时写审计日志、15 分钟聚合桶、用户/Key 日月累计；失败/拒绝请求只审计不计量 |
| 分析与告警 | Dashboard 今日/近7天/近30天聚合、KPI/趋势/模型分布/近期请求/系统概览、配额阈值与限流告警 |
| 系统设置 | 默认日/月配额、默认 RPM/TPM、告警阈值、运行时长，持久化即时生效 |

## 2. 快速开始

环境要求：Node.js ≥ 18、Python ≥ 3.11、npm、curl。

```bash
# 一键启动（自动安装依赖；后端 8000 + 前端 5173）
bash start.sh

# 打开控制台
#   http://127.0.0.1:5173/
# 后端 API 文档
#   http://127.0.0.1:8000/docs
```

也可以分开启动：

```bash
npm install          # 前端依赖
npm run dev          # 前端 5173
bash backend/run.sh  # 后端 8000（会自动 vendor Python 依赖到 backend/vendor）
```

**演示账号**：`admin / admin123`（超级管理员；其余种子账号密码相同）。
**演示 API Key**：`sk-demo-admin-2026`（admin）、`sk-demo-user123-2026`（user123，便于复现限流/配额告警）。

推理网关调用示例：

```bash
curl -s -X POST http://127.0.0.1:8000/v1/chat/completions \
  -H 'Authorization: Bearer sk-demo-admin-2026' \
  -H 'Content-Type: application/json' \
  -d '{"model":"GPT-4o","messages":[{"role":"user","content":"你好，介绍一下 Token 流量管理"}]}'
```

响应包含 OpenAI 兼容 `choices` 与 `usage`（`prompt_tokens` / `completion_tokens` / `total_tokens`），并带 `X-RateLimit-*`、`X-Quota-*` 响应头；每次成功调用都会出现在「流量监控」日志与 Dashboard 指标中。

## 3. 页面与功能

| 路由 | 页面 | 内容 |
|---|---|---|
| `/login` | 登录 | 深色品牌区 + 白色登录卡，错误提示、回车提交、演示账号一键填入 |
| `/` | Dashboard | 3 个 KPI（总请求量 / Token 使用量 / 成功率）、请求量趋势、Token 分布、近期请求、系统概览；今日/近7天/近30天切换 |
| `/users` | 用户管理 | 筛选卡、工具栏（新增/批量删除/批量启停）、用户表格、分页、新增/编辑弹窗、Toast |
| `/roles` | 角色管理 | 5 个角色卡片、成员数/权限数、权限勾选弹窗并保存（超管只读） |
| `/permissions` | 权限管理 | 17 项权限按 9 组展示 + 角色×权限矩阵 |
| `/traffic` | 流量监控 | 今日/7天/30天 KPI、限流与配额事件、请求日志筛选/分页 |
| `/models` | 模型管理 | 渠道 CRUD、启停、权重/单价、上游配置（从系统设置页进入） |
| `/settings` | 系统设置 | 默认配额/限流/告警阈值、运行时长、模型管理入口 |

侧栏沿用原型 6 项：Dashboard、用户管理、角色管理、权限管理、流量监控、系统设置；模型管理通过系统设置页入口访问。登录页不渲染侧栏/顶栏，未登录访问任意业务路由会跳转登录并在登录后回跳。

## 4. Token 流量治理链路

```
POST /v1/chat/completions
  ├─ API Key 有效？       否 → 401（审计日志 status=unauthorized）
  ├─ 用户启用？           否 → 403
  ├─ 请求体合法？         否 → 400
  ├─ 模型存在且启用？     否 → 404/400（未指定 model 时按权重加权选择）
  ├─ 日/月 Token 配额？   超 → 429 quota_exceeded（审计，不计量）
  ├─ RPM / TPM 限流？     超 → 429 rate_limited + Retry-After（审计，不计量）
  ├─ 上游转发（已配置）或内置确定性模拟上游
  └─ 成功 → request_logs + usage_buckets(15min) + token_usage + Key 最近使用时间
```

- 配额优先级：**Key 级 > 用户级覆盖 > 角色级 > 系统默认**。
- 限流窗口：60 秒滑动窗口（统计该 Key 最近 60s 的请求数与 Token 数）。
- 模拟上游：`prompt_tokens = max(1, ceil(字符数/4))`，`completion_tokens` 由固定模板长度确定，可复现、离线可用。
- 配置了 `upstreamBaseUrl` 的模型会通过 httpx 转发；上游不可用降级 502 并记录失败日志。

## 5. 目录结构

```
backend/                     FastAPI 服务
  app/
    main.py                  应用工厂、CORS、统一错误、/health、静态托管 dist/
    config.py  db.py  seed.py  security.py  catalog.py  deps.py  errors.py  utils.py
    routers/                 auth / users / rbac / models / keys / quota / settings /
                             traffic(含 /v1 网关) / analytics / alerts
    services/                metering / rate_limit / gateway / alerts
  tests/                     pytest（临时 SQLite 隔离，86 例）
  requirements.txt  install.sh  run.sh
  data/app.db                运行期生成（gitignore）
src/                         前端控制台
  api/client.js  api/analytics.js
  stores/auth.js
  router/index.js            登录守卫 + 8 个路由
  views/                     Login / Dashboard / Users / Roles / Permissions / Traffic / Models / Settings
  components/                设计稿组件 + 图表 + console 业务组件
  styles.css                 设计 token / 布局 / 响应式
docs/                        设计规格、API、架构、QA 报告
openspec/                    OpenSpec change 与 specs
start.sh                     一键启动前后端
index.png / users.jpg        设计基线
static/                      历史原生静态版（单文件，可直接打开；不含后端能力）
tools/                       开发期 QA 工具（Playwright 截图/像素 diff/E2E）
```

## 6. 数据与设计稿复现

首次启动自动建表 + 幂等种子（`SEED_VERSION` 控制），种子基线精确对齐原型：

| 指标 | 种子值 |
|---|---|
| 今日总请求量 | **128,960** |
| 今日 Token 使用量 | **1.24B**（1,240,000,000） |
| 成功率 | **99.2%** |
| 模型 Token 占比 | GPT-4o 40.2% / Claude-3.5 32.6% / Qwen-Max 18.1% / 其他 9.1% |
| 用户 / 角色 / 接入模型 | 128 / 5 / 4 |
| 系统运行时长 | 15 天 |
| 近期请求 4 行 | user123 GPT-4o 2,048；alice Claude-3.5 1,024；bob Qwen-Max 4,096；admin GPT-4o 768 |
| 未读告警 | 3 |

> 设计稿本身存在数据自相矛盾（趋势图日累计 ≠ KPI 128,960、成功率曲线 ≠ 99.2%）。本系统以**数据一致性**为准：趋势曲线保持原型形状并缩放到与 KPI 一致的总量，成功率按 99.2% 生成；KPI 数字、模型占比、近期请求内容与布局均与原型一致。真实网关流量会自然叠加到今日指标。

重置为原型基线：

```bash
rm -f backend/data/app.db backend/data/app.db-wal backend/data/app.db-shm
bash start.sh
```

## 7. API

完整接口文档见 [`docs/api.md`](docs/api.md)（包含鉴权、错误结构、分页、权限键、网关示例、Dashboard 响应结构）。
后端启动后可访问 Swagger UI：<http://127.0.0.1:8000/docs>。

## 8. 测试与验收

```bash
# 后端单元/接口测试（86 例）
npm run api:test
# 或
cd backend && PYTHONPATH="$(pwd)/vendor:$(pwd)" python3 -m pytest tests/ -q

# 前端生产构建
npm run build

# 浏览器验收（需后端 8000 + 前端 5173 就绪）
node tools/e2e/run.mjs --frontend=http://127.0.0.1:5173 --backend=http://127.0.0.1:8000
```

最新验收结果（详见 [`docs/qa-report.md`](docs/qa-report.md)、[`docs/backend-test-report.md`](docs/backend-test-report.md)）：

| 项目 | 结果 |
|---|---|
| 后端 pytest | **86 passed / 0 failed** |
| 浏览器 E2E（登录/守卫/KPI/6 页导航/用户 CRUD/退出） | **37/37 PASS** |
| 网关端到端（Key/usage/日志/SSE/限流/配额/告警） | **15/15 PASS** |
| 响应式（1672/1440/1024/768/390 × 7 页 + 移动抽屉） | **22/22 PASS** |
| 像素回归 Dashboard vs `index.png` | **≈5.6%**（外壳侧栏 4.36% / 顶栏 2.50% / 页头 3.49% 与历史基线一致） |
| 像素回归用户页 vs `users.jpg` | **≈5.83%**（外壳最大 5.20%；内容差异来自真实 128 行数据与筛选/导航增强） |
| 生产构建 | PASS |

## 9. OpenSpec 工作流

本系统按 OpenSpec **propose → apply → archive** 流程交付：

```bash
openspec status --change build-token-traffic-system        # 规划进度
openspec instructions apply --change build-token-traffic-system
openspec validate build-token-traffic-system --strict      # 规格校验
openspec archive build-token-traffic-system               # 归档并合并 specs
```

- 变更目录：`openspec/changes/build-token-traffic-system/`
- 能力规格：`auth-rbac`、`user-management`、`model-channel`、`api-key-quota`、`traffic-gateway`、`traffic-analytics`、`management-console`
- 归档后主规格位于 `openspec/specs/<capability>/spec.md`

## 10. 安全说明

- 密码 PBKDF2-HMAC-SHA256（260,000 次迭代 + 随机盐）；API 响应永不返回密码哈希。
- 令牌 HS256 签名，包含 `jti`/`exp`；退出登录写入吊销表，旧令牌立即 `401`。
- API Key 明文仅在创建/轮换响应出现一次，库存 SHA-256 哈希，列表仅显示前缀。
- 权限在接口层强制校验（超级管理员 `*` 放行）；控制台按权限隐藏操作按钮。
- 开发期 CORS 放开；生产部署请收紧来源、替换 `LLM_DASHBOARD_JWT_SECRET` 并置于 HTTPS 之后。
- 默认使用离线模拟上游，不向公网发送任何数据；只有在模型渠道配置上游地址后才会产生真实外部调用。

## 11. 已知差异 / 限制

- **趋势 y 轴刻度**：真实日总量 128,960 下每 15 分钟峰值约 2.2k，因此图表 y 轴为 0–2.5k（原型写的是 0–100k，与其 KPI 不自洽）；曲线形状与原型一致。
- **环形图分段**：按接口真实数据渲染 4 段（40.2/32.6/18.1/9.1，合计 100%）；原型视觉含 1 段未标注色块。
- **用户页**：真实 128 条数据 → 分页 13 页（原型 5 页）；列映射按设计稿保留（用户ID 列显示 username、用户名 列显示 userNo）。
- **限流计数**：单实例 + SQLite 滑动窗口，重启后窗口清零；多实例生产需 Redis 等共享计数。
- 未实现付款结算、多租户隔离、OAuth/SSO、邮件通知；`/v1/embeddings` 未实现（契约标注为可选）。
- `static/` 为上一阶段的原生静态还原版，仅用于无 Node 环境直接打开预览，不含登录与后端能力；主系统以 `src/` + `backend/` 为准。

## 12. 知识库（Repo Wiki）

仓库内维护了一套 Karpathy 模式的 LLM Wiki，用于沉淀架构、实体、概念与端到端流程：

- 入口：`wiki/index.md`（先读目录，再深入页面）
- 总览：`wiki/overview.md`；已知坑与文档漂移：`wiki/concepts/known-issues.md`
- 维护规范：根目录 `CLAUDE.md`（页面类型、frontmatter、ingest/query/lint 流程）
- 规模：48 个内容页（5 modules + 28 entities + 8 concepts + 6 flows）+ overview，全站 `[[wikilink]]` 互链、`source_files` 可校验

查询时先读 `wiki/index.md` 定位页面，再按需深入；代码变更后按 `CLAUDE.md` 的 ingest 流程更新对应页面并跑 lint。wiki 是纯 markdown，提交 `wiki/` 即可让 git 历史充当审计轨迹。

## 13. 常见问题

**Q：端口被占用？** 后端默认 8000、前端 5173；`start.sh` 会跳过已运行的服务。可用 `HOST`/`PORT` 环境变量调整后端，`npm run dev -- --port 5174` 调整前端。

**Q：Python 依赖安装失败（无 venv/ensurepip）？** 本项目使用 `backend/install.sh` 将依赖 vendored 到 `backend/vendor/`（`--break-system-packages --target`），不依赖系统 venv。

**Q：数据乱了想恢复原型？** 删除 `backend/data/app.db*` 后重启即可重新种子；或提升 `backend/app/seed.py` 的 `SEED_VERSION`。

**Q：如何接真实模型？** 在「系统设置 → 模型管理」编辑模型，填写 `upstreamBaseUrl`（OpenAI 兼容）与 `upstreamApiKey`，网关会转发请求并透传 `usage`。

**Q：如何接入自己的业务流量？** 用管理员创建 API Key，业务方以 `Authorization: Bearer sk-...` 调 `/v1/chat/completions`；配额/限流/计量/日志/告警自动生效。
