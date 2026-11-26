<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, RotateCcw } from 'lucide-vue-next'
import type { ImportProgress } from '@/api/templateImport'
import AiProgress from '@/components/shell/AiProgress.vue'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

/**
 * Step 4: the server builds one layout per slide. Real progress drives the bar; each slide keeps its
 * preview with a shimmer until its layout is ready. On failure: the backend's message, retry or start over.
 */
const props = defineProps<{
  progress: ImportProgress
  slides: string[]
  status: 'generating' | 'error'
  error?: string | null
  busy?: boolean
}>()
const emit = defineEmits<{ retry: []; reset: [] }>()
const { t } = useI18n()

const total = computed(() => props.progress.total || props.slides.length)
const value = computed(() => (props.progress.total ? (100 * props.progress.done) / props.progress.total : undefined))
const stage = computed(() => {
  const { done, total: all } = props.progress
  if (!all) return t('templates.import.progress.starting')
  if (done >= all) return t('templates.import.progress.finishing')
  return t('templates.import.progress.stage', { current: done + 1, total: all })
})
const detail = computed(() => (total.value ? t('templates.import.progress.detail', { done: props.progress.done, total: total.value }) : ''))
const tiles = computed(() =>
  Array.from({ length: total.value }, (_, i) => ({
    src: props.slides[i] ?? (i === 0 ? props.progress.thumbnail : null),
    done: props.progress.slides[i] === 'completed',
  })),
)
</script>

<template>
  <div class="anim-rise-in flex flex-col gap-5" data-testid="import-progress">
    <Alert v-if="status === 'error'" variant="destructive" class="flex items-center justify-between gap-4 py-2 text-[12px] max-[560px]:flex-col max-[560px]:items-start">
      <span>
        <strong class="font-semibold">{{ t('templates.import.progress.failed') }}.</strong>
        {{ error }}
      </span>
      <span class="flex flex-none gap-2">
        <Button variant="ghost" size="sm" :disabled="busy" @click="emit('reset')">{{ t('templates.import.progress.startOver') }}</Button>
        <Button variant="secondary" size="sm" :disabled="busy" @click="emit('retry')">
          <RotateCcw class="size-3.5" aria-hidden="true" />{{ t('templates.import.progress.retry') }}
        </Button>
      </span>
    </Alert>
    <template v-else>
      <AiProgress
        class="w-full max-w-[560px]"
        :stage="stage"
        :detail="detail"
        :value="value"
        :label="t('templates.import.progress.label')"
        :expected-ms="90_000"
      />
      <div class="-mt-2 flex items-center justify-between gap-4 max-[560px]:flex-col max-[560px]:items-start">
        <p class="text-[12px] text-tx-9aabb4">{{ t('templates.import.progress.leaveNote') }}</p>
        <Button variant="ghost" size="sm" class="flex-none" @click="emit('reset')">{{ t('templates.import.progress.importAnother') }}</Button>
      </div>
    </template>

    <ol class="grid list-none grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3 max-[520px]:grid-cols-2 max-[520px]:gap-2.5">
      <li v-for="(tile, i) in tiles" :key="i" class="flex min-w-0 flex-col gap-1.5">
        <div class="relative aspect-video overflow-hidden rounded-[9px] border border-ov/[0.07] bg-sx-101416">
          <img v-if="tile.src" :src="tile.src" alt="" loading="lazy" class="size-full object-contain transition-opacity duration-300" :class="!tile.done && 'opacity-60'" />
          <div v-if="!tile.done && status === 'generating'" class="skeleton-shimmer absolute inset-0" aria-hidden="true" />
          <span
            v-if="tile.done"
            data-testid="import-slide-done"
            class="anim-pop-in absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-accent text-accent-ink shadow-[0_2px_8px_var(--shade-22)]"
          >
            <Check class="size-3.5" aria-hidden="true" />
          </span>
        </div>
        <span class="px-0.5 text-[12px] text-tx-899296 tabular-nums">
          <span aria-hidden="true">{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="sr-only">{{ tile.done ? t('templates.import.progress.slideDone', { n: i + 1 }) : t('templates.import.progress.slidePending', { n: i + 1 }) }}</span>
        </span>
      </li>
    </ol>
  </div>
</template>
