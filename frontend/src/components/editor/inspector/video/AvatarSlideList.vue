<script setup lang="ts">
import { computed } from 'vue'
import type { Slide } from '@/api/types'
import { useEditorStore } from '@/stores/editor'
import { injectDeckAvatars } from './useDeckAvatars'
import AvatarChip from './AvatarChip.vue'

/** Every slide with its video, state and stats. The active slide is highlighted; a click jumps to it. */
const props = defineProps<{ slides: Slide[]; activeSlide: Slide | null }>()

const editor = useEditorStore()
const { videoBySlide, chipOf } = injectDeckAvatars()
const sorted = computed(() => [...props.slides].sort((a, b) => a.index - b.index))

const size = (b?: number | null) => (b ? `${(b / 1048576).toFixed(1)} MB` : null)
const duration = (s?: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : null)
function stats(s: Slide) {
  const v = videoBySlide.value.get(s.index)
  return v ? [duration(v.duration_seconds), size(v.size_bytes), v.format?.toUpperCase()].filter(Boolean).join(' · ') : 'No video'
}
function select(s: Slide) {
  if (s.id) editor.select(s.id)
}
</script>

<template>
  <section class="flex flex-col rounded-card border border-white/[0.06]" aria-label="Slides" data-testid="avatar-slide-list">
    <h3 class="px-3 pt-3 pb-2 text-[12px] font-semibold text-[#f6f8f9]">Slides</h3>
    <ul class="flex max-h-80 flex-col overflow-y-auto border-t border-white/[0.06]">
      <li v-for="s in sorted" :key="s.id ?? s.index">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.04]"
          :class="activeSlide && activeSlide.index === s.index && 'bg-white/[0.07]'"
          :aria-current="activeSlide && activeSlide.index === s.index ? 'true' : undefined"
          :data-testid="`avatar-row-${s.index}`"
          @click="select(s)"
        >
          <video
            v-if="videoBySlide.get(s.index)?.url"
            :src="`${videoBySlide.get(s.index)!.url}#t=0.1`"
            muted
            playsinline
            preload="metadata"
            class="aspect-video w-16 flex-none rounded-control bg-black object-cover"
          />
          <span v-else class="grid aspect-video w-16 flex-none place-items-center rounded-control bg-black/25 text-[11px] text-faint">{{ s.index + 1 }}</span>
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="flex items-center gap-1.5 text-[11px] font-semibold text-[#d4dadd]">Slide {{ s.index + 1 }}<AvatarChip :kind="chipOf(s)" class="ml-auto" /></span>
            <span class="truncate text-[11px] text-muted">{{ stats(s) }}</span>
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>
