<script setup lang="ts">
import { computed } from 'vue'
import { backendStatus } from '@/api/client'
import { useHelpDialog } from '@/composables/useHelpDialog'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const { show } = useHelpDialog()
const online = computed(() => backendStatus.value === 'ok')
const workspace = computed(() => (session.user?.username ? `${session.user.username}'s workspace` : 'Your workspace'))
</script>

<template>
  <footer
    class="flex h-[38px] flex-none items-center gap-[15px] bg-shell px-[22px] text-[9px] text-[#89969e] max-[760px]:h-[37px] max-[760px]:gap-2 max-[760px]:px-3.5 max-[450px]:h-[35px] [@media(max-height:780px)_and_(min-width:1051px)]:h-8"
  >
    <span class="flex items-start gap-0.5 text-[17px] leading-none font-semibold tracking-[-0.06em] text-[#b7c4cb]">presenton</span>
    <span class="max-[450px]:hidden">Open-source AI presentations.</span>
    <div class="ml-auto flex items-center gap-1.5">
      <span
        class="size-1 rounded-full"
        :class="online ? 'bg-[#9cb5a8]' : 'bg-danger-text'"
        aria-hidden="true"
      />
      <span class="max-[760px]:hidden">{{ online ? workspace : 'Backend unreachable' }}</span>
      <button
        type="button"
        class="ml-5 flex items-center gap-[7px] text-[9px] text-[#93a1a9] hover:text-accent max-[760px]:ml-0"
        @click="show"
      >
        <span class="max-[760px]:sr-only">Keyboard shortcuts</span>
        <span class="grid size-[15px] place-items-center rounded-[4px] border border-white/[0.09]" aria-hidden="true">?</span>
      </button>
    </div>
  </footer>
</template>
