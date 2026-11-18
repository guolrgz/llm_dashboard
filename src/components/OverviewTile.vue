<template>
  <div class="ov-tile" :class="`ov-tile--${tone}`">
    <OverviewIcon :type="type" />
    <span class="ov-label">{{ label }}</span>
    <strong class="ov-value">{{ value }} <em v-if="unit">{{ unit }}</em></strong>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import OverviewIcon from './OverviewIcon.vue'

const props = defineProps({
  type: { type: String, required: true },
  label: { type: String, required: true },
  value: { type: String, required: true },
  unit: { type: String, default: '' },
})

const toneMap = { users: 'blue', roles: 'purple', cube: 'green', clock: 'orange' }
const tone = computed(() => toneMap[props.type])
</script>
