<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import { AlertTriangle } from 'lucide-vue-next'
import { readImportProgress } from '@/api/templateImport'
import type { AsyncTask } from '@/api/tasks'

/**
 * A PowerPoint import still running on the server, shown in the Templates grid until it lands as a template.
 * A failed one stays visible (it opens the import dialog, which offers Try again / Start over).
 */
const props = defineProps<{ task: AsyncTask }>()
const { t } = useI18n()
const route = useRoute()

const progress = computed(() => readImportProgress(props.task))
const failed = computed(() => props.task.status === 'error')
const name = computed(() => progress.value.name ?? t('templates.importCard.untitled'))
const percent = computed(() => (progress.value.total ? Math.round((100 * progress.value.done) / progress.value.total) : 0))
const meta = computed(() =>
  failed.value
    ? t('templates.importCard.failed')
    : progress.value.total
    ? t('templates.importCard.meta', { done: progress.value.done, total: progress.value.total })
    : t('templates.importCard.metaStarting'),
)
</script>

<template>
  <article data-testid="import-task-card" class="group min-w-0">
    <RouterLink
      :to="{ name: 'templates', query: { ...route.query, import: task.id } }"
      :aria-label="t('templates.importCard.open', { name })"
      class="block rounded-card focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent"
    >
      <div
        class="relative aspect-video overflow-hidden rounded-card border bg-sx-101416 shadow-[0_6px_15px_var(--shade-22)]"
        :class="failed ? 'border-danger' : 'anim-working border-lx-bedff02e'"
      >
        <img v-if="progress.thumbnail" :src="progress.thumbnail" alt="" loading="lazy" class="size-full object-contain" :class="failed ? 'opacity-40 grayscale' : 'opacity-70'" />
        <div v-if="!failed" class="skeleton-shimmer absolute inset-0" aria-hidden="true" />
        <span v-else class="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-danger text-danger-text">
          <AlertTriangle class="size-3.5" aria-hidden="true" />
        </span>
        <div
          v-if="!failed"
          class="absolute inset-x-3 bottom-3 h-[5px] overflow-hidden rounded-[5px] bg-sx-141d23"
          role="progressbar"
          :aria-label="t('templates.importCard.progress')"
          :aria-valuenow="percent"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span class="block h-full origin-left bg-sx-9bd5ee transition-transform duration-500" :style="{ transform: `scaleX(${percent / 100})` }" />
        </div>
      </div>
      <div class="mt-[13px] min-w-0">
        <h3 class="truncate text-[14px] font-medium text-tx-dbe7ef">{{ name }}</h3>
        <p class="mt-[7px] text-[10px] tabular-nums" :class="failed ? 'text-danger-text' : 'text-tx-95aab7'">{{ meta }}</p>
      </div>
    </RouterLink>
  </article>
</template>
