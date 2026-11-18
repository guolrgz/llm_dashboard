<template>
  <div v-if="type === 'chat'" class="kpi-icon kpi-icon--blue"><svg class="kpi-glyph kpi-glyph--chat" viewBox="0 0 48 48"><defs><linearGradient id="chatGrad" x1="0.1" y1="0" x2="0.75" y2="1"><stop offset="0" stop-color="#4d8bfa"/><stop offset="1" stop-color="#2b63ec"/></linearGradient></defs>
            <path d="M37.4 24.6h4.8c2.5 0 4.5 2 4.5 4.5v14.4c0 2.5-2 4.5-4.5 4.5H40l-5.6 4.6c-.9.7-2.1.1-2.1-1v-3.6c-2.5 0-4.4-2-4.4-4.5V29.1c0-2.5 2-4.5 4.5-4.5Z" fill="#c9defe"/>
            <path d="M16.4 6.8h23.2c2.6 0 4.7 2.1 4.7 4.7v18.1c0 2.6-2.1 4.7-4.7 4.7H37l-8.1 7.2c-.8.7-2 .1-2-1v-6.2H16.4c-2.6 0-4.7-2.1-4.7-4.7V11.5c0-2.6 2.1-4.7 4.7-4.7Z" fill="url(#chatGrad)"/>
            <circle cx="20.8" cy="20.6" r="2.3" fill="#fff"/>
            <circle cx="27.9" cy="20.6" r="2.3" fill="#fff"/>
            <circle cx="35" cy="20.6" r="2.3" fill="#fff"/>
          </svg></div>
  <div v-else-if="type === 'database'" class="kpi-icon kpi-icon--green"><svg class="kpi-glyph" viewBox="0 0 70 70" style=""><path d="M27.8,18.7 26.2,21.3 24.0,21.6 22.7,22.8 24.2,25.3 22.1,23.6 19.5,24.2 19.7,29.2 22.0,29.6 24.2,31.5 28.8,31.5 31.4,33.5 42.8,33.5 45.0,31.6 48.8,31.5 51.0,30.4 54.5,26.8 54.3,24.8 48.8,20.5 44.6,19.5Z" fill="#66d4b9" fill-rule="evenodd"/><path d="M18.8,32.7 18.5,39.8 20.8,42.3 33.4,46.5 39.8,46.5 43.2,44.5 47.0,44.4 51.2,42.3 55.5,37.6 55.4,35.0 52.6,32.5 46.2,33.5 42.6,35.5 29.4,35.5 22.8,32.5Z" fill="#6acb9e" fill-rule="evenodd"/><path d="M51.8,42.7 48.0,45.4 45.2,45.5 41.6,47.5 30.2,47.5 22.0,43.6 20.2,43.5 18.6,45.0 17.6,48.9 18.5,52.8 23.0,56.4 26.0,56.6 28.2,58.5 42.6,58.5 46.8,57.5 50.2,56.3 55.4,52.0 55.4,46.0 54.2,43.7Z" fill="#69c897" fill-rule="evenodd"/></svg></div>
  <div v-else class="kpi-icon kpi-icon--purple"><svg class="kpi-glyph" viewBox="0 0 70 70" style=""><path d="M35.8,16.7 25.8,20.7 21.8,23.7 17.7,28.8 15.5,34.4 15.5,46.8 19.7,54.2 25.8,60.3 36.2,64.5 42.8,64.5 51.0,61.4 58.3,55.2 62.5,47.8 63.5,43.6 63.5,35.2 59.3,25.8 54.2,20.7 43.8,16.5ZM47.8,31.7 37.0,42.4 34.8,42.3 30.8,38.5 28.7,39.8 28.6,41.0 35.8,47.3 37.0,47.4 50.3,34.2 50.3,32.8Z" fill="#8e6bf1" fill-rule="evenodd"/></svg></div>
</template>

<script setup>
// KPI 卡片图标：形状与渐变直接从设计稿描摹，保持与设计稿一致的配色
defineProps({
  type: { type: String, default: 'chat' },
})
</script>
