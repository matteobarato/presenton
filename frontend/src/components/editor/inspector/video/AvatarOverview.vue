<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { Check, Circle, Loader, TriangleAlert } from 'lucide-vue-next'
import type { Slide } from '@/api/types'
import { useEditorStore } from '@/stores/editor'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { injectDeckNarration } from '../narration/useDeckNarration'
import { buildOverview, type CellAction, type OverviewCell } from './avatar-overview'
import { hasVideoPlaceholder } from './avatar-state'
import { injectDeckAvatars } from './useDeckAvatars'

const { t } = useI18n()

/**
 * What this platform can do with avatars, and what each avatar is made from, for the whole deck and for the
 * active slide side by side. Missing things are one click from their fix.
 */
const props = defineProps<{ slide: Slide | null; totalSlides: number }>()
const emit = defineEmits<{ 'add-portrait': [] }>()

const editor = useEditorStore()
// Below 1050px the inspector is a modal drawer (see EditorLayout); it would cover the footer a fix opens.
const inDrawer = useMediaQuery('(max-width: 1050px)')
const { stateOf } = injectDeckNarration()
const { videos, videoBySlide, placeholderSlides, eligibleSlides, chipOf, busy, running, progress, task, togglePlaceholder } = injectDeckAvatars()

const capability = computed(() => {
  if (running.value) return { state: 'busy', label: t('editorInspector.avatar.overview.capability.busy.label'), detail: task.value?.message || t('editorInspector.avatar.overview.capability.busy.detail'), variant: 'secondary' as const }
  if (!videos.value) return { state: 'checking', label: t('editorInspector.avatar.overview.capability.checking.label'), detail: t('editorInspector.avatar.overview.capability.checking.detail'), variant: 'secondary' as const }
  if (!videos.value.generation_available) {
    return {
      state: 'off',
      label: t('editorInspector.avatar.overview.capability.off.label'),
      detail: t('editorInspector.avatar.overview.capability.off.detail'),
      variant: 'secondary' as const,
    }
  }
  return {
    state: 'on',
    label: t('editorInspector.avatar.overview.capability.on.label'),
    detail: t('editorInspector.avatar.overview.capability.on.detail'),
    variant: 'default' as const,
  }
})

const rows = computed(() =>
  buildOverview({
    hasPortrait: Boolean(videos.value?.portrait),
    totalSlides: props.totalSlides,
    placeholderCount: placeholderSlides.value.length,
    eligibleCount: eligibleSlides.value.length,
    videoCount: placeholderSlides.value.filter((s) => videoBySlide.value.has(s.id)).length,
    slide: props.slide && { chip: chipOf(props.slide), narration: stateOf(props.slide), hasPlaceholder: hasVideoPlaceholder(props.slide) },
  }),
)

function run(action: CellAction) {
  if (action === 'open-voice') {
    editor.openFooter('voice')
    if (inDrawer.value) editor.inspectorOpen = false
  }
  else if (action === 'add-portrait') emit('add-portrait')
  else if (props.slide) togglePlaceholder(props.slide, true)
}
const disabled = (c: OverviewCell) => c.action === 'add-placeholder' && Boolean(props.slide && busy.value.has(props.slide.index))
const ICON = { ok: Check, todo: Circle, warn: TriangleAlert, busy: Loader, none: null } as const
const TONE = { ok: 'text-accent', todo: 'text-muted', warn: 'text-danger-text', busy: 'text-accent', none: 'text-faint' } as const
</script>

<template>
  <section class="flex flex-col rounded-card border border-ov/[0.06]" :aria-label="t('editorInspector.avatar.overview.title')" data-testid="avatar-overview">
    <header class="flex flex-col gap-1 px-3 pt-3 pb-2.5">
      <div class="flex items-center gap-2">
        <h3 class="text-[12px] font-semibold text-tx-f6f8f9">{{ t('editorInspector.avatar.overview.title') }}</h3>
        <Badge :variant="capability.variant" class="ml-auto" data-testid="avatar-capability" :data-state="capability.state">{{ capability.label }}</Badge>
      </div>
      <p class="text-[11px] leading-[1.5] text-muted">{{ capability.detail }}</p>
    </header>

    <div v-if="running" class="px-3 pb-2.5" role="status">
      <Progress :model-value="progress" :aria-label="t('editorInspector.avatar.deck.progressAria')" />
    </div>

    <table class="w-full border-t border-ov/[0.06] text-[11px]">
      <caption class="sr-only">{{ t('editorInspector.avatar.overview.caption') }}</caption>
      <thead>
        <tr class="text-left text-muted">
          <th scope="col" class="px-3 py-1.5 font-normal"><span class="sr-only">{{ t('editorInspector.avatar.overview.requirement') }}</span></th>
          <th scope="col" class="py-1.5 pr-2 font-semibold whitespace-nowrap">{{ t('editorInspector.avatar.overview.deck') }}</th>
          <th v-if="slide" scope="col" class="py-1.5 pr-3 font-semibold whitespace-nowrap">{{ t('editorInspector.avatar.overview.slide', { n: slide.index + 1 }) }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id" class="border-t border-ov/[0.04]">
          <th scope="row" class="py-1.5 pr-2 pl-3 text-left font-normal whitespace-nowrap text-tx-d4dadd">{{ row.label }}</th>
          <template v-for="col in (['deck', 'slide'] as const)" :key="col">
            <td v-if="col === 'deck' || row.slide" class="py-1.5 pr-2 align-middle last:pr-3" :data-testid="`overview-${row.id}-${col}`">
              <component
                :is="(row[col]!.action ? 'button' : 'span')"
                v-bind="row[col]!.action ? { type: 'button', disabled: disabled(row[col]!), onClick: () => run(row[col]!.action!) } : {}"
                class="inline-flex min-h-6 items-center gap-1.5 rounded-control whitespace-nowrap tabular-nums"
                :class="[TONE[row[col]!.tone], row[col]!.action && 'cursor-pointer px-1 -mx-1 underline decoration-white/25 underline-offset-2 hover:decoration-current disabled:cursor-default disabled:no-underline']"
              >
                <component :is="ICON[row[col]!.tone]" v-if="ICON[row[col]!.tone]" class="size-3 flex-none" :class="row[col]!.tone === 'busy' && 'animate-spin'" aria-hidden="true" />
                {{ row[col]!.text }}
              </component>
            </td>
          </template>
        </tr>
      </tbody>
    </table>
  </section>
</template>
