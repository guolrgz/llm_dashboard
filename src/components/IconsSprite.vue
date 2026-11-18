<template>
<svg class="svg-defs" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <!-- ===== navigation / chrome icons ===== -->
    <symbol id="i-home" viewBox="0 0 24 24">
      <path d="M3.2 10.4 12 3.1l8.8 7.3v8.9a1.9 1.9 0 0 1-1.9 1.9h-4.2v-5.9H9.3v5.9H5.1a1.9 1.9 0 0 1-1.9-1.9v-8.9Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <symbol id="i-users" viewBox="0 0 28 28"><path d="M11.8,3.7 7.6,7.0 7.5,10.8 11.0,14.4 13.8,14.5 17.4,11.0 17.5,8.2 14.2,3.7ZM18.8,6.7 18.5,13.6 19.6,14.5 21.4,13.0 22.5,9.4 21.2,6.7ZM8.8,15.7 4.7,18.8 3.6,21.0 3.6,23.0 4.8,24.3 19.3,24.2 19.5,20.2 17.2,16.7 14.6,15.5ZM19.8,16.7 19.6,18.0 21.5,20.2 21.6,24.0 24.0,24.4 25.5,21.8 25.4,20.0 22.0,16.6Z" fill="currentColor" fill-rule="evenodd"/></symbol>
    <symbol id="i-role" viewBox="0 0 28 28"><path d="M11.8,3.7 7.7,5.8 6.5,9.8 9.8,14.3 13.8,14.5 16.5,11.8 16.5,6.2 15.0,4.6ZM18.8,6.7 18.5,13.8 20.8,14.5 22.5,11.8 22.5,8.2 21.0,6.6ZM8.8,15.7 3.6,20.0 3.8,24.3 19.3,24.2 19.2,18.7 17.8,18.3 14.8,15.5ZM18.8,15.7 18.7,17.2 21.4,19.0 21.7,23.2 23.0,24.4 24.2,24.3 25.5,22.6 25.5,19.2 24.3,16.8 21.8,15.5Z" fill="currentColor" fill-rule="evenodd"/></symbol>
    <symbol id="i-shield" viewBox="0 0 28 28"><path d="M11.8,3.7 8.8,5.5 6.0,5.6 4.6,7.0 4.5,18.6 8.8,23.3 14.6,25.5 21.2,22.3 24.4,19.0 24.5,8.4 23.0,6.6 19.0,5.4 16.0,3.6ZM13.8,9.7 13.3,12.2 10.8,13.7 10.5,14.6 14.6,18.5 16.8,15.7 18.4,14.9 15.6,13.0 15.3,9.8Z" fill="currentColor" fill-rule="evenodd"/></symbol>
    <symbol id="i-traffic" viewBox="0 0 28 28"><path d="M20.8,4.7 19.6,5.9 20.3,7.2 17.0,10.4 15.0,10.4 11.2,7.5 3.7,14.2 6.0,15.4 11.1,10.6 15.8,14.3 17.0,14.4 21.8,8.7 24.4,8.0 24.2,4.7ZM20.8,12.7 20.5,20.8 19.2,22.3 18.5,21.8 18.2,16.7 14.8,16.7 14.4,21.0 13.2,21.5 12.5,20.6 12.4,16.0 10.4,15.5 9.5,16.2 9.2,21.3 7.7,21.2 6.8,18.5 5.0,18.6 3.7,19.8 4.7,24.2 24.2,24.3 25.4,23.1 24.5,21.6 24.5,13.2 23.6,12.5Z" fill="currentColor" fill-rule="evenodd"/></symbol>
    <symbol id="i-settings" viewBox="0 0 28 28"><path d="M12.8,3.7 10.0,6.4 6.8,6.7 3.7,10.8 3.6,12.0 5.4,15.1 3.6,17.0 3.5,18.6 6.8,22.3 10.2,22.7 12.0,25.4 15.6,25.5 19.0,22.6 23.4,22.0 24.5,19.6 24.5,17.2 23.5,15.6 24.5,10.4 22.0,6.6 18.0,6.4 15.8,3.5ZM13.8,6.7 12.0,9.4 7.6,10.0 8.5,15.6 7.5,18.6 8.2,19.5 12.0,19.6 12.7,21.2 14.6,22.5 17.0,19.6 21.3,19.2 21.4,18.0 19.5,14.4 21.5,11.4 20.2,9.7 17.0,9.4 15.2,6.7ZM11.8,11.7 10.5,13.2 10.7,16.2 12.2,17.5 16.2,17.3 17.5,15.8 17.3,12.8 15.8,11.5Z" fill="currentColor" fill-rule="evenodd"/></symbol>
    <symbol id="i-logout" viewBox="0 0 28 28"><path d="M5.8,4.7 4.5,7.4 4.5,21.6 5.6,24.0 16.0,24.4 17.5,22.6 16.1,20.6 14.6,21.5 7.6,21.0 7.5,8.4 8.4,7.5 17.0,7.4 17.4,5.0ZM18.8,9.7 19.2,12.3 12.2,12.5 10.5,14.8 11.4,15.5 19.0,15.6 19.5,16.6 18.6,19.0 20.8,19.5 24.3,16.2 25.4,13.9 21.2,9.7Z" fill="currentColor" fill-rule="evenodd"/></symbol>
    <symbol id="i-menu" viewBox="0 0 24 24">
      <path d="M2.6 6.6h18.8M2.6 12h18.8M2.6 17.4h18.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    </symbol>
    <symbol id="i-bell" viewBox="0 0 24 24">
      <path d="M18.3 15.7v-4.9c0-3.5-2.8-6.4-6.3-6.4S5.7 7.3 5.7 10.8v4.9l-1.6 2.5c-.3.5.1 1.2.7 1.2h14.4c.6 0 1-.7.7-1.2l-1.6-2.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M9.8 19.4a2.3 2.3 0 0 0 4.4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </symbol>
    <symbol id="i-chevron-down" viewBox="0 0 24 24">
      <path d="m6.5 9.5 5.5 5.5 5.5-5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <symbol id="i-chevron-right" viewBox="0 0 24 24">
      <path d="m9.5 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <symbol id="i-calendar" viewBox="0 0 21 22"><path d="M6.8,2.7 4.0,3.6 2.5,5.2 2.7,19.2 18.2,19.3 19.5,16.6 19.5,6.4 18.3,3.8 14.6,2.5 12.6,3.5ZM4.8,5.7 5.2,8.5 16.6,8.5 17.5,7.8 16.8,5.5 14.1,7.4 12.8,5.5 8.2,5.5 6.6,6.5ZM4.8,10.7 5.0,17.4 17.4,17.0 17.0,10.6Z" fill="currentColor" fill-rule="evenodd"/></symbol>
    <symbol id="i-arrow-up" viewBox="0 0 14 14"><path d="M4.8,0.7 0.5,5.6 1.1,6.4 4.3,4.8 4.5,11.8 5.6,12.5 6.5,11.6 6.7,4.8 8.0,4.6 9.9,6.4 10.5,5.4 6.2,0.7Z" fill="currentColor" fill-rule="evenodd"/></symbol>
    <!-- ===== KPI icons ===== -->
    <symbol id="i-message" viewBox="0 0 48 48">
      <defs>
        <linearGradient id="chatGrad" x1="0.1" y1="0" x2="0.75" y2="1">
          <stop offset="0" stop-color="#4d8bfa"/>
          <stop offset="1" stop-color="#2b63ec"/>
        </linearGradient>
        <!-- ===== user-management page ===== -->
    <symbol id="i-model" viewBox="0 0 24 24">
      <path d="m12 2.8 8.6 4.7v9L12 21.2l-8.6-4.7v-9L12 2.8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="m3.6 7.6 8.4 4.6 8.4-4.6M12 12.2v8.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    </symbol>
    <symbol id="i-search" viewBox="0 0 24 24">
      <circle cx="10.5" cy="10.5" r="6.3" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <path d="m15.4 15.4 4.6 4.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </symbol>
    <symbol id="i-plus" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </symbol>
    <symbol id="i-trash" viewBox="0 0 24 24">
      <path d="M4.5 6.5h15M9.5 6.5V4.8c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2v1.7M6.5 6.5l.8 12.1c0 .9.8 1.6 1.7 1.6h6c.9 0 1.7-.7 1.7-1.6l.8-12.1M10 10.5v5.6M14 10.5v5.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <symbol id="i-ban" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <path d="m6.2 17.8 11.6-11.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </symbol>
    <symbol id="i-close" viewBox="0 0 24 24">
      <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </symbol>
  </defs>
      <path d="M33.4 24.6h9.8c2.5 0 4.5 2 4.5 4.5v14.4c0 2.5-2 4.5-4.5 4.5h-1.5l-5.6 4.6c-.9.7-2.1.1-2.1-1v-3.6h-.6c-2.5 0-4.5-2-4.5-4.5V29.1c0-2.5 2-4.5 4.5-4.5Z" fill="#c9defe"/>
      <path d="M12.4 6.8h23.2c2.6 0 4.7 2.1 4.7 4.7v18.1c0 2.6-2.1 4.7-4.7 4.7h-1.8l-8.1 7.2c-.8.7-2 .1-2-1v-6.2H12.4c-2.6 0-4.7-2.1-4.7-4.7V11.5c0-2.6 2.1-4.7 4.7-4.7Z" fill="url(#chatGrad)"/>
      <circle cx="16.8" cy="20.6" r="2.3" fill="#fff"/>
      <circle cx="23.9" cy="20.6" r="2.3" fill="#fff"/>
      <circle cx="31" cy="20.6" r="2.3" fill="#fff"/>
    </symbol>
    <symbol id="i-database" viewBox="0 0 48 48">
      <defs>
        <linearGradient id="dbTop" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stop-color="#9af0d5"/>
          <stop offset="1" stop-color="#68e0bf"/>
        </linearGradient>
        <linearGradient id="dbMid" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stop-color="#7ae7c4"/>
          <stop offset="1" stop-color="#4bd4a6"/>
        </linearGradient>
        <linearGradient id="dbBot" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stop-color="#5ddcae"/>
          <stop offset="1" stop-color="#2ec48c"/>
        </linearGradient>
      </defs>
      <ellipse cx="24" cy="12.4" rx="15.2" ry="6.6" fill="url(#dbTop)"/>
      <path d="M8.8 17.2c0 3.6 6.8 6.6 15.2 6.6s15.2-3 15.2-6.6v7.6c0 3.6-6.8 6.6-15.2 6.6S8.8 28.4 8.8 24.8v-7.6Z" fill="url(#dbMid)"/>
      <path d="M8.8 26.8c0 3.6 6.8 6.6 15.2 6.6s15.2-3 15.2-6.6v6.6c0 3.6-6.8 6.6-15.2 6.6S8.8 37 8.8 33.4v-6.6Z" fill="url(#dbBot)"/>
    </symbol>
    <symbol id="i-check-circle" viewBox="0 0 48 48">
      <defs>
        <linearGradient id="checkGrad" x1="0.15" y1="0" x2="0.8" y2="1">
          <stop offset="0" stop-color="#a78bfa"/>
          <stop offset="1" stop-color="#7c47f0"/>
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="19.4" fill="url(#checkGrad)"/>
      <path d="m15.2 24.6 5.9 5.9 11.7-12" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <!-- ===== overview icons ===== -->
    <symbol id="i-users-solid" viewBox="0 0 40 40">
      <circle cx="15" cy="12.4" r="5.6" fill="currentColor"/>
      <path d="M4.4 30.6c0-5.2 4.7-9 10.6-9s10.6 3.8 10.6 9c0 .7-.5 1.2-1.2 1.2H5.6c-.7 0-1.2-.5-1.2-1.2Z" fill="currentColor"/>
      <circle cx="28.4" cy="14.2" r="4.2" fill="currentColor" opacity=".8"/>
      <path d="M24.4 24.4c4.6.4 8.2 3.2 8.2 6.9 0 .6-.5 1.1-1.1 1.1h-3.9c.2-.5.2-1 .2-1.5 0-2.7-1.3-5-3.4-6.5Z" fill="currentColor" opacity=".8"/>
    </symbol>
    <symbol id="i-cube" viewBox="0 0 40 40">
      <path d="m20 5.6 13 6.8v14.9l-13 7-13-7V12.4l13-6.8Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="m7.4 12.7 12.6 6.7 12.6-6.7M20 19.4v14.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="m20 5.9 12.7 6.6-12.7 6.8L7.3 12.5 20 5.9Z" fill="currentColor" opacity=".9"/>
    </symbol>
    <symbol id="i-clock" viewBox="0 0 40 40">
      <path d="M20 5.5c8 0 14.5 6.5 14.5 14.5S28 34.5 20 34.5 5.5 28 5.5 20 12 5.5 20 5.5Z" fill="currentColor"/>
      <path d="M20 11.6V20l5.9 3.6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <!-- ===== logo ===== -->
    <symbol id="i-logo" viewBox="0 0 54 54">
      <defs>
        <linearGradient id="logoGradEx" x1="0.05" y1="0" x2="0.9" y2="1">
          <stop offset="0" stop-color="#7ad6ff"/>
          <stop offset="0.5" stop-color="#4bb8f8"/>
          <stop offset="1" stop-color="#2f8fe8"/>
        </linearGradient>
      </defs>
      <path d="M25.4,1.0 24.7,1.5 21.5,1.5 16.5,4.0 13.5,7.0 11.1,11.9 10.9,14.8 5.9,17.0 2.9,20.0 1.0,24.3 1.0,28.8 1.6,29.6 1.6,30.7 2.9,33.2 5.9,36.2 10.4,38.1 14.8,38.1 15.5,37.6 16.7,37.4 18.4,36.4 19.2,36.5 18.8,37.3 18.7,38.9 18.2,39.6 18.1,40.8 17.6,41.4 17.5,43.0 17.0,43.8 16.9,45.4 16.4,46.1 16.6,46.9 19.2,44.4 19.4,43.6 22.7,40.3 23.0,39.5 25.7,36.8 25.9,35.9 26.7,35.2 38.3,35.1 39.3,35.7 43.8,35.7 44.4,35.2 45.6,35.1 48.1,33.9 51.1,30.8 53.0,26.5 53.0,22.0 52.4,21.2 52.4,20.1 51.1,17.6 48.1,14.6 45.6,13.3 44.4,13.2 43.8,12.7 40.3,12.6 37.5,7.0 34.5,4.0 29.6,1.5 26.3,1.5Z" fill="none" stroke="url(#logoGradEx)" stroke-width="2.9" stroke-linejoin="round"/>
      <path d="M13.4 26.6h13.4" fill="none" stroke="url(#logoGradEx)" stroke-width="2.8" stroke-linecap="round"/>
      <g fill="url(#logoGradEx)">
        <circle cx="19.6" cy="18.6" r="2.2"/>
        <circle cx="28.4" cy="16.8" r="2.2"/>
        <circle cx="33.2" cy="23.2" r="2.2"/>
        <circle cx="34.6" cy="31.4" r="2"/>
        <circle cx="19.4" cy="31.4" r="1.9"/>
        <circle cx="26.8" cy="34" r="1.9"/>
      </g>
      <g fill="none" stroke="url(#logoGradEx)" stroke-width="1.5" stroke-linecap="round">
        <path d="m21.6 19.4-1.4 4.6"/>
        <path d="m27 17.6 3.4 4.4"/>
        <path d="m31.6 25 1 4.4"/>
        <path d="m32.6 30-5.2 2.4"/>
        <path d="m24 33.6-2.6-1.6"/>
      </g>
    </symbol>
    <!-- ===== misc ===== -->
    <symbol id="i-bars" viewBox="0 0 24 24">
      <rect x="2.5" y="14" width="4" height="7" rx="1" fill="currentColor"/>
      <rect x="9" y="8.5" width="4" height="12.5" rx="1" fill="currentColor"/>
      <rect x="15.5" y="3.5" width="4" height="17.5" rx="1" fill="currentColor"/>
    </symbol>
    <symbol id="i-avatar" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="20" fill="#e7f0fd"/>
      <path d="M20 9.2c4.6 0 7.4 3.2 7.4 7.4v1.6c0 4.3-3 7.6-7.4 7.6s-7.4-3.3-7.4-7.6v-1.6c0-4.2 2.8-7.4 7.4-7.4Z" fill="#f3d2b6"/>
      <path d="M20 8.4c4.4 0 7.6 2.6 7.9 6.6-1.5-1.6-4-2.8-7.9-2.8s-6.4 1.2-7.9 2.8c.3-4 3.5-6.6 7.9-6.6Z" fill="#1f2a3d"/>
      <path d="M8.6 38.2c0-6.2 5.1-10.4 11.4-10.4s11.4 4.2 11.4 10.4c-3.2 1.2-7 1.8-11.4 1.8s-8.2-.6-11.4-1.8Z" fill="#26344c"/>
      <path d="M17 21.2h6v3.2c0 1.5-1.2 2.6-3 2.6s-3-1.1-3-2.6v-3.2Z" fill="#f3d2b6"/>
    </symbol>
  </defs>
</svg>
</template>

<script setup>
// 全站 SVG symbol 图标精灵：从设计稿轮廓提取，供各处 <use> 引用
</script>
