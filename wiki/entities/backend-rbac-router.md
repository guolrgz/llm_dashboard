---
title: 角色与权限路由（/api/roles、/api/permissions）
source_files:
  - backend/app/routers/rbac.py
  - backend/app/catalog.py
  - backend/app/deps.py
  - backend/app/seed.py
updated: 2026-11-18
tags: [entity, backend, rbac]
---

> 所属模块：[[modules/backend]]

# 角色与权限路由（`/api/roles`、`/api/permissions`）

RBAC 路由把 `roles`、`permissions`、`role_permissions` 三张表暴露成控制台的"角色管理"与
"权限管理"两页：查看角色及其权限/成员数、查看按组分好的权限目录、以整体替换方式保存角色
权限绑定、查看某角色下的用户。

## 端点与权限

| 方法 | 路径 | 函数 | 权限 |
|---|---|---|---|
| GET | `/api/roles` | `list_roles()` | `rbac.view` |
| GET | `/api/permissions` | `list_permissions()` | `rbac.view` |
| PUT | `/api/roles/{role_id}/permissions` | `update_role_permissions(role_id, payload)` | `rbac.manage` |
| GET | `/api/roles/{role_id}/users` | `list_role_users(role_id)` | `rbac.view` |

## 关键函数

| 名称 | 说明 |
|---|---|
| `_serialize_role(conn, row)` | `{id, key, name, description, isSuper, permissions, userCount}`；超管的 permissions 是 `["*", *全部键]` |
| `list_roles()` | 按 `id ASC` 返回全部 5 个角色，逐个统计成员数 |
| `list_permissions()` | 返回 `items`（扁平）与 `groups`（按 `group_key` 聚合、保持 `id` 顺序） |
| `update_role_permissions(role_id, payload)` | 校验角色存在/非超管/权限键合法，事务内"先删后插"整体替换 |
| `list_role_users(role_id)` | 返回 `{items: [{id, username, status}], total}` |

`/api/permissions` 的 `groups` 是惰性构造的：按 `permissions.id` 顺序扫一遍，第一次遇到某个
`group_key` 时创建 `{key, label, items: []}` 并追加，因此分组顺序与权限目录定义顺序一致
（dashboard → users → rbac → models → keys → quota → traffic → alerts → settings）。

## 保存角色权限的流程

1. 读角色行；不存在 → 404；`is_super` → 409（超管不可改）。
2. `permissions` 必须是数组；逐项 `strip()`、去重、丢弃空串；非字符串 → 400。
3. 从 `permissions` 表取全部合法键，任何未知名（`*` 除外）→ 400 并在 `details.invalid` 列出。
4. 过滤掉 `*`（超管语义不落库），`DELETE FROM role_permissions WHERE role_id = ?`，
   再逐条 `INSERT OR IGNORE`，最后 `commit()`。
5. 返回 `{"role": _serialize_role(...)}`，前端可直接用返回值刷新卡片。

"整体替换"而非增量更新，是为了让前端"勾选框 → 提交完整集合"的交互与后端语义一致，也避免
并发保存时的差异合并问题。

## 调用链与调用方

```
GET /roles → _serialize_role → role_permissions + users 计数
PUT /roles/{id}/permissions
  └─ SELECT roles → 校验 → SELECT permissions（合法键）
       └─ DELETE role_permissions + INSERT ... → commit → 重新序列化
GET /roles/{id}/users → users 表按 role_id 过滤
```

权限变更的生效路径不在本模块：`deps.get_current_user` 每次请求都重新读 `role_permissions`，
所以保存后下一次请求立即按新权限判定，无需重新登录。见 [[flows/role-permission-change]]。

## 数据与副作用

- 读：`roles`、`permissions`、`role_permissions`、`users`。
- 写：仅 `role_permissions`（整体替换）。不写 `roles`——系统没有角色的增删改接口，5 个角色是
  固定的目录数据。
- 超管的"全部权限"是序列化时合成的，不占 `role_permissions` 行；因此库中查询超管绑定会得到
  空集合，这是正常现象。
- 权限目录本身由 `seed._seed_catalog` 从 `catalog.PERMISSIONS` 用 `INSERT OR IGNORE` 灌入，
  运行期只读。

## 边界与错误处理

| 场景 | 结果 |
|---|---|
| 角色不存在 | 404 `not_found` |
| 修改超管角色 | 409 `conflict` "超级管理员固定拥有全部权限，不可修改" |
| `permissions` 不是数组 / 含非字符串 | 400 `validation_error` |
| 含未知权限键 | 400 `validation_error`，`details.invalid` 给出清单 |
| 传空数组 | 合法：清空该角色全部权限 |

## 坑与注意点

- **可以把自己锁死**：`admin` 角色拥有 `rbac.manage` 与 `users.manage`，管理员若把自己的角色
  权限清空，下一次请求立刻 403；如果同时没有其他可登录的超管，系统将无法恢复（只能改库）。
  接口没有任何"至少保留 rbac.manage / users.manage"的保护。
- **没有角色 CRUD**：不能新增/重命名/删除角色；`catalog.ROLES` 改动后旧库不会自动更新
  （种子用 `INSERT OR IGNORE`，且 `ensure_seed` 的版本检查有缺陷，见
  [[entities/backend-seed-data]]）。
- **超管权限不可编辑但成员可改**：`PUT /users/{id}` 可以把用户设为超管角色，也可以把最后一名
  超管改成别的角色——RBAC 侧的"固定全部权限"保护不了这种降级。
- **`*` 会被静默丢弃**：payload 里传 `"*"` 通过校验但不会落库，返回的权限列表也不含它
  （只有 `is_super` 角色才合成 `*`）。前端不要用 `*` 表达"全选"。
- **`userCount` 包含停用用户**：统计的是 `users.role_id` 行数，不区分 `status`；控制台卡片上的
  "成员数"因此可能大于可登录人数。
- **权限键与 UI 文案强耦合**：`catalog.PERMISSIONS` 同时是 API 契约与权限页展示文案，新增权限
  必须同时改 `catalog.py` 和消费它的路由，否则权限页会出现"能勾但没人校验"的项。

## 相关页面

[[modules/backend]] · [[entities/backend-deps-authz]] · [[entities/backend-users-router]] ·
[[entities/backend-seed-data]] · [[concepts/auth-rbac]] · [[flows/role-permission-change]]
