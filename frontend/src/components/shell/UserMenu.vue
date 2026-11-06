<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { LogOut } from 'lucide-vue-next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const name = computed(() => session.user?.username ?? '')
const initial = computed(() => Array.from(name.value)[0]?.toLocaleUpperCase() ?? '?')

async function signOut() {
  await session.signOut().catch(() => {})
  await router.push({ name: 'login' })
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        aria-label="Account menu"
        class="grid size-[33px] place-items-center rounded-full border-[3px] border-[#2e2b28] bg-[#ddccb9] text-[12px] font-bold text-[#493c2e]"
      >
        {{ initial }}
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent side="right" align="end">
      <DropdownMenuLabel class="px-2 py-1.5 text-[11px] font-medium text-muted">{{ name }}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem @select="signOut"><LogOut class="size-4" aria-hidden="true" />Sign out</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
