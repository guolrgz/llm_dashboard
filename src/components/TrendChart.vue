<template>
  <div class="chart-wrap" id="chartWrap" ref="wrapEl">
    <svg class="line-chart" id="lineChart" ref="svgEl" role="img" aria-label="请求量趋势折线图"></svg>
    <div class="chart-tip" id="chartTip" ref="tipEl">
      <div class="tip-time">{{ tip.time }}</div>
      <div class="tip-row"><i class="dot dot--blue"></i><span class="tip-key">请求量:</span><b>{{ tip.total }}</b></div>
      <div class="tip-row"><i class="dot dot--green"></i><span class="tip-key">成功请求:</span><b>{{ tip.success }}</b></div>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { el, monotonePath } from '../charts/svg.js'
import { chart, SUCCESS, TOTAL } from '../data/dashboard.js'

const props = defineProps({
  /* 请求量序列（默认使用设计稿数据） */
  total: { type: Array, default: () => TOTAL },
  success: { type: Array, default: () => SUCCESS },
  /* x 轴刻度文案（今日默认 00:00 … 20:00） */
  xLabels: {
    type: Array,
    default: () => ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
  },
  /* y 轴刻度值与对应文案，不传则用设计稿默认值 */
  yTicks: { type: Array, default: () => chart.yTicks },
  yLabels: { type: Object, default: () => chart.yLabels },
  range: { type: String, default: 'today' },
})

const wrapEl = ref(null)
const svgEl = ref(null)
const tipEl = ref(null)
const tip = reactive({ time: '20:00', total: '78,230', success: '77,102' })

let resizeObserver = null
let raf = 0

/* 当前绘图区几何信息（每次 render 更新，供一次性绑定的鼠标事件使用） */
const view = { W: 0, plotLeft: 44, plotW: 1, count: 0, xDenom: 1, placeTip: null }

const fmt = (n) => {
  const num = Number(n)
  if (!Number.isFinite(num)) return String(n ?? '0')
  return num.toLocaleString('en-US')
}

function compact(v) {
  const num = Number(v)
  if (!Number.isFinite(num)) return String(v)
  if (num >= 1e9) return `${+(num / 1e9).toFixed(2)}B`
  if (num >= 1e6) return `${+(num / 1e6).toFixed(2)}M`
  if (num >= 1e3) return `${+(num / 1e3).toFixed(num >= 1e5 ? 0 : 1)}k`
  return String(num)
}

function seriesData() {
  const totals = (Array.isArray(props.total) ? props.total : []).map(Number)
  const clean = totals.filter((n) => Number.isFinite(n))
  if (clean.length !== totals.length || totals.length < 2) return null
  let successes = (Array.isArray(props.success) ? props.success : []).map(Number)
  if (successes.length !== totals.length || successes.some((n) => !Number.isFinite(n))) {
    successes = totals.slice()
  }
  return { totals, successes }
}

function timeLabel(index, n) {
  const labels = Array.isArray(props.xLabels) ? props.xLabels : []
  if (props.range === 'today' || n === 96) {
    const minutes = Math.round((index * 1440) / Math.max(1, n))
    const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0')
    const mm = String(minutes % 60).padStart(2, '0')
    return `${hh}:${mm}`
  }
  if (labels.length === n) return String(labels[index])
  if (labels.length > 1) {
    const li = Math.round((index / Math.max(1, n - 1)) * (labels.length - 1))
    return String(labels[li])
  }
  if (props.range === '30d' || props.range === '7d') return `第 ${index + 1} 天`
  return `#${index + 1}`
}

