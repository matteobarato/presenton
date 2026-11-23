<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import type { GenerationMetrics } from '@/editor/streamMerge'
import type { StreamStatus } from '@/composables/usePresentationStream'
const { t } = useI18n()

const props = defineProps<{ metrics: GenerationMetrics | null; status: StreamStatus; slideCount: number }>()

const fmt = (n: number) => n.toLocaleString('en-US')
const label = computed(() =>
  props.status === 'error'
    ? t('editor.generation.stopped')
    : props.status === 'done'
      ? t('editor.generation.complete')
      : t('editor.generation.generating'),
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
    <span>{{ t('editor.generation.slideCount', { count: slideCount }, slideCount) }}</span>
    <template v-if="metrics">
      <span v-if="metrics.model">{{ metrics.model }}</span>
      <span>{{ t('editor.generation.outputTokens', { count: fmt(metrics.output_tokens) }) }}</span>
      <span v-if="metrics.thinking_tokens">{{ t('editor.generation.thinking', { count: fmt(metrics.thinking_tokens) }) }}</span>
      <span v-if="metrics.tokens_per_second > 0">{{ t('editor.generation.tokensPerSecond', { rate: metrics.tokens_per_second.toFixed(1) }) }}</span>
      <span>{{ t('editor.generation.seconds', { seconds: metrics.duration_seconds.toFixed(1) }) }}</span>
    </template>
  </section>
</template>
