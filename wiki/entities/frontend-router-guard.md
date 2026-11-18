---
title: 前端路由与登录守卫
source_files:
  - src/router/index.js
  - src/main.js
updated: 2026-11-18
tags: [entity, frontend, routing]
---

> 所属模块：[[modules/frontend]]

# 前端路由与登录守卫

`src/router/index.js` 定义 8 条路由与全局 `beforeEach` 守卫；`src/main.js` 负责在首次导航（含守卫里的会话校验）完成后再挂载应用，避免登录页闪出侧栏。

## 用途与职责

- 声明页面路由、页面标题（`meta.title`）与懒加载边界。
- 用 hash 模式承载 SPA，保证 FastAPI 静态托管与 `index.html` 直接打开都能工作。
- 在进入业务路由前确认“有 token 且用户有效”，刷新/新标签页时补拉 `/api/auth/me`。
- 未登录跳转 `/login?redirect=<原路径>`，登录后由登录页回跳。
- 已登录用户访问 `/login` 时直接送回 Dashboard，避免重复登录。

## 路由表

| path | name | 组件 | meta | 备注 |
|---|---|---|---|---|
| `/login` | login | `LoginView.vue` | `title:'登录', public:true` | 唯一公开路由 |
| `/` | dashboard | `DashboardView.vue` | `title:'Dashboard'` | 同步导入 |
| `/users` | users | `UsersView.vue` | `title:'用户管理'` | 同步导入 |
| `/roles` | roles | `RolesView.vue` | `title:'角色管理'` | `import()` 懒加载 |
| `/permissions` | permissions | `PermissionsView.vue` | `title:'权限管理'` | 懒加载 |
| `/traffic` | traffic | `TrafficView.vue` | `title:'流量监控'` | 懒加载 |
| `/models` | models | `ModelsView.vue` | `title:'模型管理'` | 懒加载 |
| `/settings` | settings | `SettingsView.vue` | `title:'系统设置'` | 懒加载 |
| `/:pathMatch(.*)*` | — | — | — | 重定向 `/` |

登录、Dashboard、用户页被同步打进首包；其余 5 页按路由分包。`scrollBehavior` 统一回到顶部。

## 守卫时序（beforeEach）

守卫是 `async` 函数，返回 `true` 放行、返回 location 重定向。

**A. 公开路由（`/login`）**

1. 没有 token → 放行，正常显示登录页。
2. 有 token 且 `auth.user && auth.ready` → 重定向 `/`。
3. 有 token 但未 ready → `await auth.fetchMe()`；成功重定向 `/`；失败时若是 401/403 就 `auth.clear()`，然后**仍停在登录页**（`return true`）。

**B. 业务路由**

1. 没有 token → `{ path:'/login', query:{ redirect: to.fullPath }, replace:true }`。
2. 已有 `auth.user` 且 `ready` → 放行，不重复请求。
3. 否则 `await auth.fetchMe()`：
   - 成功 → 放行；
   - 401/403 → `auth.clear()` 并带 `redirect` 去登录；
   - 其他错误（后端 5xx/网络断）→ 若本地还有用户快照则放行，由页面展示错误态；否则去登录。

`isAuthError()` 只把 401/403 视为会话失效；5xx 不会误踢用户。`loginLocation()` 用 `to.fullPath` 保留查询串与 hash 前的路径。

## 标题与挂载

- `afterEach` 把 `meta.title` 拼成 `${title} · LLM推理 · Token 流量管理系统`；无 title 时用总标题。
- `App.vue` 里另有一个 `route.meta.title` watcher 做同样的事，属于兜底重复。
- `main.js` 先 `app.use(router)`，再 `router.isReady().then(() => app.mount('#app'))`。首次导航若触发 `fetchMe`，挂载会等它完成，因此首屏可能短暂空白（`#app` 为空），但不会出现“先闪外壳再跳登录”。

## 调用链

- 首次访问 `/users` → 守卫 → `getToken()` → 无 token → `/login?redirect=/users` → [[entities/frontend-login-view]] 登录成功 → `router.replace(safeRedirect(...))` → 再进守卫。
- 刷新 `/` → 有 token、无 `ready` → [[entities/frontend-auth-store]] `fetchMe()` → [[entities/frontend-api-client]] `GET /api/auth/me` → 后端 [[entities/backend-auth-router]] / [[entities/backend-deps-authz]]。
- 任意页面请求 401 → 客户端清 token、改 hash 到 `#/login?redirect=...` → 客户端事件让 auth store 清空 → 守卫在登录页分支放行。
- 完整时序见 [[flows/login-session]]；权限语义见 [[concepts/auth-rbac]]。

## 坑与注意点

- **守卫只鉴权、不鉴权能**：没有 `meta.permission`，`traffic.view`/`models.view`/`settings.view`/`rbac.manage` 都由页面自行判断并渲染“无权查看/只读模式”。没有权限的用户可以进入页面框架，只是看不到数据按钮。
- **hash 路由**：URL 形如 `/#/traffic`；客户端 401 直接改 `window.location.hash`，与 `router.push` 并行时可能产生一次多余导航，`redirecting` 标志只防客户端内部并发。
- **token 存在即视为可能已登录**：守卫不看 token 是否过期，过期只能靠 `fetchMe` 的 401 发现；每次冷启动都会多一次 `/api/auth/me` 请求。
- **离线宽容**：后端临时不可用时，只要本地有用户快照就允许进入业务页；这会放行一个“可能已失效”的会话，页面需自行处理 401/错误态。
- **登录页也会请求**：带 token 访问 `/login` 会触发 `fetchMe`；后端挂掉时会停在登录页而不是报错页，用户可能误以为未登录。
- **重复标题逻辑**：`afterEach` 与 `App.vue` watcher 双写 `document.title`，修改标题文案时两处都要改。
- **懒加载边界**：首包包含 Users 页（设计稿第二张基线页），因此首屏体积比只留 Dashboard 更大；这是为减少用户页首跳等待的取舍。
