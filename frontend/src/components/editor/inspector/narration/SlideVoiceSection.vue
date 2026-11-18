<script setup lang="ts">
import { computed } from 'vue'
import { AudioLines } from 'lucide-vue-next'
import type { Slide } from '@/api/types'
import { audioSrc } from '@/api/tts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { injectDeckNarration } from './useDeckNarration'

/** The active slide's recorded voice. Its note is edited in the Notes tab. */
const props = defineProps<{ slide: Slide }>()

const { audioOf, stateOf, canStart, generateSlide, isRecording, progress, task, taskError } = injectDeckNarration()

const n = computed(() => props.slide.index + 1)
const hasNote = computed(() => Boolean(props.slide.speaker_note?.trim()))

// Voice
const TRANSLATED_HINT = "Translated narration can't be checked against note edits. Regenerate this slide if you changed its note."
const audio = computed(() => audioOf(props.slide))
const state = computed(() => stateOf(props.slide))
const label = computed(() => ({ missing: 'No audio', ready: 'Up to date', stale: 'Out of date', translated: 'Translated' })[state.value])
const recording = computed(() => isRecording(props.slide.index))

function onGenerate() {
  generateSlide(props.slide.index) // the Notes tab flushes its draft when it unmounts
}
</script>

<template>
  <section class="flex flex-col gap-2 rounded-card border border-white/[0.06] p-2.5" aria-label="Slide voice" :data-state="state" data-testid="slide-voice">
    <div class="flex items-center gap-2">
      <AudioLines class="size-3.5 text-muted" aria-hidden="true" />
      <span class="text-[12px] font-semibold text-[#d4dadd]">Voice</span>
      <Badge
        :title="state === 'translated' ? TRANSLATED_HINT : undefined"
        :variant="state === 'stale' ? 'destructive' : state === 'ready' ? 'default' : 'secondary'"
        class="ml-auto"
      >
        {{ label }}
      </Badge>
    </div>
    <audio v-if="audio" controls preload="none" :src="audioSrc(audio)" :aria-label="`Narration for slide ${n}`" class="h-8 w-full" />
    <p v-if="state === 'stale'" class="text-[11px] text-muted">The note changed since this audio was made.</p>
    <p v-else-if="state === 'translated'" class="text-[11px] text-muted">{{ TRANSLATED_HINT }}</p>
    <p v-else-if="state === 'missing' && !hasNote" class="text-[11px] text-muted">Write a note first, then generate its audio.</p>
    <div v-if="recording" class="flex flex-col gap-1" role="status">
      <Progress :model-value="progress" aria-label="Narration progress" />
      <span class="text-[11px] text-muted">{{ task?.message || 'Generating audio…' }}</span>
    </div>
    <p v-if="taskError" role="alert" class="text-[11px] text-danger-text">{{ taskError }}</p>
    <Button
      size="sm"
      :variant="state === 'ready' || state === 'translated' ? 'outline' : 'default'"
      :disabled="!canStart || !hasNote"
      @click="onGenerate"
    >
      {{ audio ? 'Regenerate audio' : 'Generate audio' }}
    </Button>
  </section>
</template>
