<script setup lang="ts">
import { CLASSIC_SETTINGS_URL } from '@/settings/providers'
</script>

<template>
  <p class="text-[11px] leading-[1.6] text-[#95aab7]">
    ChatGPT sign-in and Presenton Cloud are set up in the
    <a
      :href="CLASSIC_SETTINGS_URL"
      target="_blank"
      rel="noopener noreferrer"
      class="text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >classic app</a
    >.
  </p>
</template>
