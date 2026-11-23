<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { PresentationSummary } from '@/api/presentations'
import SlideView from '@/render/SlideView.vue'
import DeckActions from './DeckActions.vue'
import { coverSlide, deckEditPath, deckMeta, deckOpenPath, deckTitle } from './deckMeta'

const props = defineProps<{ presentation: PresentationSummary }>()
defineEmits<{ duplicate: []; delete: [] }>()

const title = computed(() => deckTitle(props.presentation))
const cover = computed(() => coverSlide(props.presentation))
</script>

<template>
  <article data-testid="deck" class="group min-w-0">
    <RouterLink
      :to="deckOpenPath(presentation)"
      :aria-label="`Open ${title}`"
      class="block aspect-video overflow-hidden rounded-card bg-sx-101416 shadow-[0_6px_15px_#0002] transition-transform duration-200 motion-safe:group-hover:-translate-y-1"
    >
      <SlideView v-if="cover" :slide="cover" :theme="presentation.theme" :fonts="presentation.fonts" fit="width" lazy />
    </RouterLink>
    <div class="mt-4 grid grid-cols-[1fr_auto] items-center gap-2">
      <div class="min-w-0">
        <h3 class="truncate text-[12px] font-medium text-tx-dbe7ef">{{ title }}</h3>
        <p class="mt-[7px] text-[10px] text-tx-95aab7">{{ deckMeta(presentation) }}</p>
      </div>
      <DeckActions :title="title" :edit-to="deckEditPath(presentation)" @duplicate="$emit('duplicate')" @delete="$emit('delete')" />
    </div>
  </article>
</template>
