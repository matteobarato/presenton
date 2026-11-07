<script setup lang="ts">
import { computed } from 'vue'
import type { Presentation, Slide } from '@/api/types'
import DeckNarrationSection from './narration/DeckNarrationSection.vue'
import SlideVoiceSection from './narration/SlideVoiceSection.vue'
import { provideDeckNarration, useDeckNarration } from './narration/useDeckNarration'
import GenerateAvatarsDialog from './video/GenerateAvatarsDialog.vue'
import SlideAvatarSection from './video/SlideAvatarSection.vue'
import { provideDeckAvatars, useDeckAvatars } from './video/useDeckAvatars'

/**
 * Narration and avatar video of the active slide, with the deck-wide settings below.
 * One instance of each deck state (TTS task, avatar run) is shared by every section.
 */
const props = defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()

const idRef = computed(() => props.presentationId)
const deck = computed(() => props.presentation)
const narration = useDeckNarration(idRef, deck)
provideDeckNarration(narration)
const avatars = useDeckAvatars(idRef, deck, narration)
provideDeckAvatars(avatars)

const { language } = narration
const { confirming, pendingIndices, generate } = avatars
</script>

<template>
  <section class="flex flex-col gap-5 px-5 pt-5 pb-[18px] max-[1279px]:px-4" aria-label="Narration">
    <template v-if="activeSlide">
      <p class="text-[11px] font-semibold tracking-wide text-muted uppercase tabular-nums" data-testid="narration-slide">
        Slide {{ activeSlide.index + 1 }} <span class="font-normal normal-case">of {{ presentation.slides.length }}</span>
      </p>
      <SlideVoiceSection :presentation-id="presentationId" :slide="activeSlide" />
      <SlideAvatarSection :slide="activeSlide" />
    </template>
    <p v-else class="text-[12px] text-muted">Select a slide to edit its narration.</p>

    <DeckNarrationSection :presentation-id="presentationId" :presentation="presentation" :active-slide="activeSlide" />

    <GenerateAvatarsDialog
      v-model:open="confirming"
      :count="pendingIndices.length"
      :language="language"
      :pending="generate.isPending.value"
      @confirm="generate.mutate($event)"
    />
  </section>
</template>
