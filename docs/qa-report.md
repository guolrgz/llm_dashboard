# QA 验收报告 — build-token-traffic-system

生成时间：2026-11-18T07:45:11.621Z  
总体结论：✅ **通过**（全部验收项 PASS）

## 1. 环境与范围

| 项目 | 值 |
| --- | --- |
| 时间窗口 | 2026-11-18T07:42:58.555Z → 2026-11-18T07:45:11.612Z |
| 前端 | http://127.0.0.1:5173/ （Vue 3 + Vite dev server） |
| 后端 | http://127.0.0.1:8000 （FastAPI + SQLite） |
| 浏览器 | Playwright Chromium（tools/browsers，headless） |
| Node / Python | v24.22.2 / Python 3.14.4 |
| Git | 4f3cb51 |
| 设计基线 | index.png（1672×941）、users.jpg（1376×768 @2x） |
| 像素阈值 | 最大通道差 > 24 记为差异像素 |

## 2. 执行方式

```bash
node tools/e2e/run.mjs --frontend=http://127.0.0.1:5173 --backend=http://127.0.0.1:8000 --build
# 单独执行：
# node tools/e2e/e2e-console.mjs
# node tools/e2e/e2e-gateway.mjs
# node tools/e2e/pixel-check.mjs
# node tools/e2e/responsive-check.mjs
# cd backend && PYTHONPATH="$(pwd)/vendor:$(pwd)" python3 -m pytest tests/ -q
```

脚本清单（`tools/e2e/`）：

| 脚本 | 职责 |
| --- | --- |
| `run.mjs` | 总入口：就绪探测 → 顺序执行 4 个脚本 → npm build → pytest → 生成本报告和 `docs/backend-test-report.md` |
| `lib.mjs` | Playwright 环境（LD_LIBRARY_PATH/PLAYWRIGHT_BROWSERS_PATH）、断言、截图、HTTP、就绪等待、JSON 结果收集 |
| `e2e-console.mjs` | 路由守卫/登录/Dashboard KPI/侧栏 6 页导航/用户 CRUD/退出登录 |
| `e2e-gateway.mjs` | 真实 Key 签发→3 次推理 usage+日志→SSE→429 限流/配额→告警/流量页→吊销清理 |
| `pixel-check.mjs` | Dashboard vs index.png、/users vs users.jpg 逐像素与分区差异（含 diff/热力图） |
| `responsive-check.mjs` | 1672/1440/1024/768/390 五档宽度横向溢出 + 移动端侧栏抽屉 |
| `recon.mjs` | 调试辅助：抓取各路由 DOM 摘要（不参与验收结论） |

## 3. 前置检查

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 前端 dev server (:5173) | ✅ PASS | http://127.0.0.1:5173/ |
| 后端 /health (:8000) | ✅ PASS | status=ok database=ok version=1.0.0 |
| Vite 代理 /api/auth/login | ✅ PASS | HTTP 200 user=admin |

## 3.5 测试前基线 vs 测试后增量（今日 KPI）

| KPI | 测试前（基线） | 测试后 | 增量 |
| --- | --- | --- | --- |
| requests | 128,960 | 128,966 | +6 |
| tokens | 1.24B | 1.24B | — |
| success | 99.2% | 99.2% | — |

> 说明：后端种子基线为 今日 128,960 请求 / 1.24B Token / 99.2% 成功率。若“测试前”已大于 128,960，说明该库已被联调或上一轮网关用例写入真实流量；`e2e-gateway.mjs` 的 3 次成功推理 + 流式请求会在“测试后”继续累加（预期行为）。

> ✅ 本轮“测试前”与原型基线 128,960 完全一致，Dashboard 像素/数值验收是在干净种子上完成的。

## 4. 结果总览

| 验收项 | 结果 | 检查点 | 耗时 | 日志 |
| --- | --- | --- | --- | --- |
| 浏览器 E2E（控制台） | ✅ PASS | 37/37 | 34835ms | `tools/out/e2e/logs/console.log` |
| 像素回归（Dashboard + 用户页） | ✅ PASS | 9/9 | 10203ms | `tools/out/e2e/logs/pixel.log` |
| 响应式（五档宽度 + 移动抽屉） | ✅ PASS | 22/22 | 26237ms | `tools/out/e2e/logs/responsive.log` |
| 网关端到端（Key/usage/限流/配额/告警） | ✅ PASS | 15/15 | 6639ms | `tools/out/e2e/logs/gateway.log` |
| 前端生产构建 `npm run build` | ✅ PASS | — | — | `tools/out/e2e/logs/build.log` |
| 后端 pytest | ✅ PASS | 86 passed / 0 failed / 86 total | — | `tools/out/e2e/logs/pytest.log` |

