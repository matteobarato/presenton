<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()

async function signOut() {
  await session.signOut().catch(() => {})
  await router.push({ name: 'login' })
}
</script>

<template>
  <div>
    <dl class="mb-6 grid gap-3">
      <div class="rounded-[11px] bg-[#1d2427] px-4 py-3">
        <dt class="text-[10px] text-[#95aab7]">Username</dt>
        <dd class="mt-1.5 text-[13px] font-medium text-[#dbe7ef]">{{ session.user?.username }}</dd>
      </div>
      <div v-if="session.user?.role" class="rounded-[11px] bg-[#1d2427] px-4 py-3">
        <dt class="text-[10px] text-[#95aab7]">Role</dt>
        <dd class="mt-1.5 text-[13px] font-medium text-[#dbe7ef]">{{ session.user.role }}</dd>
      </div>
    </dl>
    <Button variant="secondary" @click="signOut">Sign out</Button>
  </div>
</template>
