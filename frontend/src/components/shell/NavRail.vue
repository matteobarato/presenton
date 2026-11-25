<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import { CircleHelp, FolderOpen, LayoutTemplate, Plus, Settings2, Presentation } from 'lucide-vue-next'
import { useHelpDialog } from '@/composables/useHelpDialog'
import { defaultSettingsSection } from '@/settings/types'
import { useSessionStore } from '@/stores/session'
import UserMenu from './UserMenu.vue'

const { t } = useI18n()
const route = useRoute()
const help = useHelpDialog()
const session = useSessionStore()
const link =
  'flex w-full flex-col items-center gap-2 rounded-[11px] py-3 text-[9px] font-medium text-tx-9aa3a8 transition-colors duration-200 hover:bg-sx-1d2225 hover:text-tx-d9e0e4 max-[760px]:gap-1.5 max-[760px]:text-[7px]'
const cta =
  'flex w-full flex-col items-center gap-1.5 py-1 text-[9px] font-medium text-tx-c2e5f5 max-[760px]:text-[7px]'
const active = 'bg-sx-222b30 text-tx-c2e5f5'
const libraryActive = computed(() => route.name === 'library' || route.name === 'editor')
const newActive = computed(() => route.name === 'new' || route.name === 'create')
const templatesActive = computed(() => route.name === 'templates' || route.name === 'template')
const settingsActive = computed(() => route.name === 'settings')
const settingsSection = computed(() => defaultSettingsSection(session.user?.role === 'admin'))
</script>

<template>
  <nav
    :aria-label="t('shell.nav.main')"
    class="z-35 flex w-[76px] flex-none flex-col items-center border-r border-ov/[0.02] bg-rail pt-[25px] pb-5 max-[760px]:pt-[22px] max-[760px]:pb-4 [@media(max-height:780px)_and_(min-width:1051px)]:pt-[18px] max-[1279px]:w-[65px] max-[760px]:w-14"
  >
    <RouterLink
      :to="{ name: 'library' }"
      aria-label="Slideshows"
      class="grid size-10 place-items-center rounded-[12px] max-[760px]:size-[33px] max-[760px]:rounded-[10px] bg-accent text-accent-ink shadow-[0_5px_20px_#0003] transition-[background,transform] duration-200 hover:-rotate-[5deg] hover:bg-accent-hover"
    >
      <img src="/favicon.svg" alt="Slideshows" class="size-8" aria-hidden="true" />
    </RouterLink>

    <div class="mt-[38px] flex w-full flex-col gap-[13px] px-[7px] max-[760px]:mt-[30px] max-[760px]:gap-[15px] max-[760px]:px-1 [@media(max-height:780px)_and_(min-width:1051px)]:mt-[29px]">
      <RouterLink
        :to="{ name: 'new' }"
        :class="[cta, 'group']"
        :aria-current="newActive ? 'page' : undefined"
      >
        <span :class="['grid size-10 place-items-center rounded-full bg-sx-c2e5f5/12 transition-colors duration-200 group-hover:bg-sx-c2e5f5/20 max-[760px]:size-9', newActive && 'bg-sx-c2e5f5/25']">
          <Plus class="size-[19px] stroke-[1.5]" aria-hidden="true" />
        </span>{{ t('shell.nav.new') }}
      </RouterLink>
      <RouterLink :to="{ name: 'library' }" :class="[link, libraryActive && active]" :aria-current="libraryActive ? 'page' : undefined">
        <FolderOpen class="size-[19px] stroke-[1.5]" aria-hidden="true" />{{ t('shell.nav.library') }}
      </RouterLink>
      <RouterLink :to="{ name: 'templates' }" :class="[link, templatesActive && active]" :aria-current="templatesActive ? 'page' : undefined">
        <LayoutTemplate class="size-[19px] stroke-[1.5]" aria-hidden="true" />{{ t('shell.nav.templates') }}
      </RouterLink>
      <RouterLink :to="{ name: 'settings', params: { section: settingsSection } }" :class="[link, settingsActive && active]" :aria-current="settingsActive ? 'page' : undefined">
        <Settings2 class="size-[19px] stroke-[1.5]" aria-hidden="true" />{{ t('shell.nav.settings') }}
      </RouterLink>
    </div>

    <div class="mt-auto flex w-full flex-col items-center gap-[25px] px-2 max-[760px]:px-[5px]">
      <button type="button" :class="link" :title="t('shell.nav.helpTitle')" @click="help.show">
        <CircleHelp class="size-[19px] stroke-[1.5]" aria-hidden="true" />{{ t('shell.nav.help') }}
      </button>
      <UserMenu />
    </div>
  </nav>
</template>
