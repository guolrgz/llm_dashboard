#!/usr/bin/env node
/**
 * tools/e2e/e2e-gateway.mjs — OpenAI 兼容网关端到端验收。
 *
 * 覆盖：
 *  1) admin 登录（Vite 代理 /api）→ 创建真实 API Key（明文仅返回一次）；
 *  2) POST /v1/chat/completions 3 次（经 5173 代理）校验 usage / 响应结构 / 请求日志；
 *  3) 流式 stream=true（SSE data: [DONE]）；
 *  4) 低 RPM Key 连续请求触发 429 rate_limited + Retry-After；
 *  5) 低日配额 Key 触发 429 quota_exceeded；
 *  6) 告警（/api/alerts）与流量页/日志出现限额事件；
 *  7) OpenAI 错误分支：无 Key 401 / 未知模型 / 缺 messages；
 *  8) 清理创建的 Key（吊销）。
 *
 * Usage: node tools/e2e/e2e-gateway.mjs [--frontend=...] [--backend=...]
 * Output: tools/out/e2e/e2e-gateway.json + screenshots.
 */
import {
  DEFAULT_BACKEND,
  DEFAULT_FRONTEND,
  apiCall,
  bodyText,
  launchBrowser,
  loginApi,
  newInstrumentedPage,
  parseArgs,
  resolveUrls,
  runScript,
  settle,
  sleep,
  waitForAny,
  waitForBackend,
  waitForBodyText,
  waitForFrontend,
} from './lib.mjs'

const args = parseArgs({
  frontend: DEFAULT_FRONTEND,
  backend: DEFAULT_BACKEND,
  waitTimeout: 60000,
})
const { frontend, backend } = resolveUrls(args)
const runId = Date.now().toString(36)
const PREFIX = `e2e-gw-${runId}`

/**
 * 从创建/轮换响应中提取完整明文 Key。
 * 注意：响应同时含 key.keyPrefix（短前缀）与 apiKey（完整明文），
 * 必须先按字段名匹配、且只接受足够长的完整 Key，避免误把前缀当明文。
 */
function findApiKey(obj, depth = 0) {
  if (obj == null || depth > 5) return null
  if (typeof obj === 'string') return /^sk-[A-Za-z0-9_-]{20,}$/.test(obj) ? obj : null
  if (Array.isArray(obj)) {
    for (const value of obj) {
      const found = findApiKey(value, depth + 1)
      if (found) return found
    }
    return null
  }
  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const field = String(key).replace(/[_-]/g, '').toLowerCase()
      if (['apikey', 'plaintext', 'keyplaintext'].includes(field)) {
        if (typeof value === 'string' && value.startsWith('sk-') && value.length > 20) return value
      }
    }
    for (const value of Object.values(obj)) {
      const found = findApiKey(value, depth + 1)
      if (found) return found
    }
  }
  return null
}

function keyPrefix(apiKey) {
  return apiKey.slice(0, 15) // sk- + 12 chars per contract
}

async function createKey({ name, rpmLimit, tpmLimit, dailyQuota, monthlyQuota }) {
  const res = await apiCall(frontend, '/api/keys', {
    method: 'POST',
    token: adminToken,
    body: { userId: adminUserId, name, rpmLimit, tpmLimit, dailyQuota, monthlyQuota },
  })
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`创建 Key 失败: HTTP ${res.status} ${res.text.slice(0, 300)}`)
  }
  const apiKey = findApiKey(res.json)
  const id = res.json?.key?.id ?? res.json?.id ?? null
  const prefix = res.json?.key?.keyPrefix || res.json?.keyPrefix || apiKey?.slice(0, 15) || null
  if (!apiKey) throw new Error(`创建 Key 响应中未找到明文 apiKey: ${res.text.slice(0, 300)}`)
  return { apiKey, id, name, prefix, status: res.status, json: res.json }
}

async function chat({ apiKey, model = 'GPT-4o', content = 'hello', stream = false, maxTokens = 128, authOverride, timeoutMs = 60000 }) {
  const body = { model, messages: [{ role: 'user', content }], max_tokens: maxTokens, temperature: 0.2 }
  if (stream) body.stream = true
  return apiCall(frontend, '/v1/chat/completions', {
    method: 'POST',
    token: authOverride === undefined ? apiKey : authOverride,
    body,
    timeoutMs,
  })
}

