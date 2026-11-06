<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { usePresentation } from '@/api/presentations'
import { useTts } from '@/api/tts'
import { getVideos, videoKeys } from '@/api/videos'
import { useEditorFetchGate } from '@/composables/useEditorFetchGate'
import { audioForSlide, narrationState } from '@/components/editor/inspector/narration/narration-state'

const props = defineProps<{ presentationId: string; slideIndex: number }>()

const idRef = computed(() => props.presentationId)
const { data: presentation } = usePresentation(idRef, useEditorFetchGate())
// The Narration tab owns the language; it is re-read whenever the deck changes.
const language = computed(() => (presentation.value, localStorage.getItem('presenton.tts.lang') ?? ''))
const { data: tts } = useTts(idRef, language)
const { data: videos } = useQuery({ queryKey: () => videoKeys.all(idRef.value), queryFn: () => getVideos(idRef.value) })

const slide = computed(() => presentation.value?.slides.find((s) => s.index === props.slideIndex))
const narration = computed(() => {
  if (!slide.value || !tts.value) return null
  return narrationState(slide.value, audioForSlide(slide.value, tts.value.audios))
})
const narrationDot = computed(() => {
  if (narration.value === 'ready' || narration.value === 'translated') return { label: 'Narration ready', tone: 'bg-accent' }
  if (narration.value === 'stale') return { label: 'Narration out of date', tone: 'bg-danger-text' }
  return null
})
const hasVideo = computed(() => Boolean(videos.value?.videos?.some((v) => v.slide_index === props.slideIndex)))
</script>

<template>
  <span class="pointer-events-none absolute bottom-1.5 left-1.5 flex gap-1" data-testid="slide-status-dots">
    <span v-if="narrationDot" role="img" :aria-label="narrationDot.label" :title="narrationDot.label" :class="['size-2 rounded-full', narrationDot.tone]" />
    <span v-if="hasVideo" role="img" aria-label="Avatar video" title="Avatar video" class="size-2 rounded-full bg-[#9db3c0]" />
  </span>
</template>
