<script setup lang="ts">
import { ChevronLeft, ChevronRight, Mic, MicOff, Pause, Play, X } from 'lucide-vue-next'

defineProps<{
  index: number
  total: number
  visible: boolean
  /** Hidden entirely when the deck has no narration to preview. */
  narrationAvailable: boolean
  narrating: boolean
  playing: boolean
}>()
defineEmits<{ prev: []; next: []; exit: []; 'toggle-narration': []; 'toggle-play': [] }>()

const btn =
  'inline-flex size-9 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40'
</script>

<template>
  <div
    data-present-controls
    class="absolute inset-x-0 bottom-0 flex justify-center p-5 transition-opacity duration-200"
    :class="visible ? 'opacity-100' : 'pointer-events-none opacity-0'"
    @click.stop
  >
    <div class="flex items-center gap-1 rounded-full bg-black/60 px-2 py-1.5 backdrop-blur">
      <button type="button" :class="btn" aria-label="Previous slide" :disabled="index <= 0" @click="$emit('prev')">
        <ChevronLeft class="size-5" />
      </button>
      <span data-testid="counter" class="min-w-14 text-center text-sm tabular-nums text-white/90">{{ index + 1 }} / {{ total }}</span>
      <button type="button" :class="btn" aria-label="Next slide" :disabled="index >= total - 1" @click="$emit('next')">
        <ChevronRight class="size-5" />
      </button>
      <template v-if="narrationAvailable">
        <span class="mx-1 h-5 w-px bg-white/20" />
        <button
          type="button"
          :class="btn"
          :aria-pressed="narrating"
          :aria-label="narrating ? 'Turn narration off' : 'Turn narration on'"
          @click="$emit('toggle-narration')"
        >
          <Mic v-if="narrating" class="size-5" />
          <MicOff v-else class="size-5" />
        </button>
        <button v-if="narrating" type="button" :class="btn" :aria-label="playing ? 'Pause narration' : 'Play narration'" @click="$emit('toggle-play')">
          <Pause v-if="playing" class="size-5" />
          <Play v-else class="size-5" />
        </button>
      </template>
      <span class="mx-1 h-5 w-px bg-white/20" />
      <button type="button" :class="btn" aria-label="Exit presentation" @click="$emit('exit')">
        <X class="size-5" />
      </button>
    </div>
  </div>
</template>
