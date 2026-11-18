<script setup lang="ts">
import { useTemplateRef } from 'vue'
import type { Presentation, Slide } from '@/api/types'
import { injectDeckAvatars } from './video/useDeckAvatars'
import { injectDeckNarration } from './narration/useDeckNarration'
import AvatarOverview from './video/AvatarOverview.vue'
import DeckAvatarSection from './video/DeckAvatarSection.vue'
import GenerateAvatarsDialog from './video/GenerateAvatarsDialog.vue'
import SlideAvatarSection from './video/SlideAvatarSection.vue'

/**
 * Avatar video in the inspector: what the platform can generate and what each avatar needs (the overview), then
 * the active slide's video, then the deck-wide settings. The overview ties the last two together.
 * The deck state is provided by DeckStateProvider and shared with the footer's Voice tab.
 */
defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()

const deckSection = useTemplateRef<InstanceType<typeof DeckAvatarSection>>('deckSection')
const { language } = injectDeckNarration()
const { confirming, pendingIndices, generate } = injectDeckAvatars()
</script>

<template>
  <section class="flex flex-col gap-3 px-4 py-3" aria-label="Avatar">
    <AvatarOverview :slide="activeSlide" :total-slides="presentation.slides.length" @add-portrait="deckSection?.revealPortrait()" />
    <SlideAvatarSection v-if="activeSlide" :slide="activeSlide" />
    <p v-else class="text-[12px] text-muted">Select a slide to edit its avatar.</p>
    <DeckAvatarSection ref="deckSection" :presentation-id="presentationId" :presentation="presentation" :active-slide="activeSlide" />

    <GenerateAvatarsDialog
      v-model:open="confirming"
      :count="pendingIndices.length"
      :language="language"
      :pending="generate.isPending.value"
      @confirm="generate.mutate($event)"
    />
  </section>
</template>
