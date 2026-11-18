# Vue.js Security Review Report

## 1. Overview

- **Target:** LLM 推理 Token 流量管理系统（Vue 3 + Vite 控制台 `src/`，含 FastAPI 后端相关配置的人工复核）
- **Scope:**
  - 自动扫描：`src/**`（`.vue` / `.js`）、`static/**`（历史静态版）、`index.html`、`users.html`
  - 人工复核：`src/api/client.js`、`src/views/LoginView.vue`、`src/router/index.js`、`backend/app/{config,main}.py`、`backend/app/routers/{auth,users}.py`、`backend/app/seed.py`、`package.json`
  - 排除：`node_modules/`、`dist/`、`tools/browsers/**`（Chromium 第三方资源）、`tools/libs/**`、`backend/vendor/**`
- **Date:** 2026-11-18
- **Method:** automated scan（`vue_security_scan.py`，23 条规则）+ 人工验证（重定向白名单、数据流、鉴权、依赖审计）
- **Overall risk:** **Medium** — 第一方 Vue 代码未发现可确认的 XSS/注入入口；上线公网前需完成部署加固（演示凭据、CSP、登录限流、密码策略、依赖升级）。

> 扫描说明：直接对仓库根目录运行时，扫描器把 `tools/browsers/**`（随附的 Chromium 资源）中的 11 条命中计入结果；这些不是本应用代码。本报告已按应用范围重新扫描 `src/` 与 `static/` 并逐条人工验证。

## 2. Summary

| Severity | Confirmed | False Positive | Needs Verification |
|----------|-----------|----------------|--------------------|
| High     | 1 | 11（tools/browsers 第三方资源） | 0 |
| Medium   | 4 | 4（`:style` ×2、redirect ×2） | 1（JWT 默认密钥） |
| Low      | 2 | 0 | 0 |

**Top risks：**

1. 仓库内置演示账号（`admin` + 默认演示口令）与两个演示 API Key，若公网部署且未轮换，可直接登录管理后台并消耗配额。
2. 未配置 CSP 与安全响应头（`/` 实测只有 `server/content-type/...`），一旦出现 XSS，JWT 存在 `localStorage` 内可被直接读取。
3. 登录接口无失败限流/锁定、密码仅校验“非空”，暴力破解与弱口令风险随公网暴露放大。

## 3. Findings

### [VULN-001] 内置演示账号与演示 API Key 未在生产前移除/轮换

- **Rule:** MANUAL-001（人工复核）
- **Severity:** High（仅当公网/不可信网络部署时；本地演示为预期设计）
- **Status:** Confirmed
- **Location:** `backend/app/seed.py:275`、`backend/app/seed.py:382-383`
- **Description:** 种子数据为全部 128 个账号写入同一演示口令，并内置两个已知明文演示 Key；README 中也记录了这些凭据。系统一旦被公网访问，攻击者无需任何前置条件即可登录超级管理员并调用推理网关（消耗配额、读取用户/流量数据）。
- **Data flow:** 公开文档/种子数据（source）→ 已知凭据 → 登录/网关鉴权（sink）。
- **Evidence:**
  ```python
  password_hash = security.hash_password("<DEMO_PASSWORD>")  # 所有种子账号同一口令
  demo_keys = [("sk-demo-admin-****", "admin", ...), ("sk-demo-user123-****", "user123", ...)]
  ```
- **Impact:** 未授权访问管理后台与推理网关；Token 配额被盗用；用户邮箱/流量日志泄露；可进一步创建 Key、改配额、停用账号。
- **Recommendation:** 生产部署前：① 删除/禁用演示 Key；② 重置全部种子账号口令；③ 将演示种子改为“仅本地环境开关”（如 `LLM_DASHBOARD_DEMO_SEED=1` 才写入演示凭据）；④ 结合 HTTPS 与登录限流。README 中保留“演示账号”说明仅限本地。

### [VULN-002] 缺少 Content-Security-Policy 与安全响应头

