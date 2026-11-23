<script setup lang="ts">
import { computed } from 'vue'
import type { Presentation, Slide } from '@/api/types'
import { injectDeckAvatars } from './video/useDeckAvatars'
import { injectDeckNarration } from './narration/useDeckNarration'
import { hasVideoPlaceholder, otherAvatarLanguage } from './video/avatar-state'
import AvatarGenerationCard from './video/AvatarGenerationCard.vue'
import AvatarSlideList from './video/AvatarSlideList.vue'
import BubblePlacer from './video/BubblePlacer.vue'
import GenerateAvatarsDialog from './video/GenerateAvatarsDialog.vue'
import PortraitHero from './video/PortraitHero.vue'
import SlideAvatarSection from './video/SlideAvatarSection.vue'
import SlideView from '@/render/SlideView.vue'

/**
 * Avatar workspace, in the order a presenter gets made: the portrait (its face), this slide (the switch that puts
 * the presenter on it, and its video), the whole deck (one run for every presenter slide), the slide list, then the
 * voice bubble that plays on every other slide. Flat hairline sections, like the Motion tab.
 * State comes from DeckStateProvider, shared with the footer's Voice tab.
 */
const props = defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()

const { language } = injectDeckNarration()
const { videos, videoBySlide, portraitMut, confirming, pendingIndices, generate } = injectDeckAvatars()
/** The bubble hands over to the presenter only where the slide has the presenter on and a video to play. */
const presenterHere = computed(() => {
  const s = props.activeSlide
  return Boolean(s && hasVideoPlaceholder(s) && videoBySlide.value.has(s.id) && !otherAvatarLanguage(videoBySlide.value.get(s.id), language.value))
})

const heading = 'text-[12px] font-semibold text-[#f6f8f9]'
const note = 'text-[10px] leading-[1.6] text-[#a0abb1]'
</script>

<template>
  <section class="flex flex-1 flex-col px-5 pb-[18px] max-[1279px]:px-4 min-[1600px]:px-[23px]" aria-label="Avatar">
    <div class="pt-6 pb-[18px] min-[1600px]:pt-7 [@media(max-height:780px)_and_(min-width:1051px)]:pt-[17px]">
      <h2 class="text-[19px] font-medium tracking-[-0.04em] text-[#f0f2f3] max-[1279px]:text-[18px] min-[1600px]:text-[22px]">Your presenter, on stage.</h2>
      <p class="mt-[5px] text-[10px] leading-[1.6] text-[#a0abb1]">One portrait, lip-synced to each slide's narration.</p>
    </div>

    <PortraitHero
      class="pb-[18px]"
      :portrait="videos?.portrait"
      :busy="portraitMut.isPending.value"
      @upload="portraitMut.mutate($event)"
      @remove="portraitMut.mutate(null)"
    />

    <SlideAvatarSection v-if="activeSlide" :slide="activeSlide" />
    <p v-else class="border-t border-line py-[18px] text-[11px] text-muted">Select a slide to put the presenter on it.</p>

    <AvatarGenerationCard />
    <AvatarSlideList :slides="presentation.slides" :active-slide="activeSlide" />

    <section v-if="activeSlide" class="flex flex-col gap-2.5 border-t border-line pt-[18px]" aria-label="Voice bubble">
      <div>
        <h3 :class="heading">Voice bubble</h3>
        <p :class="['mt-1', note]">
          Plays the narration on slides without the presenter. Drag it to move it on every slide; drag the corner to resize.
        </p>
      </div>
      <div class="relative overflow-hidden rounded-control border border-line">
        <SlideView :slide="activeSlide" :theme="props.presentation.theme" :fonts="props.presentation.fonts" fit="width" class="pointer-events-none" />
        <BubblePlacer :presentation-id="presentationId" :slide="activeSlide" :language="language" />
      </div>
      <p v-if="presenterHere" :class="note" data-testid="bubble-presenter-note">This slide plays its presenter video instead, so the bubble stays hidden here.</p>
    </section>

    <GenerateAvatarsDialog
      v-model:open="confirming"
      :count="pendingIndices.length"
      :language="language"
      :pending="generate.isPending.value"
      @confirm="generate.mutate($event)"
    />
  </section>
</template>
