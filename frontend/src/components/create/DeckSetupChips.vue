<script setup lang="ts">
import { computed } from 'vue'
import { Languages, LayoutGrid, Palette } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import type { CreateOptions } from './options'
import { lengthSummary, styleSummary } from './setupSummary'

/**
 * The settings chips of a created deck, read-only: they were fixed when the deck was created (the presenter and the
 * narration language can still change, on the Presenter step).
 */
const props = defineProps<{ presentation: Presentation }>()

const style = computed(() => {
  const p = props.presentation
  return styleSummary((p.tone || 'default') as CreateOptions['tone'], (p.verbosity || 'standard') as CreateOptions['verbosity'])
})
const fixed = 'inline-flex h-9 max-w-full min-w-0 items-center gap-2 rounded-full border border-white/[0.05] px-3 text-[12px] text-tx-a2b1b9'
</script>

<template>
  <div class="flex flex-wrap gap-2" role="group" aria-label="Deck settings" data-testid="setup-chips">
    <span v-if="presentation.language?.trim()" :class="fixed" data-testid="chip-language-fixed"><Languages class="size-3.5 flex-none" aria-hidden="true" /><span class="truncate">{{ presentation.language }}</span></span>
    <span :class="fixed" data-testid="chip-length-fixed"><LayoutGrid class="size-3.5 flex-none" aria-hidden="true" /><span class="truncate">{{ lengthSummary(String(presentation.n_slides ?? '')) }}</span></span>
    <span :class="fixed" data-testid="chip-style-fixed"><Palette class="size-3.5 flex-none" aria-hidden="true" /><span class="truncate">{{ style }}</span></span>
  </div>
</template>