function render() {
  const wrap = wrapEl.value
  const svg = svgEl.value
  const tipBox = tipEl.value
  if (!wrap || !svg || !tipBox) return

  const W = Math.max(360, Math.round(wrap.clientWidth))
  const H = Math.max(200, Math.round(wrap.clientHeight))
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  svg.setAttribute('width', W)
  svg.setAttribute('height', H)
  svg.textContent = ''

  const data = seriesData()
  if (!data) {
    tipBox.style.opacity = 0
    view.placeTip = null
    return
  }
  const { totals, successes } = data
  const n = totals.length

  const PLOT = { left: 44, right: W, top: 17.5, bottom: 215.5 }
  const plotW = PLOT.right - PLOT.left
  const plotH = PLOT.bottom - PLOT.top

  const ticks = (Array.isArray(props.yTicks) && props.yTicks.length ? props.yTicks : chart.yTicks)
    .map(Number)
    .filter((v) => Number.isFinite(v))
  const maxValue = Math.max(...ticks, ...totals, ...successes, 1)
  const MAX = maxValue || 1

  /* 今日按 96 个 15 分钟点铺满 0–24h（末点略早于右边界，与设计稿一致）；
     其它范围按 n 个点铺满整个绘图区 */
  const xDenom = props.range === 'today' ? Math.max(1, n) : Math.max(1, n - 1)
  const xOf = (i) => PLOT.left + (i / xDenom) * plotW
  const yOf = (v) => PLOT.bottom - (Math.max(0, Number(v) || 0) / MAX) * plotH

  /* defs: area gradients */
  const defs = el('defs')
  const mkGrad = (id, color, topOpacity) => {
    const g = el('linearGradient', { id, x1: '0', y1: '0', x2: '0', y2: '1' })
    g.appendChild(el('stop', { offset: '0', 'stop-color': color, 'stop-opacity': topOpacity }))
    g.appendChild(el('stop', { offset: '0.45', 'stop-color': color, 'stop-opacity': topOpacity * 0.82 }))
    g.appendChild(el('stop', { offset: '0.8', 'stop-color': color, 'stop-opacity': topOpacity * 0.28 }))
    g.appendChild(el('stop', { offset: '1', 'stop-color': color, 'stop-opacity': 0 }))
    return g
  }
  defs.appendChild(mkGrad('gradBlue', '#3478f2', '0.16'))
  defs.appendChild(mkGrad('gradGreen', '#5fd0a0', '0.13'))
  svg.appendChild(defs)

  const gridG = el('g')

  /* horizontal grid + y labels */
  ticks.forEach((v) => {
    const y = Math.round(yOf(v)) + 0.5
    gridG.appendChild(el('line', { x1: PLOT.left, y1: y, x2: PLOT.right, y2: y, stroke: '#eef0f3', 'stroke-width': 1 }))
    const label = props.yLabels && Object.prototype.hasOwnProperty.call(props.yLabels, String(v))
      ? props.yLabels[v]
      : compact(v)
    const t = el('text', {
      x: PLOT.left - 14,
      y: y + 1,
      'text-anchor': 'end',
      fill: '#6b7280',
      'font-size': 12.5,
      'font-family': 'inherit',
    })
    t.textContent = String(label)
    gridG.appendChild(t)
  })

  /* x 轴刻度标签位置：今日沿用设计稿实测位置，其余按数据长度均分 */
  const labels = Array.isArray(props.xLabels) ? props.xLabels : []
  let xPositions = []
  if (props.range === 'today' && labels.length === 6 && n > 30) {
    const sx = plotW / 752
    xPositions = chart.xLabels.map((v) => Math.round(PLOT.left + (v - 44) * sx))
  } else if (labels.length === n) {
    xPositions = labels.map((_, i) => Math.round(xOf(i)))
  } else if (labels.length > 1) {
    xPositions = labels.map((_, i) => Math.round(PLOT.left + (plotW * i) / (labels.length - 1)))
  } else if (labels.length === 1) {
    xPositions = [Math.round(PLOT.left + plotW / 2)]
  }

  /* 竖向网格线：今日沿设计稿实测位置，其它范围对齐标签位置 */
  let gridPositions
  if (props.range === 'today' && labels.length === 6) {
    const sx = plotW / 752
    gridPositions = chart.vGrid.map((v) => Math.round(PLOT.left + (v - 44) * sx))
  } else {
    gridPositions = xPositions.slice(0, -1)
  }
  gridPositions.forEach((gx) => {
    if (gx > PLOT.left && gx < PLOT.right) {
      gridG.appendChild(el('line', {
        x1: gx + 0.5,
        y1: PLOT.top,
        x2: gx + 0.5,
        y2: PLOT.bottom,
        stroke: '#efeff2',
        'stroke-width': 1,
      }))
    }
  })

  if (props.range !== 'today') {
    xPositions = xPositions.map((x) => Math.min(Math.max(x, PLOT.left + 18), W - 12))
  }

  labels.forEach((label, i) => {
    if (xPositions[i] === undefined) return
    const t = el('text', {
      x: xPositions[i],
      y: PLOT.bottom + 33,
      'text-anchor': 'middle',
      fill: '#6b7280',
      'font-size': 12.5,
      'font-family': 'inherit',
    })
    t.textContent = String(label)
    gridG.appendChild(t)
  })
  svg.appendChild(gridG)

  /* series */
  const totalPts = totals.map((v, i) => [xOf(i), yOf(v)])
  const successPts = successes.map((v, i) => [xOf(i), yOf(v)])
  const areaPath = (pts) =>
    `${monotonePath(pts)}L${pts[pts.length - 1][0]},${PLOT.bottom}L${pts[0][0]},${PLOT.bottom}Z`

  const gBlue = el('g')
  gBlue.appendChild(el('path', { d: areaPath(totalPts), fill: 'url(#gradBlue)' }))
  gBlue.appendChild(el('path', {
    d: monotonePath(totalPts),
    fill: 'none',
    stroke: '#3478f2',
    'stroke-width': 2.4,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }))
  svg.appendChild(gBlue)

  const gGreen = el('g')
  gGreen.appendChild(el('path', { d: areaPath(successPts), fill: 'url(#gradGreen)' }))
  gGreen.appendChild(el('path', {
    d: monotonePath(successPts),
    fill: 'none',
    stroke: '#5fd0a0',
    'stroke-width': 2.4,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }))
  svg.appendChild(gGreen)

  /* interactive marker + crosshair */
  const hoverLine = el('line', {
    x1: 0,
    y1: PLOT.top,
    x2: 0,
    y2: PLOT.bottom,
    stroke: '#c9d3e6',
    'stroke-width': 1,
    'stroke-dasharray': '3 4',
    opacity: 0,
  })
  const dotTotal = el('circle', { r: 4, fill: '#3478f2', stroke: '#fff', 'stroke-width': 2, opacity: 0 })
  const dotSuccess = el('circle', { r: 4, fill: '#5fd0a0', stroke: '#fff', 'stroke-width': 2, opacity: 0 })
  svg.appendChild(hoverLine)
  svg.appendChild(dotTotal)
  svg.appendChild(dotSuccess)

  const placeTip = (rawIndex) => {
    const idx = Math.max(0, Math.min(n - 1, Math.round(Number(rawIndex) || 0)))
    const x = xOf(idx)
    dotTotal.setAttribute('cx', x)
    dotTotal.setAttribute('cy', yOf(totals[idx]))
    dotSuccess.setAttribute('cx', x)
    dotSuccess.setAttribute('cy', yOf(successes[idx]))
    hoverLine.setAttribute('x1', x)
    hoverLine.setAttribute('x2', x)

    const timeText = timeLabel(idx, n)
    const totalText = fmt(totals[idx])
    const successText = fmt(successes[idx])
    tip.time = timeText
    tip.total = totalText
    tip.success = successText
    const timeEl = tipBox.querySelector('.tip-time')
    if (timeEl) timeEl.textContent = timeText
    const rows = tipBox.querySelectorAll('.tip-row b')
    if (rows[0]) rows[0].textContent = totalText
    if (rows[1]) rows[1].textContent = successText

    let left = x - 79.5
    left = Math.max(4, Math.min(W - 161, left))
    tipBox.style.left = `${Math.round(left)}px`
    tipBox.style.top = '7px'
    tipBox.style.opacity = 1
    dotTotal.setAttribute('opacity', 1)
    dotSuccess.setAttribute('opacity', 1)
    hoverLine.setAttribute('opacity', 1)
  }

  const defaultIndex = () => {
    if (n === 96) return 80 /* 设计稿停在 20:00 */
    if (n > 1) return Math.round((n - 1) * 0.84)
    return 0
  }

  view.W = W
  view.plotLeft = PLOT.left
  view.plotW = plotW
  view.count = n
  view.xDenom = xDenom
  view.placeTip = placeTip
  placeTip(defaultIndex())
}

