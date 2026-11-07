<script setup lang="ts">
import { computed } from 'vue'
import { Film } from 'lucide-vue-next'
import type { Slide } from '@/api/types'
import { useSlideVideo } from '@/api/videos'

/** The avatar placeholder's video, previewed. Uploading and generating stay in the Narration tab. */
const props = defineProps<{ presentationId: string; slide: Slide | null }>()

const { video, src, isPending } = useSlideVideo(() => props.presentationId, () => props.slide?.index)
const name = computed(() =>
  video.value ? video.value.original_filename || (video.value.source === 'heygen' ? 'Generated avatar' : 'Uploaded video') : null,
)
</script>

<template>
  <div class="border-t border-line py-[18px] min-[1600px]:py-[22px]" data-testid="element-video">
    <div class="mb-3 flex items-center justify-between text-[10px] font-medium text-[#d0d7dc] min-[1600px]:text-[11px]">
      <h3>Video</h3>
      <span v-if="name" class="truncate pl-2 text-[9px] font-normal text-[#9aa9b0]">{{ name }}</span>
    </div>
    <video
      v-if="src"
      :key="src"
      :src="src"
      controls
      muted
      playsinline
      preload="metadata"
      class="aspect-video w-full rounded-control bg-black object-contain"
      aria-label="Video preview"
    />
    <div
      v-else
      class="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-control border border-dashed border-white/[0.08] bg-field px-4 text-center text-[10px] leading-[1.5] text-[#9aa9b0]"
    >
      <Film class="size-5" aria-hidden="true" />
      <span v-if="isPending">Loading video…</span>
      <span v-else>No video on this slide yet. Upload or generate one in the Narration tab.</span>
    </div>
  </div>
</template>
