<template>
  <div class="pager">
    <span class="pager-total">共 {{ total }} 条记录，每页 {{ pageSize }} 条</span>
    <div class="pager-controls">
      <button class="pager-btn" type="button" :disabled="page <= 1" @click="go(page - 1)">上一页</button>
      <template v-for="item in pageItems" :key="item.key">
        <span v-if="item.type === 'ellipsis'" class="pager-ellipsis" aria-hidden="true">…</span>
        <button
          v-else
          class="pager-btn"
          :class="{ 'is-active': item.value === page }"
          type="button"
          :aria-current="item.value === page ? 'page' : undefined"
          @click="go(item.value)"
        >{{ item.value }}</button>
      </template>
      <button class="pager-btn" type="button" :disabled="page >= pageCount" @click="go(page + 1)">下一页</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  total: { type: Number, default: 0 },
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 10 },
})

const emit = defineEmits(['change'])

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

const pageItems = computed(() => {
  const count = pageCount.value
  const current = Math.min(Math.max(1, props.page), count)
  const items = []
  if (count <= 5) {
    for (let i = 1; i <= count; i += 1) items.push({ type: 'page', value: i, key: 'p' + i })
    return items
  }
  if (current <= 3) {
    for (let i = 1; i <= 3; i += 1) items.push({ type: 'page', value: i, key: 'p' + i })
    items.push({ type: 'ellipsis', key: 'e-last' })
    items.push({ type: 'page', value: count, key: 'p' + count })
    return items
  }
  if (current >= count - 2) {
    items.push({ type: 'page', value: 1, key: 'p1' })
    items.push({ type: 'ellipsis', key: 'e-first' })
    for (let i = count - 2; i <= count; i += 1) items.push({ type: 'page', value: i, key: 'p' + i })
    return items
  }
  items.push({ type: 'page', value: 1, key: 'p1' })
  items.push({ type: 'ellipsis', key: 'e-first' })
  items.push({ type: 'page', value: current, key: 'p' + current })
  items.push({ type: 'ellipsis', key: 'e-last' })
  items.push({ type: 'page', value: count, key: 'p' + count })
  return items
})

function go(target) {
  const next = Math.min(Math.max(1, target), pageCount.value)
  if (next !== props.page) emit('change', next)
}
</script>

<style scoped>
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 64px;
  padding: 12px 2px 4px;
}
.pager-total { font-size: 14.5px; color: #334155; white-space: nowrap; }
.pager-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.pager-btn {
  min-width: 34px;
  height: 34px;
  padding: 0 11px;
  border: 1px solid #d5dae4;
  border-radius: 6px;
  background: #fff;
  font-family: inherit;
  font-size: 13.5px;
  color: #1f2937;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}
.pager-btn:hover:not(:disabled):not(.is-active) { border-color: #b9c8dd; }
.pager-btn.is-active { border-color: #2077ed; background: #2077ed; color: #fff; }
.pager-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.pager-ellipsis { color: #64748b; font-size: 14px; letter-spacing: 1px; }
@media (max-width: 640px) {
  .pager { flex-direction: column; align-items: flex-start; gap: 10px; }
  .pager-controls { justify-content: flex-start; }
}
</style>
