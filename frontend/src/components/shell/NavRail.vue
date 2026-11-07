<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { CircleHelp, FolderOpen, Plus, Settings2, Presentation } from 'lucide-vue-next'
import { useHelpDialog } from '@/composables/useHelpDialog'
import UserMenu from './UserMenu.vue'

const route = useRoute()
const help = useHelpDialog()
const link =
  'flex w-full flex-col items-center gap-2 rounded-[11px] py-3 text-[9px] font-medium text-[#9aa3a8] transition-colors duration-200 hover:bg-[#1d2225] hover:text-[#d9e0e4] max-[760px]:gap-1.5 max-[760px]:text-[7px]'
const active = 'bg-[#222b30] text-[#c2e5f5]'
const libraryActive = computed(() => route.name === 'library' || route.name === 'editor')
const newActive = computed(() => route.name === 'new' || route.name === 'outline')
</script>

<template>
  <nav
    aria-label="Main"
    class="z-35 flex w-[76px] flex-none flex-col items-center border-r border-white/[0.02] bg-rail pt-[25px] pb-5 max-[760px]:pt-[22px] max-[760px]:pb-4 [@media(max-height:780px)_and_(min-width:1051px)]:pt-[18px] max-[1279px]:w-[65px] max-[760px]:w-14"
  >
    <RouterLink
      :to="{ name: 'library' }"
      aria-label="Presenton"
      class="grid size-10 place-items-center rounded-[12px] max-[760px]:size-[33px] max-[760px]:rounded-[10px] bg-accent text-accent-ink shadow-[0_5px_20px_#0003] transition-[background,transform] duration-200 hover:-rotate-[5deg] hover:bg-accent-hover"
    >
      <Presentation class="size-6" aria-hidden="true" />
    </RouterLink>

    <div class="mt-[38px] flex w-full flex-col gap-[13px] px-[7px] max-[760px]:mt-[30px] max-[760px]:gap-[15px] max-[760px]:px-1 [@media(max-height:780px)_and_(min-width:1051px)]:mt-[29px]">
      <RouterLink :to="{ name: 'library' }" :class="[link, libraryActive && active]" :aria-current="libraryActive ? 'page' : undefined">
        <FolderOpen class="size-[19px] stroke-[1.5]" aria-hidden="true" />Library
      </RouterLink>
      <RouterLink :to="{ name: 'new' }" :class="[link, newActive && active]" :aria-current="newActive ? 'page' : undefined">
        <Plus class="size-[19px] stroke-[1.5]" aria-hidden="true" />New
      </RouterLink>
      <a href="/settings" target="_blank" rel="noopener" aria-label="Settings (classic app)" :class="link">
        <Settings2 class="size-[19px] stroke-[1.5]" aria-hidden="true" />Settings
      </a>
    </div>

    <div class="mt-auto flex w-full flex-col items-center gap-[25px] px-2 max-[760px]:px-[5px]">
      <button type="button" :class="link" title="Help and keyboard shortcuts" @click="help.show">
        <CircleHelp class="size-[19px] stroke-[1.5]" aria-hidden="true" />Help
      </button>
      <UserMenu />
    </div>
  </nav>
</template>
