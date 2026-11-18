---
title: 数据库 schema 与连接管理（backend/app/db.py）
source_files:
  - backend/app/db.py
  - backend/app/seed.py
  - backend/app/deps.py
  - backend/app/routers/users.py
updated: 2026-11-18
tags: [entity, backend, database]
---

> 所属模块：[[modules/backend]]

# 数据库 schema 与连接管理（`backend/app/db.py`）

`db.py` 同时承担两件事：定义整套 SQLite schema（`SCHEMA` 常量）与提供连接/事务/设置读写的
薄封装。系统没有 ORM 和迁移框架，表结构即事实来源，路由里直接写 SQL。

## 用途与职责

- **建表**：`init_db()` 执行 `SCHEMA`（全部 `CREATE TABLE IF NOT EXISTS`），再按需种子。
- **连接策略**：每个 HTTP 请求开一条短连接，WAL 模式支持并发读，写操作由 handler 自己提交。
- **类型/行转换**：`row_to_dict`、`rows_to_dicts` 把 `sqlite3.Row` 变成普通 dict。
- **设置读写**：`get_setting` / `set_setting` 是 `settings` 表的唯一访问助手（upsert）。

## 关键函数

| 函数 | 签名 | 说明 |
|---|---|---|
| `connect` | `(db_path=None) -> sqlite3.Connection` | 建目录、`timeout=15`、`check_same_thread=False`、`Row` 工厂 |
| `session` | `@contextmanager (db_path=None) -> Iterator[Connection]` | 成功 `commit`、异常 `rollback`、最终 `close` |
| `init_db` | `(db_path=None, with_seed=True) -> None` | `executescript(SCHEMA)`，再 `seed.ensure_seed(conn)` |
| `row_to_dict` / `rows_to_dicts` | `(row) -> dict \| None` / `(rows) -> list[dict]` | 行序列化 |
| `get_setting` | `(conn, key, default=None)` | 读 `settings.value`（永远是字符串） |
| `set_setting` | `(conn, key, value: str, updated_at: str)` | `INSERT ... ON CONFLICT(key) DO UPDATE`，**不提交** |

连接建立时固定执行三条 PRAGMA：`journal_mode=WAL`、`foreign_keys=ON`、`busy_timeout=5000`。
WAL 让读写不互相阻塞，`foreign_keys=ON` 让 `api_keys` 的 `ON DELETE CASCADE` 真正生效，
`busy_timeout` 缓解并发写锁冲突。

## 表结构（14 张）

| 表 | 主键 / 唯一约束 | 作用与关键列 |
|---|---|---|
| `roles` | `id`；`key UNIQUE` | 角色；`is_super` 决定是否固定拥有全部权限 |
| `permissions` | `id`；`key UNIQUE` | 权限目录；`group_key/group_label` 供前端分组 |
| `role_permissions` | `(role_id, permission_key)` | 多对多绑定，两端 `ON DELETE CASCADE` |
| `users` | `id`；`username`、`user_no` 各自 UNIQUE | `password_hash`、`role_id`、`status`、`last_login_at`；索引 role/status |
| `models` | `id`；`name UNIQUE` | 上游渠道：`upstream_base_url`、`upstream_api_key`、单价、`weight`、`status` |
| `api_keys` | `id`；`key_hash UNIQUE` | 只存 SHA-256 哈希与 `key_prefix`，含 Key 级四项限制；`user_id` 级联删除 |
| `quota_policies` | `id`；`UNIQUE(scope, target_id)` | `scope` 为 user/role/key 的覆盖策略，NULL 表示回落下一级 |
| `request_logs` | `id` | 审计日志；`ts`、`user_id`、`username`、`key_prefix`、`model`、三种 token、`status`、`http_status`、`latency_ms`、`error_code`、`source` |
| `usage_buckets` | `id`；`UNIQUE(bucket_start, model)` | 15 分钟 × 模型聚合；`requests/success_requests/prompt/completion/total` |
| `token_usage` | `(scope, target_id, period)` | 日/月累计；`period` 形如 `day:YYYY-MM-DD`、`month:YYYY-MM` |
| `alerts` | `id` | `type`、`level`、`title`、`message`、`user_id`、`read`、`created_at` |
| `settings` | `key` | 文本 key/value（默认配额、阈值、站点名、启动时间、`spark_today`） |
| `revoked_tokens` | `jti` | 退出登录黑名单；`expires_at` 用于顺手清理 |
| `app_meta` | `key` | 元数据（种子版本写在这里，见下方坑） |

