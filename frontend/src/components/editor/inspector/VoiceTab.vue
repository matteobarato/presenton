<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Presentation, Slide } from '@/api/types'
import DeckNarrationSection from './narration/DeckNarrationSection.vue'
import SlideVoiceSection from './narration/SlideVoiceSection.vue'

const { t } = useI18n()

/**
 * Speech of the active slide, with the deck-wide narration settings, side by side in the footer.
 * Avatar and video options live in the inspector's Avatar tab; both share the state DeckStateProvider provides.
 */
defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()
</script>

<template>
  <section class="@container flex flex-col gap-3 px-4 pt-1 pb-4 max-[760px]:px-3" :aria-label="t('editorInspector.voice.ariaLabel')">
    <template v-if="activeSlide">
      <p class="sr-only" data-testid="narration-slide">{{ t('editorInspector.voice.slideCount', { current: activeSlide.index + 1, total: presentation.slides.length }) }}</p>
    </template>
    <p v-else class="text-[12px] text-muted">{{ t('editorInspector.voice.noSlide') }}</p>

    <div data-testid="voice-columns" class="grid items-stretch gap-3 @2xl:grid-cols-2">
      <SlideVoiceSection v-if="activeSlide" :slide="activeSlide" />
      <DeckNarrationSection :presentation="presentation" />
    </div>
</section>
</template>
