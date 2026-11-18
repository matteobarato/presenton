<script setup lang="ts">
import type { Presentation, Slide } from '@/api/types'
import { injectDeckAvatars } from './video/useDeckAvatars'
import { injectDeckNarration } from './narration/useDeckNarration'
import DeckAvatarSection from './video/DeckAvatarSection.vue'
import GenerateAvatarsDialog from './video/GenerateAvatarsDialog.vue'
import SlideAvatarSection from './video/SlideAvatarSection.vue'

/**
 * Avatar video of the active slide plus the deck-wide avatar settings, in the inspector.
 * The deck state is provided by DeckStateProvider and shared with the footer's Voice tab.
 */
defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()

const { language } = injectDeckNarration()
const { confirming, pendingIndices, generate } = injectDeckAvatars()
</script>

<template>
  <section class="flex flex-col gap-3 px-4 py-3" aria-label="Avatar">
    <SlideAvatarSection v-if="activeSlide" :slide="activeSlide" />
    <p v-else class="text-[12px] text-muted">Select a slide to edit its avatar.</p>
    <DeckAvatarSection :presentation-id="presentationId" :presentation="presentation" :active-slide="activeSlide" />

    <GenerateAvatarsDialog
      v-model:open="confirming"
      :count="pendingIndices.length"
      :language="language"
      :pending="generate.isPending.value"
      @confirm="generate.mutate($event)"
    />
  </section>
</template>
