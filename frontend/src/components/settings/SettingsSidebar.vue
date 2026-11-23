<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { SECTION_ICONS } from '@/settings/sectionIcons'
import { sectionSubtitle } from '@/settings/summary'
import type { ProviderConfig, SettingsSection } from '@/settings/types'

const props = defineProps<{ section: SettingsSection; config: ProviderConfig; sections: SettingsSection[] }>()
const emit = defineEmits<{ select: [section: SettingsSection] }>()

const NAMES: Record<SettingsSection, string> = {
  text: 'Text',
  images: 'Images',
  'web-search': 'Web search',
  users: 'Users',
  'api-keys': 'API keys',
  account: 'Account',
}

// Wide: a vertical list of ordinary buttons in the natural tab order.
// Narrow: a horizontal tablist with roving tabindex; selection follows focus.
const narrow = useMediaQuery('(max-width: 760px)')

const item =
  'flex min-w-0 items-center gap-3 rounded-[11px] px-3 py-2.5 text-left transition-colors duration-200 hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-[760px]:flex-none max-[760px]:gap-2 max-[760px]:py-2'
const tile = 'grid size-8 flex-none place-items-center rounded-[9px] transition-colors duration-200 max-[760px]:size-6 max-[760px]:rounded-[7px]'

function onTabKeydown(event: KeyboardEvent) {
  const last = props.sections.length - 1
  const current = props.sections.indexOf(props.section)
  let next: number
  switch (event.key) {
    case 'ArrowRight':
      next = current === last ? 0 : current + 1
      break
    case 'ArrowLeft':
      next = current === 0 ? last : current - 1
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = last
      break
    default:
      return
  }
  event.preventDefault()
  const tabs = (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="tab"]')
  tabs[next]?.focus()
  emit('select', props.sections[next]!)
}
</script>

<template>
  <div
    v-if="narrow"
    role="tablist"
    aria-label="Settings sections"
    aria-orientation="horizontal"
    class="flex w-full flex-row gap-2 overflow-x-auto pb-1"
    @keydown="onTabKeydown"
  >
    <button
      v-for="s in sections"
      :key="s"
      type="button"
      role="tab"
      :aria-selected="s === section"
      :tabindex="s === section ? 0 : -1"
      :class="[item, s === section ? 'bg-[#222b30]' : '']"
      @click="emit('select', s)"
    >
      <span :class="[tile, s === section ? 'bg-[#c2e5f5]/12 text-[#c2e5f5]' : 'bg-white/[0.04] text-[#95aab7]']">
        <component :is="SECTION_ICONS[s]" class="size-[14px] stroke-[1.75]" aria-hidden="true" />
      </span>
      <span class="text-[13px] font-medium whitespace-nowrap" :class="s === section ? 'text-[#c2e5f5]' : 'text-[#dbe7ef]'">{{ NAMES[s] }}</span>
    </button>
  </div>
  <nav v-else aria-label="Settings sections" class="flex w-[230px] flex-none flex-col gap-1 max-[1050px]:w-[190px]">
    <button
      v-for="s in sections"
      :key="s"
      type="button"
      :aria-current="s === section ? 'page' : undefined"
      :class="[item, s === section ? 'bg-[#222b30]' : '']"
      @click="emit('select', s)"
    >
      <span :class="[tile, s === section ? 'bg-[#c2e5f5]/12 text-[#c2e5f5]' : 'bg-white/[0.04] text-[#95aab7]']">
        <component :is="SECTION_ICONS[s]" class="size-4 stroke-[1.75]" aria-hidden="true" />
      </span>
      <span class="flex min-w-0 flex-col gap-[3px]">
        <span class="text-[13px] font-medium whitespace-nowrap" :class="s === section ? 'text-[#c2e5f5]' : 'text-[#dbe7ef]'">{{ NAMES[s] }}</span>
        <span v-if="sectionSubtitle(s, config)" class="truncate text-[10px] text-[#95aab7]">{{ sectionSubtitle(s, config) }}</span>
      </span>
    </button>
  </nav>
</template>
