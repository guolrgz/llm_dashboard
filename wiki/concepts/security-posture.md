---
title: 安全态势与加固清单
source_files:
  - vue-security-review-report.md
  - backend/app/main.py
  - backend/app/config.py
  - backend/app/seed.py
  - src/api/client.js
  - backend/app/security.py
  - backend/app/deps.py
updated: 2026-11-18
tags: [concept, security, hardening]
---

# 安全态势与加固清单

## 当前结论（来自 2026-11-18 安全审查）

完整报告：仓库根 `vue-security-review-report.md`（自动化扫描 + 人工验证）。

- **综合风险：Medium**（本地/内网演示可接受；公网部署前需加固）。
- 第一方 Vue 代码**未发现可确认的 XSS/注入入口**：`src/`/`static/` 无 `v-html`、`innerHTML`、`eval`、`new Function`、`javascript:`；用户数据全部用 `{{ }}` 插值渲染。扫描器在根目录命中的 eval/innerHTML 均来自 `tools/browsers/**`（随附 Chromium 第三方资源，非应用代码）。
- 已确认的正向控制：服务端接口级权限强制、参数化 SQL（动态表名走 `{user,role,key}` 白名单）、API Key 只存 sha256 + 前缀、登录/令牌错误统一结构、退出登录黑名单、登录返回不含密码哈希。

## 已确认的问题与优先级

| 优先级 | 问题 | 位置 | 处置建议 |
|---|---|---|---|
| High（公网部署前） | 演示账号/演示 API Key 内置且文档公开 | `backend/app/seed.py` | 删除/禁用演示 Key、重置口令、演示种子加环境开关 |
| Medium（部署配置） | JWT 默认密钥回退值 | `backend/app/config.py:24-28` | 生产强制设置强随机 `LLM_DASHBOARD_JWT_SECRET`，缺失时启动失败 |
| Medium | 无 CSP / 安全响应头 | `backend/app/main.py`、`index.html` | 加 CSP、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy` |
| Medium | 登录无失败限流/锁定 | `backend/app/routers/auth.py` | 按 IP+账号的退避/锁定 + 登录审计告警 |
| Medium | 密码策略缺失（仅非空） | `backend/app/routers/users.py` | ≥10 位、复杂度、弱口令黑名单、禁止与用户名相同 |
| Medium（dev-only） | 前端开发链 4 个 high（Vite→tinyglobby/fdir/picomatch ReDoS） | `package.json` | 升级 Vite 及传递依赖；CI 执行 npm audit / pip-audit |
| Low | JWT + 用户快照存 `localStorage` | `src/api/client.js` | 首选 httpOnly Cookie + CSRF token；或严格 CSP + 短令牌作为补偿控制 |
| Low | CORS `allow_origins=["*"]` | `backend/app/main.py` | 生产收敛到控制台域名 |

## 纵深防御视角

认证/授权链路的“三层边界”：

1. **网络/部署**：HTTPS、可信来源、内网/零信任（尚未内建，由部署保证）。
2. **服务端**：JWT/API Key 鉴权 + 权限键校验 + 参数化 SQL + 统一错误；这是唯一安全边界，前端隐藏按钮不算授权。见 [[concepts/auth-rbac]]、[[entities/backend-deps-authz]]。
3. **浏览器**：CSP（缺失）+ 插值渲染（已满足）+ localStorage 令牌（取舍）。见 [[concepts/design-fidelity]] 的 UI 约束与 [[entities/frontend-api-client]]。

Token 治理面另有一层业务安全：配额/限流防止单个 Key 滥用，失败请求全部审计，便于事后追踪。见 [[concepts/token-governance]]、[[flows/gateway-request]]。

## 公网部署前检查清单

- [ ] 设置 `LLM_DASHBOARD_JWT_SECRET`（≥32 字节随机），确认未使用仓库默认值。
- [ ] 删除/轮换演示账号口令与 `sk-demo-*` Key；关闭演示种子或改默认口令策略。
- [ ] 全站 HTTPS；nginx/FastAPI 增加 CSP 与安全响应头。
- [ ] 登录失败限流/锁定；管理员账号最小化。
- [ ] CORS 收敛到控制台域名；`/v1` 对外时按 Key 限流与审计。
- [ ] 升级 Vite 开发依赖；CI 加入 `npm audit`（dev/prod 分开）与 `pip-audit`。
- [ ] 定期轮换 API Key；关注 `revoked_tokens` 与日志增长。

## 坑与注意点

- **不要在前端做安全决策**：用户快照/权限列表可被改，服务端每次请求都会重新查库校验。
- **不要记录令牌/密钥**：后端日志只记 `key_prefix`，前端 `console` 不打印 token；改动时保持该约束。
- **扫描器根目录运行会混入第三方资源**：应用范围应扫 `src/`、`static/` 与入口 HTML；`tools/browsers/**` 不是应用代码。
- **`vue-security-review-report.md` 是一次性快照**：代码演进后应重新审查并更新该报告与本节。

## 相关页面

- [[concepts/auth-rbac]]、[[concepts/token-governance]]
- [[entities/backend-security]]、[[entities/backend-deps-authz]]、[[entities/backend-auth-router]]
- [[entities/frontend-api-client]]、[[entities/frontend-auth-store]]
- [[flows/login-session]]、[[flows/gateway-request]]