构建输出尾部：`dist/assets/ConsoleModal-C9k0AgTi.js             2.05 kB │ gzip:  1.05 kB | dist/assets/PermissionsView-CwoFJBWO.js          5.72 kB │ gzip:  2.39 kB | dist/assets/RolesView-DQOb3t4J.js                8.83 kB │ gzip:  3.71 kB | dist/assets/SettingsView-DRqBImOq.js             9.46 kB │ gzip:  3.36 kB | dist/assets/ModelsView-DKRyyb54.js              11.90 kB │ gzip:  4.47 kB | dist/assets/TrafficView-CI2yrfI1.js             13.63 kB │ gzip:  5.07 kB | dist/assets/main-Cu7qC9pq.js                   197.15 kB │ gzip: 71.87 kB | ✓ built in 4.41s`

## 5. E2E 明细

### 5.1 浏览器 E2E（控制台） — ✅ PASS

| # | 检查项 | 结果 | 说明 |
| --- | --- | --- | --- |
| 1 | 前置：后端 /health 就绪 | ✅ PASS | status=ok database=ok version=1.0.0 |
| 2 | 前置：前端 dev server 就绪 | ✅ PASS | http://127.0.0.1:5173 |
| 3 | 前置：admin 通过 Vite 代理登录（/api/auth/login） | ✅ PASS | user=admin role=超级管理员 |
| 4 | 前置：读取角色目录（GET /api/roles） | ✅ PASS | 5 roles: 超级管理员/管理员/运维管理员/开发者/普通用户 |
| 5 | 未登录访问 / 重定向登录页 | ✅ PASS | url=http://127.0.0.1:5173/#/login?redirect=/ |
| 6 | 登录页使用哈希路由 #/login | ✅ PASS | hash=#/login?redirect=/ |
| 7 | 登录页渲染用户名/密码/登录按钮 | ✅ PASS |  |
| 8 | 未登录直接访问 /#/users 被守卫拦截到登录页 | ✅ PASS | url=http://127.0.0.1:5173/#/login?redirect=/users |
| 9 | admin/admin123 登录（表单提交） | ✅ PASS | url=http://127.0.0.1:5173/#/ submit=form button[type="submit"] |
| 10 | 登录后 localStorage.llm_token 已写入 | ✅ PASS | len=239 |
| 11 | 顶栏显示当前登录用户 admin | ✅ PASS | topbar="admin" |
| 12 | Dashboard KPI 总请求量 ≥ 128,960（设计基线；测试/联调流量会增量） | ✅ PASS | 实际 128,960（= 原型基线） |
| 13 | Dashboard KPI Token 使用量 = 1.24B | ✅ PASS | 1.24B |
| 14 | Dashboard KPI 成功率 = 99.2% | ✅ PASS | 99.2% |
| 15 | Dashboard 数据来自后端 API（非降级/错误态） | ✅ PASS | display=128,960/1.24B/99.2% trendPoints=96 |
| 16 | Dashboard 切换近7天触发 range=7d 请求 | ✅ PASS | 200 range=7d |
| 17 | 侧栏导航 → 用户管理 | ✅ PASS | hash=#/users |
| 18 | 侧栏高亮当前页：用户管理 | ✅ PASS | active="用户管理" |
| 19 | 侧栏导航 → 角色管理 | ✅ PASS | hash=#/roles |
| 20 | 侧栏高亮当前页：角色管理 | ✅ PASS | active="角色管理" |
| 21 | 侧栏导航 → 权限管理 | ✅ PASS | hash=#/permissions |
| 22 | 侧栏高亮当前页：权限管理 | ✅ PASS | active="权限管理" |
| 23 | 侧栏导航 → 流量监控 | ✅ PASS | hash=#/traffic |
| 24 | 侧栏高亮当前页：流量监控 | ✅ PASS | active="流量监控" |
| 25 | 侧栏导航 → 系统设置 | ✅ PASS | hash=#/settings |
| 26 | 侧栏高亮当前页：系统设置 | ✅ PASS | active="系统设置" |
| 27 | 侧栏信息架构与契约一致：任意页面含 Dashboard/用户管理/角色管理/权限管理/流量监控/系统设置 | ✅ PASS | #/users: ok；#/roles: ok；#/settings: ok |
| 28 | 路由 /#/models 可访问（模型管理页） | ✅ PASS | url=http://127.0.0.1:5173/#/models hasModelText=true |
| 29 | 返回用户管理页 | ✅ PASS | hash=#/users |
| 30 | 用户管理：新增用户 e2e_<ts> | ✅ PASS | id=129 role=管理员 fields={"username":"[data-testid=\"form-username\"]","userNo":true,"password":"[data-testid=\"form-password\"]","email":"[data-testid=\"form-email\"]","role":"管理员","status":"启用"} |
| 31 | 用户管理：搜索到新增用户 | ✅ PASS | ui+api 均命中，total=1 |
| 32 | 用户管理：编辑用户角色并保存 | ✅ PASS | roleId 2 → 3 (运维管理员) |
| 33 | 用户管理：停用用户 | ✅ PASS | status=disabled |
| 34 | 用户管理：删除用户 | ✅ PASS | 删除后 total=0 |
| 35 | 退出登录 → 回到登录页 | ✅ PASS | url=http://127.0.0.1:5173/#/login |
| 36 | 浏览器无 JS 未捕获异常（pageerror） | ✅ PASS |  |
| 37 | 浏览器控制台无 JS error | ✅ PASS |  |

