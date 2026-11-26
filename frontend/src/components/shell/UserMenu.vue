<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { LogOut, Settings2 } from 'lucide-vue-next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { defaultSettingsSection } from '@/settings/types'
import { useSessionStore } from '@/stores/session'

const { t } = useI18n()
const session = useSessionStore()
const router = useRouter()
const route = useRoute()
const name = computed(() => session.user?.username ?? '')
const initial = computed(() => Array.from(name.value)[0]?.toLocaleUpperCase() ?? '?')
const settingsSection = computed(() => defaultSettingsSection(session.user?.role === 'admin'))

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
        :aria-label="t('shell.nav.accountMenu')"
        class="grid size-[33px] place-items-center rounded-full border-[3px] border-lx-2e2b28 bg-sx-ddccb9 text-[12px] font-bold text-tx-493c2e"
      >
        {{ initial }}
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent side="right" align="end">
      <DropdownMenuLabel class="px-2 py-1.5 text-[11px] font-medium text-muted">{{ name }}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem as-child>
        <RouterLink :to="{ name: 'settings', params: { section: settingsSection } }" :aria-current="route.name === 'settings' ? 'page' : undefined"><Settings2 class="size-4" aria-hidden="true" />{{ t('shell.nav.settings') }}</RouterLink>
      </DropdownMenuItem>
      <DropdownMenuItem @select="signOut"><LogOut class="size-4" aria-hidden="true" />{{ t('shell.nav.signOut') }}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
