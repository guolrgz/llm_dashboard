<template>
  <article class="card donut-card">
    <h2 class="card-title">Token 使用量分布</h2>
    <DonutChart :segments="segments" :legend="legend" :total-display="totalDisplay" />
  </article>
</template>

<script setup>
import { computed } from 'vue'
import DonutChart from './DonutChart.vue'

const props = defineProps({
  /* {total, display, segments:[{key,name,percent,color}]} */
  distribution: { type: Object, default: null },
})

const segments = computed(() => {
  const list = props.distribution?.segments
  return Array.isArray(list) && list.length ? list : null
})

const legend = computed(() => {
  const list = segments.value
  if (!list) return null
  return list.map((seg) => ({
    key: seg.key || seg.name,
    name: seg.name,
    value: `${Number(seg.percent)}%`,
    color: seg.color,
  }))
})

const totalDisplay = computed(() => {
  const display = props.distribution?.display
  return typeof display === 'string' && display ? display : ''
})
</script>
