# 系统架构 — LLM 推理 Token 流量管理系统

> 本文件描述 `build-token-traffic-system` 变更落地后的系统全貌。规划来源：
> `openspec/changes/build-token-traffic-system/`（proposal / design / specs / tasks）。

## 1. 总览

```
┌──────────────────────────── Browser ────────────────────────────┐
│  Vue 3 + Vite 控制台（SPA，hash 路由）                            │
│  /login  /  /users  /roles  /permissions  /traffic  /models  /settings │
└───────────────┬─────────────────────────────────────────────────┘
                │ HTTPS / JSON（Bearer token）
┌───────────────▼─────────────────────────────────────────────────┐
│  FastAPI（uvicorn，127.0.0.1:8000）                               │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────────────┐  │
│  │ 管理 API /api │  │ 分析 /api/... │  │ 网关 /v1             │  │
│  │ auth/rbac/    │  │ dashboard     │  │ chat/completions     │  │
│  │ users/models/ │  │ traffic/alerts│  │ API Key 鉴权          │  │
│  │ keys/quota/   │  │               │  │ 配额→限流→转发/模拟    │  │
│  │ settings      │  │               │  │ 计量→日志             │  │
│  └───────┬───────┘  └───────┬───────┘  └──────────┬───────────┘  │
│          └──────────────────┼─────────────────────┘              │
│                     ┌───────▼────────┐                           │
│                     │ SQLite (WAL)   │  backend/data/app.db      │
│                     │ 11 张业务表     │                           │
│                     └────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
                │ 可选：配置了 upstream_base_url 的模型
                ▼
     真实 OpenAI 兼容上游（默认关闭，离线模拟上游）
```

## 2. 目录结构

```
backend/
  app/
    main.py            # create_app()：CORS、错误处理、/health、路由挂载、静态托管
    config.py          # 环境变量与业务默认值
    db.py              # SQLite 连接 + schema（11 张表）
    seed.py            # 幂等种子：原型基线数据 + 128 用户 + 60 天用量
    security.py        # PBKDF2 密码、HS256 令牌、API Key 哈希
    catalog.py         # 17 个权限键、5 个角色定义
    deps.py            # get_db / get_current_user / require_permission
    errors.py          # ApiError + 统一错误响应
    utils.py           # 时间、格式化、分页
    routers/           # auth/users/rbac/models/keys/quota/settings/traffic/analytics/alerts
    services/          # metering / rate_limit / gateway / alerts
  tests/               # pytest（临时 SQLite，每个测试隔离）
  run.sh / install.sh  # 依赖 vendored 到 backend/vendor（gitignore）
src/
  api/client.js        # fetch 封装、token、401 跳转
  stores/auth.js       # 登录态与权限
  router/index.js      # 路由 + 登录守卫
  views/               # 8 个页面（Dashboard + 6 治理页 + 登录）
  components/          # 设计稿组件 + 业务组件
  styles.css           # 设计 token 与布局
  users/               # 历史静态版（已降级为兼容入口）
backend/data/app.db    # 运行期生成（gitignore）
```

## 3. 数据模型（SQLite）

| 表 | 作用 | 关键字段 |
|---|---|---|
| `users` | 系统用户 | username 唯一、user_no 唯一、password_hash、role_id、status |
| `roles` / `permissions` / `role_permissions` | RBAC | 5 角色 / 17 权限 / 多对多绑定 |
| `models` | 上游模型渠道 | name 唯一、provider、upstream_base_url、单价、weight、status |
| `api_keys` | 推理凭证 | key_hash 唯一（明文不落库）、key_prefix、rpm/tpm/日/月配额、status |
| `quota_policies` | 配额/限流覆盖 | scope(user/role/key)+target_id，空值回落默认策略 |
| `usage_buckets` | 15 分钟 × 模型聚合 | requests、success_requests、prompt/completion/total tokens |
| `request_logs` | 请求审计 | 成功/失败状态、HTTP 码、延迟、Key 前缀 |
| `token_usage` | 用户日/月累计 | period=`day:YYYY-MM-DD` / `month:YYYY-MM` |
| `alerts` | 告警 | 配额阈值/超限/限流，已读状态 |
| `settings` | 系统设置 | 默认配额/限流、告警阈值、启动时间、原型 spark |
| `revoked_tokens` | 退出登录黑名单 | jti + 过期时间 |