- **Rule:** MANUAL-002（人工复核；参考 VUE-SEC-013/环境加固）
- **Severity:** Medium
- **Status:** Confirmed
- **Location:** `backend/app/main.py:85-101`（静态托管 `dist/`）、`index.html:1-12`
- **Description:** 实测 `GET /` 响应头仅含 `server/content-type/accept-ranges/content-length/last-modified/etag/vary`，没有 `Content-Security-Policy`、`X-Content-Type-Options`、`X-Frame-Options`/`frame-ancestors`、`Referrer-Policy`、`Permissions-Policy`。Vite 入口页也没有 CSP meta。缺少 CSP 时，任何 XSS 都能无障碍执行并读取 `localStorage` 令牌。
- **Data flow:** 任何注入点（若未来引入 `v-html`/第三方内容）→ 脚本执行 → 读取 `localStorage.llm_token`。
- **Evidence:** `curl -D - http://127.0.0.1:8000/` 响应无任何安全头；`index.html` 仅有 charset/viewport。
- **Impact:** 降低纵深防御；配合 VULN-007（令牌在 localStorage）可导致会话劫持；页面可被第三方 iframe 嵌入（点击劫持）。
- **Recommendation:** 生产静态托管统一加安全头（FastAPI 中间件或 nginx）：
  ```python
  @app.middleware("http")
  async def security_headers(request, call_next):
      response = await call_next(request)
      response.headers["Content-Security-Policy"] = (
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
          "img-src 'self' data:; font-src 'self' data:; connect-src 'self'; "
          "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
      )
      response.headers["X-Content-Type-Options"] = "nosniff"
      response.headers["X-Frame-Options"] = "DENY"
      response.headers["Referrer-Policy"] = "no-referrer"
      return response
  ```
  `style-src 'unsafe-inline'` 为 Vue 内联 `:style` 所需；若可改为 class 可进一步收紧。开发态（Vite HMR）单独放宽，仅生产启用严格 CSP。

### [VULN-003] 登录接口无失败限流/锁定（暴力破解）

- **Rule:** MANUAL-003（人工复核）
- **Severity:** Medium
- **Status:** Confirmed
- **Location:** `backend/app/routers/auth.py:29-63`
- **Description:** `POST /api/auth/login` 仅校验用户名/口令，未记录失败次数、无按 IP/账号的退避或锁定，也无审计告警。PBKDF2（260k 次）单次较慢可提高成本，但攻击者仍可分布式尝试；种子账号统一演示口令进一步放大风险。
- **Data flow:** 攻击者字典（source）→ 反复 `POST /api/auth/login`（sink）。
- **Evidence:**
  ```python
  row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
  if row is None or not security.verify_password(password, row["password_hash"]):
      raise ApiError(401, "unauthorized", "用户名或密码错误")
  ```
- **Impact:** 账号接管（尤其 admin）、超管权限滥用；大规模尝试造成资源占用。
- **Recommendation:** 增加登录限流与失败审计：按 `IP + username` 的 60s/15min 滑动窗口（如 5 次/分钟、10 次/15 分钟触发 429 + 指数退避）；连续失败 N 次锁定/告警；记录成功/失败登录日志并接入现有告警表；管理 API 也可加统一速率限制中间件。

### [VULN-004] 密码策略缺失（仅校验非空）

- **Rule:** MANUAL-004（人工复核）
- **Severity:** Medium
- **Status:** Confirmed
- **Location:** `backend/app/routers/users.py:358-361`（创建）、`backend/app/routers/users.py:432-434`（编辑重置）
- **Description:** 创建/编辑用户只要求 `password` 非空，没有最小长度、复杂度、弱口令/复用校验；前端新增用户弹窗也无强度提示。结合登录无限流，弱口令风险显著。
- **Data flow:** 管理员/调用方输入（source）→ `security.hash_password` 存储（sink）。
- **Evidence:**
  ```python
  password = "" if payload.get("password") is None else str(payload.get("password"))
  if not password:
      raise ApiError(400, "validation_error", "密码不能为空")
  ```
- **Impact:** 弱口令账号易被撞库/暴力破解；演示账号口令复用扩大影响面。
- **Recommendation:** 服务端统一密码策略（≥10 位、字母+数字、拒绝常见弱口令与演示口令、禁止与用户名相同）；前后端同源校验提示；管理员重置密码时同样适用；可在设置页展示策略说明。

### [VULN-005] 前端开发依赖 4 个 High 漏洞（npm audit）

- **Rule:** MANUAL-005（人工复核：依赖审计）
- **Severity:** Medium（仅开发工具链；生产产物 `dist/` 不包含）
- **Status:** Confirmed
- **Location:** `package.json`（`vite ^6.4.6` 及 `tinyglobby → fdir → picomatch` 链）
- **Description:** `npm audit --registry=https://registry.npmjs.org` 报告 4 个 high：`picomatch` ReDoS（GHSA-fc5q-39xc-vjpf）经 `fdir`/`tinyglobby` 传递到 `vite`；`npm audit --omit=dev` 为 0 个漏洞。说明漏洞位于开发服务器/构建工具链，不影响已构建的静态产物，但 `npm run dev`/CI 在不可信输入下可被 ReDoS 拖慢。
- **Data flow:** 恶意 glob/模式输入（source）→ vite/tinyglobby/picomatch（sink）。
- **Evidence:** `4 high severity vulnerabilities`（fdir / picomatch / tinyglobby / vite）；`--omit=dev` → `found 0 vulnerabilities`。
- **Impact:** 开发/CI 环境可用性（ReDoS）；不直接进入生产包。
- **Recommendation:** 升级 Vite 到当前安全版本（`npm install -D vite@latest` 后回归 `npm run build` 与 E2E）；将 `npm audit --omit=dev` 与完整 audit 纳入 CI；锁定并定期刷新依赖。

