<template>
  <aside class="sidebar" id="sidebar">
    <div class="brand">
      <span class="brand-logo">
        <svg aria-hidden="true" viewBox="0 0 55 59" style="width:55px;height:59px"><use href="#i-logo" /></svg>
      </span>
      <span class="brand-text">
        <strong>LLM推理</strong>
        <span>Token 流量管理系统</span>
      </span>
    </div>

    <nav class="nav" aria-label="主导航">
      <template v-for="item in items" :key="item.id">
        <div v-if="item.dividerBefore" class="nav-divider"></div>
        <a
          class="nav-item"
          :class="{ 'is-active': active === item.id }"
          href="#"
          :aria-current="active === item.id ? 'page' : undefined"
          @click.prevent="$emit('navigate', item.id)"
        >
          <svg
            class="ico"
            :viewBox="item.size === 24 ? '0 0 24 24' : '0 0 28 28'"
            :style="item.size === 28 ? 'width:28px;height:28px' : null"
            aria-hidden="true"
          ><use :href="`#${item.icon}`" /></svg>
          <span>{{ item.label }}</span>
          <svg v-if="item.chevron" class="ico nav-chevron" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-chevron-down" /></svg>
        </a>
      </template>
    </nav>

    <div class="sidebar-footer">
      <a class="nav-item nav-item--logout" href="#" @click.prevent="$emit('logout')">
        <svg class="ico" viewBox="0 0 28 28" style="width:28px;height:28px" aria-hidden="true"><use href="#i-logout" /></svg>
        <span>退出登录</span>
      </a>
    </div>
  </aside>
</template>

<script setup>
defineProps({
  items: { type: Array, required: true },
  active: { type: String, default: 'dashboard' },
})
defineEmits(['navigate', 'logout'])
</script>
