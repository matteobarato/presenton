<script setup lang="ts">
import { computed } from 'vue'
import { Video } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { injectDeckNarration } from '../narration/useDeckNarration'
import { injectDeckAvatars } from './useDeckAvatars'

/**
 * Whole-deck generation: is the deck's presenter set current, the run itself and its progress. One status line and
 * one reason line; the blocker (portrait, server setup, narration) is never said twice.
 */
const { languageName } = injectDeckNarration()
const { videos, chipOf, running, progress, task, eligibleSlides, placeholderSlides, deckRunBlocker, requestGenerate, taskError } = injectDeckAvatars()

/** Is the deck's avatar set current? Counts presenter slides by what they still need. */
const deckState = computed(() => {
  const chips = placeholderSlides.value.map((s) => chipOf(s))
  const total = chips.length
  const stale = chips.filter((c) => c === 'video_stale' || c === 'audio_stale').length
  const failed = chips.filter((c) => c === 'failed').length
  const current = chips.filter((c) => c === 'done' || c === 'uploaded').length
  const missing = total - current - stale - failed
  if (running.value) return { label: 'Generating', variant: 'secondary' as const, detail: task.value?.message || 'Generating avatars…' }
  if (!total) return { label: 'Not used yet', variant: 'secondary' as const, detail: null }
  if (stale || failed) {
    const parts = [stale && `${stale} out of date`, failed && `${failed} failed`, missing && `${missing} without video`].filter(Boolean)
    return { label: 'Needs update', variant: 'destructive' as const, detail: parts.join(' · ') }
  }
  // Only never-generated slides: a to-do, not an error.
  if (missing) return { label: 'To generate', variant: 'secondary' as const, detail: `${missing} presenter ${missing === 1 ? 'slide has' : 'slides have'} no video yet.` }
  return {
    label: 'Up to date',
    variant: 'default' as const,
    detail: total === 1 ? 'The presenter slide has a current video.' : `All ${total} presenter slides have a current video.`,
  }
})

const count = computed(() => eligibleSlides.value.length)
const label = computed(() => (count.value > 1 && !deckRunBlocker.value ? `Generate ${count.value} avatars` : 'Generate avatars'))
/** "· 1 of 2 presenter slides ready to generate", while there is something left to generate. */
const readyText = computed(() => {
  const total = placeholderSlides.value.length
  if (!total || deckState.value.label === 'Up to date') return ''
  return ` · ${count.value} of ${total} presenter ${total === 1 ? 'slide' : 'slides'} ready to generate`
})
const note = 'text-[10px] leading-[1.6] text-tx-a0abb1'
</script>

<template>
  <section class="flex flex-col gap-3 border-t border-line py-[18px]" aria-label="Whole deck avatars" data-testid="avatar-overview">
    <div class="flex items-center gap-2">
      <h3 class="text-[12px] font-semibold text-tx-f6f8f9">Whole deck</h3>
      <Badge :variant="deckState.variant" class="ml-auto" data-testid="deck-avatar-state">{{ deckState.label }}</Badge>
    </div>
    <div class="flex flex-col gap-1">
      <p v-if="deckState.detail" class="text-[11px] leading-[1.5] text-tx-d4dadd">{{ deckState.detail }}</p>
      <p :class="note" data-testid="avatar-language">
        Lip-synced to <strong class="font-semibold text-tx-d4dadd">{{ languageName }}</strong> narration{{ readyText }}.
      </p>
    </div>
    <div v-if="running" role="status"><Progress :model-value="progress" aria-label="Avatar generation progress" /></div>
    <Button size="sm" :disabled="deckRunBlocker !== null" :aria-describedby="deckRunBlocker ? 'avatar-reason' : undefined" @click="requestGenerate(eligibleSlides.map((s) => s.index))">
      <Video class="size-3.5" aria-hidden="true" />{{ label }}
    </Button>
    <p v-if="deckRunBlocker" id="avatar-reason" :class="note" data-testid="avatar-reason" :data-state="videos && !videos.generation_available ? 'off' : undefined">
      {{ deckRunBlocker }}
    </p>
    <p v-else-if="!videos" :class="note" data-testid="avatar-capability">Checking what this server can generate…</p>
    <p v-if="taskError" role="alert" class="text-[11px] text-danger-text">{{ taskError }}</p>
  </section>
</template>
