#!/usr/bin/env node
/**
 * tools/e2e/e2e-console.mjs — 浏览器端到端验收：登录 / 路由守卫 / Dashboard KPI /
 * 侧栏六个页面导航 / 用户管理 增-查-改-停用-删 / 退出登录。
 *
 * Usage (repo root):
 *   node tools/e2e/e2e-console.mjs [--frontend=http://127.0.0.1:5173] [--backend=http://127.0.0.1:8000]
 *   node tools/e2e/run.mjs            # 推荐：统一编排 + 生成报告
 *
 * Output: tools/out/e2e/e2e-console.json, tools/out/e2e/e2e-console-*.png
 */
import {
  DEFAULT_BACKEND,
  DEFAULT_FRONTEND,
  DEMO,
  apiCall,
  bodyText,
  clickFirst,
  fillFirst,
  findVisible,
  gotoNav,
  hashOf,
  hasLoginForm,
  launchBrowser,
  loginApi,
  newInstrumentedPage,
  parseArgs,
  resolveUrls,
  runScript,
  selectByLabel,
  settle,
  sleep,
  uiLogin,
  waitForAny,
  waitForBackend,
  waitForBodyText,
  waitForConsoleReady,
  waitForFrontend,
} from './lib.mjs'

const args = parseArgs({
  frontend: DEFAULT_FRONTEND,
  backend: DEFAULT_BACKEND,
  waitTimeout: 60000,
})
const { frontend, backend } = resolveUrls(args)
const runId = `${Date.now().toString(36)}`
const testUser = `e2e_${runId}`
const testEmail = `${testUser}@example.com`

const DIALOG_ROOTS = ['[role="dialog"]', '.u-modal', '.dialog', '.modal', '.modal-card', '.dialog-card', '.dlg']
const CONFIRM_BUTTONS = [
  '[data-testid="dialog-confirm"]',
  '[data-testid="confirm-btn"]',
  '.dlg-primary',
  'button:has-text("确定")',
  'button:has-text("确认")',
  'button:has-text("保存")',
]
const CANCEL_BUTTONS = ['[data-testid="dialog-cancel"]', 'button:has-text("取消")']

async function dialogRoot(page, { timeout = 8000 } = {}) {
  const found = await findVisible(page, DIALOG_ROOTS, { timeout })
  if (found) return found.locator
  const confirm = await findVisible(page, ['[data-testid="dialog-confirm"]'], { timeout: 1000 })
  if (confirm) return page.locator('body')
  return null
}

async function closeDialog(page) {
  const cancel = await findVisible(page, CANCEL_BUTTONS, { timeout: 800 })
  if (cancel) await cancel.locator.click().catch(() => {})
  await page.keyboard.press('Escape').catch(() => {})
  await sleep(200)
}

async function confirmDialog(page, { timeout = 3000 } = {}) {
  const root = await dialogRoot(page, { timeout })
  const scope = root && (await root.count().catch(() => 0)) ? root : page
  try {
    const selector = await clickFirst(scope, CONFIRM_BUTTONS, { timeout: 5000 })
    return selector
  } catch {
    return null
  }
}

async function apiUserByKeyword(token, keyword) {
  const res = await apiCall(
    frontend,
    `/api/users?page=1&pageSize=20&keyword=${encodeURIComponent(keyword)}`,
    { token }
  )
  const items = Array.isArray(res.json?.items) ? res.json.items : []
  return { status: res.status, items, total: res.json?.total ?? items.length, raw: res }
}

async function waitUserInApi(token, username, predicate, { timeout = 12000 } = {}) {
  const deadline = Date.now() + timeout
  let last = null
  while (Date.now() < deadline) {
    last = await apiUserByKeyword(token, username)
    const hit = last.items.find((u) => u.username === username)
    if (hit && (!predicate || predicate(hit, last))) return { user: hit, list: last }
    await sleep(300)
  }
  return { user: null, list: last }
}

async function findUserRow(page, username, { timeout = 8000 } = {}) {
  const selectors = [
    `[data-testid="user-row"]:has-text("${username}")`,
    `tr:has-text("${username}")`,
    `.ut-row:has-text("${username}")`,
    `.user-row:has-text("${username}")`,
  ]
  const found = await findVisible(page, selectors, { timeout })
  return found ? found.locator : null
}