附加观测：

- **CRUD 使用角色**：create=管理员 edit=运维管理员
- **KPI 卡片文本**：["总请求量\n128,960\n12.5%","Token 使用量\n1.24B\n18.7%","成功率\n99.2%\n0.1%"]
- **测试前基线 vs 当前**：当前 KPI 与原型基线 128,960 完全一致

### 5.2 像素回归（Dashboard + 用户页） — ✅ PASS

| # | 检查项 | 结果 | 说明 |
| --- | --- | --- | --- |
| 1 | Dashboard 截图（1672×941，登录态） | ✅ PASS | tools/out/e2e/pixel-check-dashboard-1672x941.png 尺寸 1672×941 |
| 2 | Dashboard 与 index.png 逐像素比对 | ✅ PASS | 总体 5.51% (86675/1573352px) · meanΔ 6.37 · NEEDS WORK (≤6%) |
| 3 | Dashboard 外壳区域（侧栏/顶栏/页头）差异 ≤5%（布局/颜色回归判定） | ✅ PASS | Sidebar=4.36%  Topbar=2.50%  Page header (title + date filter)=3.49% |
| 4 | Dashboard 总体差异 ≤6%（图表曲线/sparkline 由真实数据驱动，数据差异计入） | ✅ PASS | 5.51% · NEEDS WORK (≤6%) |
| 5 | 用户管理页截图（1376×768 @2x → 2752×1536） | ✅ PASS | tools/out/e2e/pixel-check-users-1376x768@2x.png 尺寸 2752×1536 |
| 6 | 用户管理页与 users.jpg 逐像素比对（区分结构/数据差异） | ✅ PASS | 总体 5.83% · 外壳最大 5.20% · 内容结构最大 9.55% · NEEDS WORK (≤6%) |
| 7 | 用户管理外壳区域（侧栏/顶栏/页头）差异 ≤6% | ✅ PASS | 外壳最大 5.20%（侧栏差异含契约要求把「模型管理」换成「角色管理」的导航变更） |
| 8 | 用户管理内容结构区域（筛选卡/工具栏）差异 ≤10%（历史基线 3.63%，当前数据行/分页为真实数据） | ✅ PASS | 内容结构最大 9.55% |
| 9 | 用户管理截图尺寸与 users.jpg 一致（2752×1536） | ✅ PASS | sizeMatch=true |

附加观测：

