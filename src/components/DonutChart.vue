<template>
  <div class="donut-body">
    <div class="donut">
      <svg class="donut-svg" id="donutChart" viewBox="0 0 220 220" role="img" aria-label="Token 使用量分布环形图">
        <path
          v-for="seg in arcs"
          :key="seg.key"
          :d="seg.d"
          fill="none"
          :stroke="seg.color"
          stroke-width="35"
          stroke-linecap="butt"
        />
      </svg>
      <div class="donut-center">
        <strong>{{ centerDisplay }}</strong>
        <span>总使用量</span>
      </div>
    </div>
    <ul class="donut-legend">
      <li v-for="item in legendItems" :key="item.key || item.name">
        <i
          class="dot"
          :class="item.tone ? `dot--${item.tone}` : null"
          :style="!item.tone && item.color ? { background: item.color } : null"
        ></i>
        <span class="dl-name">{{ item.name }}</span>
        <span class="dl-val">{{ item.value }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { donutLegend, donutSegments } from '../data/dashboard.js'

const props = defineProps({
  /* API 分布段：[{key,name,percent,color}]，不传则使用设计稿默认段 */
  segments: { type: Array, default: null },
  /* 图例：[{name,value,tone?}]，不传则使用设计稿默认图例 */
  legend: { type: Array, default: null },
  totalDisplay: { type: String, default: '' },
})

const C = 110
const R = 92
const GAP_DEG = 0.8

const TONE_BY_NAME = {
  'GPT-4o': 'blue',
  'Claude-3.5': 'green',
  'Qwen-Max': 'orange',
  其他: 'lavender',
}

const pt = (deg, r) => {
  const a = ((deg - 90) * Math.PI) / 180
  return [C + r * Math.cos(a), C + r * Math.sin(a)]
}

function arcPath(from, to) {
  const a0 = from + GAP_DEG
  const a1 = Math.max(a0 + 0.6, to - GAP_DEG)
  const [x0, y0] = pt(a0, R)
  const [x1, y1] = pt(a1, R)
  const large = a1 - a0 > 180 ? 1 : 0
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${R},${R} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`
}

const normalizedSegments = computed(() => {
  const apiSegments = Array.isArray(props.segments) ? props.segments.filter((s) => s && Number.isFinite(Number(s.percent))) : []
  if (apiSegments.length) {
    let acc = 0
    return apiSegments.map((seg) => {
      const from = acc
      const to = acc + (Number(seg.percent) * 360) / 100
      acc = to
      return {
        key: seg.key || seg.name || String(from),
        color: seg.color || '#518af6',
        d: arcPath(from, to),
      }
    })
  }
  return donutSegments.map((s) => ({
    key: s.key,
    color: s.color,
    d: arcPath(s.from, s.to),
  }))
})

const arcs = computed(() => normalizedSegments.value)

const legendItems = computed(() => {
  const apiLegend = Array.isArray(props.legend) ? props.legend : null
  if (apiLegend && apiLegend.length) {
    return apiLegend.map((item, index) => ({
      key: item.key || item.name || String(index),
      name: item.name,
      value: item.value,
      tone: item.tone || TONE_BY_NAME[item.name] || '',
      color: item.color || '',
    }))
  }
  return donutLegend.map((item, index) => ({
    key: item.name || String(index),
    name: item.name,
    value: item.value,
    tone: item.tone,
    color: '',
  }))
})

const centerDisplay = computed(() => props.totalDisplay || '1.24B')
</script>