async function searchUsers(page, keyword) {
  const selectors = [
    '[data-testid="search-input"]',
    'input[type="search"]',
    'input[placeholder*="用户名"]',
    'input[placeholder*="用户 ID"]',
    'input[placeholder*="搜索"]',
    'input[placeholder*="关键字"]',
  ]
  // 表格上方的搜索框（排除弹窗内输入）
  const dialogs = await page.locator(DIALOG_ROOTS.join(',')).count().catch(() => 0)
  if (dialogs) {
    // form dialog may still be mounted; press Escape first
    await page.keyboard.press('Escape').catch(() => {})
    await sleep(150)
  }
  const filled = await fillFirst(page, selectors, keyword, { timeout: 8000 })
  const querySelectors = [
    '[data-testid="query-btn"]',
    'button:has-text("查询")',
    'button:has-text("搜索")',
    '.btn-query',
  ]
  const query = await findVisible(page, querySelectors, { timeout: 1200 })
  if (query) {
    await query.locator.click().catch(() => {})
  } else {
    const input = page.locator(filled).first()
    await input.press('Enter').catch(() => {})
  }
  await sleep(600)
  return filled
}

async function pickRoleSelect(scope, roleNameCandidates) {
  const selects = scope.locator('select')
  const count = await selects.count().catch(() => 0)
  const meta = []
  for (let i = 0; i < count; i += 1) {
    const options = await selects
      .nth(i)
      .evaluate((el) => [...el.options].map((o) => ({ label: o.textContent.trim(), value: o.value })))
      .catch(() => [])
    meta.push({ index: i, options })
  }
  const roleSelect = meta.find((m) => m.options.some((o) => roleNameCandidates.includes(o.label)))
  if (!roleSelect) return { index: -1, meta }
  return { index: roleSelect.index, meta, locator: selects.nth(roleSelect.index) }
}

async function fillCreateForm(page, { username, password, email, roleName, statusLabel }) {
  const root = await dialogRoot(page, { timeout: 10000 })
  if (!root) throw new Error('新增用户弹窗未打开')
  const scope = root
  const used = {}
  used.username = await fillFirst(
    scope,
    [
      '[data-testid="form-username"]',
      'input[name="username"]',
      'input[placeholder*="请输入用户名"]',
      'input[placeholder*="用户名"]',
      'label:has-text("用户名") input',
    ],
    username,
    { timeout: 8000 }
  )
  // userNo 若为必填则填唯一值（可选字段）
  try {
    await fillFirst(
      scope,
      [
        '[data-testid="form-userno"]',
        'input[name="userNo"]',
        'input[placeholder*="用户ID"]',
        'input[placeholder*="用户 ID"]',
      ],
      `U${runId}`,
      { timeout: 600 }
    )
    used.userNo = true
  } catch {
    used.userNo = false
  }
  used.password = await fillFirst(
    scope,
    ['[data-testid="form-password"]', 'input[name="password"]', 'input[type="password"]'],
    password,
    { timeout: 8000 }
  )
  used.email = await fillFirst(
    scope,
    ['[data-testid="form-email"]', 'input[name="email"]', 'input[placeholder*="邮箱"]', 'label:has-text("邮箱") input'],
    email,
    { timeout: 8000 }
  )
  // 角色下拉
  const rolePick = await pickRoleSelect(scope, roleNameCandidates(roleName))
  if (rolePick.index >= 0) {
    const wanted = roleNameCandidates(roleName).find((name) =>
      rolePick.meta[rolePick.index].options.some((o) => o.label === name)
    )
    if (wanted) {
      await rolePick.locator.selectOption({ label: wanted }).catch(() => {})
      used.role = wanted
    }
  } else {
    // 自定义下拉兜底
    try {
      await clickFirst(scope, ['[data-testid="form-role"]', '[data-testid="select-role"]'], { timeout: 1500 })
      await clickFirst(page, [`text="${roleName}"`], { timeout: 1500 })
      used.role = roleName
    } catch {
      used.role = null
    }
  }
  // 状态（若表单内有状态选择）
  const statusPick = rolePick.meta.filter((m) => m.options.some((o) => /启用|正常|停用|禁用/.test(o.label)))
  const statusIdx = statusPick.find((m) => m.index !== rolePick.index)
  if (statusIdx) {
    const target = statusIdx.options.find((o) => o.label.includes(statusLabel || '启用')) || statusIdx.options[0]
    const select = scope.locator('select').nth(statusIdx.index)
    await select.selectOption({ label: target.label }).catch(() => {})
    used.status = target.label
  }
  return used
}