async function trafficLogs(pageSize = 50, token) {
  const res = await apiCall(frontend, `/api/traffic/logs?page=1&pageSize=${pageSize}`, { token })
  return { status: res.status, items: Array.isArray(res.json?.items) ? res.json.items : [], json: res.json, raw: res }
}

async function alertsSnapshot() {
  const [list, unread] = await Promise.all([
    apiCall(frontend, '/api/alerts?page=1&pageSize=50', { token: adminToken }),
    apiCall(frontend, '/api/alerts/unread-count', { token: adminToken }),
  ])
  return {
    items: Array.isArray(list.json?.items) ? list.json.items : [],
    unread: unread.json?.unread ?? null,
    listStatus: list.status,
    unreadStatus: unread.status,
  }
}

let adminToken = null
let adminUserId = null

await runScript('e2e-gateway', async (report) => {
  report.env = { frontend, backend, runId, node: process.version, startedAt: new Date().toISOString() }

  await report.step(
    '前置：后端 /health 就绪',
    async () => {
      const health = await waitForBackend(backend, { timeoutMs: Number(args.waitTimeout) })
      return `status=${health.status} database=${health.database}`
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
  await report.step(
    '前置：admin 登录（经 Vite 代理）',
    async () => {
      const login = await loginApi(frontend)
      adminToken = login.token
      const me = await apiCall(frontend, '/api/auth/me', { token: adminToken })
      if (me.status !== 200 || !me.json?.user?.id) throw new Error(`/api/auth/me unexpected: HTTP ${me.status}`)
      adminUserId = me.json.user.id
      return `admin id=${adminUserId}`
    },
    { required: true }
  )

  const keys = []
  let usages = []
  const browser = await launchBrowser()
  try {
    // ---- 1. 创建普通 Key ------------------------------------------------
    let normalKey = null
    await report.step(
      '创建 API Key（明文仅返回一次，sk- 前缀）',
      async () => {
        normalKey = await createKey({
          name: `${PREFIX}-normal`,
          rpmLimit: 120,
          tpmLimit: 20_000_000,
          dailyQuota: 100_000_000,
          monthlyQuota: 1_000_000_000,
        })
        keys.push({ ...normalKey, kind: 'normal' })
        if (!normalKey.apiKey.startsWith('sk-')) throw new Error(`apiKey 前缀异常: ${normalKey.apiKey.slice(0, 6)}`)
        return `id=${normalKey.id} prefix=${normalKey.prefix}`
      }
    )

    // 列表不含明文（契约 2.7）
    await report.step('GET /api/keys 不泄露明文 Key', async () => {
      const res = await apiCall(frontend, `/api/keys?userId=${adminUserId}`, { token: adminToken })
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
      const text = res.text
      if (normalKey && text.includes(normalKey.apiKey)) {
        throw new Error('列表响应中出现了完整明文 Key（应仅返回 keyPrefix）')
      }
      const hit = (res.json?.items || []).find((k) => Number(k.id) === Number(normalKey.id))
      if (!hit) throw new Error('列表中找不到新建 Key')
      return `items=${res.json.items.length} keyPrefix=${hit.keyPrefix} hasPlaintext=false`
    })

    // ---- 2. 3 次非流式推理 ----------------------------------------------
    await report.step('POST /v1/chat/completions ×3 返回 OpenAI 兼容 usage', async () => {
      for (let i = 1; i <= 3; i += 1) {
        const res = await chat({
          apiKey: normalKey.apiKey,
          content: `QA gateway e2e request #${i} (${runId}) — token 计量验证。`,
        })
        if (res.status !== 200) throw new Error(`第 ${i} 次请求 HTTP ${res.status}: ${res.text.slice(0, 300)}`)
        const json = res.json || {}
        const usage = json.usage || {}
        const total = Number(usage.total_tokens)
        const prompt = Number(usage.prompt_tokens)
        const completion = Number(usage.completion_tokens)
        if (!Number.isFinite(total) || total <= 0) throw new Error(`第 ${i} 次 usage.total_tokens 非法: ${JSON.stringify(usage)}`)
        if (!Number.isFinite(prompt) || prompt <= 0) throw new Error(`第 ${i} 次 usage.prompt_tokens 非法: ${JSON.stringify(usage)}`)
        if (!Number.isFinite(completion) || completion < 0) throw new Error(`第 ${i} 次 usage.completion_tokens 非法`)
        if (total !== prompt + completion) throw new Error(`第 ${i} 次 total != prompt+completion`)
        const content = json.choices?.[0]?.message?.content
        if (typeof content !== 'string' || !content.length) throw new Error(`第 ${i} 次 choices[0].message.content 为空`)
        if (!json.model) throw new Error(`第 ${i} 次响应缺少 model`)
        usages.push({
          model: json.model,
          prompt,
          completion,
          total,
          contentLength: content.length,
          rateLimitHeaders: {
            limit: res.headers.get('x-ratelimit-limit'),
            remaining: res.headers.get('x-ratelimit-remaining'),
            reset: res.headers.get('x-ratelimit-reset'),
          },
          quotaRemaining: res.headers.get('x-quota-remaining'),
        })
        await sleep(120)
      }
      return `usages=${JSON.stringify(usages.map((u) => u.total))} model=${usages[0]?.model}`
    })
    report.info(
      '非流式响应头（限流/配额观测）',
      JSON.stringify(usages[0]?.rateLimitHeaders || {}) + ` quotaRemaining=${usages[0]?.quotaRemaining ?? 'n/a'}`
    )

    // ---- 3. 请求日志核对 -------------------------------------------------
    await report.step('流量日志记录 3 次成功请求（Token 与 usage 一致）', async () => {
      const prefix = normalKey.prefix
      const deadline = Date.now() + 12000
      let matched = []
      let lastCount = -1
      while (Date.now() < deadline) {
        const logs = await trafficLogs(80, adminToken)
        matched = logs.items.filter((row) => String(row.keyPrefix || '').startsWith(prefix))
        lastCount = logs.items.length
        if (matched.length >= 3) break
        await sleep(400)
      }
      if (matched.length < 3) throw new Error(`日志中 keyPrefix=${prefix} 的记录仅 ${matched.length} 条（最近 80 条共 ${lastCount}）`)
      const successRows = matched.filter((row) => /success|成功/i.test(String(row.status || row.statusKey || '')))
      if (successRows.length < 3) throw new Error(`成功状态日志不足: ${matched.map((r) => r.status).join(',')}`)
      const expected = usages.reduce((sum, u) => sum + u.total, 0)
      const logged = successRows.slice(0, 3).reduce((sum, row) => sum + Number(row.totalTokens || 0), 0)
      if (logged !== expected) throw new Error(`日志 Token 合计 ${logged} != 响应 usage 合计 ${expected}`)
      return `records=${matched.length} tokens=${logged}`
    })

    // ---- 4. 流式响应 -----------------------------------------------------
    await report.step('stream=true 返回 SSE 且以 data: [DONE] 结束', async () => {
      const res = await chat({
        apiKey: normalKey.apiKey,
        content: `QA streaming check ${runId}`,
        stream: true,
      })
      if (res.status !== 200) throw new Error(`流式请求 HTTP ${res.status}: ${res.text.slice(0, 200)}`)
      const contentType = res.headers.get('content-type') || ''
      const body = res.text || ''
      if (!/text\/event-stream/i.test(contentType)) throw new Error(`Content-Type 非 text/event-stream: ${contentType}`)
      if (!body.includes('data: ')) throw new Error('SSE 响应中没有 data: 块')
      if (!/data:\s*\[DONE\]/.test(body)) throw new Error('SSE 响应缺少 data: [DONE]')
      const chunks = body.split(/\n\n/).filter((line) => line.startsWith('data: ') && !line.includes('[DONE]'))
      if (!chunks.length) throw new Error('SSE 没有内容块')
      return `contentType=${contentType.split(';')[0]} chunks=${chunks.length}`
    })

    // ---- 5. 限流（低 RPM Key）--------------------------------------------
    let rateKey = null
    await report.step(
      '低 RPM Key：连续请求触发 429 rate_limited + Retry-After',
      async () => {
        rateKey = await createKey({
          name: `${PREFIX}-ratelimit`,
          rpmLimit: 2,
          tpmLimit: 20_000_000,
          dailyQuota: 100_000_000,
          monthlyQuota: 1_000_000_000,
        })
        keys.push({ ...rateKey, kind: 'ratelimit' })
        const results = []
        for (let i = 0; i < 6; i += 1) {
          const res = await chat({ apiKey: rateKey.apiKey, content: `rate limit probe ${i} ${runId}` })
          results.push({
            status: res.status,
            code: res.json?.error?.code || null,
            retryAfter: res.headers.get('retry-after'),
          })
        }
        const limited = results.filter((r) => r.status === 429)
        if (!limited.length) throw new Error(`6 次快速请求均未触发 429: ${JSON.stringify(results)}`)
        const rateLimited = limited.find((r) => r.code === 'rate_limited')
        if (!rateLimited) throw new Error(`429 但 error.code 不是 rate_limited: ${JSON.stringify(limited)}`)
        if (!rateLimited.retryAfter) throw new Error('429 响应缺少 Retry-After 头')
        report.data.rateLimitResults = results
        return `statuses=${results.map((r) => r.status).join(',')} retryAfter=${rateLimited.retryAfter}s`
      }
    )

    // ---- 6. 配额（低日配额 Key）------------------------------------------
    let quotaKey = null
    await report.step(
      '低日配额 Key：请求触发 429 quota_exceeded（且不计量）',
      async () => {
        quotaKey = await createKey({
          name: `${PREFIX}-quota`,
          rpmLimit: 60,
          tpmLimit: 200_000_000,
          dailyQuota: 100,
          monthlyQuota: 1000,
        })
        keys.push({ ...quotaKey, kind: 'quota' })
        const res = await chat({
          apiKey: quotaKey.apiKey,
          content: `quota probe ${runId} ` + 'x'.repeat(1200),
          maxTokens: 64,
        })
        if (res.status !== 429) throw new Error(`期望 429，实际 HTTP ${res.status}: ${res.text.slice(0, 300)}`)
        const code = res.json?.error?.code
        if (code !== 'quota_exceeded') throw new Error(`429 但 error.code=${code}（期望 quota_exceeded）`)
        report.data.quotaResponse = { status: res.status, code, headers: Object.fromEntries(res.headers.entries()) }
        return `status=429 code=quota_exceeded quotaRemaining=${res.headers.get('x-quota-remaining') ?? 'n/a'}`
      }
    )

    // ---- 7. 告警 ---------------------------------------------------------
    let alertsAfter = null
    await report.step('限流/配额事件产生告警（GET /api/alerts）', async () => {
      const deadline = Date.now() + 15000
      let hit = null
      let snapshot = null
      while (Date.now() < deadline) {
        snapshot = await alertsSnapshot()
        const candidates = snapshot.items.filter((a) => {
          const text = `${a.type || ''} ${a.title || ''} ${a.message || ''}`.toLowerCase()
          return /quota|rate|限流|配额/.test(text)
        })
        if (candidates.length) {
          hit = candidates[0]
          break
        }
        await sleep(500)
      }
      alertsAfter = snapshot
      if (!hit) {
        throw new Error(
          `告警列表未发现配额/限流告警（items=${snapshot?.items?.length ?? '?'} unread=${snapshot?.unread ?? '?'}）`
        )
      }
      report.data.alertSample = { type: hit.type, level: hit.level, title: hit.title, message: hit.message }
      return `unread=${snapshot.unread} sample="${hit.title || hit.message}" type=${hit.type}`
    })

    // ---- 8. 日志中可见限流/配额记录 --------------------------------------
    await report.step('流量日志包含 rate_limited / quota_exceeded 记录', async () => {
      const logs = await trafficLogs(100, adminToken)
      const statuses = logs.items.map((row) => String(row.status || ''))
      const rateRows = logs.items.filter((row) => /rate_limited/i.test(String(row.status)))
      const quotaRows = logs.items.filter((row) => /quota_exceeded/i.test(String(row.status)))
      if (!rateRows.length) throw new Error(`最近 ${logs.items.length} 条日志无限流记录（statuses=${[...new Set(statuses)].slice(0, 6)}）`)
      if (!quotaRows.length) throw new Error('最近日志无配额超限记录')
      report.data.statusBreakdown = [...new Set(statuses)]
      return `rate_limited=${rateRows.length} quota_exceeded=${quotaRows.length}`
    })

    // ---- 9. OpenAI 错误分支 ----------------------------------------------
    await report.step('OpenAI 错误分支：无 Key 401 / 缺 messages 400 / 未知模型 4xx', async () => {
      const noKey = await chat({ apiKey: null, authOverride: null, content: 'no key' })
      if (noKey.status !== 401) throw new Error(`无 Key 期望 401，实际 ${noKey.status}`)
      const missing = await apiCall(frontend, '/v1/chat/completions', {
        method: 'POST',
        token: normalKey.apiKey,
        body: { model: 'GPT-4o' },
      })
      if (missing.status !== 400) throw new Error(`缺 messages 期望 400，实际 ${missing.status}`)
      const unknown = await chat({ apiKey: normalKey.apiKey, model: 'definitely-not-a-model', content: 'x' })
      if (![400, 404].includes(unknown.status)) throw new Error(`未知模型期望 400/404，实际 ${unknown.status}`)
      report.data.errorBranches = {
        noKey: { status: noKey.status, code: noKey.json?.error?.code },
        missingMessages: { status: missing.status, code: missing.json?.error?.code },
        unknownModel: { status: unknown.status, code: unknown.json?.error?.code },
      }
      return `noKey=${noKey.status} missingMessages=${missing.status} unknownModel=${unknown.status}`
    })

    // ---- 10. 浏览器侧可见性（Dashboard 告警 / 流量页）--------------------
    await report.step('浏览器：流量监控页可见限流/配额记录（或 Dashboard 告警）', async () => {
      const { context, page, errors } = await newInstrumentedPage(browser, {
        token: adminToken,
        viewport: { width: 1672, height: 941 },
      })
      try {
        await page.goto(`${frontend}/#/traffic`, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await waitForBodyText(page, ['流量监控'], { timeout: 20000 })
        await settle(page, { ms: 700 })
        const trafficText = await bodyText(page)
        await report.shot(page, 'traffic-page')
        const trafficHit = /限流|配额|rate_limited|quota_exceeded|已拒绝/.test(trafficText)

        await page.goto(`${frontend}/#/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await waitForBodyText(page, ['总请求量'], { timeout: 20000 })
        await settle(page, { ms: 700 })
        const dashText = await bodyText(page)
        await report.shot(page, 'dashboard-after-gateway')
        // 顶栏通知徽标 > 0 或页面出现告警文案
        const badge = await page
          .locator('.bell-badge, [data-testid="alert-badge"], .topbar .badge')
          .first()
          .innerText()
          .catch(() => '')
        const badgeHit = /[1-9]/.test(badge || '')
        const dashHit = /告警|通知|限流|配额/.test(dashText)
        if (errors.pageErrors.length) report.info('流量页 pageerror', errors.pageErrors.slice(0, 2).join(' | '))
        if (!trafficHit && !(badgeHit || dashHit)) {
          throw new Error('流量页未展示限流/配额记录，Dashboard 也未显示告警徽标/文案')
        }
        return `trafficHit=${trafficHit} badge="${badge}" dashHit=${dashHit}`
      } finally {
        await context.close().catch(() => {})
      }
    })

    // ---- 11. 清理 --------------------------------------------------------
    await report.step('清理：吊销本次创建的 API Key', async () => {
      const revoked = []
      for (const key of keys) {
        if (!key.id) continue
        const res = await apiCall(frontend, `/api/keys/${key.id}`, { method: 'DELETE', token: adminToken })
        revoked.push(`${key.kind}:${res.status}`)
      }
      return revoked.join(' ')
    })
  } finally {
    if (browser) await browser.close().catch(() => {})
    report.data.keys = keys.map((k) => ({ id: k.id, name: k.name, kind: k.kind, prefix: k.prefix }))
    report.data.usages = usages
  }
})
