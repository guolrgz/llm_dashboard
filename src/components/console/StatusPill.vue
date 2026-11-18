<template>
  <span class="pill" :class="'pill--' + tone">{{ label }}</span>
</template>

<script setup>
defineProps({
  label: { type: String, default: '' },
  tone: { type: String, default: 'gray' }, // green | red | amber | blue | purple | gray
})
</script>

<style scoped>
.pill {
  display: inline-flex;
  align-items: center;
  height: 25px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}
.pill--green { background: #e2f7ec; color: #1f9d63; }
.pill--red { background: #fbe4e5; color: #d4556b; }
.pill--amber { background: #fdf0dd; color: #b7791f; }
.pill--blue { background: #e3efff; color: #2f6fb5; }
.pill--purple { background: #efeafd; color: #7357cf; }
.pill--gray { background: #eef1f6; color: #64748b; }
</style>
