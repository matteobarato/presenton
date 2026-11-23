<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, nextTick, useTemplateRef } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { ChevronDown } from 'lucide-vue-next'
import type { Presentation, Slide } from '@/api/types'
import SlideView from '@/render/SlideView.vue'
import { Button } from '@/components/ui/button'
import { injectDeckNarration } from '../narration/useDeckNarration'
import BubblePlacer from './BubblePlacer.vue'
import PortraitCard from './PortraitCard.vue'
import { injectDeckAvatars } from './useDeckAvatars'

const { t } = useI18n()

/** Avatar settings that apply to every slide: portrait, batch generation and the voice bubble. */
const props = defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()

const { language, languageName } = injectDeckNarration()
const {
  videos,
  portraitMut,
  eligibleSlides,
  placeholderSlides,
  deckRunBlocker,
  requestGenerate,
  taskError,
} = injectDeckAvatars()

// Per-viewer convenience; useLocalStorage falls back to memory when storage is unavailable.
const open = useLocalStorage('slideshows.editor.deck-avatars-open', true)
const root = useTemplateRef<HTMLElement>('root')
/** Opens the section and brings the portrait picker into view (the overview's "Missing portrait" fix). */
async function revealPortrait() {
  open.value = true
  await nextTick()
  const el = root.value?.querySelector<HTMLElement>('[data-testid="portrait-card"]')
  el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  el?.querySelector<HTMLElement>('button')?.focus()
}
defineExpose({ revealPortrait })

const summary = computed(() =>
  [languageName.value, t('editorInspector.avatar.deck.section.summary', { eligible: eligibleSlides.value.length, total: placeholderSlides.value.length })].filter(Boolean).join(' · '),
)
</script>

<template>
  <section ref="root" class="flex flex-col rounded-card border border-ov/[0.06]" :aria-label="t('editorInspector.avatar.deck.ariaLabel')">
    <button
      type="button"
      class="flex min-h-11 items-center gap-2 rounded-card px-3 text-left transition-colors duration-200 hover:bg-ov/[0.03]"
      :aria-expanded="open"
      aria-controls="deck-avatars-body"
      @click="open = !open"
    >
      <span class="text-[12px] font-semibold text-tx-f6f8f9">{{ t('editorInspector.avatar.deck.title') }}</span>
      <span class="min-w-0 flex-1 truncate text-right text-[11px] text-muted">{{ summary }}</span>
      <ChevronDown class="size-3.5 flex-none text-muted transition-transform duration-200" :class="open && 'rotate-180'" aria-hidden="true" />
    </button>

    <div v-show="open" id="deck-avatars-body" class="flex flex-col gap-5 border-t border-ov/[0.06] p-3">
      <p class="text-[11px] text-muted" data-testid="avatar-language">
        {{ t('editorInspector.avatar.deck.section.lead') }} <strong class="font-semibold text-tx-d4dadd">{{ languageName }}</strong> {{ t('editorInspector.avatar.deck.section.tail') }}
      </p>

      <PortraitCard
        :portrait="videos?.portrait"
        :busy="portraitMut.isPending.value"
        @upload="portraitMut.mutate($event)"
        @remove="portraitMut.mutate(null)"
      />

      <div class="flex flex-col gap-2">
        <h3 class="text-[12px] font-semibold text-tx-f6f8f9">{{ t('editorInspector.avatar.deck.section.avatars') }}</h3>
        <p class="text-[11px] text-muted">
          {{ t('editorInspector.avatar.deck.section.readyCount', { count: placeholderSlides.length, eligible: eligibleSlides.length, total: placeholderSlides.length }, placeholderSlides.length) }}
        </p>
        <Button
          size="sm"
          :disabled="deckRunBlocker !== null"
          aria-describedby="avatar-reason"
          @click="requestGenerate(eligibleSlides.map((s) => s.index))"
        >
          {{ t('editorInspector.avatar.deck.generate') }}
        </Button>
        <p v-if="deckRunBlocker" id="avatar-reason" class="text-[11px] text-muted" data-testid="avatar-reason">{{ deckRunBlocker }}</p>
        <p v-if="taskError" role="alert" class="text-[11px] text-danger-text">{{ taskError }}</p>
      </div>

      <div v-if="activeSlide" class="flex flex-col gap-2">
        <h3 class="text-[12px] font-semibold text-tx-f6f8f9">{{ t('editorInspector.avatar.bubble.title') }}</h3>
        <p class="text-[11px] text-muted">{{ t('editorInspector.avatar.deck.section.bubbleHint') }}</p>
        <div class="relative overflow-hidden rounded-control border border-ov/[0.06]">
          <SlideView :slide="activeSlide" :theme="props.presentation.theme" :fonts="props.presentation.fonts" fit="width" class="pointer-events-none" />
          <BubblePlacer :presentation-id="presentationId" :slide="activeSlide" :language="language" />
        </div>
      </div>
    </div>
  </section>
</template>
