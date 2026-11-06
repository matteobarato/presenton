<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { PresentationSummary } from '@/api/presentations'
import SlideView from '@/render/SlideView.vue'
import DeckActions from './DeckActions.vue'
import { coverSlide, deckMeta, deckTitle } from './deckMeta'

const props = defineProps<{ presentation: PresentationSummary }>()
defineEmits<{ duplicate: []; delete: [] }>()

const title = computed(() => deckTitle(props.presentation))
const cover = computed(() => coverSlide(props.presentation))
</script>

<template>
  <article
    data-testid="deck"
    class="overflow-hidden rounded-[14px] border border-white/[0.06] bg-[#171c1f] transition-[border-color,transform] duration-200 hover:border-white/[0.14] motion-safe:hover:-translate-y-0.5"
  >
    <RouterLink :to="`/p/${presentation.id}`" :aria-label="`Open ${title}`" class="block aspect-video overflow-hidden bg-[#101416]">
      <SlideView v-if="cover" :slide="cover" :theme="presentation.theme" :fonts="presentation.fonts" fit="width" lazy />
    </RouterLink>
    <div class="flex items-center gap-2 px-3.5 py-3">
      <div class="min-w-0 flex-1">
        <h3 class="truncate text-[13px] font-semibold text-[#f6f8f9]">{{ title }}</h3>
        <p class="mt-0.5 text-[11px] text-[#9aa3a8]">{{ deckMeta(presentation) }}</p>
      </div>
      <DeckActions :title="title" @duplicate="$emit('duplicate')" @delete="$emit('delete')" />
    </div>
  </article>
</template>
