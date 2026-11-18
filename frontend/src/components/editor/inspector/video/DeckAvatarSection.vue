<script setup lang="ts">
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
const open = useLocalStorage('presenton.editor.deck-avatars-open', true)
const root = useTemplateRef<HTMLElement>('root')
/** Opens the section and brings the portrait picker into view (the overview's "Missing portrait" fix). */
async function revealPortrait() {
  open.value = true
  await nextTick()
  const el = root.value?.querySelector<HTMLElement>('[aria-label="Presenter portrait"]')
  el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  el?.querySelector<HTMLElement>('button')?.focus()
}
defineExpose({ revealPortrait })

const summary = computed(() => [languageName.value, `${eligibleSlides.value.length}/${placeholderSlides.value.length} ready`].filter(Boolean).join(' · '))
</script>

<template>
  <section ref="root" class="flex flex-col rounded-card border border-white/[0.06]" aria-label="Whole deck avatars">
    <button
      type="button"
      class="flex min-h-11 items-center gap-2 rounded-card px-3 text-left transition-colors duration-200 hover:bg-white/[0.03]"
      :aria-expanded="open"
      aria-controls="deck-avatars-body"
      @click="open = !open"
    >
      <span class="text-[12px] font-semibold text-[#f6f8f9]">Whole deck</span>
      <span class="min-w-0 flex-1 truncate text-right text-[11px] text-muted">{{ summary }}</span>
      <ChevronDown class="size-3.5 flex-none text-muted transition-transform duration-200" :class="open && 'rotate-180'" aria-hidden="true" />
    </button>

    <div v-show="open" id="deck-avatars-body" class="flex flex-col gap-5 border-t border-white/[0.06] p-3">
      <p class="text-[11px] text-muted" data-testid="avatar-language">
        Avatars are lip-synced to <strong class="font-semibold text-[#d4dadd]">{{ languageName }}</strong> narration. Change the language in the Voice tab.
      </p>

      <PortraitCard
        :portrait="videos?.portrait"
        :busy="portraitMut.isPending.value"
        @upload="portraitMut.mutate($event)"
        @remove="portraitMut.mutate(null)"
      />

      <div class="flex flex-col gap-2">
        <h3 class="text-[12px] font-semibold text-[#f6f8f9]">Avatars</h3>
        <p class="text-[11px] text-muted">
          {{ eligibleSlides.length }} of {{ placeholderSlides.length }} placeholder
          {{ placeholderSlides.length === 1 ? 'slide is' : 'slides are' }} ready to generate.
        </p>
        <Button
          size="sm"
          :disabled="deckRunBlocker !== null"
          aria-describedby="avatar-reason"
          @click="requestGenerate(eligibleSlides.map((s) => s.index))"
        >
          Generate avatars
        </Button>
        <p v-if="deckRunBlocker" id="avatar-reason" class="text-[11px] text-muted" data-testid="avatar-reason">{{ deckRunBlocker }}</p>
        <p v-if="taskError" role="alert" class="text-[11px] text-danger-text">{{ taskError }}</p>
      </div>

      <div v-if="activeSlide" class="flex flex-col gap-2">
        <h3 class="text-[12px] font-semibold text-[#f6f8f9]">Voice bubble</h3>
        <p class="text-[11px] text-muted">Where the narrator sits on slides without an avatar. Drag it here; it applies to every slide.</p>
        <div class="relative overflow-hidden rounded-control border border-white/[0.06]">
          <SlideView :slide="activeSlide" :theme="props.presentation.theme" :fonts="props.presentation.fonts" fit="width" class="pointer-events-none" />
          <BubblePlacer :presentation-id="presentationId" :slide="activeSlide" :language="language" />
        </div>
      </div>
    </div>
  </section>
</template>
