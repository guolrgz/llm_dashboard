---
title: 流程 — 角色权限变更与即时生效
source_files:
  - src/views/RolesView.vue
  - src/views/PermissionsView.vue
  - backend/app/routers/rbac.py
  - backend/app/catalog.py
  - backend/app/deps.py
  - backend/app/db.py
updated: 2026-11-18
tags: [flow, rbac, permissions]
---

# 角色权限变更与即时生效

## 参与者

- 前端：[[entities/frontend-roles-permissions-views]]（`RolesView.vue` + `PermissionsView.vue`）
- 后端：[[entities/backend-rbac-router]]（`/api/roles`、`/api/permissions`、`PUT /api/roles/{id}/permissions`）、[[entities/backend-deps-authz]]（权限实时读取）、`catalog.py`（权限目录与角色默认定义）
- 数据：`roles`、`permissions`、`role_permissions`、`users.role_id`

## 步骤（按调用顺序）

### 1. 查看角色与权限矩阵

1. 角色管理页：`GET /api/roles` → 每个角色含 `id/key/name/description/isSuper/permissions/userCount`；页面展示 5 张角色卡（成员数、权限数、权限键预览）。
2. 权限管理页：`GET /api/permissions` → `items`（17 条，含 `groupKey/groupLabel/name/description`）与 `groups`（9 组）；再结合 `GET /api/roles` 的权限键渲染“角色 × 权限”矩阵（5 列 × 17 行）。
3. 无 `rbac.view` 时页面显示无权限错误态（路由本身未做 403 页，页面级兜底）。

### 2. 打开角色权限弹窗（需要 `rbac.manage`）

1. 点击角色卡「配置权限」→ 弹窗展示 9 组权限的勾选状态（当前角色的 `permissions` 回填）。
2. 超级管理员角色 `isSuper=true`：弹窗只读（或隐藏编辑），因为服务端 `PUT` 会返回 409「超级管理员固定拥有全部权限」。
3. 普通角色：勾选/取消后点保存。

### 3. 保存变更

1. 前端 `PUT /api/roles/{id}/permissions`，body `{permissions: [key, ...]}`。
2. 后端 `rbac.py::update_role_permissions`：
   - `require_permission("rbac.manage")`；
   - 角色存在性校验（404）；
   - `is_super` → 409；
   - 每个权限键必须在 `permissions` 目录中（否则 400）；
   - **事务内** `DELETE FROM role_permissions WHERE role_id=?` 后批量插入新绑定；
   - 返回更新后的角色。
3. 前端收到成功 → Toast + 重新拉取角色列表（`fetchRoles`），弹窗关闭。

### 4. 变更如何“立即生效”

- `deps.get_current_user()` 在**每次请求**都会根据 `users.role_id` 读取 `role_permissions` 并组装权限列表（无缓存）。所以保存后，该角色下所有用户的下一个请求就按新权限判定。
- 已经登录的浏览器不会自动刷新自己的权限快照（`auth.user.permissions`），但任何受保护接口都会按服务端新权限返回 403/200；若需要前端按钮立即可见，用户需刷新/重新 `fetchMe`。
- 超管始终拥有 `*`，不受角色权限变更影响。

### 5. 前端可见性

- 角色/权限页的编辑按钮由 `auth.hasPerm('rbac.manage')` 控制；`viewer`/`developer` 打开只读。
- 权限矩阵的“授权格”由角色 `permissions` 数组决定（含 `*` 的超管列全亮）。

## 状态与副作用

- 修改角色权限影响的是“角色”，不是单个用户；要调整个人权限可改 `users.role_id`（用户编辑页）。
- `catalog.py` 中的 `ROLES` 仅是种子默认值；已运行库以 `role_permissions` 为准（改种子不会覆盖已有绑定）。
- 权限键是前后端共同契约（见 `docs/api-contract.md`），新增权限键需要同时更新 `catalog.py` 与前端 `hasPerm` 使用处。

## 坑与注意点

- **超管不可编辑**是刻意保护：否则可能把系统锁死；前端应只读展示。
- **事务替换**：`PUT` 是全量替换而非增量合并，前端必须提交完整勾选集合。
- **缓存不存在**：不要假设权限修改要重启或重新登录；但前端显示快照可能滞后，刷新即可。
- **角色删除**：当前接口未提供角色删除（5 个内置角色），如需新增角色要扩展 `roles` 与 UI。

## 相关页面

- [[concepts/auth-rbac]]、[[concepts/security-posture]]
- [[entities/backend-rbac-router]]、[[entities/backend-deps-authz]]、[[entities/backend-security]]
- [[entities/frontend-roles-permissions-views]]、[[entities/frontend-auth-store]]
- [[flows/login-session]]、[[flows/user-management]]
