<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import { Video } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { injectDeckNarration } from '../narration/useDeckNarration'
import { injectDeckAvatars } from './useDeckAvatars'

const { t } = useI18n()

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
  if (running.value) return { label: t('editorInspector.avatar.deck.state.generating'), variant: 'secondary' as const, detail: task.value?.message || t('editorInspector.avatar.deck.generatingDetail') }
  if (!total) return { label: t('editorInspector.avatar.deck.state.notUsed'), variant: 'secondary' as const, detail: null }
  if (stale || failed) {
    const parts = [
      stale && t('editorInspector.avatar.deck.parts.outOfDate', { count: stale }),
      failed && t('editorInspector.avatar.deck.parts.failed', { count: failed }),
      missing && t('editorInspector.avatar.deck.parts.withoutVideo', { count: missing }),
    ].filter(Boolean)
    return { label: t('editorInspector.avatar.deck.state.needsUpdate'), variant: 'destructive' as const, detail: parts.join(' · ') }
  }
  // Only never-generated slides: a to-do, not an error.
  if (missing) return { label: t('editorInspector.avatar.deck.state.toGenerate'), variant: 'secondary' as const, detail: t('editorInspector.avatar.deck.noVideoYet', { count: missing }, missing) }
  return {
    label: t('editorInspector.avatar.deck.state.upToDate'),
    variant: 'default' as const,
    detail: t('editorInspector.avatar.deck.currentVideo', { count: total }, total),
  }
})

const count = computed(() => eligibleSlides.value.length)
const label = computed(() =>
  count.value > 1 && !deckRunBlocker.value ? t('editorInspector.avatar.deck.generateCount', { count: count.value }) : t('editorInspector.avatar.deck.generate'),
)
/** "· 1 of 2 presenter slides ready to generate", while there is something left to generate. */
const readyText = computed(() => {
  const total = placeholderSlides.value.length
  if (!total || deckState.value.label === t('editorInspector.avatar.deck.state.upToDate')) return ''
  return t('editorInspector.avatar.deck.readyText', { count: total, eligible: count.value, total }, total)
})
const note = 'text-[10px] leading-[1.6] text-tx-a0abb1'
</script>

<template>
  <section class="flex flex-col gap-3 border-t border-line py-[18px]" :aria-label="t('editorInspector.avatar.deck.ariaLabel')" data-testid="avatar-overview">
    <div class="flex items-center gap-2">
      <h3 class="text-[12px] font-semibold text-tx-f6f8f9">{{ t('editorInspector.avatar.deck.title') }}</h3>
      <Badge :variant="deckState.variant" class="ml-auto" data-testid="deck-avatar-state">{{ deckState.label }}</Badge>
    </div>
    <div class="flex flex-col gap-1">
      <p v-if="deckState.detail" class="text-[11px] leading-[1.5] text-tx-d4dadd">{{ deckState.detail }}</p>
      <p :class="note" data-testid="avatar-language">
        {{ t('editorInspector.avatar.deck.langLead') }} <strong class="font-semibold text-tx-d4dadd">{{ languageName }}</strong> {{ t('editorInspector.avatar.deck.langTail', { readyText }) }}
      </p>
    </div>
    <div v-if="running" role="status"><Progress :model-value="progress" :aria-label="t('editorInspector.avatar.deck.progressAria')" /></div>
    <Button size="sm" :disabled="deckRunBlocker !== null" :aria-describedby="deckRunBlocker ? 'avatar-reason' : undefined" @click="requestGenerate(eligibleSlides.map((s) => s.index))">
      <Video class="size-3.5" aria-hidden="true" />{{ label }}
    </Button>
    <p v-if="deckRunBlocker" id="avatar-reason" :class="note" data-testid="avatar-reason" :data-state="videos && !videos.generation_available ? 'off' : undefined">
      {{ deckRunBlocker }}
    </p>
    <p v-else-if="!videos" :class="note" data-testid="avatar-capability">{{ t('editorInspector.avatar.deck.checking') }}</p>
    <p v-if="taskError" role="alert" class="text-[11px] text-danger-text">{{ taskError }}</p>
  </section>
</template>
