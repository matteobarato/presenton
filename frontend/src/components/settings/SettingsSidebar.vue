<script setup lang="ts">
import { sectionSubtitle } from '@/settings/summary'
import { SETTINGS_SECTIONS, type ProviderConfig, type SettingsSection } from '@/settings/types'

defineProps<{ section: SettingsSection; config: ProviderConfig }>()
defineEmits<{ select: [section: SettingsSection] }>()

const NAMES: Record<SettingsSection, string> = {
  text: 'Text',
  images: 'Images',
  'web-search': 'Web search',
  account: 'Account',
}
</script>

<template>
  <div
    role="tablist"
    aria-label="Settings sections"
    aria-orientation="vertical"
    class="flex w-[230px] flex-none flex-col gap-1 max-[1050px]:w-[190px] max-[760px]:w-full max-[760px]:flex-row max-[760px]:gap-2 max-[760px]:overflow-x-auto max-[760px]:pb-1"
  >
    <button
      v-for="s in SETTINGS_SECTIONS"
      :key="s"
      type="button"
      role="tab"
      :aria-selected="s === section"
      :tabindex="s === section ? 0 : -1"
      class="flex min-w-0 flex-col gap-[5px] rounded-[11px] px-3.5 py-3 text-left transition-colors duration-200 hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-[760px]:flex-none max-[760px]:py-2.5"
      :class="s === section ? 'bg-[#222b30]' : ''"
      @click="$emit('select', s)"
    >
      <span class="text-[13px] font-medium whitespace-nowrap" :class="s === section ? 'text-[#c2e5f5]' : 'text-[#dbe7ef]'">{{ NAMES[s] }}</span>
      <span v-if="sectionSubtitle(s, config)" class="truncate text-[10px] text-[#95aab7] max-[760px]:hidden">{{ sectionSubtitle(s, config) }}</span>
    </button>
  </div>
</template>
