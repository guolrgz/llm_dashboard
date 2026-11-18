<template>
  <div class="kpi-spark">
    <svg viewBox="0 0 184 84" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :stop-color="tone.stop" stop-opacity="0.20" />
          <stop offset="0.45" :stop-color="tone.stop" stop-opacity="0.13" />
          <stop offset="0.75" :stop-color="tone.stop" stop-opacity="0.06" />
          <stop offset="1" :stop-color="tone.stop" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path :d="areaPath" :fill="`url(#${gradientId})`" />
      <path
        :d="linePath"
        fill="none"
        :stroke="tone.line"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </div>
</template>

<script setup>
import { computed, useId } from 'vue'
import { monotonePath } from '../charts/svg.js'
import { KPI_SPARKS, sparkTones } from '../data/dashboard.js'

const props = defineProps({
  /* 'requests' | 'tokens' | 'success'（内置设计稿曲线）或 API 返回的数字数组 */
  spark: { type: [String, Array], required: true },
  tone: { type: String, default: 'blue' },
})

const uid = useId()
const gradientId = computed(() => `sparkGrad-${String(uid).replace(/[^a-zA-Z0-9_-]/g, '')}-${props.tone}`)
const tone = computed(() => sparkTones[props.tone] || sparkTones.blue)

const points = computed(() => {
  const x0 = 11
  const x1 = 179

  if (Array.isArray(props.spark)) {
    const ys = props.spark.map(Number).filter((n) => Number.isFinite(n))
    if (ys.length < 2) return []
    const min = Math.min(...ys)
    const max = Math.max(...ys)
    const span = max - min || 1
    /* 设计稿/种子数据里的 spark 是「折线 y 坐标」（0 = 顶部，约 2..54 为曲线区间），
       直接按坐标绘制可与设计稿完全一致；超出该区间的真实数据再归一化。 */
    const isCoordinate = max <= 84 && min >= 0
    const top = 4
    const bottom = 56
    return ys.map((value, i) => [
      x0 + ((x1 - x0) * i) / (ys.length - 1),
      isCoordinate ? Math.max(1, value) : bottom - ((value - min) / span) * (bottom - top),
    ])
  }

  const ys = KPI_SPARKS[props.spark]
  if (!ys) return []
  return ys.map((y, i) => [x0 + ((x1 - x0) * i) / (ys.length - 1), Math.max(1, y)])
})

const linePath = computed(() => monotonePath(points.value))
const areaPath = computed(() => {
  const pts = points.value
  if (!pts.length) return ''
  return `${linePath.value}L${pts[pts.length - 1][0]},84L${pts[0][0]},84Z`
})
</script>
