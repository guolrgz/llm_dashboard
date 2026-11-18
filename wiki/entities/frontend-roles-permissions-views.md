---
title: 前端角色与权限管理页
source_files:
  - src/views/RolesView.vue
  - src/views/PermissionsView.vue
  - src/components/console/ConsoleModal.vue
  - src/components/console/ConsoleState.vue
  - src/components/console/ToastHost.vue
  - src/components/console/useToast.js
updated: 2026-11-18
tags: [entity, frontend, rbac]
---

> 所属模块：[[modules/frontend]]

# 前端角色与权限管理页

`RolesView.vue` 负责“角色 → 权限”的可视化授权：5 张角色卡 + 勾选式权限弹窗；`PermissionsView.vue` 是只读的权限目录与角色×权限矩阵。写操作只发生在角色页，统一走 `PUT /api/roles/{id}/permissions`，权限变更流程见 [[flows/role-permission-change]]。

## RolesView

### 页面结构

```
main.content.console-page.roles-page
├─ .page-head：标题 + 只读模式提示（!canManage）
├─ .stat-row：角色总数 / 关联用户 / 权限项（按 N 个分组）
├─ section.card.roles-card
│  ├─ card-head：刷新按钮
│  ├─ ConsoleState（loading / error / empty）
│  └─ .roles-grid → article.role-card × N
└─ ConsoleModal（权限勾选）+ ToastHost
```

角色卡展示：名称、`isSuper` 徽标或“当前角色”、描述、成员数（`userCount`）、权限数（超管显示“全部”）、`role.key`、权限键串（超管显示 `*`）、右下动作文案（“配置权限/查看权限”）。卡片 `tabindex="0"`，点击或回车打开弹窗。

### 数据加载

- `load()` 用 `Promise.all([GET /api/roles, GET /api/permissions])` 并行拉取；失败统一写 `error` 并弹 Toast，`ConsoleState` 提供“重试”。
- `permissionCount` 是权限分组内 `items` 数量之和；`totalMembers` 是各角色 `userCount` 之和。
- `isOwnRole(role)` 用 `auth.user.roleId === role.id` 标记当前登录角色。

### 权限编辑弹窗

`editor = reactive({open, role, checked, saving})`，`canToggle = canManage && open && role && !role.isSuper`。

- 打开：`editor.checked = isSuper ? allKeys() : role.permissions.filter(k => k !== '*')`；若分组尚未加载则 `loadPermissions()`。
- 勾选：分组头复选框 `:checked="groupCheckedAll"`、`:indeterminate="groupCheckedSome"`，`toggleGroup()` 批量增删；单项 `v-model="editor.checked"`；“全选/清空”工具条与“已选 X / N”计数。
- 提示文案分三种：超管“默认拥有全部权限，不可单独裁剪”、无 `rbac.manage`“仅可查看”、可编辑“勾选后保存，立即生效”。
- 保存 `onPrimary()`：仅当 `canManage && !isSuper` 时调 `savePermissions()`；否则只关闭弹窗。保存体为 `{permissions: [...checked]}`，成功用返回的 `data.role` 合并本地卡片，或至少用 checked 覆盖 `permissions`，然后 Toast 并关闭。
- 主按钮禁用条件：权限目录加载中、目录错误、可编辑但一项未选。`checked.length === 0` 时也拒绝保存（Toast“请至少保留一项权限”）。
- 只读/超管场景：确认按钮文案变“关闭”，`cancelText` 传空串，弹窗底部只剩一个按钮。

### 权限判定

- `canManage = auth.hasPerm('rbac.manage')`；无此权限仍可查看角色与授权详情，只是勾选框不渲染。
- 超管角色永远只读；后端也会对修改超管权限返回 `409`，前端提前用 `isSuper` 阻断，避免无谓请求。
- 角色卡上的“只读模式”提示只在非加载、非错误时出现。

## PermissionsView

- 并行拉 `GET /api/permissions` 与 `GET /api/roles`；`flattenGroups()` 优先用 `permData.items`，否则把 `groups[].items` 拍平，用于统计与矩阵列。
- 顶部三张统计卡：权限项（`items.length`）、权限分组（`groups.length`）、角色数（`roles.length`）。
- “权限目录”：每个分组一张卡，列出 `key`（等宽字体标签）、名称、描述；分组为空时走 `ConsoleState` 空态。
- “角色×权限矩阵”：表头是角色名 + 已授权数（超管显示全部项数），每个分组一个跨列标题行，每个权限一行；有权限显示绿色 ✓，否则灰色 –。表格 `min-width:760px`，容器横向滚动。
- `roleHas(role,key)`：`permissions` 含 `'*'` 或含精确 key；`grantedCount(role)`：超管返回 `items.length`，否则 `permissions.length`。
- 页头右侧仅在 `rbac.manage` 时显示“前往角色管理配置权限”的 `RouterLink`（`to="/roles"`），把写操作集中到角色页。
- 本页没有任何写接口、弹窗或 Toast；错误只以整页 `ConsoleState` 呈现。

## 错误/加载/空态

- 加载：`loading && !roles.length` 才显示全屏 loading，避免刷新时闪空。
- 错误：`ConsoleState type="error"` + `retry` 重新 `load()`；角色页还会额外弹 Toast。
- 空：无角色 / 无权限项分别有专门文案。
- 保存中：`editor.saving` 传给 `ConsoleModal` 的 `confirmLoading`，按钮显示“处理中…”并禁用。

## 坑与注意点

- **当前会话权限不会自动刷新**：改的是角色权限，但 `auth.permissions` 是登录时快照；若改的是自己所属角色，按钮可见性要到刷新/重新 `fetchMe()` 才更新，虽然接口已即时生效。
- **超管权限的“全选”是视觉态**：`checked` 被填成全部键，但勾选框不渲染、保存按钮是“关闭”；这只是展示，不会提交。
- **分组 indeterminate 的只读分支**：`groupCheckedSome()` 在不可切换时返回 `true`，由于此时没有复选框渲染，不影响界面，但读代码时容易误解。
- **角色卡只监听 Enter**：`role="button"` 没有处理 Space，键盘可访问性不完整；也未处理 `aria-pressed`。
- **保存结果依赖响应形状**：代码兼容 `data.role` 与“仅本地覆盖”两种；若后端返回 204，本地仍会更新，但 `userCount` 等字段保持旧值。
- **矩阵没有粘性表头/首列**：角色多、分组多时横向滚动后看不到左侧权限名；`min-width` 在窄屏只能滚动，没有折叠视图。
- **两个页面都假设 `rbac.view`**：路由守卫不校验，直接访问时若后端 403，会落到错误态；页面本身不区分“无 view 权限”和“加载失败”。
- **权限键来自后端而非前端常量**：前端不维护 17 项权限清单，分组/名称/描述全部动态渲染；后端新增权限无需改前端，但文案质量由 `catalog.py` 决定。
