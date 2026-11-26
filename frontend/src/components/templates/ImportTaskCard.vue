<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { readImportProgress } from '@/api/templateImport'
import type { AsyncTask } from '@/api/tasks'

/** A PowerPoint import still running on the server, shown in the Templates grid until it lands as a template. */
const props = defineProps<{ task: AsyncTask }>()
const { t } = useI18n()

const progress = computed(() => readImportProgress(props.task))
const name = computed(() => progress.value.name ?? t('templates.importCard.untitled'))
const percent = computed(() => (progress.value.total ? Math.round((100 * progress.value.done) / progress.value.total) : 0))
const meta = computed(() =>
  progress.value.total
    ? t('templates.importCard.meta', { done: progress.value.done, total: progress.value.total })
    : t('templates.importCard.metaStarting'),
)
</script>

<template>
  <article data-testid="import-task-card" class="group min-w-0">
    <RouterLink
      :to="{ name: 'template-import', query: { task: task.id } }"
      :aria-label="t('templates.importCard.open', { name })"
      class="block rounded-card focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent"
    >
      <div class="anim-working relative aspect-video overflow-hidden rounded-card border border-lx-bedff02e bg-sx-101416 shadow-[0_6px_15px_var(--shade-22)]">
        <img v-if="progress.thumbnail" :src="progress.thumbnail" alt="" loading="lazy" class="size-full object-contain opacity-70" />
        <div class="skeleton-shimmer absolute inset-0" aria-hidden="true" />
        <div
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
        <p class="mt-[7px] text-[10px] text-tx-95aab7 tabular-nums">{{ meta }}</p>
      </div>
    </RouterLink>
  </article>
</template>