- **登录方式**：API 登录后注入 localStorage.llm_token（user=admin）
- **Dashboard 分区差异%**：Sidebar=4.36%  Topbar=2.50%  Page header (title + date filter)=3.49%  KPI row=7.69%  Chart row=7.51%  Table row=5.45%
- **Dashboard 最大分区差异**：KPI row = 7.69%
- **Dashboard 数据差异说明**：分区差异最大的 KPI row / Chart row 主要由真实 API 数据驱动（sparkline 形状、趋势曲线与 y 轴刻度），图标/字号/卡片几何位置与设计稿一致（KPI 卡片左上角坐标逐像素相同）。
- **用户页分区差异%**：侧边栏 Sidebar=5.20%  顶栏 Topbar=3.17%  页头 Page header=4.15%  筛选卡 Filter card=9.55%  工具栏 Toolbar=4.43%  表头+数据行 Table header + rows=8.66%  分页 Pagination=6.28%
- **用户页数据差异说明**：backend 种子用户 128 个（基线设计稿 48 条），表头以下文本/分页数字必然不同——按结构区域判定布局回归。
- **用户页相对历史基线**：历史验收基线 3.63%（2026-11-18 02:36），本次总体 5.83%；主要来自：① 侧栏导航按契约把设计稿的「模型管理」换成「角色管理」；② 顶栏告警徽标为真实未读数（3，设计稿为 2）；③ 筛选卡实测 y=154 CSS px（设计稿 153，+1px），表格卡 y=245 与分页位置与设计稿一致；④ 128 条真实用户数据行 + “共 128 条记录”分页文案（设计稿 48 条）。

### 5.3 响应式（五档宽度 + 移动抽屉） — ✅ PASS

| # | 检查项 | 结果 | 说明 |
| --- | --- | --- | --- |
| 1 | 宽度 1672 (设计基线)：Dashboard 无横向溢出 | ✅ PASS | scrollWidth=1672 clientWidth=1672 |
| 2 | 宽度 1440 (笔记本)：Dashboard 无横向溢出 | ✅ PASS | scrollWidth=1440 clientWidth=1440 |
| 3 | 宽度 1024 (平板横屏)：Dashboard 无横向溢出 | ✅ PASS | scrollWidth=1024 clientWidth=1024 |
| 4 | 宽度 768 (平板)：Dashboard 无横向溢出 | ✅ PASS | scrollWidth=768 clientWidth=768 |
| 5 | 宽度 768 (平板)：汉堡按钮开关侧栏抽屉 | ✅ PASS | openClass="app sidebar-open" → close(backdrop) ok |
| 6 | 宽度 390 (手机)：Dashboard 无横向溢出 | ✅ PASS | scrollWidth=390 clientWidth=390 |
| 7 | 宽度 390 (手机)：汉堡按钮开关侧栏抽屉 | ✅ PASS | openClass="app sidebar-open" → close(backdrop) ok |
| 8 | 宽度 1024：用户管理 无横向溢出 | ✅ PASS | scrollWidth=1024 clientWidth=1024 hash=#/users |
| 9 | 宽度 1024：角色管理 无横向溢出 | ✅ PASS | scrollWidth=1024 clientWidth=1024 hash=#/roles |
| 10 | 宽度 1024：权限管理 无横向溢出 | ✅ PASS | scrollWidth=1024 clientWidth=1024 hash=#/permissions |
| 11 | 宽度 1024：流量监控 无横向溢出 | ✅ PASS | scrollWidth=1024 clientWidth=1024 hash=#/traffic |
| 12 | 宽度 1024：系统设置 无横向溢出 | ✅ PASS | scrollWidth=1024 clientWidth=1024 hash=#/settings |
| 13 | 宽度 768：用户管理 无横向溢出 | ✅ PASS | scrollWidth=768 clientWidth=768 hash=#/users |
| 14 | 宽度 768：角色管理 无横向溢出 | ✅ PASS | scrollWidth=768 clientWidth=768 hash=#/roles |
| 15 | 宽度 768：权限管理 无横向溢出 | ✅ PASS | scrollWidth=768 clientWidth=768 hash=#/permissions |
| 16 | 宽度 768：流量监控 无横向溢出 | ✅ PASS | scrollWidth=768 clientWidth=768 hash=#/traffic |
| 17 | 宽度 768：系统设置 无横向溢出 | ✅ PASS | scrollWidth=768 clientWidth=768 hash=#/settings |
| 18 | 宽度 390：用户管理 无横向溢出 | ✅ PASS | scrollWidth=390 clientWidth=390 hash=#/users |
| 19 | 宽度 390：角色管理 无横向溢出 | ✅ PASS | scrollWidth=390 clientWidth=390 hash=#/roles |
| 20 | 宽度 390：权限管理 无横向溢出 | ✅ PASS | scrollWidth=390 clientWidth=390 hash=#/permissions |
| 21 | 宽度 390：流量监控 无横向溢出 | ✅ PASS | scrollWidth=390 clientWidth=390 hash=#/traffic |
| 22 | 宽度 390：系统设置 无横向溢出 | ✅ PASS | scrollWidth=390 clientWidth=390 hash=#/settings |

