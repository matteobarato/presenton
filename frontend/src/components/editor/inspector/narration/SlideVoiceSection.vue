<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import type { Slide } from '@/api/types'
import { audioSrc } from '@/api/tts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { injectDeckNarration } from './useDeckNarration'

const { t } = useI18n()

/** The active slide's recorded voice. Its note is edited in the Notes tab. */
const props = defineProps<{ slide: Slide }>()

const { audioOf, stateOf, canStart, generateSlide, isRecording, progress, task, taskError } = injectDeckNarration()

const n = computed(() => props.slide.index + 1)
const hasNote = computed(() => Boolean(props.slide.speaker_note?.trim()))

// Voice
const translatedHint = computed(() => t('editorInspector.narration.slide.translatedHint'))
const audio = computed(() => audioOf(props.slide))
const state = computed(() => stateOf(props.slide))
const label = computed(() => t(`editorInspector.narration.slide.state.${state.value}`))
const recording = computed(() => isRecording(props.slide.index))

function onGenerate() {
  generateSlide(props.slide.index) // the Notes tab flushes its draft when it unmounts
}
</script>

<template>
  <section class="flex flex-col rounded-card border border-ov/[0.06] bg-ov/[0.015]" :aria-label="t('editorInspector.narration.slide.ariaLabel')" :data-state="state" data-testid="slide-voice">
    <div class="flex min-h-11 items-center gap-2 px-3">
      <span class="text-[12px] font-semibold text-tx-f6f8f9">{{ t('editorInspector.narration.slide.title') }}</span>
      <Badge
        :title="state === 'translated' ? translatedHint : undefined"
        :variant="state === 'stale' ? 'destructive' : state === 'ready' ? 'default' : 'secondary'"
        class="ml-auto"
      >
        {{ label }}
      </Badge>
    </div>
    <div class="flex flex-1 flex-col gap-3 border-t border-ov/[0.06] p-3">
      <audio v-if="audio" controls preload="none" :src="audioSrc(audio)" :aria-label="t('editorInspector.narration.slide.audioAria', { n })" class="h-8 w-full" />
      <p v-if="state === 'stale'" class="text-[11px] leading-normal text-muted">{{ t('editorInspector.narration.slide.staleNote') }}</p>
      <p v-else-if="state === 'translated'" class="text-[11px] leading-normal text-muted">{{ translatedHint }}</p>
      <p v-else-if="state === 'missing' && !hasNote" class="text-[11px] leading-normal text-muted">{{ t('editorInspector.narration.slide.noteFirst') }}</p>
      <div v-if="recording" class="flex flex-col gap-1" role="status">
        <Progress :model-value="progress" :aria-label="t('editorInspector.narration.progressAria')" />
        <span class="text-[11px] text-muted">{{ task?.message || t('editorInspector.narration.slide.generating') }}</span>
      </div>
      <p v-if="taskError" role="alert" class="text-[11px] text-danger-text">{{ taskError }}</p>
      <Button
        size="sm"
        class="self-start"
        :variant="state === 'ready' || state === 'translated' ? 'outline' : 'default'"
        :disabled="!canStart || !hasNote"
        @click="onGenerate"
      >
        {{ audio ? t('editorInspector.narration.slide.regenerate') : t('editorInspector.narration.slide.generate') }}
      </Button>
    </div>
  </section>
</template>
