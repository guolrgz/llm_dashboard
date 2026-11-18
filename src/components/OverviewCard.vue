<template>
  <article class="card overview-card">
    <h2 class="card-title">系统概览</h2>
    <div class="overview-grid">
      <OverviewTile
        v-for="tile in tiles"
        :key="tile.type"
        :type="tile.type"
        :label="tile.label"
        :value="tile.value"
        :unit="tile.unit"
      />
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import OverviewTile from './OverviewTile.vue'
import { overviewTiles } from '../data/dashboard.js'

const props = defineProps({
  /* {users, roles, models, uptimeDays} */
  overview: { type: Object, default: null },
})

function fmt(value) {
  if (value === null || value === undefined || value === '') return '-'
  const num = Number(value)
  if (Number.isFinite(num)) return num.toLocaleString('en-US')
  return String(value)
}

const tiles = computed(() => {
  const data = props.overview
  if (!data || typeof data !== 'object') return overviewTiles
  return [
    { type: 'users', label: '用户总数', value: fmt(data.users) },
    { type: 'roles', label: '角色数量', value: fmt(data.roles) },
    { type: 'cube', label: '接入模型', value: fmt(data.models) },
    { type: 'clock', label: '系统运行时长', value: fmt(data.uptimeDays), unit: '天' },
  ]
})
</script>
