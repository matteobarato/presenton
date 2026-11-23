<script setup lang="ts">
import { computed } from 'vue'
import type { Slide } from '@/api/types'
import { useEditorStore } from '@/stores/editor'
import { hasVideoPlaceholder } from './avatar-state'
import { injectDeckAvatars } from './useDeckAvatars'
import AvatarChip from './AvatarChip.vue'

/** Every slide with its presenter state and video stats. The active slide is highlighted; a click jumps to it. */
const props = defineProps<{ slides: Slide[]; activeSlide: Slide | null }>()

const editor = useEditorStore()
const { videoBySlide, chipOf } = injectDeckAvatars()
const sorted = computed(() => [...props.slides].sort((a, b) => a.index - b.index))
const withPresenter = computed(() => props.slides.filter(hasVideoPlaceholder).length)

const size = (b?: number | null) => (b ? `${(b / 1048576).toFixed(1)} MB` : null)
const duration = (s?: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : null)
function stats(s: Slide) {
  const v = videoBySlide.value.get(s.id)
  if (v) return [duration(v.duration_seconds), size(v.size_bytes), v.format?.toUpperCase()].filter(Boolean).join(' · ')
  return chipOf(s) === 'no_placeholder' ? 'Voice bubble' : 'No video'
}
function select(s: Slide) {
  if (s.id) editor.select(s.id)
}
</script>

<template>
  <section class="flex flex-col gap-2.5 border-t border-line py-[18px]" aria-label="Slides" data-testid="avatar-slide-list">
    <div class="flex items-baseline gap-2">
      <h3 class="text-[12px] font-semibold text-tx-f6f8f9">Slides</h3>
      <span class="ml-auto text-[10px] text-tx-a0abb1 tabular-nums">{{ withPresenter }} of {{ slides.length }} with presenter</span>
    </div>
    <ul class="-mx-2 flex max-h-72 flex-col gap-px overflow-y-auto">
      <li v-for="s in sorted" :key="s.id ?? s.index">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-2.5 rounded-control px-2 py-1.5 text-left transition-colors duration-150 hover:bg-white/[0.04] aria-[current=true]:bg-white/[0.07]"
          :aria-current="activeSlide && activeSlide.index === s.index ? 'true' : undefined"
          :data-testid="`avatar-row-${s.index}`"
          @click="select(s)"
        >
          <video
            v-if="videoBySlide.get(s.id)?.url"
            :src="`${videoBySlide.get(s.id)!.url}#t=0.1`"
            muted
            playsinline
            preload="metadata"
            class="aspect-video w-12 flex-none rounded-control bg-black object-cover"
          />
          <span v-else class="grid aspect-video w-12 flex-none place-items-center rounded-control border border-line text-[10px] text-faint tabular-nums">{{ s.index + 1 }}</span>
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="flex items-center gap-1.5">
              <span class="text-[11px] font-semibold whitespace-nowrap text-tx-d4dadd">Slide {{ s.index + 1 }}</span>
              <!-- Presenter-off rows stay quiet (their line says "Voice bubble"); badges mark the slides that have a presenter. -->
              <AvatarChip v-if="chipOf(s) !== 'no_placeholder' || videoBySlide.has(s.id)" :kind="chipOf(s)" class="ml-auto shrink-0" />
            </span>
            <span class="truncate text-[10px] text-tx-a0abb1 tabular-nums">{{ stats(s) }}</span>
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>
