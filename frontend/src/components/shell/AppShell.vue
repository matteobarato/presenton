<script setup lang="ts">
import BackendBanner from './BackendBanner.vue'
import NavRail from './NavRail.vue'
</script>

<template>
  <div class="flex h-dvh min-h-[600px] overflow-hidden bg-rail">
    <NavRail />
    <div class="flex min-w-0 flex-1 flex-col bg-shell">
      <BackendBanner />
      <main class="min-h-0 flex-1 overflow-auto"><slot /></main>
    </div>
  </div>
</template>
