<script setup lang="ts">
import type { Presentation, Slide } from '@/api/types'
import { injectDeckAvatars } from './video/useDeckAvatars'
import { injectDeckNarration } from './narration/useDeckNarration'
import AvatarGenerationCard from './video/AvatarGenerationCard.vue'
import AvatarSlideList from './video/AvatarSlideList.vue'
import BubblePlacer from './video/BubblePlacer.vue'
import GenerateAvatarsDialog from './video/GenerateAvatarsDialog.vue'
import PortraitHero from './video/PortraitHero.vue'
import SlideAvatarSection from './video/SlideAvatarSection.vue'
import SlideView from '@/render/SlideView.vue'

/**
 * Avatar workspace, top to bottom: the presenter portrait, deck-wide generation and freshness, the voice bubble,
 * a slide list with each video and its stats (also the quick slide picker), then the active slide's own controls.
 * State comes from DeckStateProvider, shared with the footer's Voice tab.
 */
const props = defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()

const { language } = injectDeckNarration()
const { videos, portraitMut, confirming, pendingIndices, generate } = injectDeckAvatars()
</script>

<template>
  <section class="flex flex-col gap-3 px-4 py-3" aria-label="Avatar">
    <PortraitHero
      :portrait="videos?.portrait"
      :busy="portraitMut.isPending.value"
      @upload="portraitMut.mutate($event)"
      @remove="portraitMut.mutate(null)"
    />
    <AvatarGenerationCard />

    <section v-if="activeSlide" class="flex flex-col gap-2 rounded-card border border-white/[0.06] p-3" aria-label="Voice bubble">
      <h3 class="text-[12px] font-semibold text-[#f6f8f9]">Voice bubble</h3>
      <p class="text-[11px] text-muted">Where the narrator sits on slides without an avatar. Drag it; it applies to every slide.</p>
      <div class="relative overflow-hidden rounded-control border border-white/[0.06]">
        <SlideView :slide="activeSlide" :theme="props.presentation.theme" :fonts="props.presentation.fonts" fit="width" class="pointer-events-none" />
        <BubblePlacer :presentation-id="presentationId" :slide="activeSlide" :language="language" />
      </div>
    </section>

    <AvatarSlideList :slides="presentation.slides" :active-slide="activeSlide" />
    <SlideAvatarSection v-if="activeSlide" :slide="activeSlide" />

    <GenerateAvatarsDialog
      v-model:open="confirming"
      :count="pendingIndices.length"
      :language="language"
      :pending="generate.isPending.value"
      @confirm="generate.mutate($event)"
    />
  </section>
</template>
