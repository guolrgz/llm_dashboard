---
title: 前端用户管理页与控制台套件
source_files:
  - src/views/UsersView.vue
  - src/components/console/ToastHost.vue
  - src/components/console/useToast.js
  - src/components/console/ConsoleModal.vue
  - src/components/console/ConsolePagination.vue
  - src/components/console/ConsoleState.vue
  - src/components/console/StatusPill.vue
updated: 2026-11-18
tags: [entity, frontend, users]
---

> 所属模块：[[modules/frontend]]

# 前端用户管理页与控制台套件

`UsersView.vue` 是设计稿 `users.jpg` 的还原页：筛选卡 + 工具栏 + 用户表格 + 分页 + 新增/编辑弹窗 + 确认弹窗 + Toast。它按 `users.view` 展示、按 `users.manage` 开放操作。页面早于通用控制台套件，因此弹窗与分页是自定义实现，只复用了 Toast。

## 页面结构

```
main.content.users-page
├─ .page-head（标题 + 说明）
├─ section.card.users-filter
│  ├─ 搜索框（用户名/用户 ID，回车查询）
│  ├─ 状态分段：全部/启用/停用
│  ├─ 角色分段：全部/管理员/普通用户
│  └─ 查询 / 重置
├─ section.card.users-table-card
│  ├─ .users-toolbar：新增、批量删除、批量启用/停用（仅 canManage）
│  ├─ table.users-table（8 列：勾选/用户ID/用户名/角色/邮箱/创建时间/状态/操作）
│  └─ .users-pagination：总数 + 上一页/页码/下一页
├─ 新增/编辑弹窗 .u-modal
├─ 确认弹窗 .u-modal--confirm
└─ ToastHost
```

## 状态与数据请求

| 名称 | 说明 |
|---|---|
| `userList` / `total` / `page` / `pageSize` | 列表状态，默认每页 10 条 |
| `loading` / `listError` | 列表加载与错误文案 |
| `keyword` / `appliedKeyword` | 输入值与“已生效”关键字分离，点查询才生效 |
| `statusFilter` / `roleFilter` | `all/enabled/disabled` 与 `all/admin/viewer` |
| `selected` | 当前页选中的用户 id 数组 |
| `roles` / `rolesError` / `roleChoices` | 角色下拉数据；接口失败时从当前列表去重回退 |
| `dialog` / `form` / `formError` / `saving` | 新增/编辑弹窗 |
| `confirm` | `{open, running, label, message, action}`，通用确认弹窗 |

请求链：

- `fetchUsers()` → `GET /api/users?page&pageSize&keyword&status&role`，筛选项只在非 `all` 时拼入；成功后若当前页超出最大页会递归纠正，并把 `selected` 裁剪为当前页仍存在的 id。
- `fetchRoles()` → `GET /api/roles`，只在 `canManage` 时于挂载与打开弹窗前调用；失败只写 `rolesError`（页面未展示），靠 `roleChoices` 从列表数据兜底。
- `toggleStatus(user)` → `POST /api/users/{id}/status`，body `{status:'enabled'|'disabled'}`。
- 单删 → `DELETE /api/users/{id}`；批删/批启停 → `POST /api/users/batch`，body `{ids, action:'delete'|'enable'|'disable'}`。
- 新增 → `POST /api/users`；编辑 → `PUT /api/users/{id}`（密码留空表示不改，填写则重置）。

后端契约与删除约束（不能删自己/最后一个超管、Key 级联失效）见 [[entities/backend-users-router]]，完整流程见 [[flows/user-management]]。

## 关键函数

- `applyFilters()`：把 `keyword` 复制到 `appliedKeyword`，`page=1`、清空选择、重新请求。
- `resetFilters()`：清空四个筛选项并立即查询。
- `gotoPage(target)`：夹取到 `[1, pageCount]`，清空选择后请求。
- `toggleAll(event)` / `toggleOne(user)`：页级全选；`watchEffect` 把 `selectAllEl.indeterminate` 设为“部分选中”。
- `openCreate()` / `openEdit(user)`：必要时先拉角色；创建时 `resetForm()` 选默认角色（优先 `viewer`，其次非超管，最后列表首个）；编辑时回填字段。
- `validateForm()`：用户名 ≥3 字符、邮箱必填且正则合法、角色必选、创建必须设密码、改密 ≥6 位。
- `saveUser()`：构造 payload，仅在有值时带 `userNo`/`password`；创建成功回第 1 页；409 映射为“用户名或用户ID已存在”。
- `askDelete` / `askBatchDelete` / `askBatchToggle`：只组装 `confirm`，真正请求在 `runConfirm()`，成功后统一 `fetchUsers()`。

