<template>
  <Teleport to="body">
    <Transition name="cm-fade">
      <div v-if="open" class="cm-mask" @mousedown.self="emit('close')">
        <div class="cm" role="dialog" aria-modal="true" :aria-label="title" :style="{ width }">
          <header class="cm-head">
            <h3 class="cm-title">{{ title }}</h3>
            <button class="cm-close" type="button" aria-label="关闭" @click="emit('close')">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
          </header>
          <div class="cm-body">
            <slot />
          </div>
          <footer class="cm-foot">
            <slot name="footer">
              <button v-if="cancelText" class="cm-btn cm-btn--ghost" type="button" @click="emit('close')">{{ cancelText }}</button>
              <button class="cm-btn cm-btn--primary" type="button" :disabled="confirmDisabled || confirmLoading" @click="emit('confirm')">
                {{ confirmLoading ? '处理中…' : confirmText }}
              </button>
            </slot>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { onBeforeUnmount, onMounted, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  width: { type: String, default: '480px' },
  confirmText: { type: String, default: '保存' },
  cancelText: { type: String, default: '取消' },
  confirmDisabled: { type: Boolean, default: false },
  confirmLoading: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'confirm'])

function onKeydown(event) {
  if (event.key === 'Escape' && props.open) emit('close')
}

function lockBody(locked) {
  document.body.classList.toggle('console-modal-locked', locked)
}

watch(
  () => props.open,
  (open) => lockBody(open),
)

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.classList.remove('console-modal-locked')
})
</script>

<style scoped>
.cm-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.45);
  overflow-y: auto;
}
.cm {
  width: 480px;
  max-width: 100%;
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 24px 70px rgba(2, 8, 23, 0.28);
  overflow: hidden;
}
.cm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 22px 12px;
  flex: none;
}
.cm-title {
  margin: 0;
  font-size: 19px;
  line-height: 26px;
  font-weight: 700;
  color: #0f172a;
}
.cm-close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}
.cm-close:hover { background: #f1f5f9; }
.cm-close svg { width: 18px; height: 18px; }
.cm-body {
  padding: 2px 22px 8px;
  overflow-y: auto;
  min-height: 0;
}
.cm-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px 20px;
  flex: none;
}
.cm-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 38px;
  padding: 0 18px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14.5px;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease;
}
.cm-btn--ghost { background: #fff; border-color: #d5dae4; color: #1f2937; }
.cm-btn--ghost:hover { border-color: #b9c8dd; }
.cm-btn--primary { background: #2077ed; color: #fff; }
.cm-btn--primary:hover:not(:disabled) { background: #1a6ae0; }
.cm-btn--primary:disabled { background: #b9cdf0; cursor: not-allowed; }
.cm-fade-enter-active,
.cm-fade-leave-active { transition: opacity 0.16s ease; }
.cm-fade-enter-from,
.cm-fade-leave-to { opacity: 0; }
@media (max-width: 640px) {
  .cm { border-radius: 12px; }
  .cm-head { padding: 16px 16px 10px; }
  .cm-body { padding: 2px 16px 6px; }
  .cm-foot { padding: 12px 16px 16px; }
}
</style>
