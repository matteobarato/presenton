<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { TriangleAlert } from 'lucide-vue-next'
import { getAuthStatus } from '@/api/auth'
import { backendStatus } from '@/api/client'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const backendUrl = __PRESENTON_BACKEND_URL__

async function retry() {
  if (backendStatus.value !== 'unreachable') return
  try {
    session.applyStatus(await getAuthStatus())
  } catch {
    // Still down: guardedFetch keeps backendStatus 'unreachable'.
  }
}

onMounted(() => window.addEventListener('focus', retry))
onBeforeUnmount(() => window.removeEventListener('focus', retry))
</script>

<template>
  <div
    v-if="backendStatus === 'unreachable'"
    role="alert"
    class="flex items-center gap-2.5 border-b border-danger-text/20 bg-danger px-4 py-2 text-[12px] text-danger-text"
  >
    <TriangleAlert class="size-4 shrink-0" aria-hidden="true" />
    <span>Can't reach the Presenton backend at {{ backendUrl }} (via this server's /api proxy). Retrying when you return to this window…</span>
  </div>
</template>
