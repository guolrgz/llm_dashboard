<template>
  <main class="content">
    <div v-if="loading" class="load-bar" role="progressbar" aria-label="数据加载中"><span></span></div>

    <PageHeader v-model="range" />

    <div v-if="errorMessage" class="state-alert state-alert--error" role="alert">
      <svg class="state-alert-ico" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.7" />
        <path d="M10 5.6v5M10 13.9v.1" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
      </svg>
      <div class="state-alert-body">
        <strong>Dashboard 数据加载失败</strong>
        <span>{{ errorMessage }}</span>
      </div>
      <button class="state-alert-retry" type="button" @click="load">重试</button>
    </div>
    <p v-else-if="empty" class="state-alert state-alert--empty" role="status">
      <svg class="state-alert-ico" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.7" />
        <path d="M6.6 10h6.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
      </svg>
      <span>{{ rangeLabel }}暂无统计数据，请稍后刷新</span>
    </p>

    <section class="kpi-grid">
      <KpiCard
        v-for="item in kpis"
        :key="item.id"
        :label="item.label"
        :value="item.value"
        :delta="item.delta"
        :trend="item.trend"
        :tone="item.tone"
        :spark="item.spark"
        :icon="item.icon"
      />
    </section>

    <section class="mid-grid">
      <TrendCard
        :total="trend?.total"
        :success="trend?.success"
        :x-labels="trend?.xLabels"
        :y-ticks="trend?.yTicks"
        :y-labels="trend?.yLabels"
        :range="range"
      />
      <DonutCard :distribution="dashboard?.distribution" />
    </section>

    <section class="bottom-grid">
      <RequestTable :rows="recentRows" />
      <OverviewCard :overview="dashboard?.overview" />
    </section>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import KpiCard from '../components/KpiCard.vue'
import TrendCard from '../components/TrendCard.vue'
import DonutCard from '../components/DonutCard.vue'
import RequestTable from '../components/RequestTable.vue'
import OverviewCard from '../components/OverviewCard.vue'
import { kpis as fallbackKpiData, ranges } from '../data/dashboard.js'
import { fetchDashboard } from '../api/analytics.js'

const range = ref('today')
const dashboard = ref(null)
const loading = ref(false)
const empty = ref(false)
const errorMessage = ref('')

let controller = null

const fallbackKpis = fallbackKpiData.map((item) => ({
  id: item.id,
  label: item.label,
  value: item.value,
  delta: item.delta,
  trend: 'up',
  tone: item.tone,
  spark: item.spark,
  icon: item.icon,
}))

const SPARK_BY_ID = { requests: 'requests', tokens: 'tokens', success: 'success' }
const TONE_BY_ID = { requests: 'blue', tokens: 'green', success: 'purple' }
const ICON_BY_ID = { requests: 'chat', tokens: 'database', success: 'check' }

function formatNumber(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return String(value ?? '-')
  return num.toLocaleString('en-US')
}

const kpis = computed(() => {
  const items = dashboard.value?.kpis
  if (!Array.isArray(items) || !items.length) return fallbackKpis
  return items.map((item) => {
    const id = item.id || item.label
    const delta = Number(item.delta)
    const unit = item.deltaUnit === 'pp' ? '%' : item.deltaUnit || '%'
    const deltaText = Number.isFinite(delta) ? `${Math.abs(delta)}${unit}` : item.delta ?? '—'
    const spark = Array.isArray(item.spark) && item.spark.length >= 2 ? item.spark : SPARK_BY_ID[id] || 'requests'
    return {
      id,
      label: item.label || id,
      value: item.display ?? formatNumber(item.value),
      delta: deltaText,
      trend: Number.isFinite(delta) && delta < 0 ? 'down' : 'up',
      tone: item.tone || TONE_BY_ID[id] || 'blue',
      spark,
      icon: item.icon || ICON_BY_ID[id] || 'chat',
    }
  })
})

const trend = computed(() => {
  const data = dashboard.value?.trend
  if (!data || !Array.isArray(data.total) || data.total.length < 2) return null
  return {
    total: data.total,
    success: Array.isArray(data.success) && data.success.length === data.total.length ? data.success : data.total,
    xLabels: Array.isArray(data.xLabels) && data.xLabels.length ? data.xLabels : undefined,
    yTicks: Array.isArray(data.yTicks) && data.yTicks.length ? data.yTicks : undefined,
    yLabels: data.yLabels && typeof data.yLabels === 'object' ? data.yLabels : undefined,
  }
})

const recentRows = computed(() => {
  const list = dashboard.value?.recentRequests
  if (Array.isArray(list)) return list
  return null /* null → 组件使用设计稿默认 4 条 */
})

const rangeLabel = computed(() => {
  const found = ranges.find((item) => item.id === range.value)
  return found ? found.label : ''
})

function announceUnread() {
  const unread = dashboard.value?.alerts?.unread
  if (unread === undefined || unread === null) return
  const num = Number(unread)
  if (!Number.isFinite(num)) return
  try {
    window.dispatchEvent(new CustomEvent('llm:alerts-unread', { detail: num }))
  } catch {
    /* ignore */
  }
}

async function load() {
  if (controller) controller.abort()
  const current = new AbortController()
  controller = current
  loading.value = true
  errorMessage.value = ''

  try {
    const data = await fetchDashboard(range.value, { signal: current.signal })
    if (current.signal.aborted) return
    dashboard.value = data || null
    const hasKpis = Array.isArray(data?.kpis) && data.kpis.length > 0
    const hasTrend = Array.isArray(data?.trend?.total) && data.trend.total.length > 1
    empty.value = !hasKpis && !hasTrend
    announceUnread()
  } catch (err) {
    if (err?.name === 'AbortError' || current.signal.aborted) return
    if (err?.status === 401) {
      /* client 已清 token 并跳转登录，这里不再提示，避免闪烁 */
      errorMessage.value = ''
      return
    }
    errorMessage.value = err?.message || '无法获取 Dashboard 数据，请检查后端服务是否可用'
  } finally {
    if (!current.signal.aborted) loading.value = false
  }
}

watch(range, () => {
  load()
})

onMounted(() => {
  load()
})

onBeforeUnmount(() => {
  if (controller) controller.abort()
})
</script>