索引：`users(role_id)`、`users(status)`、`api_keys(user_id)`、`request_logs(ts)`、
`request_logs(user_id, ts)`、`request_logs(key_prefix, ts)`、`usage_buckets(bucket_start)`、
`alerts(read)`。限流窗口查询 `key_prefix + ts` 与 Dashboard 时间范围查询都依赖这些索引。

## 调用链与调用方

```
create_app → db.init_db → connect + executescript(SCHEMA) + seed.ensure_seed
请求 → deps.get_db → db.connect(request.app.state.db_path)
路由/服务 → conn.execute(...) → conn.commit()（手动）
种子 → db.init_db（connect + 手动 commit；db.session() 已定义但当前无调用方）
settings 路由与 keys/quota/rate_limit → db.get_setting / db.set_setting
```

## 数据与副作用

- `init_db` 会物理创建 DB 文件、WAL/SHM 旁文件，并写入种子；是幂等的但**不是无副作用**。
- `request_logs` 刻意做成"反范式审计"：`username`、`key_prefix`、`model` 都存字符串快照，
  因此删除用户/Key/模型后历史统计仍然可读。
- `usage_buckets` 只用 `(bucket_start, model)` 唯一键做 upsert，真实流量与种子基线自然叠加。
- `settings` 的值一律文本；读取方各自 `int()`/`float()`，解析失败时回退默认值而不是报错。

## 边界与错误处理

- `init_db(with_seed=False)` 只建表不种子，测试或空库场景可用。
- `session()` 定义了自动提交/回滚语义，但当前代码里没有调用方；实际路径是
  `init_db`/路由自己 `connect` + 显式 `commit`。只有 `close()` 时，SQLite 会回滚未提交事务
  ——前提是 handler 没有提前 `commit`。
- `connect` 的 `timeout=15` 与 `busy_timeout=5000` 是两套等待机制，前者是 Python 驱动层。
- `row_to_dict(None)` 返回 `None`，调用方需自行判空；`get_setting` 缺少 key 时返回 `default`。

## 坑与注意点

- **`revoked_tokens` 清理依赖字符串比较**：`expires_at` 是 `YYYY-MM-DD HH:MM:SS` 文本，
  `DELETE ... WHERE expires_at < now_str()` 的字典序恰好等价于时间序，换格式就会出错。
- **只有 `api_keys` 声明了级联**：`users.role_id` 有外键但没有 `ON DELETE` 行为，
  `quota_policies.target_id` 则完全没有外键约束；删除用户时的 `token_usage`/`quota_policies`
  清理是 `users._delete_user_cascade` 手动做的，绕过该函数直接删库会留下孤儿行。
- **种子版本双写但只读一处**：`ensure_seed` 读 `settings.seed_version`，结尾却写
  `app_meta.seed_version`；`_seed_settings` 用 `INSERT OR IGNORE` 使 `settings` 里的版本永久
  停留在首次值。递增 `SEED_VERSION` 后每次启动都会重跑种子流程，详见
  [[entities/backend-seed-data]]。
- **`settings` 没有类型**：`alert_threshold` 可能被写成 `"80"`，消费方需容忍（告警服务会 /100）。
- **单文件即单实例**：WAL 允许并发读，但写仍是串行的；高并发写场景 `busy_timeout` 之后会
  抛 `database is locked`，网关路径没有重试逻辑。

## 相关页面

[[modules/backend]] · [[entities/backend-app-factory]] · [[entities/backend-seed-data]] ·
[[entities/backend-deps-authz]] · [[entities/backend-metering-rate-limit]] ·
[[concepts/token-governance]] · [[flows/gateway-request]]
