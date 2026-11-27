<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarDays, Image, Presentation as PresentationIcon } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import SlideView from '@/render/SlideView.vue'

/**
 * Step 1 of a deck read from a PowerPoint, read-only: the file it came from and its first slide. There is no topic,
 * template or generation settings to show, since the slides keep the PowerPoint's design.
 */
const props = defineProps<{ presentation: Presentation }>()
const { t } = useI18n()

const name = computed(() => props.presentation.source_name?.trim() || props.presentation.title?.trim() || '')
const count = computed(() => props.presentation.slides.length)
const first = computed(() => props.presentation.slides[0] ?? null)
const created = computed(() => {
  const d = new Date(props.presentation.created_at)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
})
</script>

<template>
  <section data-testid="summary-topic" class="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-4 max-[760px]:grid-cols-1">
    <article data-testid="summary-source" class="summary-card flex min-w-0 flex-col gap-3">
      <header class="summary-kicker"><PresentationIcon class="size-3.5" aria-hidden="true" />{{ t('create.wizard.imported.fromPowerPoint') }}</header>
      <div class="flex min-w-0 flex-col gap-1">
        <p class="truncate text-[14px] font-medium text-tx-eef6fa" :title="name">{{ name }}</p>
        <p class="text-[12px] text-tx-8e9ca4">{{ t('create.wizard.imported.slideCount', { count }, count) }}</p>
      </div>
      <footer v-if="created" class="mt-auto flex items-center gap-1.5 pt-1 text-[12px] text-tx-8e9ca4">
        <CalendarDays class="size-3.5" aria-hidden="true" />{{ t('create.wizard.created', { date: created }) }}
      </footer>
    </article>
    <article v-if="first" data-testid="summary-first-slide" class="summary-card flex min-w-0 flex-col gap-3">
      <header class="summary-kicker"><Image class="size-3.5" aria-hidden="true" />{{ t('create.wizard.imported.firstSlide') }}</header>
      <div class="w-full overflow-hidden rounded-[9px] border border-ov/[0.07] bg-sx-101416">
        <SlideView
          :slide="first"
          :theme="presentation.theme"
          :fonts="presentation.fonts"
          fit="width"
          class="pointer-events-none overflow-hidden"
        />
      </div>
    </article>
  </section>
</template>

<style scoped>
/* Same look as the template-based Topic summary in DeckWizard. */
.summary-card {
  border-radius: var(--radius-card, 12px);
  border: 1px solid var(--sheen-border);
  background: linear-gradient(180deg, var(--sheen-a), var(--sheen-b));
  padding: 18px;
  box-shadow: inset 0 1px 0 var(--sheen-inset);
}
.summary-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-accent, #bee3f3);
}
</style>