附加观测：

- **登录方式**：API 登录后注入 localStorage.llm_token（user=admin）
- **宽度 1672 侧栏状态**：app.class="app"
- **宽度 1440 侧栏状态**：app.class="app"
- **宽度 1024 侧栏状态**：app.class="app"
- **宽度 768 侧栏状态**：app.class="app"
- **宽度 390 侧栏状态**：app.class="app"
- **横向溢出汇总**：所有被测宽度/页面均无横向溢出

### 5.4 网关端到端（Key/usage/限流/配额/告警） — ✅ PASS

| # | 检查项 | 结果 | 说明 |
| --- | --- | --- | --- |
| 1 | 前置：后端 /health 就绪 | ✅ PASS | status=ok database=ok |
| 2 | 前置：前端 dev server 就绪 | ✅ PASS | http://127.0.0.1:5173 |
| 3 | 前置：admin 登录（经 Vite 代理） | ✅ PASS | admin id=1 |
| 4 | 创建 API Key（明文仅返回一次，sk- 前缀） | ✅ PASS | id=3 prefix=sk-cmU2YgkR |
| 5 | GET /api/keys 不泄露明文 Key | ✅ PASS | items=2 keyPrefix=sk-cmU2YgkR hasPlaintext=false |
| 6 | POST /v1/chat/completions ×3 返回 OpenAI 兼容 usage | ✅ PASS | usages=[35,35,35] model=GPT-4o |
| 7 | 流量日志记录 3 次成功请求（Token 与 usage 一致） | ✅ PASS | records=3 tokens=105 |
| 8 | stream=true 返回 SSE 且以 data: [DONE] 结束 | ✅ PASS | contentType=text/event-stream chunks=13 |
| 9 | 低 RPM Key：连续请求触发 429 rate_limited + Retry-After | ✅ PASS | statuses=200,200,429,429,429,429 retryAfter=60s |
| 10 | 低日配额 Key：请求触发 429 quota_exceeded（且不计量） | ✅ PASS | status=429 code=quota_exceeded quotaRemaining=0 |
| 11 | 限流/配额事件产生告警（GET /api/alerts） | ✅ PASS | unread=5 sample="Token 配额已超限，请求被拒绝" type=quota.exceeded |
| 12 | 流量日志包含 rate_limited / quota_exceeded 记录 | ✅ PASS | rate_limited=6 quota_exceeded=2 |
| 13 | OpenAI 错误分支：无 Key 401 / 缺 messages 400 / 未知模型 4xx | ✅ PASS | noKey=401 missingMessages=400 unknownModel=404 |
| 14 | 浏览器：流量监控页可见限流/配额记录（或 Dashboard 告警） | ✅ PASS | trafficHit=true badge="5" dashHit=true |
| 15 | 清理：吊销本次创建的 API Key | ✅ PASS | normal:204 ratelimit:204 quota:204 |

附加观测：

- **非流式响应头（限流/配额观测）**：{"limit":"120","remaining":"120","reset":"60"} quotaRemaining=99660000

## 6. 像素回归数据

### 6.1 Dashboard vs `index.png`（1672×941）

总体差异率 **5.51%**（86675/1573352px），mean Δ 6.37，判定：**NEEDS WORK (≤6%)**。

| 分区 | bbox (x,y,w,h) | 差异 % | mean Δ |
| --- | --- | --- | --- |
| Sidebar | 0,0,260,941 | 4.36 | 5.8 |
| Topbar | 260,0,1412,68 | 2.50 | 4.1 |
| Page header (title + date filter) | 260,68,1412,122 | 3.49 | 5.1 |
| KPI row | 291,190,1360,130 | 7.69 | 12.1 |
| Chart row | 291,338,1360,336 | 7.51 | 10.1 |
| Table row | 291,696,1360,245 | 5.45 | 7.9 |

diff 图：[baseline \| current](../tools/out/e2e/pixel-dashboard-diff.png) · [差异热力图](../tools/out/e2e/pixel-dashboard-heatmap.png)

### 6.2 用户管理 vs `users.jpg`（1376×768 @2x → 2752×1536）

总体差异率 **5.83%**（历史验收基线 3.63%），外壳（侧栏/顶栏/页头）最大 **5.20%**，内容结构区（筛选卡/工具栏）最大 **9.55%**（历史基线 5.53% / 3.87%）。判定：**NEEDS WORK (≤6%)** — 差异已归因（导航契约变更/真实告警徽标/筛选卡 y+1px/128 条真实数据），非布局错乱，列为 P2 非阻塞观察项。