function onMove(ev) {
  const wrap = wrapEl.value
  if (!wrap || !view.placeTip || view.count < 2) return
  const rect = wrap.getBoundingClientRect()
  const mx = ev.clientX - rect.left
  const ratio = (mx - view.plotLeft) / Math.max(1, view.plotW)
  view.placeTip(ratio * view.xDenom)
}

function onLeave() {
  if (!view.placeTip || !view.count) return
  const n = view.count
  const idx = n === 96 ? 80 : n > 1 ? Math.round((n - 1) * 0.84) : 0
  view.placeTip(idx)
}

function onResize() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(render)
}

watch(
  () => [props.total, props.success, props.xLabels, props.yTicks, props.yLabels, props.range],
  () => render(),
  { deep: true, flush: 'post' },
)

onMounted(() => {
  render()
  wrapEl.value.addEventListener('mousemove', onMove)
  wrapEl.value.addEventListener('mouseleave', onLeave)
  window.addEventListener('resize', onResize)
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(wrapEl.value)
  }
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  if (wrapEl.value) {
    wrapEl.value.removeEventListener('mousemove', onMove)
    wrapEl.value.removeEventListener('mouseleave', onLeave)
  }
  window.removeEventListener('resize', onResize)
  if (resizeObserver) resizeObserver.disconnect()
})
</script>
