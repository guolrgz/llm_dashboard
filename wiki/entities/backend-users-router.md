---
title: 用户管理路由（/api/users）
source_files:
  - backend/app/routers/users.py
  - backend/app/routers/auth.py
  - backend/app/deps.py
  - backend/app/catalog.py
updated: 2026-11-18
tags: [entity, backend, users]
---

> 所属模块：[[modules/backend]]

# 用户管理路由（`/api/users`）

`routers/users.py` 是控制台"用户管理"页的全部后端能力：分页筛选、统计、增删改、启停、
批量操作，并导出 `build_user` 供认证路由复用。它是后端里唯一需要同时维护"账号唯一性、
角色解析、级联清理、最后一个超管保护"的模块。

## 端点与权限

| 方法 | 路径 | 函数 | 权限 |
|---|---|---|---|
| GET | `/api/users` | `list_users(page, pageSize, keyword, status, role, ...)` | `users.view` |
| GET | `/api/users/stats` | `user_stats()` | `users.view` |
| POST | `/api/users` | `create_user(payload)` → 201 | `users.manage` |
| PUT | `/api/users/{user_id}` | `update_user(user_id, payload)` | `users.manage` |
| DELETE | `/api/users/{user_id}` | `delete_user(user_id)` → 204 | `users.manage` |
| POST | `/api/users/{user_id}/status` | `update_user_status(user_id, payload)` | `users.manage` |
| POST | `/api/users/batch` | `batch_users(payload)` | `users.manage` |

## 关键函数与内部助手

| 名称 | 说明 |
|---|---|
| `build_user(conn, user_id) -> dict` | 契约里的 `user` 结构，绝不返回密码哈希；用户不存在 → 404 |
| `permissions_for_role(conn, role_id, is_super)` | 超管返回 `["*", *ALL_PERMISSION_KEYS]`，否则按 `role_permissions` 排序读取 |
| `_role_row_for_value(conn, value)` | 依次按数字 id、`key`、中文 `name`、`ROLE_ALIASES` 解析角色 |
| `_role_row_for_payload(conn, payload, default_key)` | 优先 `roleId`，其次 `role`，否则用默认角色 |
| `_next_user_no(conn)` | `MAX(CAST(user_no AS INTEGER))` + 1，从 10001 起，冲突继续 ++ |
| `_ensure_unique(...)` | 用户名/用户 ID 唯一性检查，冲突抛 409 |
| `_delete_user_cascade(conn, user_id)` | 手删该用户的 Key 及其 `token_usage`/`quota_policies`，再删用户；日志保留 |
| `_enabled_super_count(conn)` | 统计"启用中的超管"，用于最后一名保护 |
| `_like_pattern(value)` | 转义 `\`、`%`、`_` 后再包 `%...%`，配合 `LIKE ... ESCAPE '\'` |

## 行为细节

- **列表**：`keyword` 同时匹配 username/user_no/email/nickname；`status` 只接受
  `enabled|disabled`（`all`/`全部` 视为不过滤）；`role` 接受 id/key/中文名/别名。
  排序固定 `u.id ASC`，每行附 `keyCount`（该用户 `status='active'` 的 Key 数）。
  分页上限 100，`page` 最小 1。
- **统计**：`total/enabled/disabled` 来自 `GROUP BY status`；`byRole` 用
  `roles LEFT JOIN users` 保证零成员角色也出现。
- **创建**：用户名、密码必填；`userNo` 缺省自动生成；角色缺省 `viewer`；`status` 缺省
  `enabled`；`nickname` 缺省等于 username；密码用 PBKDF2 哈希；返回 201 + `{user}`。
- **编辑**：真正的局部更新——只有出现在 payload 里的字段才进 `UPDATE`；`password` 非空才重置；
  `roleId`/`role` 二选一；先 `_fetch_user_row` 确认存在（404）。
- **删除**：禁止删自己（409）；禁止删最后一个启用中的超管（409）；其余走级联清理。
- **启停**：`status` 必填，写库后返回完整 `user`。
- **批量**：`ids` 必须是数组，`action` ∈ `delete|enable|disable`；`dict.fromkeys` 去重；
  删除时静默跳过自己与"最后一个超管"；返回 `{ok, affected}`，不逐条报错。

## 调用链与副作用

```
create/update/status → security.hash_password → INSERT/UPDATE users → conn.commit → build_user
delete/batch(delete) → _delete_user_cascade
     ├─ DELETE token_usage WHERE scope='key' / quota_policies WHERE scope='key'
     ├─ DELETE api_keys WHERE user_id=?
     ├─ DELETE token_usage/quota_policies WHERE scope='user'
     └─ DELETE users
```

写入表：`users`、`api_keys`、`token_usage`、`quota_policies`。`request_logs` 与 `alerts`
**不清理**：审计日志用 `username` 字符串快照保留历史；告警的 `user_id` 会变成悬空引用。
认证路由的登录响应复用 `build_user`，所以两处字段必须保持一致。

## 边界与错误处理

| 场景 | 结果 |
|---|---|
| 用户名/用户 ID 重复（创建或改名） | 409 `conflict` |
| 角色无法解析 | 400 `validation_error` "无效的角色" |
| status 非法 | 400 `validation_error` |
| 删除自己 | 409 `conflict` "不能删除当前登录用户" |
| 删除最后一个启用超管 | 409 `conflict` |
| 批量 ids 非法 / action 非法 | 400 `validation_error` |

## 坑与注意点

- **最后超管保护只在删除时生效**：`PUT /users/{id}` 或 `/status` 可以把最后一名启用超管改成
  `disabled`，系统随后没有任何超管；`admin` 角色虽能改用户，但若只剩超管本人也无从登录。
- **批量操作"成功但不生效"**：删自己或删最后超管会被静默 `continue`，接口仍返回
  `{ok: true}`，只能靠 `affected` 判断实际数量。
- **角色解析容错很宽**：数字字符串先当 id，再当 key/name，最后查中文别名；`role="1abc"` 之类
  会落到"无效角色"。好处是兼容历史静态页的中文角色名，代价是错误信息不够精确。
- **`_next_user_no` 依赖字符串转数字**：历史上若写入非数字 `user_no`（如 `sk-...`），
  `CAST` 会得到 0，生成逻辑仍能工作但从 10001 重新开始，可能撞已存在的号。
- **删除不吊销而删除 Key**：级联直接删 `api_keys` 行，而不是标记 `revoked`；被删 Key 的明文
  立即失效，符合预期，但 Key 的审计线索（除了日志里的前缀）也随之消失。
- **`userNo` 与 `id` 是两套编号**：`id` 自增，`user_no` 业务编号；前端展示用 `userNo`，
  接口路径用 `id`，不要混用。
- **更新不校验邮箱格式**：`email` 只做 `strip()`，非法格式会原样入库；列表的 keyword 搜索会
  命中它。

## 相关页面

[[modules/backend]] · [[entities/backend-auth-router]] · [[entities/backend-deps-authz]] ·
[[entities/backend-rbac-router]] · [[entities/backend-db-schema]] · [[concepts/auth-rbac]] ·
[[flows/user-management]] · [[flows/login-session]]
