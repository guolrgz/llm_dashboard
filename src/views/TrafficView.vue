<template>
  <main class="content console-page traffic-page">
    <div class="page-head">
      <div class="page-heading">
        <h1>流量监控</h1>
        <p>实时查看推理请求日志、Token 用量、限流与配额事件</p>
      </div>
      <div class="head-tools">
        <div class="range seg" role="group" aria-label="时间范围">
          <button
            v-for="item in ranges"
            :key="item.id"
            class="seg-btn"
            :class="{ 'is-active': range === item.id }"
            type="button"
            @click="setRange(item.id)"
          >{{ item.label }}</button>
        </div>
        <button class="refresh-btn" type="button" :disabled="summaryLoading || logsLoading" @click="refreshAll">
          <svg class="refresh-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          刷新
        </button>
      </div>
    </div>

    <ConsoleState
      v-if="!canView"
      type="error"
      title="无权查看流量监控"
      message="当前账号缺少 traffic.view 权限，请联系管理员分配。"
    />

    <template v-else>
      <div v-if="summaryError" class="error-banner" role="alert">
        <span>{{ summaryError }}</span>
        <button class="banner-btn" type="button" @click="fetchSummary">重试</button>
      </div>

      <!-- 概览指标 -->
      <section class="kpi-row">
        <article class="kpi-card">
          <span class="kpi-label">总请求量</span>
          <strong class="kpi-value">{{ summaryLoading ? '—' : formatInt(summary.requests) }}</strong>
          <span class="kpi-sub">成功 {{ formatInt(summary.successRequests) }} · 失败 {{ formatInt(summary.failedRequests) }}</span>
        </article>
        <article class="kpi-card">
          <span class="kpi-label">成功率</span>
          <strong class="kpi-value">{{ summaryLoading ? '—' : formatPercent(summary) }}</strong>
          <span class="kpi-sub">成功请求占比（{{ rangeLabel }}）</span>
        </article>
        <article class="kpi-card">
          <span class="kpi-label">Token 使用量</span>
          <strong class="kpi-value">{{ summaryLoading ? '—' : formatTokens(summary.tokens) }}</strong>
          <span class="kpi-sub">输入 + 输出 Token 合计</span>
        </article>
        <article class="kpi-card">
          <span class="kpi-label">平均延迟</span>
          <strong class="kpi-value">{{ summaryLoading ? '—' : formatLatency(summary.avgLatencyMs) }}</strong>
          <span class="kpi-sub">
            限流 {{ formatInt(summary.rateLimited) }} 次 · 配额超限 {{ formatInt(summary.quotaExceeded) }} 次
          </span>
        </article>
      </section>

      <!-- 限流 / 配额事件 -->
      <section class="card events-card">
        <div class="card-head events-head">
          <h2 class="card-title">限流与配额事件</h2>
          <span class="events-meta">最近 {{ events.length }} 条</span>
        </div>
        <div v-if="eventsLoading" class="events-loading">加载中…</div>
        <p v-else-if="eventsError" class="events-error">{{ eventsError }}</p>
        <p v-else-if="!events.length" class="events-empty">暂无配额超限或限流事件</p>
        <ul v-else class="events-list">
          <li v-for="(event, index) in events" :key="event.id || index" class="event-row">
            <StatusPill :label="statusMeta(event.status || event.type).label" :tone="statusMeta(event.status || event.type).tone" />
            <span class="event-user">{{ event.username || `用户 ${event.userId ?? '—'}` }}</span>
            <span class="event-model">{{ event.model || '—' }}</span>
            <span class="event-spacer"></span>
            <span class="event-code">{{ event.errorCode || event.httpStatus || '—' }}</span>
            <span class="event-time">{{ event.time || event.createdAt || '—' }}</span>
          </li>
        </ul>
      </section>

      <!-- 请求日志 -->
      <section class="card logs-card">
        <div class="card-head logs-head">
          <h2 class="card-title">请求日志</h2>
          <span class="events-meta">共 {{ total }} 条</span>
        </div>

        <form class="filters" @submit.prevent="applyFilters">
          <label class="filter-field filter-field--grow">
            <span class="filter-label">关键字</span>
            <input v-model.trim="filters.keyword" type="search" placeholder="用户 / 模型 / 错误码" />
          </label>
          <label class="filter-field">
            <span class="filter-label">状态</span>
            <select v-model="filters.status">
              <option value="">全部状态</option>
              <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </label>
          <label class="filter-field">
            <span class="filter-label">用户</span>
            <select v-model="filters.userId" :disabled="!userOptions.length">
              <option value="">全部用户</option>
              <option v-for="user in userOptions" :key="user.id" :value="user.id">{{ user.username }}</option>
            </select>
          </label>
          <label class="filter-field">
            <span class="filter-label">模型</span>
            <select v-model="filters.model">
              <option value="">全部模型</option>
              <option v-for="model in modelOptions" :key="model" :value="model">{{ model }}</option>
            </select>
          </label>
          <div class="filter-actions">
            <button class="u-btn u-btn--primary" type="submit" :disabled="logsLoading">{{ logsLoading ? '查询中…' : '查询' }}</button>
            <button class="u-btn u-btn--ghost" type="button" @click="resetFilters">重置</button>
          </div>
        </form>

        <ConsoleState v-if="logsLoading && !logs.length" type="loading" title="正在加载请求日志…" />
        <ConsoleState v-else-if="logsError" type="error" title="请求日志加载失败" :message="logsError" @retry="fetchLogs" />
        <ConsoleState
          v-else-if="!logs.length"
          type="empty"
          title="暂无请求日志"
          message="当前筛选条件下没有匹配的推理请求"
        />
        <template v-else>
          <div class="logs-table-wrap">
            <table class="logs-table">
              <colgroup>
                <col style="width: 158px" />
                <col style="width: 150px" />
                <col style="width: 140px" />
                <col style="width: 130px" />
                <col style="width: 100px" />
                <col style="width: 110px" />
                <col style="width: 120px" />
              </colgroup>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>用户</th>
                  <th>模型</th>
                  <th>Token</th>
                  <th>延迟</th>
                  <th>状态</th>
                  <th>HTTP / 错误码</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="log in logs" :key="log.id">
                  <td>{{ log.time || '—' }}</td>
                  <td>
                    <span class="cell-main">{{ log.username || `用户 ${log.userId ?? '—'}` }}</span>
                    <span v-if="log.keyPrefix" class="cell-sub">{{ log.keyPrefix }}…</span>
                  </td>
                  <td>{{ log.model || '—' }}</td>
                  <td>
                    <span class="cell-main">{{ formatInt(log.totalTokens) }}</span>
                    <span class="cell-sub">提示 {{ formatInt(log.promptTokens) }} / 生成 {{ formatInt(log.completionTokens) }}</span>
                  </td>
                  <td>{{ formatLatency(log.latencyMs) }}</td>
                  <td>
                    <StatusPill :label="statusMeta(log.status).label" :tone="statusMeta(log.status).tone" />
                  </td>
                  <td>
                    <span class="cell-main">{{ log.httpStatus ?? '—' }}</span>
                    <span v-if="log.errorCode" class="cell-sub cell-sub--error">{{ log.errorCode }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <ConsolePagination :total="total" :page="page" :page-size="pageSize" @change="gotoPage" />
        </template>
      </section>
    </template>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { request } from '../api/client.js'
import { auth } from '../stores/auth.js'
import ConsoleState from '../components/console/ConsoleState.vue'
import ConsolePagination from '../components/console/ConsolePagination.vue'
import StatusPill from '../components/console/StatusPill.vue'
import { errorText } from '../components/console/useToast.js'

function safeHasPerm(key) {
  if (auth && typeof auth.hasPerm === 'function') return auth.hasPerm(key)
  const perms = auth?.permissions || []
  return perms.includes('*') || perms.includes(key)
}
const canView = computed(() => safeHasPerm('traffic.view'))

const ranges = [
  { id: 'today', label: '今日' },
  { id: '7d', label: '近7天' },
  { id: '30d', label: '近30天' },
]
const range = ref('today')
const rangeLabel = computed(() => ranges.find((item) => item.id === range.value)?.label || '今日')

const statusOptions = [
  { value: 'success', label: '成功' },
  { value: 'error', label: '失败' },
  { value: 'quota_exceeded', label: '配额超限' },
  { value: 'rate_limited', label: '限流' },
]

const STATUS_META = {
  success: { label: '成功', tone: 'green' },
  error: { label: '失败', tone: 'red' },
  quota_exceeded: { label: '配额超限', tone: 'amber' },
  rate_limited: { label: '限流', tone: 'purple' },
  unauthorized: { label: '鉴权失败', tone: 'red' },
  disabled: { label: '停用用户', tone: 'gray' },
}

function statusMeta(status) {
  const key = String(status || '').toLowerCase()
  return STATUS_META[key] || { label: status || '未知', tone: 'gray' }
}

/* ---------------- 格式化 ---------------- */
const intFormatter = new Intl.NumberFormat('en-US')

function formatInt(value) {
  const num = Number(value)
  return Number.isFinite(num) ? intFormatter.format(num) : '—'
}

function formatTokens(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}k`
  return intFormatter.format(num)
}

function formatLatency(value) {
  const num = Number(value)
  return Number.isFinite(num) ? `${Math.round(num)} ms` : '—'
}

function formatPercent(summaryData) {
  const requests = Number(summaryData.requests || 0)
  const success = Number(summaryData.successRequests || 0)
  if (requests > 0) return `${((success / requests) * 100).toFixed(1)}%`
  if (Number.isFinite(Number(summaryData.successRate))) return `${Number(summaryData.successRate).toFixed(1)}%`
  return '—'
}

/* ---------------- 摘要 ---------------- */
const summary = reactive({
  requests: 0,
  successRequests: 0,
  failedRequests: 0,
  tokens: 0,
  avgLatencyMs: 0,
  rateLimited: 0,
  quotaExceeded: 0,
})
const summaryLoading = ref(false)
const summaryError = ref('')

async function fetchSummary() {
  summaryLoading.value = true
  summaryError.value = ''
  try {
    const data = await request(`/api/traffic/summary?range=${encodeURIComponent(range.value)}`)
    Object.assign(summary, {
      requests: Number(data?.requests || 0),
      successRequests: Number(data?.successRequests || 0),
      failedRequests: Number(data?.failedRequests || 0),
      tokens: Number(data?.tokens || 0),
      avgLatencyMs: Number(data?.avgLatencyMs || 0),
      rateLimited: Number(data?.rateLimited || 0),
      quotaExceeded: Number(data?.quotaExceeded || 0),
    })
  } catch (err) {
    summaryError.value = errorText(err, '流量摘要加载失败')
  } finally {
    summaryLoading.value = false
  }
}

/* ---------------- 限流 / 配额事件 ---------------- */
const events = ref([])
const eventsLoading = ref(false)
const eventsError = ref('')

async function fetchEvents() {
  eventsLoading.value = true
  eventsError.value = ''
  try {
    const data = await request('/api/traffic/rate-limit-events')
    const list = Array.isArray(data) ? data : data?.items ?? data?.events ?? []
    events.value = Array.isArray(list) ? list.slice(0, 8) : []
  } catch (err) {
    eventsError.value = errorText(err, '限流事件加载失败')
  } finally {
    eventsLoading.value = false
  }
}

/* ---------------- 日志筛选与分页 ---------------- */
const logs = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const logsLoading = ref(false)
const logsError = ref('')
const filters = reactive({ keyword: '', status: '', userId: '', model: '' })
const applied = reactive({ keyword: '', status: '', userId: '', model: '' })
const userOptions = ref([])
const modelOptions = ref([])

function buildQuery() {
  const params = new URLSearchParams()
  params.set('page', String(page.value))
  params.set('pageSize', String(pageSize.value))
  params.set('range', range.value)
  if (applied.keyword) params.set('keyword', applied.keyword)
  if (applied.status) params.set('status', applied.status)
  if (applied.userId !== '') params.set('userId', String(applied.userId))
  if (applied.model) params.set('model', applied.model)
  return params.toString()
}

async function fetchLogs() {
  logsLoading.value = true
  logsError.value = ''
  try {
    const data = await request(`/api/traffic/logs?${buildQuery()}`)
    logs.value = Array.isArray(data?.items) ? data.items : []
    total.value = Number(data?.total || 0)
    const maxPage = Math.max(1, Math.ceil(total.value / pageSize.value))
    if (page.value > maxPage) {
      page.value = maxPage
      await fetchLogs()
      return
    }
    mergeModelOptionsFromLogs()
  } catch (err) {
    logs.value = []
    total.value = 0
    logsError.value = errorText(err, '请求日志加载失败')
  } finally {
    logsLoading.value = false
  }
}

function mergeModelOptionsFromLogs() {
  if (modelOptions.value.length) return
  const seen = new Set(logs.value.map((log) => log.model).filter(Boolean))
  modelOptions.value = [...seen]
}

function applyFilters() {
  Object.assign(applied, {
    keyword: filters.keyword || '',
    status: filters.status || '',
    userId: filters.userId === '' || filters.userId == null ? '' : filters.userId,
    model: filters.model || '',
  })
  page.value = 1
  fetchLogs()
}

function resetFilters() {
  filters.keyword = ''
  filters.status = ''
  filters.userId = ''
  filters.model = ''
  applyFilters()
}

function gotoPage(target) {
  page.value = target
  fetchLogs()
}

/* ---------------- 筛选项来源 ---------------- */
async function fetchUserOptions() {
  try {
    const data = await request('/api/users?page=1&pageSize=100')
    userOptions.value = Array.isArray(data?.items) ? data.items.map((u) => ({ id: u.id, username: u.username })) : []
  } catch {
    userOptions.value = []
  }
}

async function fetchModelOptions() {
  try {
    const data = await request('/api/models')
    modelOptions.value = Array.isArray(data?.items) ? data.items.map((m) => m.name) : []
  } catch {
    modelOptions.value = []
  }
}

function setRange(next) {
  if (range.value === next) return
  range.value = next
  page.value = 1
  fetchSummary()
  fetchLogs()
}

function refreshAll() {
  fetchSummary()
  fetchEvents()
  fetchLogs()
}

onMounted(() => {
  if (!canView.value) return
  fetchSummary()
  fetchEvents()
  fetchLogs()
  fetchUserOptions()
  fetchModelOptions()
})
</script>

<style scoped>
.head-tools { display: flex; align-items: center; gap: 10px; align-self: center; flex-wrap: wrap; }
.head-tools .seg { height: 38px; }
.head-tools .seg-btn { font-size: 13.5px; line-height: 38px; }
.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 14px;
  border: 1px solid #d5dae4;
  border-radius: 9px;
  background: #fff;
  color: #334155;
  font-family: inherit;
  font-size: 13.5px;
  cursor: pointer;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}
.refresh-btn:hover:not(:disabled) { border-color: #b9c8dd; background: #f8fafd; }
.refresh-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.refresh-ico { width: 15px; height: 15px; }

.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
  padding: 11px 16px;
  border: 1px solid #f3d3d7;
  border-radius: 10px;
  background: #fdf3f4;
  color: #c0465b;
  font-size: 13.5px;
}
.banner-btn {
  flex: none;
  height: 30px;
  padding: 0 12px;
  border: 1px solid #eec4ca;
  border-radius: 7px;
  background: #fff;
  color: #c0465b;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}

.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 15px;
  margin-bottom: 16px;
}
.kpi-card {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-height: 112px;
  padding: 16px 19px 14px;
  border: 1px solid #eef1f6;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.035), 0 6px 18px rgba(16, 24, 40, 0.03);
}
.kpi-label { font-size: 13.5px; color: #6b7280; }
.kpi-value {
  font-size: 27px;
  line-height: 32px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.4px;
}
.kpi-sub { margin-top: auto; font-size: 12.5px; line-height: 18px; color: #94a3b8; }

.events-card { padding: 16px 20px 14px; margin-bottom: 16px; }
.events-head { margin-bottom: 10px; }
.events-head .card-title { font-size: 17px; }
.events-meta { font-size: 12.5px; color: #94a3b8; }
.events-loading,
.events-empty,
.events-error {
  margin: 0;
  padding: 16px 4px;
  color: #94a3b8;
  font-size: 13.5px;
  text-align: center;
}
.events-error { color: #d4556b; }
.events-list { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.event-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 9px 2px;
  border-top: 1px solid #f2f5fa;
  font-size: 13.5px;
  color: #334155;
}
.events-list .event-row:first-child { border-top: 0; }
.event-user { min-width: 110px; font-weight: 500; color: #1f2937; }
.event-model { min-width: 100px; color: #475569; }
.event-spacer { flex: 1; }
.event-code {
  padding: 2px 8px;
  border-radius: 5px;
  background: #f6f1fb;
  color: #7357cf;
  font-size: 11.5px;
  white-space: nowrap;
}
.event-time { min-width: 142px; text-align: right; color: #94a3b8; font-size: 12.5px; white-space: nowrap; }

.logs-card { padding: 18px 20px 14px; }
.logs-head { margin-bottom: 14px; }
.logs-head .card-title { font-size: 18px; }

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  margin-bottom: 14px;
}
.filter-field { display: flex; flex-direction: column; gap: 5px; min-width: 150px; }
.filter-field--grow { flex: 1 1 200px; }
.filter-label { font-size: 12.5px; color: #6b7280; }
.filter-field input,
.filter-field select {
  height: 36px;
  padding: 0 11px;
  border: 1px solid #d9e0ec;
  border-radius: 8px;
  background: #fff;
  font-family: inherit;
  font-size: 13.5px;
  color: #1f2937;
  outline: none;
  min-width: 0;
}
.filter-field select:disabled { background: #f7f9fc; color: #9aa6ba; cursor: not-allowed; }
.filter-field input:focus,
.filter-field select:focus { border-color: #9cc3f7; box-shadow: 0 0 0 3px rgba(31, 121, 238, 0.09); }
.filter-actions { display: flex; gap: 8px; margin-left: auto; }
.filter-actions .u-btn { height: 36px; padding: 0 16px; font-size: 14px; }

.logs-table-wrap { overflow-x: auto; }
.logs-table {
  width: 100%;
  min-width: 900px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}
.logs-table thead th {
  height: 40px;
  padding: 0 12px;
  background: #f2f6fd;
  border-radius: 8px 0 0 8px;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
}
.logs-table thead th:first-child { border-radius: 8px 0 0 8px; }
.logs-table thead th:last-child { border-radius: 0 8px 8px 0; }
.logs-table tbody td {
  height: 56px;
  padding: 0 12px;
  border-bottom: 1px solid #f1f4f9;
  font-size: 13.5px;
  color: #1f2937;
  vertical-align: middle;
}
.logs-table tbody tr:last-child td { border-bottom: 0; }
.logs-table tbody tr:hover td { background: #fafcff; }
.cell-main { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cell-sub {
  display: block;
  overflow: hidden;
  font-size: 11.5px;
  line-height: 17px;
  color: #9aa6ba;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.cell-sub--error { color: #d4556b; }

@media (max-width: 1280px) {
  .kpi-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .kpi-row { grid-template-columns: minmax(0, 1fr); }
  .head-tools { width: 100%; }
  .filter-actions { width: 100%; margin-left: 0; }
}
@media (max-width: 640px) {
  .event-row { flex-wrap: wrap; gap: 4px 10px; }
  .event-user,
  .event-model { min-width: 0; }
  .event-spacer { display: none; }
  .event-time { min-width: 0; text-align: left; }
  .events-card { padding: 14px 14px 12px; }
  .logs-card { padding: 16px 14px 10px; }
}
</style>