### [VULN-006] JWT 默认密钥回退值（部署配置）

- **Rule:** MANUAL-006（人工复核）
- **Severity:** Medium
- **Status:** Needs Verification（取决于部署是否设置环境变量）
- **Location:** `backend/app/config.py:24-28`
- **Description:** `LLM_DASHBOARD_JWT_SECRET` 未设置时回退到仓库内固定开发密钥。若生产部署忘记覆盖，攻击者可用公开密钥伪造任意用户（含超级管理员）的 HS256 令牌。代码内已有注释提示，但无启动强制校验。
- **Data flow:** 部署环境变量缺失（source）→ `decode_token` 使用公开密钥验证（sink）。
- **Evidence:**
  ```python
  return os.environ.get(
      "LLM_DASHBOARD_JWT_SECRET", "<DEFAULT_DEV_SECRET>"  # 仓库内已知回退值
  )
  ```
- **Impact:** 令牌伪造 → 完全接管系统（绕过登录与权限）。
- **Recommendation:** 生产模式（如 `LLM_DASHBOARD_ENV=production`）启动时若未设置强随机密钥则 `raise` 退出；密钥 ≥32 字节随机；支持密钥轮换（`kid`）；README 安全章节补充部署检查清单。

### [VULN-007] JWT 与用户快照存储在 localStorage

- **Rule:** VUE-SEC-013
- **Severity:** Low（若 VULN-002 不修复、出现 XSS 则升级为 High）
- **Status:** Confirmed
- **Location:** `src/api/client.js:25`、`src/api/client.js:33`、`src/api/client.js:51`、`src/api/client.js:60`
- **Description:** 访问令牌 `llm_token` 与用户快照 `llm_user` 存于 `localStorage`，任何同源脚本（XSS、恶意第三方依赖、浏览器扩展）都可读取令牌。当前第一方代码未发现 XSS 注入点（无 `v-html`/`innerHTML`/`eval`，用户数据均以 `{{ }}` 插值渲染），风险主要是“一旦 XSS 即令牌失窃”的放大效应；用户快照可被篡改，但服务端权限校验不依赖它，篡改仅影响 UI 显示。
- **Data flow:** 登录响应 `token`（source）→ `localStorage.setItem`（sink）→ 任意同源脚本可读。
- **Evidence:**
  ```js
  return localStorage.getItem('<TOKEN_KEY>') || ''
  ...
  localStorage.setItem('<TOKEN_KEY>', token)
  ```
- **Impact:** XSS/恶意依赖场景下会话劫持（令牌有效期内可调用管理 API）；本地快照篡改可误导界面。
- **Recommendation:** 首选改为 httpOnly + Secure + SameSite=Lax/Strict Cookie 会话（同时补充 CSRF token，因 Cookie 认证会引入 CSRF 面）；若保留 Bearer localStorage 方案，必须落地 VULN-002 的严格 CSP、禁止第三方脚本、并在文档中明确该取舍；缩短令牌有效期（当前 8h）+ 支持服务端吊销（已实现 logout 黑名单）。

### [VULN-008] CORS 允许任意来源（开发配置）

- **Rule:** MANUAL-007（人工复核）
- **Severity:** Low（当前 `allow_credentials=False`，Bearer 令牌不在 Cookie 中，经典 CSRF 不适用）
- **Status:** Confirmed
- **Location:** `backend/app/main.py:31-33`
- **Description:** `allow_origins=["*"]` 适用于本地开发与 Vite 代理；生产环境任意站点可携带受害者令牌（若已窃取）调用 API，且不符合最小暴露面原则。
- **Impact:** 扩大令牌泄露后的可利用面；不符合生产安全基线。
- **Recommendation:** 通过环境变量配置可信来源（控制台域名），生产禁止 `*`；保留 `/v1` 网关对第三方业务方开放时，按 Key 维度限流/审计。

## 4. Manual Review Checklist

