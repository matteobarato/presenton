<script setup lang="ts">
import { computed } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import type { GenerationMetrics } from '@/editor/streamMerge'
import type { StreamStatus } from '@/composables/usePresentationStream'

const props = defineProps<{ metrics: GenerationMetrics | null; status: StreamStatus; slideCount: number }>()

const fmt = (n: number) => n.toLocaleString('en-US')
const label = computed(() =>
  props.status === 'error' ? 'Generation stopped' : props.status === 'done' ? 'Generation complete' : 'Generating your presentation',
)
</script>

<template>
  <section
    role="status"
    aria-live="polite"
    data-testid="generation-metrics"
    class="glass-tools mx-auto mb-2 flex max-w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[11px] text-muted"
  >
    <span class="flex items-center gap-2 font-semibold text-text">
      <Loader2 v-if="status === 'streaming'" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      {{ label }}
    </span>
    <span>{{ slideCount }} {{ slideCount === 1 ? 'slide' : 'slides' }}</span>
    <template v-if="metrics">
      <span v-if="metrics.model">{{ metrics.model }}</span>
      <span>{{ fmt(metrics.output_tokens) }} output tokens</span>
      <span v-if="metrics.thinking_tokens">{{ fmt(metrics.thinking_tokens) }} thinking</span>
      <span v-if="metrics.tokens_per_second > 0">{{ metrics.tokens_per_second.toFixed(1) }} tok/s</span>
      <span>{{ metrics.duration_seconds.toFixed(1) }}s</span>
    </template>
  </section>
</template>
