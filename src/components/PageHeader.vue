<template>
  <div class="page-head">
    <div class="page-heading">
      <h1>Dashboard</h1>
      <p>实时监控 LLM 推理服务的 Token 流量与使用情况</p>
    </div>
    <div class="range">
      <button
        class="seg-btn seg-btn--solo"
        :class="{ 'is-active': modelValue === 'today' }"
        type="button"
        role="tab"
        :aria-selected="modelValue === 'today'"
        @click="select('today')"
      >今日</button>
      <div class="seg" role="tablist" aria-label="时间范围">
        <button
          v-for="item in secondaryRanges"
          :key="item.id"
          class="seg-btn"
          :class="{ 'is-active': modelValue === item.id }"
          type="button"
          role="tab"
          :aria-selected="modelValue === item.id"
          @click="select(item.id)"
        >{{ item.label }}</button>
      </div>
      <button class="calendar-btn" type="button" aria-label="选择日期">
        <svg class="ico" viewBox="0 0 21 22" style="width:21px;height:22px" aria-hidden="true"><use href="#i-calendar" /></svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ranges } from '../data/dashboard.js'

const props = defineProps({
  modelValue: { type: String, default: 'today' },
})
const emit = defineEmits(['update:modelValue'])

const secondaryRanges = computed(() => ranges.filter((r) => r.id !== 'today'))

function select(id) {
  emit('update:modelValue', id)
}
</script>
