---
title: 后端应用工厂与配置（create_app / config）
source_files:
  - backend/app/main.py
  - backend/app/config.py
  - backend/app/routers/auth.py
  - backend/app/routers/users.py
  - backend/app/routers/traffic.py
updated: 2026-11-18
tags: [entity, backend, bootstrap]
---

> 所属模块：[[modules/backend]]

# 后端应用工厂与配置（create_app / config）

`main.py` 负责把一组独立的路由模块、错误处理器、CORS、静态托管组装成一个 FastAPI 应用；
`config.py` 是所有"可被环境变量覆盖"的运行时参数与业务默认常量的唯一入口。二者共同决定
系统启动时的数据库位置、版本号、令牌密钥与配额默认值。

## 用途与职责

- **应用装配**：`create_app(db_path=None)` 构造 `FastAPI` 实例，写入 `app.state`，注册
  CORS/错误处理器，初始化数据库，挂载 `/health` 与全部 router，最后尝试托管前端产物。
- **可测试性**：工厂接受 `db_path`，测试用 `create_app(tmp_path / "app.db")` 得到完全隔离的
  实例；模块级 `app = create_app()` 只是给 `uvicorn app.main:app` 用的默认产物。
- **配置集中**：环境变量读取函数保持惰性（每次调用时读 `os.environ`），业务默认值以常量
  形式同时被 `settings`、`keys`、`quota`、`rate_limit` 等模块引用。

## 关键函数与配置项

| 名称 | 签名 / 值 | 说明 |
|---|---|---|
| `create_app` | `(db_path: str \| Path \| None = None) -> FastAPI` | 应用工厂；`db_path` 为空时用 `config.db_path()` |
| `_mount_frontend` | `(app: FastAPI) -> None` | 仅当仓库根 `dist/` 存在时挂 `/assets`、`/`、`/users.html` |
| `health` | `(request: Request) -> dict` | `SELECT 1` 探活，返回 status/database/version/uptimeSeconds/startedAt |
| `config.data_dir` | `() -> Path` | `LLM_DASHBOARD_DATA_DIR`，默认 `backend/data` |
| `config.db_path` | `() -> Path` | `LLM_DASHBOARD_DB`，默认 `<data_dir>/app.db` |
| `config.jwt_secret` | `() -> str` | `LLM_DASHBOARD_JWT_SECRET`，有 dev 默认值 |
| `config.token_ttl_hours` | `() -> int` | 默认 8，非法值回退 8，最小 1 |
| `config.app_version` | `() -> str` | `LLM_DASHBOARD_VERSION`，默认 `1.0.0` |
| `DEFAULT_DAILY_QUOTA` / `DEFAULT_MONTHLY_QUOTA` | `2_000_000` / `50_000_000` | 日/月 Token 默认配额 |
| `DEFAULT_RPM` / `DEFAULT_TPM` | `60` / `120_000` | 默认限流 |
| `ALERT_THRESHOLD` | `0.8` | 告警阈值默认值 |

## 调用链与调用方

```
uvicorn app.main:app
  └─ create_app()
       ├─ FastAPI(title/version=config.app_version())
       ├─ app.state.db_path / started_at
       ├─ CORSMiddleware(...)
       ├─ register_error_handlers(app)
       ├─ db.init_db(app.state.db_path)        # 建表 + ensure_seed
       ├─ @app.get("/health")
       ├─ include_router(... ×10, prefix="/api")
       ├─ include_router(traffic.gateway_router)   # 无前缀 → /v1/chat/completions
       └─ _mount_frontend(app)
```

- `backend/run.sh` → `uvicorn app.main:app`，即使用模块级 `app`。
- `backend/tests/conftest.py` → `create_app(tmp_path / "app.db")`，每个测试独立库。
- `health` 直接读 `request.app.state`，因此多实例测试不会互相污染。

## 数据与副作用

- **启动即建库**：`db.init_db` 执行 schema 并调用 `seed.ensure_seed`，首次启动会写入原型
  基线（见 [[entities/backend-seed-data]]）。import 该模块就会产生这个副作用。
- `app.state.db_path`、`app.state.started_at` 是后续 `get_db` 与 `/health` 的唯一来源。
- `STARTED_AT` 在模块 import 时取 `time.time()`；`/health.uptimeSeconds` 是进程存活秒数，
  与 Dashboard 的 `uptimeDays`（读 `settings.system_started_at`）口径不同。
- CORS 暴露 `X-Request-Id`、`X-RateLimit-*`、`X-Quota-*`、`Retry-After`，浏览器 JS 才能读到
  网关返回的配额/限流信息；新增响应头时要同步加进 `expose_headers`。
- 静态托管只在 `dist/` 存在时生效；`/users.html` 被显式映射到同一份 SPA `index.html`，
  用于兼容历史入口。

## 边界与错误处理

- `db_path` 指向的父目录由 `db.connect` 自动 `mkdir(parents=True)`；不可写时启动直接失败。
- `/health` 的 DB 探测失败不抛错，而是降级为 `{"status": "degraded", "database": "error"}`，
  HTTP 仍为 200；它不校验种子或表是否存在。
- `token_ttl_hours` 对非数字输入静默回退 8；`jwt_secret` 没有"生产必须设置"的强制校验。
- CORS `allow_credentials=False` 与 `allow_origins=["*"]` 配套，因此不能靠 Cookie 认证；
  令牌只能放 `Authorization` 头。

## 坑与注意点

- **import 副作用**：任何 `import app.main` 都会创建/种子默认 DB。写脚本或测试时优先用
  `create_app()`，否则会污染 `backend/data/app.db`。
- **环境变量读取时机不同**：`config.*()` 每次调用都读环境，但 `app.state.db_path` 在工厂
  执行时固化；运行中改 `LLM_DASHBOARD_DB` 不会生效，改 `JWT_SECRET` 会让已签发令牌立刻失效。
- **默认密钥是演示值**：`llm-token-traffic-dev-secret-2026-please-override` 写在源码里，
  生产不覆盖等于任何人可伪造令牌（见 [[concepts/security-posture]]）。
- **`STARTED_AT` 是 import 时间**：热重载/多次创建 app 时它不会更新；`/health.startedAt`
  因此可能早于当前进程实际启动时间。
- **路由挂载顺序**：`traffic.gateway_router` 不带 `/api` 前缀，且 `/` 的 SPA 兜底只注册了
  精确路径，新增前端 history 路由时要注意是否会与网关路径冲突。

## 相关页面

[[modules/backend]] · [[entities/backend-db-schema]] · [[entities/backend-seed-data]] ·
[[entities/backend-security]] · [[entities/backend-deps-authz]] ·
[[entities/backend-traffic-gateway]] · [[concepts/security-posture]] · [[flows/login-session]]
