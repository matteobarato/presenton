<script setup lang="ts">
import { computed } from 'vue'
import type { Slide } from '@/api/types'
import { audioSrc, type TtsAudio } from '@/api/tts'
import { Badge } from '@/components/ui/badge'
import { narrationState } from './narration-state'

const props = defineProps<{ slide: Slide; audio?: TtsAudio; selected: boolean }>()
const emit = defineEmits<{ 'update:selected': [value: boolean] }>()

const state = computed(() => narrationState(props.slide, props.audio))
const label = computed(() => ({ missing: 'Missing', ready: 'Ready', stale: 'Stale' })[state.value])
</script>

<template>
  <li class="flex flex-col gap-1.5 rounded-control border border-white/[0.06] p-2" :data-state="state">
    <div class="flex items-center gap-2">
      <input
        type="checkbox"
        :checked="selected"
        :aria-label="`Select slide ${slide.index + 1}`"
        @change="emit('update:selected', ($event.target as HTMLInputElement).checked)"
      />
      <span class="text-[12px] text-[#d4dadd]">Slide {{ slide.index + 1 }}</span>
      <Badge :variant="state === 'stale' ? 'destructive' : state === 'ready' ? 'default' : 'secondary'" class="ml-auto">
        {{ label }}
      </Badge>
    </div>
    <audio v-if="audio" controls preload="none" :src="audioSrc(audio)" :aria-label="`Narration for slide ${slide.index + 1}`" class="h-8 w-full" />
  </li>
</template>