## 4. 关键流程

### 4.1 登录与鉴权

1. `POST /api/auth/login` → 校验 PBKDF2 → 签发 HS256 token（含 `sub/role/jti/exp`，默认 8h）。
2. 前端存 `localStorage.llm_token`，后续请求带 `Authorization: Bearer`。
3. 后端 `get_current_user` 校验签名、过期、`revoked_tokens`、用户启用状态，组装角色权限。
4. 路由级 `require_permission(key)`；超级管理员 `*` 短路。
5. `POST /api/auth/logout` 将 jti 写入黑名单。

### 4.2 推理网关（Token 流量治理核心）

```
请求 POST /v1/chat/completions
  → Key 有效？          否 → 401（记录 unauthorized）
  → 用户启用？          否 → 403
  → 模型存在且启用？    否 → 404/400
  → Token 配额（日/月）？超 → 429 quota_exceeded（记录，不计量）
  → RPM / TPM 限流？     超 → 429 rate_limited + Retry-After（记录，不计量）
  → 上游转发（已配置）或确定性模拟上游
  → 成功：写 request_logs + usage_buckets + token_usage，返回 usage 与配额响应头
```

- 计量口径：prompt/completion/total tokens 以响应 `usage` 为准；模拟上游按字符数确定性计算。
- 流式（`stream=true`）：SSE 分块输出，结束后一次性记账。
- 配额优先级：Key 级 > 用户级覆盖 > 角色级 > settings 默认。
- 限流窗口：60 秒滑动窗口（查 `request_logs` 最近 60s 该 Key 的请求数与 Token 数）。

### 4.3 Dashboard 聚合

- 主数据源 `usage_buckets`（15 分钟桶），`request_logs` 提供近期请求。
- `today`：96 点趋势（每 15 分钟）、6 个 x 轴标签；`7d`：7 点；`30d`：30 点。
- 环比：与上一等长周期比较；今日种子基线精确复现原型（128,960 / 1.24B / 99.2%）。
- 系统概览：用户数/角色数/启用模型数/运行天数（`settings.system_started_at`）。

### 4.4 告警

- 配额使用达到 `alert_threshold`（默认 80%）或超限、触发限流时写 `alerts`。
- 同 type+user 10 分钟内去重；顶栏徽标读取未读数。

## 5. 原型一致性与种子策略

- 设计稿 `index.png` 的数值本身存在内部不一致（图表日累计 ≠ KPI 128,960、成功率曲线 ≠ 99.2%）。
  本系统以**数据一致性**为准：趋势曲线按原型形状缩放为与 KPI 一致的总量，成功率按 99.2% 生成。
- KPI 数字、模型占比、近期请求 4 行的用户/模型/Token 数、128 用户/5 角色/4 模型/15 天运行时长均与原型一致。
- 前端布局、色彩、字体、组件尺寸保持像素级基线；数据接入后只改变文本数值，不改变布局。
- 真实网关流量写入同一批表，Dashboard 与日志自然增长。

## 6. 启动与部署

```bash
# 一键（自动装依赖、起后端 8000 + 前端 5173）
bash start.sh

# 仅后端
bash backend/run.sh

# 仅前端
npm run dev
```

- 默认账号：`admin / admin123`；演示 Key：`sk-demo-admin-2026`、`sk-demo-user123-2026`。
- 数据库：`backend/data/app.db`，首次启动自动建表与种子（幂等）。
- 生产：`npm run build` 后，FastAPI 会托管 `dist/`（`/` 与 `/users.html` → SPA），前后端单进程即可。
- 测试：`npm run api:test`（后端 pytest）、`node tools/e2e/run.mjs`（浏览器 E2E，见 QA 报告）。

## 7. 安全与边界

- 密码 PBKDF2-SHA256（260k 次迭代）；令牌 HMAC-SHA256 签名；API Key 仅存 SHA-256 哈希。
- 令牌/密钥不写入前端日志；CORS 开发期放开、生产应收敛到控制台域名。
- 单实例内存 + SQLite 限流（重启清零），生产多实例需外部 Redis 等共享计数。
- 默认离线模拟上游，不向公网发送数据；配置上游后才产生真实外部调用。
