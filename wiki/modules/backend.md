---
title: 后端模块（FastAPI + SQLite）
source_files:
  - backend/app/main.py
  - backend/app/config.py
  - backend/app/db.py
  - backend/app/seed.py
  - backend/app/security.py
  - backend/app/catalog.py
  - backend/app/deps.py
  - backend/app/errors.py
  - backend/app/utils.py
  - backend/app/routers/auth.py
  - backend/app/routers/users.py
  - backend/app/routers/rbac.py
  - backend/app/routers/models.py
  - backend/app/routers/keys.py
  - backend/app/routers/quota.py
  - backend/app/routers/settings.py
  - backend/app/routers/traffic.py
  - backend/app/routers/analytics.py
  - backend/app/routers/alerts.py
  - backend/app/services/metering.py
  - backend/app/services/rate_limit.py
  - backend/app/services/gateway.py
  - backend/app/services/alerts.py
  - backend/run.sh
  - backend/requirements.txt
updated: 2026-11-18
tags: [module, backend]
---

# 后端模块（FastAPI + SQLite）

后端是整个 Token 流量治理系统的执行侧：对控制台提供 `/api` 管理接口，对推理客户端提供
OpenAI 兼容的 `/v1/chat/completions` 网关，所有状态落在单个 SQLite 文件里。无 ORM、
无迁移框架、无外部缓存/队列，刻意保持"一个进程 + 一个 DB 文件"即可运行。

## 职责

- **身份与授权**：登录签发 HS256 JWT、退出登录吊销 `jti`、按 17 个权限键做接口级鉴权。
- **治理面的 CRUD**：用户、角色/权限、模型渠道、API Key、配额策略、系统设置。
- **流量入口**：网关鉴权 → 用户状态 → 请求体 → 模型 → 配额 → RPM/TPM → 转发/模拟 → 计量。
- **计量与分析**：写审计日志、15 分钟聚合桶、用户/Key 日月累计，并聚合出 Dashboard。
- **告警**：配额阈值/超限与限流事件写 `alerts`，按 type+用户做时间窗去重。
- **演示基线**：首次启动注入与设计稿一致的数据（128 用户 / 5 角色 / 4 模型 / 60 天用量）。

## 对外接口与入口

| 入口 | 说明 |
|---|---|
| `POST /v1/chat/completions` | 推理网关，根路径挂载，Bearer 使用 `sk-...` API Key |
| `/api/auth/*` | 登录、当前用户、退出 |
| `/api/users/*`、`/api/roles`、`/api/permissions` | 用户与 RBAC |
| `/api/models`、`/api/keys`、`/api/quota/*`、`/api/settings` | 模型、Key、配额、设置 |
| `/api/traffic/*`、`/api/analytics/dashboard`、`/api/alerts/*` | 流量、分析、告警 |
| `GET /health` | 免鉴权健康检查（含 DB 连通性、版本、进程运行秒数） |
| `GET /`、`/users.html`、`/assets/*` | 若仓库根存在 `dist/`，由 FastAPI 直接托管构建产物 |

所有管理接口返回 JSON；错误统一为 `{"error": {"code", "message", "details"?}}`；分页统一为
`{items, total, page, pageSize}`。权限键与角色定义见 [[entities/backend-deps-authz]]。

## 关键文件

| 文件 | 作用 |
|---|---|
| `app/main.py` | `create_app()`：CORS、错误处理、`/health`、路由挂载、静态托管；模块级 `app` 供 uvicorn 使用 |
| `app/config.py` | 环境变量读取 + 业务默认常量（日/月配额、RPM/TPM、告警阈值） |
| `app/db.py` | SQLite 连接（WAL/外键/busy_timeout）与 14 张表的 schema |
| `app/seed.py` | 幂等种子：原型基线、用户、Key、60 天 `usage_buckets`、日志与告警 |
| `app/security.py` | PBKDF2 密码、手写 JWT、API Key 哈希/前缀 |
| `app/catalog.py` | 17 个权限键、5 个角色、角色别名 |
| `app/deps.py` | `get_db` / `get_current_user` / `require_permission` |
| `app/errors.py` | `ApiError` 与三类异常处理器 |
| `app/utils.py` | 固定 UTC+8 本地时区、时间串、格式化、分页 |
| `app/routers/*.py` | 10 个路由模块（traffic 内含两个 router） |
| `app/services/*.py` | 计量、限流、上游调用、告警生成 |

