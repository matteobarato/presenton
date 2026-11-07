<script setup lang="ts">
import AppFooter from './AppFooter.vue'
import BackendBanner from './BackendBanner.vue'
import HelpDialog from './HelpDialog.vue'
import NavRail from './NavRail.vue'
</script>

<template>
  <div class="flex h-dvh min-h-[600px] overflow-hidden bg-rail">
    <NavRail />
    <div class="flex min-w-0 flex-1 flex-col bg-shell">
      <BackendBanner />
      <main class="flex min-h-0 flex-1 flex-col overflow-auto"><slot /></main>
      <AppFooter />
    </div>
    <HelpDialog />
  </div>
</template>
