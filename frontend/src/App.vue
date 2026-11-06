<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import AppShell from '@/components/shell/AppShell.vue'
import BackendBanner from '@/components/shell/BackendBanner.vue'
import { Toaster } from '@/components/ui/sonner'

const route = useRoute()
</script>

<template>
  <AppShell v-if="route.meta.layout === 'app'"><RouterView /></AppShell>
  <template v-else>
    <BackendBanner />
    <RouterView />
  </template>
  <Toaster />
</template>
