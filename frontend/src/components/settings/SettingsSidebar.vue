<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { sectionSubtitle } from '@/settings/summary'
import { SETTINGS_SECTIONS, type ProviderConfig, type SettingsSection } from '@/settings/types'

const props = defineProps<{ section: SettingsSection; config: ProviderConfig }>()
const emit = defineEmits<{ select: [section: SettingsSection] }>()

const NAMES: Record<SettingsSection, string> = {
  text: 'Text',
  images: 'Images',
  'web-search': 'Web search',
  account: 'Account',
}

// Wide: a vertical list of ordinary buttons in the natural tab order.
// Narrow: a horizontal tablist with roving tabindex; selection follows focus.
const narrow = useMediaQuery('(max-width: 760px)')

const item =
  'flex min-w-0 flex-col gap-[5px] rounded-[11px] px-3.5 py-3 text-left transition-colors duration-200 hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-[760px]:flex-none max-[760px]:py-2.5'

function onTabKeydown(event: KeyboardEvent) {
  const last = SETTINGS_SECTIONS.length - 1
  const current = SETTINGS_SECTIONS.indexOf(props.section)
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
  emit('select', SETTINGS_SECTIONS[next]!)
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
      v-for="s in SETTINGS_SECTIONS"
      :key="s"
      type="button"
      role="tab"
      :aria-selected="s === section"
      :tabindex="s === section ? 0 : -1"
      :class="[item, s === section ? 'bg-[#222b30]' : '']"
      @click="emit('select', s)"
    >
      <span class="text-[13px] font-medium whitespace-nowrap" :class="s === section ? 'text-[#c2e5f5]' : 'text-[#dbe7ef]'">{{ NAMES[s] }}</span>
      <span v-if="sectionSubtitle(s, config)" class="hidden truncate text-[10px] text-[#95aab7]">{{ sectionSubtitle(s, config) }}</span>
    </button>
  </div>
  <nav v-else aria-label="Settings sections" class="flex w-[230px] flex-none flex-col gap-1 max-[1050px]:w-[190px]">
    <button
      v-for="s in SETTINGS_SECTIONS"
      :key="s"
      type="button"
      :aria-current="s === section ? 'page' : undefined"
      :class="[item, s === section ? 'bg-[#222b30]' : '']"
      @click="emit('select', s)"
    >
      <span class="text-[13px] font-medium whitespace-nowrap" :class="s === section ? 'text-[#c2e5f5]' : 'text-[#dbe7ef]'">{{ NAMES[s] }}</span>
      <span v-if="sectionSubtitle(s, config)" class="truncate text-[10px] text-[#95aab7]">{{ sectionSubtitle(s, config) }}</span>
    </button>
  </nav>
</template>