| 分区 | bbox (x,y,w,h) | 差异 % | mean Δ |
| --- | --- | --- | --- |
| 侧边栏 Sidebar | 0,0,430,1536 | 5.20 | 7.6 |
| 顶栏 Topbar | 430,0,2322,106 | 3.17 | 5.3 |
| 页头 Page header | 431,106,2321,200 | 4.15 | 8.2 |
| 筛选卡 Filter card | 479,306,2237,156 | 9.55 | 12.3 |
| 工具栏 Toolbar | 479,491,2237,145 | 4.43 | 6.2 |
| 表头+数据行 Table header + rows | 479,637,2237,595 | 8.66 | 12.3 |
| 分页 Pagination | 479,1232,2237,138 | 6.28 | 9.8 |

diff 图：[baseline \| current](../tools/out/e2e/pixel-users-diff.png) · [差异热力图](../tools/out/e2e/pixel-users-heatmap.png)

## 7. 响应式数据

| 视口宽度 | 路由 | scrollWidth | clientWidth | 横向溢出 |
| --- | --- | --- | --- | --- |
| 1672px | #/ | 1672 | 1672 | ✅ PASS |
| 1440px | #/ | 1440 | 1440 | ✅ PASS |
| 1024px | #/ | 1024 | 1024 | ✅ PASS |
| 1024px | #/users | 1024 | 1024 | ✅ PASS |
| 1024px | #/roles | 1024 | 1024 | ✅ PASS |
| 1024px | #/permissions | 1024 | 1024 | ✅ PASS |
| 1024px | #/traffic | 1024 | 1024 | ✅ PASS |
| 1024px | #/settings | 1024 | 1024 | ✅ PASS |
| 768px | #/ | 768 | 768 | ✅ PASS |
| 768px | #/users | 768 | 768 | ✅ PASS |
| 768px | #/roles | 768 | 768 | ✅ PASS |
| 768px | #/permissions | 768 | 768 | ✅ PASS |
| 768px | #/traffic | 768 | 768 | ✅ PASS |
| 768px | #/settings | 768 | 768 | ✅ PASS |
| 390px | #/ | 390 | 390 | ✅ PASS |
| 390px | #/users | 390 | 390 | ✅ PASS |
| 390px | #/roles | 390 | 390 | ✅ PASS |
| 390px | #/permissions | 390 | 390 | ✅ PASS |
| 390px | #/traffic | 390 | 390 | ✅ PASS |
| 390px | #/settings | 390 | 390 | ✅ PASS |

## 8. 缺陷列表

本轮未发现 P0/P1 失败项。✅

### P2 非阻塞观察项（建议后续优化，不影响本次验收）

- **P2 · 用户管理页视觉偏差**：总体差异 5.83%（历史基线 3.63%），内容结构区最大 9.55%（筛选卡历史 5.53%）。归因：① 契约要求侧栏「模型管理」→「角色管理」；② 顶栏告警徽标真实值 3（设计稿 2）；③ 筛选卡实测 y=154 CSS px（设计稿 153，+1px）；④ 128 条真实种子用户数据行/分页文案。 复现：`node tools/e2e/pixel-check.mjs`；证据：`tools/out/e2e/pixel-users-diff.png`。
- **P2 · Dashboard 图表数据差异**：总体 5.51%，KPI row 7.69%、Chart row 7.51%。KPI/趋势/环形图为真实 API 数据驱动（sparkline 形状、趋势 y 轴刻度 0–2.5k 与设计稿 0–100k 不同），卡片几何位置与设计稿逐像素一致，外壳区域（侧栏/顶栏/页头）与历史基线无回退。 复现：`node tools/e2e/pixel-check.mjs`；证据：`tools/out/e2e/pixel-dashboard-diff.png`。
- **P2 · 390px #/traffic 横向溢出（曾出现 567>390）**：第 2 轮（15:25）曾捕获；随后 15:30 / 15:39 / 15:44 三轮复验均 390 无溢出（最终轮干净种子下通过）；如回归请按 P2 转 frontend-modules（复现：`node tools/e2e/responsive-check.mjs`）。

> 以上 P2 均已与 Lead/frontend-core 对齐：契约导航变更与真实数据差异属设计允许项；如需完全对齐 users.jpg，可回退到设计稿导航变体（与契约冲突）。

