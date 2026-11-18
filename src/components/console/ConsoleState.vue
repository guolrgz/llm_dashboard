<template>
  <div class="cs" :class="'cs--' + type" role="status">
    <span v-if="type === 'loading'" class="cs-spinner" aria-hidden="true"></span>
    <svg v-else-if="type === 'error'" class="cs-ico" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8" />
      <path d="M12 7.6v5.2M12 16.4h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
    <svg v-else class="cs-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 7.5 12 4l7.5 3.5v9L12 20l-7.5-3.5v-9Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
      <path d="M4.7 7.6 12 11l7.3-3.4M12 11v8.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
    </svg>
    <p class="cs-title">{{ title || defaultTitle }}</p>
    <p v-if="message" class="cs-message">{{ message }}</p>
    <button v-if="type === 'error' && retryText" class="cs-retry" type="button" @click="$emit('retry')">
      {{ retryText }}
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  type: { type: String, default: 'loading' }, // loading | empty | error
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  retryText: { type: String, default: '重新加载' },
})

defineEmits(['retry'])

const defaultTitle = computed(() => {
  if (props.type === 'loading') return '加载中…'
  if (props.type === 'error') return '加载失败'
  return '暂无数据'
})
</script>

<style scoped>
.cs {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 168px;
  padding: 30px 20px;
  text-align: center;
  color: #64748b;
}
.cs-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #334155;
}
.cs--loading .cs-title { color: #64748b; font-weight: 500; }
.cs-message {
  margin: 0;
  max-width: 560px;
  font-size: 13.5px;
  line-height: 21px;
  color: #7c8698;
  word-break: break-word;
}
.cs-ico {
  width: 38px;
  height: 38px;
  color: #9aa6ba;
}
.cs--error .cs-ico { color: #e0785f; }
.cs-spinner {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2.5px solid #dbe5f5;
  border-top-color: #3f7cf5;
  animation: cs-spin 0.8s linear infinite;
}
.cs-retry {
  margin-top: 6px;
  height: 34px;
  padding: 0 16px;
  border: 1px solid #cdddf7;
  border-radius: 8px;
  background: #fff;
  color: #2f6fd6;
  font-family: inherit;
  font-size: 13.5px;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease;
}
.cs-retry:hover { background: #f2f7ff; border-color: #a9c8f5; }
@keyframes cs-spin { to { transform: rotate(360deg); } }
</style>
