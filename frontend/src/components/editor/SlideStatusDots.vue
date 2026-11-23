<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { usePresentation } from '@/api/presentations'
import { useTts } from '@/api/tts'
import { getVideos, videoKeys } from '@/api/videos'
import { useTtsLanguage } from '@/composables/useTtsLanguage'
import { useEditorFetchGate } from '@/composables/useEditorFetchGate'
import { audioForSlide, narrationState } from '@/components/editor/inspector/narration/narration-state'

const props = defineProps<{ presentationId: string; slideIndex: number }>()
const { t } = useI18n()

const idRef = computed(() => props.presentationId)
const { data: presentation } = usePresentation(idRef, useEditorFetchGate())
// The Voice tab sets the language; the shared helper makes this react to it.
const { language } = useTtsLanguage(idRef, presentation)
const { data: tts } = useTts(idRef, language)
const { data: videos } = useQuery({ queryKey: () => videoKeys.all(idRef.value), queryFn: () => getVideos(idRef.value) })

const slide = computed(() => presentation.value?.slides.find((s) => s.index === props.slideIndex))
const narration = computed(() => {
  if (!slide.value || !tts.value) return null
  return narrationState(slide.value, audioForSlide(slide.value, tts.value.audios))
})
const narrationDot = computed(() => {
  if (narration.value === 'ready' || narration.value === 'translated') return { label: t('editor.navigator.narrationReady'), tone: 'bg-accent' }
  if (narration.value === 'stale') return { label: t('editor.navigator.narrationOutOfDate'), tone: 'bg-danger-text' }
  return null
})
const hasVideo = computed(() => Boolean(slide.value?.id && videos.value?.videos?.some((v) => v.slide_id === slide.value?.id)))
</script>

<template>
  <span class="pointer-events-none absolute bottom-1.5 left-1.5 flex gap-1" data-testid="slide-status-dots">
    <span v-if="narrationDot" role="img" :aria-label="narrationDot.label" :title="narrationDot.label" :class="['size-2 rounded-full', narrationDot.tone]" />
    <span v-if="hasVideo" role="img" :aria-label="t('editor.navigator.avatarVideo')" :title="t('editor.navigator.avatarVideo')" class="size-2 rounded-full bg-sx-9db3c0" />
  </span>
</template>