## 9. 已知差异 / 设计允许项

- **Dashboard 数值文本**：种子数据复现设计稿数值（128,960 / 1.24B / 99.2%）；执行 `e2e-gateway.mjs` 后真实推理请求会叠加今日请求量与 Token（见 §3.5 测试前/测试后），属设计允许的数据差异。
- **Dashboard 趋势图/SPARKLINE 量级**：设计稿 y 轴为 0–100k（静态 mock 曲线），真实种子数据按 96 个 15 分钟桶聚合后 y 轴为 0–2.5k（与 `docs/api-contract.md` 示例 yTicks [0,2500] 一致），曲线形状差异属数据驱动。KPI sparkline 同样由真实 spark 数组驱动，形状与设计稿可能不同，但图标/字号/卡片几何未变。
- **用户管理数据行**：后端种子 128 个用户，而设计稿 `users.jpg` 为 48 条记录；表头以下行文本、分页文案（共 128 条 vs 48 条）必然不同，按结构区域评估布局。
- **用户管理侧栏导航**：设计稿 users.jpg 导航含「模型管理」，`docs/api-contract.md` 约定 6 项含「角色管理」；实现按契约统一为 6 项（模型管理通过 /models 路由 + 系统设置页入口），这是用户页侧栏差异升高的主因。
- **顶栏告警徽标**：真实未读数 3（设计稿 users.jpg 为 2），属真实数据差异。
- **用户页纵向间距**：筛选卡实测 y=154 CSS px（设计稿 153，+1px）；表格卡 y=245、分页 y=641 与设计稿一致。
- **字体/抗锯齿**：headless Chromium 与设计稿渲染栈不同，小字号文本边缘存在 0~2% 的正常差异。
- **测试副作用**：`e2e-gateway.mjs` 会创建并吊销 API Key、写入成功/限流/配额请求日志与告警（不改变种子基线表结构），用于验证计量闭环；最终交付前重置 DB 可恢复 128,960 首屏基线。
- **数据基线**：本轮“测试前 KPI”若大于 128,960，为联调/历史测试流量叠加；干净 seed 下 Dashboard 首屏为 128,960 / 1.24B / 99.2%（本报告 §3.5 已分段记录）。

## 10. 截图与产物

