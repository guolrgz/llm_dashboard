<template>
  <Teleport to="body">
    <div class="toast-host" aria-live="polite" aria-atomic="false">
      <TransitionGroup name="toast-pop">
        <div v-for="item in toasts" :key="item.id" class="toast-item" :class="'toast-item--' + (item.type || 'success')">
          <span class="toast-ico" aria-hidden="true">
            <svg v-if="item.type === 'error'" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8" />
              <path d="M12 7.4v5.4M12 16.4h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            <svg v-else-if="item.type === 'info'" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8" />
              <path d="M12 10.6v5.2M12 7.6h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            <svg v-else viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8" />
              <path d="m7.8 12.2 2.8 2.9 5.7-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span class="toast-msg">{{ item.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
defineProps({
  toasts: { type: Array, default: () => [] },
})
</script>

<style scoped>
.toast-host {
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 120;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  pointer-events: none;
  width: max-content;
  max-width: calc(100vw - 32px);
}
.toast-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  max-width: min(560px, calc(100vw - 32px));
  padding: 11px 16px;
  border: 1px solid #e3e9f3;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.16);
  color: #1f2937;
  font-size: 14px;
  line-height: 20px;
  pointer-events: auto;
}
.toast-ico {
  display: grid;
  place-items: center;
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 0;
  color: #1f9d63;
}
.toast-ico svg { width: 20px; height: 20px; }
.toast-item--error .toast-ico { color: #e05353; }
.toast-item--info .toast-ico { color: #2f6fd6; }
.toast-msg { word-break: break-word; }
.toast-pop-enter-active,
.toast-pop-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.toast-pop-enter-from,
.toast-pop-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
