---
title: 前端登录页 LoginView
source_files:
  - src/views/LoginView.vue
updated: 2026-11-18
tags: [entity, frontend, auth]
---

> 所属模块：[[modules/frontend]]

# 前端登录页 LoginView

`LoginView.vue` 是唯一的公开页面：左侧深色品牌叙事、右侧白色登录卡。它不渲染侧栏/顶栏（由 [[entities/frontend-shell]] 的 `isLogin` 分支保证），提交成功后按 `redirect` 查询参数回跳。

## 用途与职责

- 收集用户名/密码，调用 [[entities/frontend-auth-store]] 的 `auth.login()`。
- 前端做必填校验与字段级错误高亮；服务端错误按状态码翻译成中文。
- 提供“演示账号 / 一键填入”，把 `admin / admin123` 写进表单（不自动提交）。
- 登录成功后 `router.replace()` 到安全的站内地址，避免退回登录页。
- 通过 `safeRedirect()` 阻断开放重定向。

## 模板结构

```
.login-page（两栏 grid）
├─ aside.login-brand（aria-hidden，纯装饰）
│  ├─ 两个模糊光晕 .login-brand-glow
│  └─ 品牌头 + 标题 + 三条卖点 + 英文页脚
└─ section.login-main
   └─ .login-card
      ├─ h1 欢迎登录 + 移动端 logo
      ├─ form.login-form
      │  ├─ 用户名（图标 + input + fieldError）
      │  ├─ 密码（图标 + input + 眼睛按钮 + fieldError）
      │  ├─ p.login-alert（role="alert"，仅错误时）
      │  └─ button.login-submit（loading 时 spinner + “登录中…”）
      ├─ .login-demo（admin / admin123 + 一键填入）
      └─ .login-foot 版权
```

品牌区在 ≤860px 直接 `display:none`，登录卡改用 `.login-mobile-logo`；≤1100px 收窄品牌列宽。

## 状态与关键函数

| 名称 | 说明 |
|---|---|
| `username` / `password` | `v-model`；用户名 `.trim` |
| `showPassword` | 切换密码框 `type` |
| `fieldError` | `'username'` / `'password'` / `''`，控制 `has-error` 样式 |
| `errorMessage` | 表单顶部错误条文案 |
| `usernameEl` / `passwordEl` | 模板 ref，用于聚焦 |
| `submitting` | 直接取 `auth.loading`，与 store 共用加载态 |

- `fillDemo()`：填 `admin`/`admin123`，清空错误，不聚焦、不提交。
- `onSubmit()`：先 `if (submitting) return`；清错误；用户名/密码为空时分别设置 `fieldError` + `errorMessage` 并聚焦；然后 `await auth.login(...)`，成功后 `await router.replace(safeRedirect(route.query.redirect))`。
- 失败分支：`401` → “用户名或密码错误，请重新输入”；`403` → “账号已被停用，请联系管理员”；`429` → “尝试次数过多，请稍后再试”；其余用 `err.message` 兜底；统一清空密码并聚焦密码框。
- `onMounted()`：自动聚焦用户名，减少一次点击。

## safeRedirect 规则

只接受“以单个 `/` 开头、不以 `//` 开头、不以 `/login` 开头”的字符串；其余（含数组、外链、协议相对 URL、登录页自身）一律回 `/`。登录后使用 `replace` 而非 `push`，浏览器后退不会回到登录页。

## 数据流与调用链

1. 路由守卫发现未登录 → `/login?redirect=<to.fullPath>`，见 [[entities/frontend-router-guard]]。
2. 用户提交 → `auth.login()` → [[entities/frontend-api-client]] `POST /api/auth/login` → 后端 [[entities/backend-auth-router]] 校验 PBKDF2、签发 HS256。
3. 成功：`applySession()` 写 token/用户快照 → 本页 `router.replace(safeRedirect(...))` → 守卫二次校验（此时 `ready` 已为 true，直接放行）。
4. 失败：`ApiError` 留在本页展示；401 不会触发客户端的全局 401 跳转，因为登录请求显式 `auth:false`。

完整时序与后端参与方见 [[flows/login-session]]。

## 错误/加载/空态

- 加载：按钮文字变“登录中…”，加 spinner，输入框与演示填入按钮全部 `disabled`（`:disabled="submitting"`）。
- 字段错误：红框 + 顶部错误条；任意输入框 `@input` 都会清掉 `fieldError`，但 `errorMessage` 只在下次提交时清空。
- 服务端错误：`role="alert"` 的错误条，视觉上只有文字 + 感叹号图标，不自动消失。
- 空态不存在；页面始终有完整表单。

## 坑与注意点

- `errorMessage` 在用户修改输入时不会自动消失（只有 `fillDemo` 与再次提交会清），错误文案可能短暂与当前输入不一致。
- `403` 的文案是“账号已被停用”，但登录接口的 403 也可能来自其它策略；若后端扩展 403 语义，这里需要按 `err.code` 细分。
- `safeRedirect()` 拒绝了 `/login` 前缀，因此 `redirect=/login?x=1` 会回 Dashboard；这是防循环的有意行为。
- 品牌区是 `aria-hidden="true"` 的纯装饰，三条卖点文案对屏幕阅读器不可见；若视为有效信息应改为普通内容。
- 眼睛按钮 `tabindex="-1"`，键盘用户无法切换明文；这是为减少 Tab 停靠点的取舍。
- 页面依赖 `IconsSprite` 里的 `#i-logo`，而精灵由 `App.vue` 无条件渲染；若把登录页拆成独立入口，需要自行引入图标或改内联 SVG。
- 演示账号硬编码在前端，仅用于本地/演示环境；生产部署应移除该区块，避免暴露默认凭据，参见 [[concepts/security-posture]]。