| Item | Result | Notes |
|------|--------|-------|
| CSRF tokens in form submissions | N/A | 认证使用 `Authorization: Bearer`（非 Cookie），经典 CSRF 不适用；若迁移 httpOnly Cookie 会话必须补充 CSRF token |
| Auth tokens not in localStorage (httpOnly cookies) | **Fail** | JWT 存 `localStorage`（VULN-007），风险由严格 CSP + 无 XSS 注入点缓解 |
| Content-Security-Policy configured | **Fail** | 无 CSP/安全响应头（VULN-002，实测响应头为空） |
| `npm audit` / dependency vulnerabilities | **Fail** | 生产依赖 0；开发工具链 4 high（Vite→tinyglobby→fdir/picomatch ReDoS，VULN-005） |
| 登录失败限流/锁定 | **Fail** | 无限流/锁定（VULN-003） |
| 密码策略 | **Fail** | 仅校验非空（VULN-004） |
| 敏感信息写入日志/响应 | Pass | 未发现 `console.log` 令牌/密钥；API Key 列表仅返回前缀；登录响应不含密码哈希 |
| SQL 注入 | Pass | 全部查询参数化；唯一动态表名来自 `{user,role,key}` 白名单（`quota.py:99`），`alerts.py` 的 WHERE 为内部布尔分支 |
| API Key 存储 | Pass | 明文仅创建/轮换响应返回一次；库存 SHA-256 哈希；吊销/轮换后旧 Key 立即失效 |
| 服务端授权 | Pass | 所有 `/api/*` 统一 `require_permission`；`/v1` 使用 API Key 哈希 + 用户启用校验；前端权限仅作显示控制，不承担安全边界 |
| 开放重定向 | Pass | 登录回跳经 `safeRedirect`（仅站内单 `/` 相对路径，拒绝 `//` 与 `/login`）；`client.js` 只改 hash 路由，非跨站跳转 |
| XSS 注入点（第一方） | Pass | `src/` 与 `static/` 未发现 `v-html`/`innerHTML`/`eval`/`new Function`/`javascript:`；用户数据均插值渲染 |
| Python 依赖漏洞 | Not scanned | 依赖 vendored 且锁定版本（fastapi 0.163.2 / uvicorn 0.54.0 / pydantic 2.14.3 / httpx 0.28.1）；建议 CI 增加 `pip-audit` |

## 5. False Positives / Accepted Risks

| Rule | Location | Reason dismissed |
|------|----------|------------------|
| VUE-SEC-011 | `src/api/client.js:120`、`:126` | 仅拼接/设置同源 hash 路由（`#/login?redirect=...`），不跳转外部 URL；消费端 `LoginView.safeRedirect` 白名单校验，开放重定向不成立 |
| VUE-SEC-006 | `src/components/AppSidebar.vue:26` | `:style` 为编译期常量条件（`'width:28px;height:28px'`），无用户输入 |
| VUE-SEC-006 | `src/components/KpiCard.vue:12` | `:style` 为编译期常量条件（`transform:rotate(180deg)`），无用户输入 |
| VUE-SEC-005/002/009 等 11 条 | `tools/browsers/chromium-*/**` | 随附 Chromium/Playwright 第三方资源，不属于应用代码，也不会打包进 `dist/` |
| VUE-SEC-013 | `localStorage` 用户快照 | 与服务端令牌合并为 VULN-007 跟踪；快照篡改不影响服务端鉴权，仅 UI 显示，接受为低风险 |
| MANUAL-001 演示凭据（本地） | `backend/app/seed.py` | 本地演示/教学场景为预期设计，接受风险；已列为公网部署前置阻断项 |

## 6. Recommended Actions

**1. 立即修复（公网部署前，High）**
- 删除/禁用演示 API Key 与演示口令，生产种子改为显式开关；改名/重置全部种子账号。
- 强制设置 `LLM_DASHBOARD_JWT_SECRET`（≥32 字节随机），生产模式缺失时启动失败。
- 全站 HTTPS；管理后台限制来源 IP/网络（如内网或零信任网关）。

**2. 主动修复（Medium）**
- 增加 CSP 与安全响应头（VULN-002），生产启用严格策略。
- 登录失败限流/退避/锁定 + 登录审计告警（VULN-003）。
- 服务端密码策略（长度/复杂度/弱口令黑名单）（VULN-004）。
- 升级 Vite 及传递依赖并回归构建/E2E；CI 加 `npm audit`（dev 与 prod 分开）与 `pip-audit`（VULN-005 / Python 依赖）。
- 生产 CORS 收敛到控制台域名（VULN-008）。

**3. 维护周期（Low）**
- 评估迁移 httpOnly Cookie 会话（配合 CSRF token）以消除 localStorage 令牌暴露面（VULN-007）；迁移前以严格 CSP 作为补偿控制。
- 令牌有效期可缩短到 2–4h 并增加滑动续期；API Key 轮换纳入例行运维。
- 引入 CI 安全门禁：SAST（Vue/JS）、依赖审计、Secret 扫描。

## 7. References

- Vue.js Security Best Practices: <https://vuejs.org/guide/best-practices/security.html>
- OWASP XSS Prevention Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Scripting_Prevention_Cheat_Sheet.html>
- OWASP CSRF Prevention Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html>
- npm advisory GHSA-fc5q-39xc-vjpf（picomatch ReDoS）: <https://github.com/advisories/GHSA-fc5q-39xc-vjpf>
- 项目内相关文档：`docs/system-architecture.md`（安全与边界）、`README.md`（演示账号与安全说明）
