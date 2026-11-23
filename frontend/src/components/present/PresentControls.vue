<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX, X } from 'lucide-vue-next'

defineProps<{
  index: number
  total: number
  visible: boolean
  /** Hidden entirely when the deck has no narration to preview. */
  narrationAvailable: boolean
  /** Narration sound on. */
  audioOn: boolean
  /** Autoplay is running (otherwise paused). */
  running: boolean
}>()
defineEmits<{ prev: []; next: []; exit: []; 'toggle-audio': []; 'toggle-play': [] }>()

const { t } = useI18n()
const btn =
  'inline-flex size-9 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-ov/15 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40'
</script>

<template>
  <div
    data-present-controls
    class="absolute inset-x-0 bottom-0 flex justify-center p-5 transition-opacity duration-200"
    :class="visible ? 'opacity-100' : 'pointer-events-none opacity-0'"
    @click.stop
  >
    <div class="flex items-center gap-1 rounded-full bg-black/60 px-2 py-1.5 backdrop-blur">
      <button type="button" :class="btn" :aria-label="t('present.controls.previous')" :disabled="index <= 0" @click="$emit('prev')">
        <ChevronLeft class="size-5" />
      </button>
      <span data-testid="counter" class="min-w-14 text-center text-sm tabular-nums text-white/90">{{ index + 1 }} / {{ total }}</span>
      <button type="button" :class="btn" :aria-label="t('present.controls.next')" :disabled="index >= total - 1" @click="$emit('next')">
        <ChevronRight class="size-5" />
      </button>
      <span class="mx-1 h-5 w-px bg-ov/20" />
      <button type="button" :class="btn" :aria-label="running ? t('present.controls.pause') : t('present.controls.play')" @click="$emit('toggle-play')">
        <Pause v-if="running" class="size-5" />
        <Play v-else class="size-5" />
      </button>
      <button
        v-if="narrationAvailable"
        type="button"
        :class="btn"
        :aria-pressed="audioOn"
        :aria-label="audioOn ? t('present.controls.audioOff') : t('present.controls.audioOn')"
        @click="$emit('toggle-audio')"
      >
        <Volume2 v-if="audioOn" class="size-5" />
        <VolumeX v-else class="size-5" />
      </button>
      <span class="mx-1 h-5 w-px bg-ov/20" />
      <button type="button" :class="btn" :aria-label="t('present.controls.exit')" @click="$emit('exit')">
        <X class="size-5" />
      </button>
    </div>
  </div>
</template>
