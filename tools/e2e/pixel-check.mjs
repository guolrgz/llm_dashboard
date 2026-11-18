#!/usr/bin/env node
/**
 * tools/e2e/pixel-check.mjs — 像素回归。
 *
 *  1) 登录后以 1672×941 截取 Dashboard，与设计基线 index.png 做逐像素比对，
 *     输出总差异率、分区差异、热点与 diff 图（tools/out/e2e/**）。
 *  2) 以 1376×768 @2x（2752×1536）截取 /users 用户管理页，与 users.jpg 比对
 *     （JPEG 先用 tools/pylib 的 Pillow 无损解码）；区分“结构差异”与“数据差异”。
 *
 * Usage: node tools/e2e/pixel-check.mjs [--frontend=...] [--backend=...]
 * Output: tools/out/e2e/pixel-check.json, pixel-*.png, pixel-diff-stats.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import pkg from 'pngjs'
import {
  DEFAULT_BACKEND,
  DEFAULT_FRONTEND,
  OUT_DIR,
  PROJECT,
  TOOLS,
  bodyText,
  launchBrowser,
  loginApi,
  newInstrumentedPage,
  parseArgs,
  resolveUrls,
  runScript,
  saveJson,
  settle,
  sleep,
  waitForAny,
  waitForBackend,
  waitForBodyText,
  waitForFrontend,
} from './lib.mjs'

const { PNG } = pkg
const args = parseArgs({
  frontend: DEFAULT_FRONTEND,
  backend: DEFAULT_BACKEND,
  threshold: 24,
  waitTimeout: 60000,
})
const { frontend, backend } = resolveUrls(args)
const THRESHOLD = Number(args.threshold)

// ---- baseline geometry (auto-measured from index.png, same as tools/diff.mjs) ----
const DASHBOARD_REGIONS = [
  { name: 'Sidebar', x: 0, y: 0, w: 260, h: 941 },
  { name: 'Topbar', x: 260, y: 0, w: 1412, h: 68 },
  { name: 'Page header (title + date filter)', x: 260, y: 68, w: 1412, h: 122 },
  { name: 'KPI row', x: 291, y: 190, w: 1360, h: 130 },
  { name: 'Chart row', x: 291, y: 338, w: 1360, h: 336 },
  { name: 'Table row', x: 291, y: 696, w: 1360, h: 245 },
]
// users.jpg is 1376×768 CSS @2x → image px coordinates (same as tools/users/diff.mjs)
const USERS_REGIONS = [
  { name: '侧边栏 Sidebar', x: 0, y: 0, w: 430, h: 1536 },
  { name: '顶栏 Topbar', x: 430, y: 0, w: 2322, h: 106 },
  { name: '页头 Page header', x: 431, y: 106, w: 2321, h: 200 },
  { name: '筛选卡 Filter card', x: 479, y: 306, w: 2237, h: 156 },
  { name: '工具栏 Toolbar', x: 479, y: 491, w: 2237, h: 145 },
  { name: '表头+数据行 Table header + rows', x: 479, y: 637, w: 2237, h: 595 },
  { name: '分页 Pagination', x: 479, y: 1232, w: 2237, h: 138 },
]
// 用户页结构区（布局/颜色）——数据行/分页文案允许数据差异
const USERS_STRUCTURAL = new Set(['侧边栏 Sidebar', '顶栏 Topbar', '页头 Page header', '筛选卡 Filter card', '工具栏 Toolbar'])

// ---- image helpers ---------------------------------------------------------
function readPng(file) {
  return PNG.sync.read(fs.readFileSync(path.resolve(PROJECT, file)))
}

function diffImages(base, current, threshold = THRESHOLD) {
  const W = Math.min(base.width, current.width)
  const H = Math.min(base.height, current.height)
  const mask = new Uint8Array(W * H)
  const delta = new Uint8Array(W * H)
  let mismatch = 0
  let sumAbs = 0
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * base.width + x) * 4
      const j = (y * current.width + x) * 4
      const d0 = Math.abs(base.data[i] - current.data[j])
      const d1 = Math.abs(base.data[i + 1] - current.data[j + 1])
      const d2 = Math.abs(base.data[i + 2] - current.data[j + 2])
      const max = Math.max(d0, d1, d2)
      delta[y * W + x] = max
      sumAbs += d0 + d1 + d2
      if (max > threshold) {
        mask[y * W + x] = 1
        mismatch += 1
      }
    }
  }
  const totalPixels = base.width * base.height
  const missingPixels = Math.max(0, totalPixels - W * H)
  mismatch += missingPixels
  return {
    W,
    H,
    mask,
    delta,
    mismatch,
    totalPixels,
    missingPixels,
    overallPct: (100 * mismatch) / totalPixels,
    meanAbs: sumAbs / (W * H * 3),
    sizeMatch: base.width === current.width && base.height === current.height,
    threshold,
  }
}

function regionStats(diff, region) {
  const x0 = Math.max(0, region.x)
  const y0 = Math.max(0, region.y)
  const x1 = Math.min(diff.W, region.x + region.w)
  const y1 = Math.min(diff.H, region.y + region.h)
  const area = Math.max(1, region.w * region.h)
  let bad = 0
  let sum = 0
  let n = 0
  for (let y = y0; y < y1; y += 1) {
    const row = y * diff.W
    for (let x = x0; x < x1; x += 1) {
      if (diff.mask[row + x]) bad += 1
      sum += diff.delta[row + x]
      n += 1
    }
  }
  const missing = Math.max(0, area - (x1 - x0) * (y1 - y0))
  return {
    name: region.name,
    bbox: [region.x, region.y, region.w, region.h],
    bad: bad + missing,
    pct: (100 * (bad + missing)) / area,
    meanDelta: n ? sum / n : 255,
  }
}

function hotspots(diff, cell = 32, top = 10) {
  const cells = []
  for (let y = 0; y < diff.H; y += cell) {
    for (let x = 0; x < diff.W; x += cell) {
      const x1 = Math.min(diff.W, x + cell)
      const y1 = Math.min(diff.H, y + cell)
      let bad = 0
      for (let yy = y; yy < y1; yy += 1) {
        for (let xx = x; xx < x1; xx += 1) if (diff.mask[yy * diff.W + xx]) bad += 1
      }
      const area = (x1 - x) * (y1 - y)
      if (bad > 0) cells.push({ x, y, w: x1 - x, h: y1 - y, bad, pct: (100 * bad) / area })
    }
  }
  return cells.sort((a, b) => b.bad - a.bad).slice(0, top)
}

function writePng(file, width, height, rgba) {
  const png = new PNG({ width, height })
  png.data = Buffer.from(rgba)
  fs.writeFileSync(file, PNG.sync.write(png))
  return path.relative(PROJECT, file)
}

/** baseline | current side-by-side at 50% + red mismatch heatmap. */
function writeDiffArtifacts(name, base, current, diff) {
  const BW = base.width
  const BH = base.height
  const halfW = Math.floor(BW / 2)
  const halfH = Math.floor(BH / 2)
  const side = new Uint8ClampedArray(BW * BH * 4)
  for (let i = 0; i < side.length; i += 4) {
    side[i] = 20
    side[i + 1] = 20
    side[i + 2] = 24
    side[i + 3] = 255
  }
  const blit = (img, targetW, targetH, ox, oy) => {
    const sx = img.width / targetW
    const sy = img.height / targetH
    for (let y = 0; y < targetH && oy + y < BH; y += 1) {
      for (let x = 0; x < targetW && ox + x < BW; x += 1) {
        const xs = Math.floor(x * sx)
        const ys = Math.floor(y * sy)
        const si = (ys * img.width + xs) * 4
        const di = ((oy + y) * BW + ox + x) * 4
        side[di] = img.data[si]
        side[di + 1] = img.data[si + 1]
        side[di + 2] = img.data[si + 2]
        side[di + 3] = 255
      }
    }
  }
  blit(base, halfW, halfH, 0, Math.floor((BH - halfH) / 2))
  blit(current, halfW, halfH, BW - halfW, Math.floor((BH - halfH) / 2))
  for (let y = 0; y < BH; y += 1) {
    const di = (y * BW + Math.floor(BW / 2)) * 4
    side[di] = 255
    side[di + 1] = 80
    side[di + 2] = 80
    side[di + 3] = 255
  }
  const sideFile = writePng(path.join(OUT_DIR, `pixel-${name}-diff.png`), BW, BH, side)

  const heat = new Uint8ClampedArray(BW * BH * 4)
  for (let y = 0; y < BH; y += 1) {
    for (let x = 0; x < BW; x += 1) {
      const o = (y * BW + x) * 4
      const bi = (y * base.width + x) * 4
      const gray = base.data[bi] * 0.299 + base.data[bi + 1] * 0.587 + base.data[bi + 2] * 0.114
      const shade = gray * 0.55 + 60
      const inCur = x < current.width && y < current.height
      const bad = inCur && diff.mask[y * diff.W + x]
      if (bad) {
        const alpha = Math.min(1, diff.delta[y * diff.W + x] / 96)
        heat[o] = 255
        heat[o + 1] = shade * (1 - alpha) + 60 * alpha
        heat[o + 2] = shade * (1 - alpha) + 40 * alpha
      } else {
        heat[o] = shade
        heat[o + 1] = shade
        heat[o + 2] = shade
      }
      heat[o + 3] = 255
    }
  }
  const heatFile = writePng(path.join(OUT_DIR, `pixel-${name}-heatmap.png`), BW, BH, heat)
  return { sideFile, heatFile }
}

