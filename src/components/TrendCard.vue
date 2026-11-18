<template>
  <article class="card chart-card">
    <div class="card-head">
      <h2 class="card-title">
        <svg class="card-title-ico" viewBox="0 0 29 28" aria-hidden="true">
          <path d="M12.8,6.7 11.5,8.4 11.5,22.6 12.8,24.3 14.6,24.5 16.5,22.6 16.5,8.4 15.0,6.6Z" fill="#5487eb" fill-rule="evenodd"/>
          <path d="M18.8,11.7 18.5,23.8 20.8,24.5 23.5,22.8 23.5,13.2 21.8,11.5Z" fill="#5989df" fill-rule="evenodd"/>
          <path d="M5.8,14.7 4.5,16.4 4.5,23.8 7.8,24.5 9.5,22.8 9.5,16.2 8.0,14.6Z" fill="#5c8ee1" fill-rule="evenodd"/>
        </svg>
        请求量趋势
      </h2>
      <div class="legend">
        <span class="legend-item"><i class="dot dot--blue"></i>总请求量</span>
        <span class="legend-item"><i class="dot dot--green"></i>成功请求</span>
      </div>
    </div>
    <TrendChart
      :total="total"
      :success="success"
      :x-labels="xLabels"
      :y-ticks="yTicks"
      :y-labels="yLabels"
      :range="range"
    />
  </article>
</template>

<script setup>
import TrendChart from './TrendChart.vue'

defineProps({
  total: { type: Array, default: undefined },
  success: { type: Array, default: undefined },
  xLabels: { type: Array, default: undefined },
  yTicks: { type: Array, default: undefined },
  yLabels: { type: Object, default: undefined },
  range: { type: String, default: 'today' },
})
</script>
