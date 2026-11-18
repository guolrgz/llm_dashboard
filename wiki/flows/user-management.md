---
title: 流程 — 用户管理 CRUD
source_files:
  - src/views/UsersView.vue
  - src/components/console
  - backend/app/routers/users.py
  - backend/app/routers/rbac.py
  - backend/app/db.py
updated: 2026-11-18
tags: [flow, users, crud, frontend]
---

# 用户管理 CRUD

## 参与者

- 前端：[[entities/frontend-users-view]]（`UsersView.vue` + `src/components/console/*`）、[[entities/frontend-api-client]]
- 后端：[[entities/backend-users-router]]（`/api/users`）、[[entities/backend-rbac-router]]（角色下拉/筛选）、`users`/`api_keys`/`token_usage` 表
- 权限：`users.view`（读）/ `users.manage`（写）

## 步骤（按调用顺序）

### 1. 列表加载

1. 进入 `/users` 后 `fetchUsers()` 调 `GET /api/users?page=1&pageSize=10`（可带 `keyword`/`status`/`role`）。
2. 后端 `users.py::list_users`：按条件拼 WHERE（参数化），`COUNT(*)` + `LIMIT/OFFSET` 分页；每行 `build_user` 输出 `id/username/userNo/nickname/email/role/roleName/roleId/status/createdAt/lastLoginAt/keyCount`，不含密码。
3. 前端渲染表格：**「用户ID」列显示 `username`、「用户名」列显示 `userNo`**（照设计稿的已知列映射，见 [[concepts/design-fidelity]]）；状态徽标“已启用/已停用”；分页文案“共 N 条记录，每页 10 条”。
4. 角色下拉来自 `GET /api/roles`（5 个角色）；无 `users.manage` 时新增/批量/行内写操作按钮隐藏。

### 2. 搜索与筛选

1. 输入关键字 / 选择状态 / 角色 → 点「查询」或回车 → `appliedKeyword` 生效并回到第 1 页。
2. 后端 `keyword` 同时模糊匹配 `username/user_no/email/nickname`；`status` 精确匹配；`role` 支持 role key/中文名/`all` 兼容。
3. 「重置」清空条件并刷新。

### 3. 新增用户

1. 点「新增用户」→ `ConsoleModal` 弹窗；表单含用户ID(userNo)、用户名、密码、邮箱、角色、状态。
2. 提交 → `POST /api/users`；后端校验：`username`/`password` 非空、`username`/`user_no` 唯一（409 `conflict`）、角色存在、状态合法；`security.hash_password()` 后插入，返回 201 `{user}`。
3. 成功 → Toast「新增成功」+ 刷新列表；失败（如重名）→ 表单内联错误 + Toast，不关闭弹窗。

### 4. 编辑用户

1. 行内「编辑」→ 弹窗回填（密码留空表示不修改）。
2. `PUT /api/users/{id}`：后端允许改昵称/邮箱/角色/状态；`password` 非空时重置哈希；唯一性冲突 → 409；不能把最后一个启用超管降级/停用（保护逻辑）。
3. 成功 → Toast + 刷新。

### 5. 启停（单条 / 批量）

- 行内「停用/启用」→ `POST /api/users/{id}/status`，后端更新 `status`；停用后该用户登录 403、其 API Key 调网关 403。
- 批量：勾选行 → 「批量启用/停用」→ `POST /api/users/batch` `{ids, action:"enable"|"disable"}`，返回 `{ok, affected}`。

### 6. 删除（单条 / 批量）

1. 行内「删除」/「批量删除」→ 确认弹窗（提示 Key 会一并失效）。
2. `DELETE /api/users/{id}` 或 `POST /api/users/batch {action:"delete"}`：
   - 禁止删除当前登录用户（409）；
   - 禁止删除最后一个启用的超级管理员（409）；
   - 级联清理该用户的 `api_keys`、`token_usage`、`quota_policies`（scope='user'）。
3. 成功 → Toast + 刷新；`204` 无响应体。

## 状态与副作用

- 每次写操作后重新拉取列表（后端为准，不做乐观更新），避免多端不一致。
- 用户数变化会反映到 Dashboard「系统概览 → 用户总数」（`_overview` 实时 COUNT）。
- 停用用户仍保留数据；删除用户会删 Key 与用量记录（审计价值 vs 清理取舍）。

## 坑与注意点

- **列映射反直觉**：见 [[concepts/design-fidelity]]；不要“修正”成用户 ID=userNo，会破坏像素基线。
- **唯一性约束**：`username` 与 `user_no` 都在库层 UNIQUE；前端要处理 409 而不是假设成功。
- **最后超管保护**：删除/停用/改角色时都要检查，否则系统会锁死。
- **密码不返回**：任何用户列表/详情响应都不含密码哈希；编辑回填也不回显密码。
- **权限可见性**：`viewer` 只能浏览；写按钮隐藏，服务端仍会 403 兜底。

## 相关页面

- [[concepts/auth-rbac]]、[[flows/role-permission-change]]
- [[entities/backend-users-router]]、[[entities/backend-rbac-router]]、[[entities/backend-deps-authz]]
- [[entities/frontend-users-view]]、[[entities/frontend-api-client]]
- 验收：[[concepts/testing-verification]]（E2E console 用例覆盖新增/搜索/编辑/停用/删除）