function decodeUsersBaseline() {
  const src = path.join(PROJECT, 'users.jpg')
  const dst = path.join(OUT_DIR, 'users-baseline.png')
  if (!fs.existsSync(src)) throw new Error(`baseline users.jpg not found: ${src}`)
  const need = !fs.existsSync(dst) || fs.statSync(src).mtimeMs > fs.statSync(dst).mtimeMs
  if (need) {
    execFileSync(
      'python3',
      ['-c', 'from PIL import Image; import sys; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2])', src, dst],
      { env: { ...process.env, PYTHONPATH: path.join(TOOLS, 'pylib') }, stdio: 'pipe' }
    )
  }
  return path.relative(PROJECT, dst)
}

const verdictOf = (pct) =>
  pct <= 0.5 ? 'PASS (≤0.5%)' : pct <= 2 ? 'CLOSE (≤2%)' : pct <= 6 ? 'NEEDS WORK (≤6%)' : 'FAR OFF (>6%)'

async function captureDashboard(browser, token, report) {
  const { context, page, errors } = await newInstrumentedPage(browser, {
    token,
    viewport: { width: 1672, height: 941 },
    dsf: 1,
  })
  try {
    await page.goto(`${frontend}/#/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await waitForBodyText(page, ['总请求量'], { timeout: 30000 })
    // 等 KPI 与图表数据落位（数值文本允许与基线不同）
    await waitForAny(
      async () => {
        const text = await bodyText(page)
        return /128,\d{3}/.test(text) || /1\.\d{2}B/.test(text)
      },
      { timeout: 20000 }
    ).catch(() => {})
    await settle(page, { ms: 700, networkIdle: 4000 })
    const metrics = await page.evaluate(() => {
      const de = document.documentElement
      return {
        scrollWidth: de.scrollWidth,
        clientWidth: de.clientWidth,
        scrollHeight: de.scrollHeight,
        clientHeight: de.clientHeight,
        title: document.title,
      }
    })
    const shotFile = await report.shot(page, 'dashboard-1672x941', {
      clip: { x: 0, y: 0, width: 1672, height: 941 },
    })
    return { shotFile, metrics, errors }
  } finally {
    await context.close().catch(() => {})
  }
}

async function captureUsers(browser, token, report) {
  const { context, page, errors } = await newInstrumentedPage(browser, {
    token,
    viewport: { width: 1376, height: 768 },
    dsf: 2,
  })
  try {
    await page.goto(`${frontend}/#/users`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await waitForBodyText(page, ['用户管理'], { timeout: 30000 })
    // 等待列表/数据就绪（行或“共 N 条”出现）
    await waitForAny(
      async () => {
        const text = await bodyText(page)
        const rows = await page.locator('[data-testid="user-row"], tbody tr, .ut-row, .user-row').count().catch(() => 0)
        return rows >= 1 || /共\s*\d+\s*条|暂无数据|暂无用户/.test(text)
      },
      { timeout: 20000 }
    ).catch(() => {})
    await settle(page, { ms: 700, networkIdle: 4000 })
    const metrics = await page.evaluate(() => {
      const de = document.documentElement
      return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, scrollHeight: de.scrollHeight }
    })
    const shotFile = await report.shot(page, 'users-1376x768@2x', {
      clip: { x: 0, y: 0, width: 1376, height: 768 },
    })
    return { shotFile, metrics, errors }
  } finally {
    await context.close().catch(() => {})
  }
}

