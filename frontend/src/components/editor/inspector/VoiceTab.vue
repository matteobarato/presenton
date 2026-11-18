<script setup lang="ts">
import type { Presentation, Slide } from '@/api/types'
import DeckNarrationSection from './narration/DeckNarrationSection.vue'
import SlideVoiceSection from './narration/SlideVoiceSection.vue'
import { injectDeckNarration } from './narration/useDeckNarration'
import GenerateAvatarsDialog from './video/GenerateAvatarsDialog.vue'
import SlideAvatarSection from './video/SlideAvatarSection.vue'
import { injectDeckAvatars } from './video/useDeckAvatars'

/**
 * Narration and avatar video of the active slide, with the deck-wide settings, side by side in the footer.
 * The deck state (TTS task, avatar run) is provided by DeckStateProvider and shared with the Avatar tab.
 */
defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()

const { language } = injectDeckNarration()
const { confirming, pendingIndices, generate } = injectDeckAvatars()
</script>

<template>
  <section class="@container flex flex-col gap-3 px-4 py-3" aria-label="Voice">
    <template v-if="activeSlide">
      <p class="text-[11px] font-semibold tracking-wide text-muted uppercase tabular-nums" data-testid="narration-slide">
        Slide {{ activeSlide.index + 1 }} <span class="font-normal normal-case">of {{ presentation.slides.length }}</span>
      </p>
    </template>
    <p v-else class="text-[12px] text-muted">Select a slide to edit its narration.</p>

    <div data-testid="voice-columns" class="grid items-start gap-4 @2xl:grid-cols-2 @4xl:grid-cols-3">
      <template v-if="activeSlide">
        <SlideVoiceSection :slide="activeSlide" />
        <SlideAvatarSection :slide="activeSlide" />
      </template>
      <DeckNarrationSection :presentation-id="presentationId" :presentation="presentation" :active-slide="activeSlide" />
    </div>

    <GenerateAvatarsDialog
      v-model:open="confirming"
      :count="pendingIndices.length"
      :language="language"
      :pending="generate.isPending.value"
      @confirm="generate.mutate($event)"
    />
  </section>
</template>
