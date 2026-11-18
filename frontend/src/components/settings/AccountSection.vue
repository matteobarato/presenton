<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
// Signing out is the parent's job: it owns the unsaved-changes prompt that must run first.
const emit = defineEmits<{ 'sign-out': [] }>()
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
    <Button variant="secondary" @click="emit('sign-out')">Sign out</Button>
  </div>
</template>