function roleNameCandidates(preferred) {
  return [preferred, '普通用户', '只读用户', '运营', '成员', '用户'].filter(Boolean)
}

await runScript('e2e-console', async (report) => {
  report.env = {
    frontend,
    backend,
    runId,
    testUser,
    node: process.version,
    startedAt: new Date().toISOString(),
  }

  // ---- 0. readiness --------------------------------------------------------
  await report.step(
    '前置：后端 /health 就绪',
    async () => {
      const health = await waitForBackend(backend, { timeoutMs: Number(args.waitTimeout) })
      return `status=${health.status} database=${health.database} version=${health.version ?? '?'}`
    },
    { required: true }
  )
  await report.step(
    '前置：前端 dev server 就绪',
    async () => {
      await waitForFrontend(frontend, { timeoutMs: Number(args.waitTimeout) })
      return frontend
    },
    { required: true }
  )

  let admin = null
  await report.step(
    '前置：admin 通过 Vite 代理登录（/api/auth/login）',
    async () => {
      admin = await loginApi(frontend)
      return `user=${admin.user?.username} role=${admin.user?.roleName ?? admin.user?.role ?? '?'}`
    },
    { required: true }
  )

  // roles for CRUD (契约 GET /api/roles)
  let roles = []
  await report.step('前置：读取角色目录（GET /api/roles）', async () => {
    const res = await apiCall(frontend, '/api/roles', { token: admin.token })
    if (res.status !== 200 || !Array.isArray(res.json?.items)) {
      throw new Error(`unexpected /api/roles: HTTP ${res.status} ${res.text.slice(0, 200)}`)
    }
    roles = res.json.items
    return `${roles.length} roles: ${roles.map((r) => r.name || r.key).join('/')}`
  })
  const nonSuper = roles.filter((r) => !r.isSuper)
  const createRole = nonSuper[0] || null
  const editRole = nonSuper.find((r) => r.id !== createRole?.id) || nonSuper[1] || createRole
  report.info('CRUD 使用角色', `create=${createRole?.name ?? '(默认)'} edit=${editRole?.name ?? '(无)'}`)
  let userId = null

  const browser = await launchBrowser()
  let context = null
  let page = null
  let errors = null
  try {
    ;({ context, page, errors } = await newInstrumentedPage(browser, {
      viewport: { width: 1672, height: 941 },
    }))

    // ---- 1. 路由守卫 ------------------------------------------------------
    await page.goto(`${frontend}/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    const redirected = await waitForAny(
      async () => /#\/login/.test(page.url()) || (await hasLoginForm(page)),
      { timeout: 20000 }
    )
    report.check('未登录访问 / 重定向登录页', redirected, `url=${page.url()}`)
    report.check('登录页使用哈希路由 #/login', /#\/login/.test(page.url()), `hash=${hashOf(page.url())}`)
    report.check('登录页渲染用户名/密码/登录按钮', await hasLoginForm(page), '')
    await settle(page)
    await report.shot(page, '01-login')

    // 守卫：未登录直接访问业务路由
    let guardOk = false
    try {
      await page.goto(`${frontend}/#/users`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      guardOk = await waitForAny(async () => /#\/login/.test(page.url()) || (await hasLoginForm(page)), {
        timeout: 10000,
      })
    } catch (err) {
      report.info('未登录访问 /#/users 异常', err.message)
    }
    report.check('未登录直接访问 /#/users 被守卫拦截到登录页', guardOk, `url=${page.url()}`)

    // ---- 2. 登录 ----------------------------------------------------------
    await page.goto(`${frontend}/#/login`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await waitForAny(async () => hasLoginForm(page), { timeout: 15000 })
    let loginSelectors = null
    await report.step(
      'admin/admin123 登录（表单提交）',
      async () => {
        loginSelectors = await uiLogin(page, { username: DEMO.username, password: DEMO.password })
        await waitForConsoleReady(page, { timeout: 30000 })
        return `url=${page.url()} submit=${loginSelectors.submitSelector}`
      },
      { required: true }
    )
    const storedToken = await page.evaluate(() => window.localStorage.getItem('llm_token')).catch(() => null)
    report.check('登录后 localStorage.llm_token 已写入', Boolean(storedToken), storedToken ? `len=${storedToken.length}` : 'null')

    // 顶栏当前用户
    const topbarUser = await page.evaluate(() => {
      const el = document.querySelector('.topbar .user-name, .topbar .user, .user-name')
      return el ? el.textContent.trim() : ''
    }).catch(() => '')
    report.check('顶栏显示当前登录用户 admin', /admin/i.test(topbarUser), `topbar="${topbarUser}"`)

    // ---- 3. Dashboard KPI ------------------------------------------------
    const apiCalls = []
    page.on('response', (response) => {
      const url = response.url()
      if (/\/api\/analytics\/dashboard/.test(url)) apiCalls.push({ url, status: response.status() })
    })
    let kpiText = ''
    let kpiValues = []
    const KPI_BASELINE_REQUESTS = 128960
    const readKpis = async () => {
      kpiText = await bodyText(page)
      kpiValues = await page.locator('.kpi-value').allInnerTexts().catch(() => [])
      return kpiValues
    }
    const kpiOk = await waitForAny(
      async () => {
        const values = await readKpis()
        return values.length >= 3 && /1\.24B/.test(values.join(' ')) && /99\.2%/.test(values.join(' '))
      },
      { timeout: 25000 }
    )
    if (!kpiOk) await readKpis()
    const kpiCards = await page
      .locator('.kpi-card, .kpi-item, [class*="kpi-card"]')
      .allInnerTexts()
      .catch(() => [])
    report.info('KPI 卡片文本', JSON.stringify(kpiCards).slice(0, 500))
    const parseCount = (raw) => Number(String(raw || '').replace(/[^0-9]/g, ''))
    const requestsRaw = kpiValues[0] || ''
    const requestsValue = parseCount(requestsRaw)
    const requestsDelta = requestsValue - KPI_BASELINE_REQUESTS
    report.check(
      'Dashboard KPI 总请求量 ≥ 128,960（设计基线；测试/联调流量会增量）',
      requestsValue >= KPI_BASELINE_REQUESTS,
      requestsValue
        ? `实际 ${kpiValues[0]}${requestsDelta === 0 ? '（= 原型基线）' : `（基线 128,960，+${requestsDelta} 次真实流量增量）`}`
        : `未取到 .kpi-value（body 片段: ${snippet(kpiText, '128') || 'n/a'}）`
    )
    report.info(
      '测试前基线 vs 当前',
      requestsDelta === 0
        ? '当前 KPI 与原型基线 128,960 完全一致'
        : `当前比原型基线多 ${requestsDelta} 次请求（真实网关/联调流量写入，属预期数据差异）`
    )
    report.check('Dashboard KPI Token 使用量 = 1.24B', /1\.24B/.test(kpiValues.join(' ')) || /1\.24B/.test(kpiText), kpiValues[1] || snippet(kpiText, '1.24') || '未找到')
    report.check('Dashboard KPI 成功率 = 99.2%', /99\.2%/.test(kpiValues.join(' ')) || /99\.2%/.test(kpiText), kpiValues[2] || snippet(kpiText, '99.2') || '未找到')

    // Dashboard 必须接真实后端数据（不能停留在本地 fallback / 错误态）
    await report.step('Dashboard 数据来自后端 API（非降级/错误态）', async () => {
      const res = await apiCall(frontend, '/api/analytics/dashboard?range=today', { token: admin.token })
      if (res.status !== 200) throw new Error(`GET /api/analytics/dashboard HTTP ${res.status}`)
      const kpis = Array.isArray(res.json?.kpis) ? res.json.kpis : []
      const display = (id) => kpis.find((item) => item.id === id)?.display
      const values = { requests: display('requests'), tokens: display('tokens'), success: display('success') }
      const errAlert = await findVisible(page, ['.state-alert--error'], { timeout: 300 }).catch(() => null)
      if (errAlert) throw new Error('Dashboard 显示数据加载错误提示（降级态）')
      const apiRequests = Number(String(values.requests || '').replace(/[^0-9]/g, ''))
      if (!(apiRequests >= 128960)) throw new Error(`后端 KPI requests=${values.requests} < 128,960`)
      if (values.tokens !== '1.24B') throw new Error(`后端 KPI tokens=${values.tokens} != 1.24B`)
      if (values.success !== '99.2%') throw new Error(`后端 KPI success=${values.success} != 99.2%`)
      return `display=${values.requests}/${values.tokens}/${values.success} trendPoints=${res.json?.trend?.total?.length ?? '?'}`
    })

    await settle(page)
    await report.shot(page, '02-dashboard')

    // ---- 3b. 时间范围切换（今日/近7天/近30天）----------------------------
    try {
      const range7 = await findVisible(page, ['button:has-text("近7天")', '[data-testid="range-7d"]', 'text="近7天"'], {
        timeout: 2500,
      })
      if (range7) {
        const before = apiCalls.length
        await range7.locator.click()
        await waitForAny(async () => apiCalls.length > before || /近7天/.test(await bodyText(page)), { timeout: 8000 })
        await sleep(600)
        const newCall = apiCalls.slice(before).find((c) => /range=7d/.test(c.url))
        report.check(
          'Dashboard 切换近7天触发 range=7d 请求',
          Boolean(newCall),
          newCall ? `${newCall.status} ${newCall.url.split('?')[1] || ''}` : `dashboard api calls: ${apiCalls.length}`
        )
        // 回到今日视图，保证后续截图/像素与基线一致
        const today = await findVisible(page, ['button:has-text("今日")', '[data-testid="range-today"]', 'text="今日"'], {
          timeout: 2000,
        })
        if (today) {
          await today.locator.click()
          await sleep(700)
        }
      } else {
        report.info('时间范围切换', '未找到 近7天 按钮，跳过（由像素/人工确认）')
      }
    } catch (err) {
      report.info('时间范围切换', `跳过: ${err.message}`)
    }

    // ---- 4. 侧栏导航 ------------------------------------------------------
    const navLabels = ['用户管理', '角色管理', '权限管理', '流量监控', '系统设置']
    const navFallbacks = []
    for (const label of navLabels) {
      await report.step(
        `侧栏导航 → ${label}`,
        async () => {
          let info = null
          let usedFallback = false
          try {
            info = await gotoNav(page, label, { timeout: 6000 })
          } catch (firstErr) {
            // 用户管理页沿用设计稿导航变体（模型管理替代角色管理等），先回 Dashboard 再点
            usedFallback = true
            await page.goto(`${frontend}/#/`, { waitUntil: 'domcontentloaded', timeout: 20000 })
            await waitForBodyText(page, ['总请求量'], { timeout: 20000 }).catch(() => {})
            await settle(page, { ms: 200 })
            const currentNav = await page
              .locator('.sidebar .nav-item, aside .nav-item')
              .allInnerTexts()
              .catch(() => [])
            try {
              info = await gotoNav(page, label, { timeout: 15000 })
            } catch (secondErr) {
              throw new Error(
                `${secondErr.message}（当前页侧栏: ${currentNav.map((t) => t.trim()).join('/')}；原始错误: ${firstErr.message.slice(0, 80)}）`
              )
            }
            navFallbacks.push({ label, reason: firstErr.message.slice(0, 120) })
          }
          const hash = hashOf(page.url())
          const expected = { 用户管理: '#/users', 角色管理: '#/roles', 权限管理: '#/permissions', 流量监控: '#/traffic', 系统设置: '#/settings' }[label]
          if (expected && !hash.startsWith(expected)) {
            throw new Error(`路由未切换到 ${expected}（实际 ${hash}）`)
          }
          await settle(page, { ms: 250 })
          await report.shot(page, `nav-${expected.replace('#/', '').replace('#', '') || 'dashboard'}`)
          return `hash=${hash}${usedFallback ? '（当前页侧栏无该入口，已从 Dashboard 点击）' : ''}`
        }
      )
      // 侧栏高亮
      const active = await page
        .locator('.sidebar .nav-item.is-active, aside .nav-item.is-active, .nav-item.is-active')
        .first()
        .innerText()
        .catch(() => '')
      report.check(`侧栏高亮当前页：${label}`, active.includes(label), `active="${active.replace(/\s+/g, ' ').trim()}"`)
    }

    if (navFallbacks.length) {
      report.info('侧栏入口回退记录', JSON.stringify(navFallbacks))
    }

    // 契约要求：侧栏 6 项在任意页面一致（含角色管理）
    await report.step('侧栏信息架构与契约一致：任意页面含 Dashboard/用户管理/角色管理/权限管理/流量监控/系统设置', async () => {
      const expectedItems = ['Dashboard', '用户管理', '角色管理', '权限管理', '流量监控', '系统设置']
      const checked = []
      for (const route of ['#/users', '#/roles', '#/settings']) {
        await page.goto(`${frontend}/${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await waitForBodyText(page, ['Dashboard'], { timeout: 15000 }).catch(() => {})
        await settle(page, { ms: 250 })
        const navTexts = await page
          .locator('.sidebar .nav-item, aside .nav-item')
          .allInnerTexts()
          .catch(() => [])
        const joined = navTexts.map((t) => t.trim()).join('|')
        const missing = expectedItems.filter((label) => !joined.includes(label))
        checked.push(`${route}: ${missing.length ? `缺 ${missing.join('/')}` : 'ok'}`)
        if (missing.length) {
          throw new Error(
            `${route} 侧栏缺少 ${missing.join('/')}（实际导航: ${navTexts.map((t) => t.trim()).join('/')}）`
          )
        }
      }
      return checked.join('；')
    })

    // 模型管理走 /models 路由（契约要求；不在侧栏 6 项内）
    await report.step('路由 /#/models 可访问（模型管理页）', async () => {
      await page.goto(`${frontend}/#/models`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await waitForBodyText(page, ['模型'], { timeout: 15000 })
      if (await hasLoginForm(page)) throw new Error(`被重定向登录页：${page.url()}`)
      await settle(page, { ms: 250 })
      const text = await bodyText(page)
      return `url=${page.url()} hasModelText=${/模型/.test(text)}`
    })

    // ---- 5. 用户管理 CRUD -------------------------------------------------
    await report.step('返回用户管理页', async () => {
      const info = await gotoNav(page, '用户管理', { timeout: 20000 })
      await waitForBodyText(page, ['用户管理'], { timeout: 15000 })
      await settle(page, { ms: 300 })
      await report.shot(page, '03-users-list')
      return `hash=${hashOf(page.url())}`
    })

    // 5a. 新增
    const created = await report.step(
      '用户管理：新增用户 e2e_<ts>',
      async () => {
        await clickFirst(
          page,
          [
            '[data-testid="add-user"]',
            'button:has-text("新增用户")',
            'button:has-text("添加用户")',
            'button:has-text("新增")',
          ],
          { timeout: 8000 }
        )
        const used = await fillCreateForm(page, {
          username: testUser,
          password: 'admin123',
          email: testEmail,
          roleName: createRole?.name || '普通用户',
        })
        await report.shot(page, '04-user-create-dialog')
        const confirmSelector = await confirmDialog(page)
        if (!confirmSelector) throw new Error('新增弹窗未找到确认按钮')
        const { user } = await waitUserInApi(admin.token, testUser, null, { timeout: 12000 })
        if (!user) throw new Error(`新增后 API 中找不到用户 ${testUser}（GET /api/users?keyword=${testUser}）`)
        userId = user.id
        await sleep(500)
        await report.shot(page, '05-user-created')
        return `id=${user.id} role=${user.roleName || user.role || '?'} fields=${JSON.stringify(used)}`
      }
    )

    // 5b. 搜索
    await report.step('用户管理：搜索到新增用户', async () => {
      await searchUsers(page, testUser)
      const row = await findUserRow(page, testUser)
      const visible = row ? await row.isVisible().catch(() => false) : false
      if (!visible) {
        const text = await bodyText(page)
        if (!text.includes(testUser)) throw new Error(`搜索结果中未见 ${testUser}`)
      }
      const api = await apiUserByKeyword(admin.token, testUser)
      if (!api.items.some((u) => u.username === testUser)) throw new Error('API 关键词搜索未命中新增用户')
      await report.shot(page, '06-user-search')
      return `ui+api 均命中，total=${api.total}`
    })

    // 5c. 编辑角色
    await report.step('用户管理：编辑用户角色并保存', async () => {
      if (!editRole || !createRole || editRole.id === createRole.id) throw new Error('没有可切换的角色（角色数不足）')
      await searchUsers(page, testUser)
      const row = await findUserRow(page, testUser, { timeout: 5000 })
      if (!row) throw new Error(`列表中未找到 ${testUser} 行`)
      const editBtn = await findVisible(row, [
        '[data-testid="edit-user"]',
        'button:has-text("编辑")',
        '.act-link:has-text("编辑")',
        'button:has-text("编改")',
      ], { timeout: 3000 })
      if (!editBtn) {
        // fallback: page-level row locator
        const pageEdit = await findVisible(page, [
          `[data-testid="user-row"]:has-text("${testUser}") [data-testid="edit-user"]`,
          `[data-testid="user-row"]:has-text("${testUser}") button:has-text("编辑")`,
          `tr:has-text("${testUser}") button:has-text("编辑")`,
        ], { timeout: 4000 })
        if (!pageEdit) throw new Error('找不到新增用户的“编辑”按钮')
        await pageEdit.locator.click()
      } else {
        await editBtn.locator.click()
      }
      await dialogRoot(page, { timeout: 8000 })
      const scope = await dialogRoot(page, { timeout: 5000 })
      if (!scope) throw new Error('编辑弹窗未打开')
      const pick = await pickRoleSelect(scope, roles.map((r) => r.name).filter(Boolean))
      if (pick.index < 0) throw new Error('编辑弹窗内未找到角色下拉')
      await pick.locator.selectOption({ label: editRole.name })
      await report.shot(page, '07-user-edit-dialog')
      const confirmSelector = await confirmDialog(page)
      if (!confirmSelector) throw new Error('编辑弹窗未找到保存按钮')
      const { user } = await waitUserInApi(
        admin.token,
        testUser,
        (u) => Number(u.roleId) === Number(editRole.id),
        { timeout: 12000 }
      )
      if (!user) throw new Error(`保存后角色未变为 ${editRole.name}（roleId=${editRole.id}）`)
      return `roleId ${createRole.id} → ${user.roleId} (${editRole.name})`
    })

    // 5d. 停用
    await report.step('用户管理：停用用户', async () => {
      await searchUsers(page, testUser)
      const row = await findUserRow(page, testUser, { timeout: 5000 })
      if (!row) throw new Error(`列表中未找到 ${testUser} 行`)
      const toggle = await findVisible(row, [
        '[data-testid="toggle-status"]',
        'button:has-text("停用")',
        '.act-link:has-text("停用")',
        'button:has-text("禁用")',
      ], { timeout: 3000 })
      if (toggle) {
        await toggle.locator.click()
      } else {
        const pageToggle = await findVisible(page, [
          `[data-testid="user-row"]:has-text("${testUser}") [data-testid="toggle-status"]`,
          `[data-testid="user-row"]:has-text("${testUser}") button:has-text("停用")`,
          `tr:has-text("${testUser}") button:has-text("停用")`,
        ], { timeout: 4000 })
        if (!pageToggle) throw new Error('找不到“停用”操作按钮')
        await pageToggle.locator.click()
      }
      await sleep(400)
      // 部分实现会二次确认
      const confirm = await dialogRoot(page, { timeout: 1500 })
      if (confirm) await confirmDialog(page)
      const { user } = await waitUserInApi(
        admin.token,
        testUser,
        (u) => String(u.status) === 'disabled' || String(u.status) === '停用',
        { timeout: 12000 }
      )
      if (!user) throw new Error('停用后 API status 仍不是 disabled')
      await report.shot(page, '08-user-disabled')
      return `status=${user.status}`
    })

    // 5e. 删除
    await report.step('用户管理：删除用户', async () => {
      await searchUsers(page, testUser)
      const row = await findUserRow(page, testUser, { timeout: 5000 })
      if (!row) throw new Error(`删除前列表中未找到 ${testUser} 行`)
      const del = await findVisible(row, [
        '[data-testid="delete-user"]',
        'button:has-text("删除")',
        '.act-link:has-text("删除")',
        '.act-danger',
      ], { timeout: 3000 })
      if (del) {
        await del.locator.click()
      } else {
        const pageDel = await findVisible(page, [
          `[data-testid="user-row"]:has-text("${testUser}") [data-testid="delete-user"]`,
          `[data-testid="user-row"]:has-text("${testUser}") button:has-text("删除")`,
          `tr:has-text("${testUser}") button:has-text("删除")`,
        ], { timeout: 4000 })
        if (!pageDel) throw new Error('找不到“删除”操作按钮')
        await pageDel.locator.click()
      }
      await sleep(400)
      await confirmDialog(page)
      // 轮询直到 API 查不到该用户（删除是异步生效的 UI 状态刷新）
      const gone = await waitForAny(
        async () => {
          const res = await apiUserByKeyword(admin.token, testUser)
          return !(res.items || []).some((u) => u.username === testUser)
        },
        { timeout: 12000, poll: 300 }
      )
      const after = await apiUserByKeyword(admin.token, testUser)
      if (!gone) throw new Error(`删除后 API 中仍能查到该用户（items=${(after.items || []).map((u) => u.username).join(',')}）`)
      await report.shot(page, '09-user-deleted')
      return `删除后 total=${after.total}`

    })

    // ---- 6. 退出登录 ------------------------------------------------------
    await report.step(
      '退出登录 → 回到登录页',
      async () => {
        const logoutSelectors = [
          'button:has-text("退出登录")',
          '[data-testid="logout"]',
          '.sidebar .nav-item--logout',
          'text="退出登录"',
        ]
        let target = await findVisible(page, logoutSelectors, { timeout: 2500 })
        if (!target) {
          // 顶栏用户下拉后再找
          const userMenu = await findVisible(page, ['.topbar .user', 'button.user', '[data-testid="user-menu"]'], {
            timeout: 2000,
          })
          if (userMenu) await userMenu.locator.click().catch(() => {})
          await sleep(400)
          target = await findVisible(page, logoutSelectors, { timeout: 2500 })
        }
        if (!target) throw new Error('页面上找不到“退出登录”入口')
        await target.locator.click()
        await sleep(500)
        const confirm = await dialogRoot(page, { timeout: 1200 })
        if (confirm) await confirmDialog(page)
        const backToLogin = await waitForAny(
          async () => /#\/login/.test(page.url()) || (await hasLoginForm(page)),
          { timeout: 15000 }
        )
        if (!backToLogin) throw new Error(`退出后未回到登录页（url=${page.url()}）`)
        const token = await page.evaluate(() => window.localStorage.getItem('llm_token')).catch(() => 'x')
        if (token && token !== 'x') throw new Error('退出后 localStorage.llm_token 仍存在')
        await settle(page)
        await report.shot(page, '10-logout')
        return `url=${page.url()}`
      },
      { required: false }
    )

    // ---- 7. 控制台错误 ----------------------------------------------------
    await settle(page, { ms: 100 })
    const pageErrors = errors.pageErrors
    const consoleErrors = errors.consoleErrors.filter((e) => !/Failed to load resource/i.test(e))
    report.check('浏览器无 JS 未捕获异常（pageerror）', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
    report.check('浏览器控制台无 JS error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
    if (errors.failedRequests.length) {
      report.info('网络请求失败（非致命）', errors.failedRequests.slice(0, 5).join(' | '))
    }
    report.data.consoleErrors = errors.consoleErrors
    report.data.failedRequests = errors.failedRequests
  } finally {
    // 清理测试数据（失败时也能回收）
    try {
      if (admin) {
        const { list } = await waitUserInApi(admin.token, testUser, null, { timeout: 4000 })
        const leftover = (list?.items || []).find((u) => u.username === testUser)
        if (leftover) {
          await apiCall(frontend, `/api/users/${leftover.id}`, { method: 'DELETE', token: admin.token })
          report.info('清理残留测试用户', `${testUser} (id=${leftover.id}) 已通过 API 删除`)
        }
      }
    } catch (err) {
      report.info('清理测试用户失败', err.message)
    }
    if (browser) await browser.close().catch(() => {})
  }
})

function snippet(text, needle) {
  if (!text) return ''
  const index = text.indexOf(needle)
  if (index < 0) return ''
  return text.slice(Math.max(0, index - 24), index + 48).replace(/\s+/g, ' ')
}
