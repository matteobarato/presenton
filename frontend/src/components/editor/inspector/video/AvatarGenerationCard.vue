<script setup lang="ts">
import { computed } from 'vue'
import { Video } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { injectDeckNarration } from '../narration/useDeckNarration'
import { injectDeckAvatars } from './useDeckAvatars'

/** Whole-deck generation: availability, deck freshness, the run itself and its progress. */
const { languageName } = injectDeckNarration()
const { videos, chipOf, running, progress, task, eligibleSlides, placeholderSlides, deckRunBlocker, requestGenerate, taskError } = injectDeckAvatars()

/** Is the deck's avatar set current? Counts placeholder slides by what they still need. */
const deckState = computed(() => {
  const chips = placeholderSlides.value.map((s) => chipOf(s))
  const total = chips.length
  const stale = chips.filter((c) => c === 'video_stale' || c === 'audio_stale').length
  const failed = chips.filter((c) => c === 'failed').length
  const current = chips.filter((c) => c === 'done' || c === 'uploaded').length
  const missing = total - current - stale - failed
  if (running.value) return { label: 'Generating', variant: 'secondary' as const, detail: task.value?.message || 'Generating avatars…' }
  if (!total) return { label: 'No avatar slides', variant: 'secondary' as const, detail: 'Turn on an avatar placeholder for a slide to start.' }
  if (stale || failed || missing) {
    const parts = [stale && `${stale} out of date`, failed && `${failed} failed`, missing && `${missing} without video`].filter(Boolean)
    return { label: 'Needs update', variant: 'destructive' as const, detail: parts.join(' · ') }
  }
  return { label: 'Up to date', variant: 'default' as const, detail: `All ${total} avatar ${total === 1 ? 'slide has' : 'slides have'} a current video.` }
})

const availability = computed(() => {
  if (!videos.value) return 'Checking what this server can generate…'
  if (!videos.value.generation_available) return 'HeyGen is not set up on this server. You can still upload videos.'
  return null
})
</script>

<template>
  <section class="flex flex-col gap-2.5 rounded-card border border-white/[0.06] p-3" aria-label="Avatar generation" data-testid="avatar-overview">
    <div class="flex items-center gap-2">
      <h3 class="text-[12px] font-semibold text-[#f6f8f9]">Generation</h3>
      <Badge :variant="deckState.variant" class="ml-auto" data-testid="deck-avatar-state">{{ deckState.label }}</Badge>
    </div>
    <p class="text-[11px] leading-[1.5] text-muted">{{ deckState.detail }}</p>
    <p class="text-[11px] text-muted" data-testid="avatar-language">
      Lip-synced to <strong class="font-semibold text-[#d4dadd]">{{ languageName }}</strong> narration · {{ eligibleSlides.length }}/{{ placeholderSlides.length }} ready
    </p>
    <div v-if="running" role="status"><Progress :model-value="progress" aria-label="Avatar generation progress" /></div>
    <Button size="sm" :disabled="deckRunBlocker !== null" aria-describedby="avatar-reason" @click="requestGenerate(eligibleSlides.map((s) => s.index))">
      <Video class="size-3.5" aria-hidden="true" />Generate avatars
    </Button>
    <p v-if="deckRunBlocker" id="avatar-reason" class="text-[11px] text-muted" data-testid="avatar-reason">{{ deckRunBlocker }}</p>
    <p v-if="availability" class="text-[11px] text-muted" data-testid="avatar-capability">{{ availability }}</p>
    <p v-if="taskError" role="alert" class="text-[11px] text-danger-text">{{ taskError }}</p>
  </section>
</template>
