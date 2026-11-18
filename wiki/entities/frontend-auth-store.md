---
title: 前端认证状态 auth store
source_files:
  - src/stores/auth.js
updated: 2026-11-18
tags: [entity, frontend, auth]
---

> 所属模块：[[modules/frontend]]

# 前端认证状态 auth store

`src/stores/auth.js` 用一个 Vue `reactive` 对象承载全局登录态：令牌、用户快照、权限列表、加载/就绪/错误标志，以及 `login`/`fetchMe`/`logout`/`hasPerm`。它不依赖 Pinia，模块级单例即全局状态。

## 用途与职责

- 把“当前是谁、能做什么”变成可响应的单一数据源，供外壳（用户名/角色）、路由守卫（会话校验）和页面（权限可见性）共同读取。
- 负责 token 与用户快照的持久化：`localStorage['llm_token']`、`localStorage['llm_user']`（实际读写委托给 [[entities/frontend-api-client]]）。
- 把后端用户结构规整为前端约定的 `permissions: string[]`。
- 提供 `ready` 语义，区分“有本地快照”与“已向后端确认过会话”。
- 在收到客户端 401 广播时同步清空内存态，避免页面继续拿旧用户渲染。

## 状态字段

| 字段 | 类型 | 含义 |
|---|---|---|
| `token` | string | 当前 Bearer 令牌，初始来自 `getToken()` |
| `user` | object/null | 用户资料快照（含 `role`、`roleName`、`permissions`） |
| `permissions` | string[] | 归一化后的权限键，超级管理员含 `'*'` |
| `loading` | boolean | 登录/拉取当前用户进行中 |
| `ready` | boolean | 是否已完成一次服务端会话确认 |
| `error` | string/null | 最近一次登录失败的可展示文案 |
| `lastError` | ApiError/null | 最近错误对象，供页面读 `status/code` |

`state` 是一个不可枚举的 getter，指向自身（`auth.state === auth`），用于兼容 `store.state` 写法又不会在序列化时自引用。

## 核心方法

| 方法 | 行为 |
|---|---|
| `login(username, password)` | `POST /api/auth/login`（`auth:false`，20s 超时）→ `applySession` → 返回 `auth.user`；失败写 `error/lastError` 并抛出 |
| `fetchMe()` | `GET /api/auth/me` → 取 `data.user || data` → `applyUser` → `ready = true`；401/403 时 `resetSession()` 后抛出 |
| `logout()` | `POST /api/auth/logout`（8s）；无论网络成败都在 `finally` 里本地清空 |
| `hasPerm(key)` | 见下方判定规则 |
| `hasAnyPerm(keys)` | 空数组视为放行，否则任一命中 |
| `hasRole(role)` | 匹配 `user.role` 或 `user.roleName`，并兜底超管角色名 |
| `clear()` | 仅清本地会话，不发请求 |

内部辅助：`applyUser()` 写 user/permissions 并落快照；`applySession()` 兼容 `token`/`accessToken`/`access_token` 三种字段；`resetSession()` 同时清 localStorage 与内存字段；`normalizePermissions()` 过滤非字符串并去重兜底超管 `'*'`。

## 登录与会话时序

1. 应用启动：`token = getToken()`、`user = getStoredUser()`、`permissions = normalizePermissions(user)`，此时 `ready = false`。
2. 路由守卫发现 token 但未 ready → `await fetchMe()`；成功则放行，失败（401/403）则清会话回登录页，见 [[entities/frontend-router-guard]]。
3. 登录页提交 → `auth.login()` → `applySession()` 同时写入 token、user、permissions，并置 `ready = true`。
4. 页面跳转后各视图用 `auth.hasPerm()` 决定按钮可见性；外壳用 `auth.user.nickname/roleName` 渲染顶栏。
5. 退出 → `auth.logout()` 先请求吊销，再本地清空；即使后端不可达也不会卡住用户。

## 权限判定规则

`hasPerm(key)` 依次判断：

1. `key` 为空 → `true`（视为“无要求”）。
2. `permissions` 含 `'*'` → `true`；含精确 key → `true`。
3. `key` 以 `.` 分段，若含 `<group>.*` → `true`（为通配权限预留）。
4. `user.isSuper === true` 或 `user.isSuperAdmin === true` → `true`（防御性兜底；后端实际通过返回 `'*'` 表达超管）。
5. 否则 `false`。

后端 `GET /api/auth/me` 返回的 `permissions` 对超管是 `["*", ...全部权限键]`，对普通角色是角色绑定键列表；前端不做二次合并。

## 状态与副作用

- **请求**：仅 `login`/`fetchMe`/`logout` 三个端点，均走统一客户端；异常不吞掉，交由调用方决定文案。
- **localStorage**：token 与 user 双写；`clearToken()` 会把两者一起删，避免“有用户快照却没有 token”的残留态。
- **全局事件**：模块加载时注册 `window.addEventListener('llm:unauthorized', ...)`，收到后清空 `token/user/permissions/ready`，但**不**清 localStorage（客户端 401 处理已清）。
- **响应式**：`auth` 是 `reactive`，模板里 `auth.user` 变化会自动重渲染；模块顶层先执行一次权限归一化，保证首屏就有可用权限数组。

## 坑与注意点

- `ready` 只表示“向后端确认过”，不表示“永不过期”；令牌过期后要等下一次请求 401 才被动退出，没有前端定时续期/倒计时。
- 本地用户快照会让刷新首屏立即显示用户名与按钮，但它是可篡改的 UX 缓存；真正的权限校验在 [[entities/backend-deps-authz]]，参见 [[concepts/security-posture]]。
- `hasPerm()` 的 `group.*` 与 `isSuper` 分支在当前后端契约下都不会被触发（超管直接给 `'*'`），属于扩展位；不要据此假设后端支持组通配。
- 角色权限被其他管理员修改后，当前会话的 `permissions` 不会自动刷新；需要刷新页面或重新 `fetchMe()`，页面按钮可能短暂“过时”。
- `useAuth()` 返回的是同一个 reactive 对象而非 `ref`，解构（`const { user } = useAuth()`）会丢掉响应性；应保留对象引用或 `toRefs`。
- `logout()` 在请求失败时仍会本地登出，服务端令牌可能直到过期才失效；对安全敏感场景需提示“服务端吊销失败”。
- `error` 只服务登录页；`fetchMe()` 失败只写 `lastError` 不写 `error`，避免路由守卫期间弹出全局错误。