## 权限可见性

`canManage = auth.hasPerm('users.manage')`：

- 隐藏工具栏三个按钮、表头/行内复选框、行内“编辑/停用/删除”，操作列显示“只读”。
- 只读用户仍能筛选、分页、查看列表（依赖 `users.view`）。
- 所有写操作函数开头还有 `if (!canManage.value) return`，避免绕过 UI 触发。

## Toast 与 console 套件

- `useToast()` 返回 `{toasts, push, dismiss, success, error, info}`；队列最多保留 4 条（`slice(-3)` 再追加），成功 2.6s、错误 3.6s 自动消失。`ToastHost` 用 `Teleport to="body"` + `TransitionGroup` 渲染，`aria-live="polite"`。
- `errorText(err, fallback)` 把 `network_error`、401、403、`token_expired` 归一为中文；页面所有 catch 都用它兜底。
- 用户页**没有**用 `ConsoleModal` / `ConsolePagination` / `ConsoleState` / `StatusPill`：弹窗、分页、错误行都是本页手写，样式来自全局 `styles.css` 的 `u-*` 类。其它治理页才使用 console 套件（`ConsoleModal` 支持 `Escape` 关闭与 `body.console-modal-locked`；`ConsolePagination` 用 `change` 事件；`ConsoleState` 有 loading/error/empty 三态与 `retry`；`StatusPill` 有 6 种 tone）。

## 错误/加载/空态

- 首次加载：表体 `colspan=8` 显示“加载中…”。
- 错误：表体显示错误文案 + “重试”链接，同时弹一条 Toast（信息重复）。
- 空：`listError` 优先于空态；空数据显示“该页暂无符合条件的用户”。
- 操作中：查询按钮变“查询中…”，保存按钮变“保存中…”，确认弹窗按钮变“处理中…”并禁止关闭。
- 角色接口失败：无可见提示，只影响新增/编辑下拉的完整度。

## 坑与注意点

- **角色筛选只有“管理员/普通用户”**：`roleOptions` 硬编码 `all/admin/viewer`，`operator`、`developer`、`super_admin` 无法直接筛；这是照抄设计稿的取舍，不是后端限制。
- **筛选不即时生效**：点状态/角色只改高亮，必须再点“查询”才发请求；只有关键字支持回车。用户会看到“选中项与列表不一致”的中间态。
- **表头列映射刻意错位**：“用户ID”列显示 `username`，“用户名”列显示 `userNo`，注释说明按 `users-design-spec §10` 照抄；对接真实数据时极易被误读。
- **页内选择**：全选只选当前页；刷新/筛选/翻页都会裁剪或清空 `selected`，批量操作范围永远是“当前页可见且仍存在”的用户。
- **批量删除用 `aria-disabled` 而非 `disabled`**：按钮仍可点击、聚焦，只是处理器里 `!selected.length` 直接返回；键盘/自动化会看到可点击但无反应的按钮。
- **邮箱是必填**：后端契约里 `email` 可空，但前端 `validateForm()` 强制合法邮箱，导致无法创建“无邮箱”用户。
- **弹窗无 Esc/焦点陷阱**：自定义 `u-modal` 只支持点遮罩和关闭按钮；Tab 可跑到背后的页面。`ConsoleModal` 才有 Esc 与锁滚动。
- **`rolesError` 是死状态**：写入了但模板从不展示，角色接口失败时用户只会发现下拉项变少。
- **每页 10 条但表格只露约 4 行**：`.users-table-wrap` 固定 `max-height:299px` 内部滚动、表头 sticky；128 个种子用户会分 13 页，与设计稿的 5 页不同。
