<template>
  <article class="card table-card">
    <div class="card-head">
      <h2 class="card-title">近期请求记录</h2>
      <a class="more-link" href="#" @click.prevent>查看更多<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-chevron-right" /></svg></a>
    </div>
    <div class="table-wrap">
      <table class="req-table">
        <thead>
          <tr>
            <th class="col-time">时间</th>
            <th class="col-user">用户</th>
            <th class="col-model">模型</th>
            <th class="col-token">Token 数量</th>
            <th class="col-status">状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in displayRows" :key="row.id ?? row.time ?? index">
            <td class="col-time">{{ row.time }}</td>
            <td class="col-user">{{ row.user }}</td>
            <td class="col-model">{{ row.model }}</td>
            <td class="col-token">{{ formatTokens(row) }}</td>
            <td class="col-status">
              <span class="badge" :class="badgeClass(row)">{{ row.status }}</span>
            </td>
          </tr>
          <tr v-if="!displayRows.length">
            <td colspan="5" class="req-empty">暂无请求记录</td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { requestRows } from '../data/dashboard.js'

const props = defineProps({
  rows: { type: Array, default: null },
})

const displayRows = computed(() => {
  if (Array.isArray(props.rows) && props.rows.length) return props.rows
  if (Array.isArray(props.rows)) return []
  return requestRows
})

const STATUS_TONE = {
  success: 'success',
  成功: 'success',
  error: 'error',
  失败: 'error',
  错误: 'error',
  unauthorized: 'error',
  auth_failed: 'error',
  鉴权失败: 'error',
  quota_exceeded: 'warning',
  配额超限: 'warning',
  rate_limited: 'warning',
  限流: 'warning',
  not_found: 'warning',
  模型不可用: 'warning',
}

function formatTokens(row) {
  if (row.tokensDisplay) return row.tokensDisplay
  const tokens = Number(row.tokens)
  if (Number.isFinite(tokens)) return tokens.toLocaleString('en-US')
  return row.tokens ?? '-'
}

function badgeClass(row) {
  const tone = STATUS_TONE[row.statusKey] || STATUS_TONE[row.status] || 'info'
  return `badge--${tone}`
}
</script>
