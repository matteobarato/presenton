<script setup lang="ts">
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()

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

const heading = 'text-[12px] font-semibold text-tx-f6f8f9'
const note = 'text-[10px] leading-[1.6] text-tx-a0abb1'
</script>

<template>
  <section class="flex flex-1 flex-col px-5 pb-[18px] max-[1279px]:px-4 min-[1600px]:px-[23px]" :aria-label="t('editorInspector.avatar.ariaLabel')">
    <div class="pt-6 pb-[18px] min-[1600px]:pt-7 [@media(max-height:780px)_and_(min-width:1051px)]:pt-[17px]">
      <h2 class="text-[19px] font-medium tracking-[-0.04em] text-tx-f0f2f3 max-[1279px]:text-[18px] min-[1600px]:text-[22px]">{{ t('editorInspector.avatar.title') }}</h2>
      <p class="mt-[5px] text-[10px] leading-[1.6] text-tx-a0abb1">{{ t('editorInspector.avatar.intro') }}</p>
    </div>

    <PortraitHero
      class="pb-[18px]"
      :portrait="videos?.portrait"
      :busy="portraitMut.isPending.value"
      @upload="portraitMut.mutate($event)"
      @remove="portraitMut.mutate(null)"
    />

    <SlideAvatarSection v-if="activeSlide" :slide="activeSlide" />
    <p v-else class="border-t border-line py-[18px] text-[11px] text-muted">{{ t('editorInspector.avatar.noSlide') }}</p>

    <AvatarGenerationCard />
    <AvatarSlideList :slides="presentation.slides" :active-slide="activeSlide" />

    <section v-if="activeSlide" class="flex flex-col gap-2.5 border-t border-line pt-[18px]" :aria-label="t('editorInspector.avatar.bubble.ariaLabel')">
      <div>
        <h3 :class="heading">{{ t('editorInspector.avatar.bubble.title') }}</h3>
        <p :class="['mt-1', note]">
          {{ t('editorInspector.avatar.bubble.hint') }}
        </p>
      </div>
      <div class="relative overflow-hidden rounded-control border border-line">
        <SlideView :slide="activeSlide" :theme="props.presentation.theme" :fonts="props.presentation.fonts" fit="width" class="pointer-events-none" />
        <BubblePlacer :presentation-id="presentationId" :slide="activeSlide" :language="language" />
      </div>
      <p v-if="presenterHere" :class="note" data-testid="bubble-presenter-note">{{ t('editorInspector.avatar.bubble.presenterNote') }}</p>
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