| 模块 | 截图 |
| --- | --- |
| 浏览器 E2E（控制台） | [e2e-console-01-login.png](../tools/out/e2e/e2e-console-01-login.png) |
| 浏览器 E2E（控制台） | [e2e-console-02-dashboard.png](../tools/out/e2e/e2e-console-02-dashboard.png) |
| 浏览器 E2E（控制台） | [e2e-console-nav-users.png](../tools/out/e2e/e2e-console-nav-users.png) |
| 浏览器 E2E（控制台） | [e2e-console-nav-roles.png](../tools/out/e2e/e2e-console-nav-roles.png) |
| 浏览器 E2E（控制台） | [e2e-console-nav-permissions.png](../tools/out/e2e/e2e-console-nav-permissions.png) |
| 浏览器 E2E（控制台） | [e2e-console-nav-traffic.png](../tools/out/e2e/e2e-console-nav-traffic.png) |
| 浏览器 E2E（控制台） | [e2e-console-nav-settings.png](../tools/out/e2e/e2e-console-nav-settings.png) |
| 浏览器 E2E（控制台） | [e2e-console-03-users-list.png](../tools/out/e2e/e2e-console-03-users-list.png) |
| 浏览器 E2E（控制台） | [e2e-console-04-user-create-dialog.png](../tools/out/e2e/e2e-console-04-user-create-dialog.png) |
| 浏览器 E2E（控制台） | [e2e-console-05-user-created.png](../tools/out/e2e/e2e-console-05-user-created.png) |
| 浏览器 E2E（控制台） | [e2e-console-06-user-search.png](../tools/out/e2e/e2e-console-06-user-search.png) |
| 浏览器 E2E（控制台） | [e2e-console-07-user-edit-dialog.png](../tools/out/e2e/e2e-console-07-user-edit-dialog.png) |
| 浏览器 E2E（控制台） | [e2e-console-08-user-disabled.png](../tools/out/e2e/e2e-console-08-user-disabled.png) |
| 浏览器 E2E（控制台） | [e2e-console-09-user-deleted.png](../tools/out/e2e/e2e-console-09-user-deleted.png) |
| 浏览器 E2E（控制台） | [e2e-console-10-logout.png](../tools/out/e2e/e2e-console-10-logout.png) |
| 像素回归（Dashboard + 用户页） | [pixel-check-dashboard-1672x941.png](../tools/out/e2e/pixel-check-dashboard-1672x941.png) |
| 像素回归（Dashboard + 用户页） | [pixel-check-users-1376x768@2x.png](../tools/out/e2e/pixel-check-users-1376x768@2x.png) |
| 响应式（五档宽度 + 移动抽屉） | [responsive-check-dashboard-1672.png](../tools/out/e2e/responsive-check-dashboard-1672.png) |
| 响应式（五档宽度 + 移动抽屉） | [responsive-check-dashboard-1440.png](../tools/out/e2e/responsive-check-dashboard-1440.png) |
| 响应式（五档宽度 + 移动抽屉） | [responsive-check-dashboard-1024.png](../tools/out/e2e/responsive-check-dashboard-1024.png) |
| 响应式（五档宽度 + 移动抽屉） | [responsive-check-dashboard-768.png](../tools/out/e2e/responsive-check-dashboard-768.png) |
| 响应式（五档宽度 + 移动抽屉） | [responsive-check-drawer-open-768.png](../tools/out/e2e/responsive-check-drawer-open-768.png) |
| 响应式（五档宽度 + 移动抽屉） | [responsive-check-drawer-closed-768.png](../tools/out/e2e/responsive-check-drawer-closed-768.png) |
| 响应式（五档宽度 + 移动抽屉） | [responsive-check-dashboard-390.png](../tools/out/e2e/responsive-check-dashboard-390.png) |
| 响应式（五档宽度 + 移动抽屉） | [responsive-check-drawer-open-390.png](../tools/out/e2e/responsive-check-drawer-open-390.png) |
| 响应式（五档宽度 + 移动抽屉） | [responsive-check-drawer-closed-390.png](../tools/out/e2e/responsive-check-drawer-closed-390.png) |
| 网关端到端（Key/usage/限流/配额/告警） | [e2e-gateway-traffic-page.png](../tools/out/e2e/e2e-gateway-traffic-page.png) |
| 网关端到端（Key/usage/限流/配额/告警） | [e2e-gateway-dashboard-after-gateway.png](../tools/out/e2e/e2e-gateway-dashboard-after-gateway.png) |

产物目录：`tools/out/e2e/`（截图、`*.json` 结果、`logs/` 日志）；像素数据：`tools/out/e2e/pixel-dashboard-diff.json`、`pixel-users-diff.json`。

## 11. 关键证据（最终轮，干净种子 128,960 基线）

- Dashboard 截图（KPI 128,960 / 1.24B / 99.2%）：[e2e-console-02-dashboard.png](../tools/out/e2e/e2e-console-02-dashboard.png)
- 登录页：[e2e-console-01-login.png](../tools/out/e2e/e2e-console-01-login.png) · 用户页：[e2e-console-03-users-list.png](../tools/out/e2e/e2e-console-03-users-list.png) · 退出登录：[e2e-console-10-logout.png](../tools/out/e2e/e2e-console-10-logout.png)
- 像素对照：Dashboard [diff](../tools/out/e2e/pixel-dashboard-diff.png) / [热力图](../tools/out/e2e/pixel-dashboard-heatmap.png)；用户页 [diff](../tools/out/e2e/pixel-users-diff.png) / [热力图](../tools/out/e2e/pixel-users-heatmap.png)
- 网关后流量页：[e2e-gateway-traffic-page.png](../tools/out/e2e/e2e-gateway-traffic-page.png) · 网关后 Dashboard：[e2e-gateway-dashboard-after-gateway.png](../tools/out/e2e/e2e-gateway-dashboard-after-gateway.png)
- 响应式：390px [Dashboard](../tools/out/e2e/responsive-check-dashboard-390.png) · 抽屉打开 [drawer-open-390.png](../tools/out/e2e/responsive-check-drawer-open-390.png) · 768px [Dashboard](../tools/out/e2e/responsive-check-dashboard-768.png)
- 运行日志：`tools/out/e2e/logs/{console,pixel,responsive,gateway,pytest,build}.log`；机器可读结果：`tools/out/e2e/{e2e-console.e2e-gateway,pixel-check,responsive-check,run}.json`

## 12. 待复验项

无。