## 依赖与被依赖

- 运行依赖：`fastapi`、`uvicorn`、`pydantic`、`httpx`；其余全部标准库（`sqlite3`、`hmac`、
  `hashlib`、`secrets`）。依赖被 vendored 到 `backend/vendor`（gitignore），由
  `backend/install.sh` 安装、`backend/run.sh` 注入 `PYTHONPATH`。
- 后端自身不调用前端；前端通过 `src/api/client.js` 依赖本模块，Vite 开发期代理 `/api`、`/v1`、
  `/health` 到 `127.0.0.1:8000`。生产构建后由本模块托管 `dist/`。
- 浏览器 E2E 与像素回归工具以 HTTP 方式依赖这些接口，见 [[modules/tools]]。

## 运行方式

```bash
bash backend/run.sh                  # 127.0.0.1:8000，自动 vendor 依赖
bash start.sh                        # 前后端一起（后端日志 backend.log）
npm run api:test                     # pytest，临时 SQLite 隔离
```

环境变量：`LLM_DASHBOARD_DB`、`LLM_DASHBOARD_DATA_DIR`、`LLM_DASHBOARD_JWT_SECRET`、
`LLM_DASHBOARD_TOKEN_TTL_HOURS`、`LLM_DASHBOARD_VERSION`、`HOST`/`PORT`。
默认库 `backend/data/app.db`，首次启动自动建表并种子；删除 DB 即回到原型基线。

## 设计要点与坑

- **每个请求一条短连接**：`deps.get_db` 只 `connect`/`close`，不自动 `commit`/`rollback`；
  handler 必须显式提交，异常时靠连接关闭丢弃未提交事务。`db.session()` 虽然定义了自动
  提交/回滚，但当前没有调用方，不要误以为路由在用它。
- **应用工厂**：`create_app(db_path=...)` 让每个测试拿到独立 DB；但 `main.py` 末尾
  `app = create_app()` 会在 import 时建库，测试必须走工厂而不是 import `app`。
- **种子版本字段错位**：`ensure_seed` 从 `settings` 读 `seed_version`，却把新版本写进
  `app_meta`，见 [[entities/backend-seed-data]]——递增 `SEED_VERSION` 不会像注释暗示的那样
  只跑一次。
- **计量与分析同源但不同表**：Dashboard/流量摘要的请求与 Token 来自 `usage_buckets`
  （只累加成功请求），失败明细来自 `request_logs`，所以"失败数 = 请求数 - 成功数"的算法
  在纯真实流量下会低估失败，见 [[entities/backend-analytics]]。
- **网关限流窗口读的是审计日志**：429 自身也会写 `request_logs` 并计入 60 秒窗口，
  客户端持续重试会延长封禁，见 [[entities/backend-metering-rate-limit]]。
- **单实例假设**：限流与配额都靠 SQLite 即时查询，没有分布式计数；多进程/多实例部署需要
  外部共享存储。CORS 当前 `allow_origins=["*"]`，生产需收敛。
- **时间口径**：业务时间固定 `UTC+8`（`utils.LOCAL_TZ`），聚合按本地自然日/自然月；
  `/health` 的运行秒数来自进程启动，而 Dashboard 的 `uptimeDays` 来自 `settings.system_started_at`，
  两者不是同一个概念。

## 相关页面

[[entities/backend-app-factory]] · [[entities/backend-db-schema]] · [[entities/backend-security]] ·
[[entities/backend-deps-authz]] · [[entities/backend-traffic-gateway]] ·
[[entities/backend-metering-rate-limit]] · [[entities/backend-analytics]] ·
[[entities/backend-alerts]] · [[entities/backend-seed-data]] · [[concepts/token-governance]] ·
[[concepts/auth-rbac]] · [[flows/gateway-request]]