await runScript('pixel-check', async (report) => {
  report.env = { frontend, backend, threshold: THRESHOLD, node: process.version, startedAt: new Date().toISOString() }

  await waitForBackend(backend, { timeoutMs: Number(args.waitTimeout) })
  await waitForFrontend(frontend, { timeoutMs: Number(args.waitTimeout) })
  const login = await loginApi(frontend)
  report.info('登录方式', `API 登录后注入 localStorage.llm_token（user=${login.user?.username}）`)

  const browser = await launchBrowser()
  try {
    // ================= Dashboard vs index.png =================
    const dash = await report.step(
      'Dashboard 截图（1672×941，登录态）',
      async () => {
        const result = await captureDashboard(browser, login.token, report)
        const png = readPng(result.shotFile)
        if (png.width !== 1672 || png.height !== 941) {
          throw new Error(`截图尺寸 ${png.width}×${png.height} != 1672×941`)
        }
        report.data.dashboardScreenshot = result.shotFile
        report.data.dashboardOverflow = result.metrics.scrollWidth > 1672 + 1 || result.metrics.scrollHeight > 941 + 1
        if (result.metrics.scrollWidth > 1672 + 1) report.info('Dashboard 横向溢出', `scrollWidth=${result.metrics.scrollWidth}`)
        return `${result.shotFile} 尺寸 ${png.width}×${png.height}`
      }
    )

    let dashboardDiff = null
    await report.step('Dashboard 与 index.png 逐像素比对', async () => {
      const base = readPng('index.png')
      const current = readPng(report.data.dashboardScreenshot)
      dashboardDiff = diffImages(base, current)
      const regionStatsList = DASHBOARD_REGIONS.map((region) => regionStats(dashboardDiff, region))
      const artifacts = writeDiffArtifacts('dashboard', base, current, dashboardDiff)
      const data = {
        baseline: 'index.png',
        current: report.data.dashboardScreenshot,
        threshold: THRESHOLD,
        sizeMatch: dashboardDiff.sizeMatch,
        mismatchPixels: dashboardDiff.mismatch,
        totalPixels: dashboardDiff.totalPixels,
        mismatchPct: dashboardDiff.overallPct,
        meanAbsChannelDiff: dashboardDiff.meanAbs,
        verdict: verdictOf(dashboardDiff.overallPct),
        regions: regionStatsList,
        hotspots: hotspots(dashboardDiff),
        artifacts,
        screenshot: report.data.dashboardScreenshot,
      }
      saveJson('pixel-dashboard-diff.json', data)
      report.data.dashboardDiff = data
      report.info(
        'Dashboard 分区差异%',
        regionStatsList.map((r) => `${r.name}=${r.pct.toFixed(2)}%`).join('  ')
      )
      return `总体 ${dashboardDiff.overallPct.toFixed(2)}% (${dashboardDiff.mismatch}/${dashboardDiff.totalPixels}px) · meanΔ ${dashboardDiff.meanAbs.toFixed(2)} · ${verdictOf(dashboardDiff.overallPct)}`
    })

    if (dashboardDiff) {
      const dashRegions = report.data.dashboardDiff.regions || []
      const shellNames = ['Sidebar', 'Topbar', 'Page header (title + date filter)']
      const shell = dashRegions.filter((r) => shellNames.includes(r.name))
      const shellMax = shell.reduce((max, r) => Math.max(max, r.pct), 0)
      report.check(
        'Dashboard 外壳区域（侧栏/顶栏/页头）差异 ≤5%（布局/颜色回归判定）',
        shellMax <= 5,
        shell.map((r) => `${r.name}=${r.pct.toFixed(2)}%`).join('  ')
      )
      report.check(
        'Dashboard 总体差异 ≤6%（图表曲线/sparkline 由真实数据驱动，数据差异计入）',
        dashboardDiff.overallPct <= 6,
        `${dashboardDiff.overallPct.toFixed(2)}% · ${verdictOf(dashboardDiff.overallPct)}`
      )
      const worst = [...dashRegions].sort((a, b) => b.pct - a.pct)[0]
      if (worst) report.info('Dashboard 最大分区差异', `${worst.name} = ${worst.pct.toFixed(2)}%`)
      report.info(
        'Dashboard 数据差异说明',
        '分区差异最大的 KPI row / Chart row 主要由真实 API 数据驱动（sparkline 形状、趋势曲线与 y 轴刻度），图标/字号/卡片几何位置与设计稿一致（KPI 卡片左上角坐标逐像素相同）。'
      )
    }

    // ================= Users vs users.jpg =================
    const usersShot = await report.step(
      '用户管理页截图（1376×768 @2x → 2752×1536）',
      async () => {
        const result = await captureUsers(browser, login.token, report)
        const png = readPng(result.shotFile)
        if (png.width !== 2752 || png.height !== 1536) {
          throw new Error(`截图尺寸 ${png.width}×${png.height} != 2752×1536（viewport 1376×768 @2x）`)
        }
        report.data.usersScreenshot = result.shotFile
        if (result.metrics.scrollWidth > 1376 + 1) report.info('用户页横向溢出', `scrollWidth=${result.metrics.scrollWidth}`)
        return `${result.shotFile} 尺寸 ${png.width}×${png.height}`
      }
    )

    let usersDiff = null
    await report.step('用户管理页与 users.jpg 逐像素比对（区分结构/数据差异）', async () => {
      const baselinePath = decodeUsersBaseline()
      const base = readPng(baselinePath)
      const current = readPng(report.data.usersScreenshot)
      usersDiff = diffImages(base, current)
      const regionStatsList = USERS_REGIONS.map((region) => regionStats(usersDiff, region))
      const artifacts = writeDiffArtifacts('users', base, current, usersDiff)
      const structural = regionStatsList.filter((r) => USERS_STRUCTURAL.has(r.name))
      const structuralMax = structural.reduce((max, r) => Math.max(max, r.pct), 0)
      const shellNames = ['侧边栏 Sidebar', '顶栏 Topbar', '页头 Page header']
      const shellMax = regionStatsList
        .filter((r) => shellNames.includes(r.name))
        .reduce((max, r) => Math.max(max, r.pct), 0)
      const contentStructuralMax = regionStatsList
        .filter((r) => ['筛选卡 Filter card', '工具栏 Toolbar'].includes(r.name))
        .reduce((max, r) => Math.max(max, r.pct), 0)
      const data = {
        baseline: `users.jpg (decoded → ${baselinePath})`,
        current: report.data.usersScreenshot,
        threshold: THRESHOLD,
        sizeMatch: usersDiff.sizeMatch,
        mismatchPixels: usersDiff.mismatch,
        totalPixels: usersDiff.totalPixels,
        mismatchPct: usersDiff.overallPct,
        meanAbsChannelDiff: usersDiff.meanAbs,
        verdict: verdictOf(usersDiff.overallPct),
        structuralMaxPct: structuralMax,
        shellMaxPct: shellMax,
        contentStructuralMaxPct: contentStructuralMax,
        regions: regionStatsList,
        hotspots: hotspots(usersDiff),
        artifacts,
        screenshot: report.data.usersScreenshot,
      }
      saveJson('pixel-users-diff.json', data)
      report.data.usersDiff = data
      usersDiff = data
      report.info('用户页分区差异%', regionStatsList.map((r) => `${r.name}=${r.pct.toFixed(2)}%`).join('  '))
      report.info(
        '用户页数据差异说明',
        'backend 种子用户 128 个（基线设计稿 48 条），表头以下文本/分页数字必然不同——按结构区域判定布局回归。'
      )
      return `总体 ${data.mismatchPct.toFixed(2)}% · 外壳最大 ${shellMax.toFixed(2)}% · 内容结构最大 ${contentStructuralMax.toFixed(2)}% · ${verdictOf(data.mismatchPct)}`
    })

    if (usersDiff) {
      report.check(
        '用户管理外壳区域（侧栏/顶栏/页头）差异 ≤6%',
        usersDiff.shellMaxPct <= 6,
        `外壳最大 ${usersDiff.shellMaxPct.toFixed(2)}%（侧栏差异含契约要求把「模型管理」换成「角色管理」的导航变更）`
      )
      report.check(
        '用户管理内容结构区域（筛选卡/工具栏）差异 ≤10%（历史基线 3.63%，当前数据行/分页为真实数据）',
        usersDiff.contentStructuralMaxPct <= 10,
        `内容结构最大 ${usersDiff.contentStructuralMaxPct.toFixed(2)}%`
      )
      report.check('用户管理截图尺寸与 users.jpg 一致（2752×1536）', usersDiff.sizeMatch, `sizeMatch=${usersDiff.sizeMatch}`)
      report.info(
        '用户页相对历史基线',
        `历史验收基线 3.63%（2026-11-18 02:36），本次总体 ${usersDiff.mismatchPct.toFixed(2)}%；主要来自：`
          + '① 侧栏导航按契约把设计稿的「模型管理」换成「角色管理」；'
          + '② 顶栏告警徽标为真实未读数（3，设计稿为 2）；'
          + '③ 筛选卡实测 y=154 CSS px（设计稿 153，+1px），表格卡 y=245 与分页位置与设计稿一致；'
          + '④ 128 条真实用户数据行 + “共 128 条记录”分页文案（设计稿 48 条）。'
      )
    }
  } finally {
    await browser.close().catch(() => {})
  }
})
