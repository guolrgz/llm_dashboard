<template>
  <article class="card kpi-card">
    <KpiIcon :type="icon" />
    <div class="kpi-body">
      <div class="kpi-label">{{ label }}</div>
      <div class="kpi-value" :class="valueClass">{{ value }}</div>
      <div class="kpi-delta" :class="{ 'kpi-delta--down': trend === 'down' }">
        <svg
          class="ico"
          viewBox="0 0 14 14"
          style="width:14px;height:14px"
          :style="trend === 'down' ? 'transform:rotate(180deg)' : null"
          aria-hidden="true"
        ><use href="#i-arrow-up" /></svg>{{ delta }}
      </div>
    </div>
    <KpiSpark :spark="spark" :tone="tone" />
  </article>
</template>

<script setup>
import { computed } from 'vue'
import KpiIcon from './KpiIcon.vue'
import KpiSpark from './KpiSpark.vue'

const props = defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  delta: { type: [String, Number], default: '' },
  deltaUnit: { type: String, default: '%' },
  trend: { type: String, default: 'up' },
  tone: { type: String, default: 'blue' },
  /* 'requests' | 'tokens' | 'success' 或数字数组 */
  spark: { type: [String, Array], required: true },
  icon: { type: String, default: 'chat' },
})

/* 30 天等大数值（如 3,714,984）缩小字号，避免与右侧 sparkline 重叠 */
const valueClass = computed(() => {
  const text = String(props.value ?? '')
  if (text.length >= 11) return 'kpi-value--xlong'
  if (text.length >= 9) return 'kpi-value--long'
  return ''
})
</script>
