<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, CalendarDays, Palette, PencilLine } from 'lucide-vue-next'
import { useElementSize } from '@vueuse/core'
import TemplateCardThumb from '@/components/create/TemplateCardThumb.vue'
import type { Presentation } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { useDeckWizard } from '@/composables/useDeckWizard'
import OutlineStep from '@/components/create/steps/OutlineStep.vue'
import PreviewStep from '@/components/create/steps/PreviewStep.vue'
import DeckSetupChips from '@/components/create/DeckSetupChips.vue'
import ImportedOutlineSummary from '@/components/create/ImportedOutlineSummary.vue'
import ImportedTopicSummary from '@/components/create/ImportedTopicSummary.vue'
import PresenterSettings from '@/components/create/steps/PresenterSettings.vue'
import AvatarStep from '@/components/create/steps/AvatarStep.vue'
import ExportStep from '@/components/create/steps/ExportStep.vue'
import { useNarrationAvatarPipeline } from '@/composables/useNarrationAvatarPipeline'
import { injectDeckNarration } from '@/components/editor/inspector/narration/useDeckNarration'
import { injectDeckAvatars } from '@/components/editor/inspector/video/useDeckAvatars'
import WizardBackButton from './WizardBackButton.vue'
import WizardFooter from './WizardFooter.vue'
import WizardLayout from './WizardLayout.vue'
import type { DeckStepKey, WizardStepItem, WizardStepKey } from './progress'
import { provideWizardFooter, useFooterNotice } from './stepFooter'
const { t } = useI18n()

/**
 * All six steps of the create wizard for one deck, each at its own URL. Steps 3–6 (Outline, Preview, Narration,
 * Export) are the deck steps; steps 1–2 (Topic, Presenter) are summaries (Topic read-only, Presenter editable) with the
 * same Back/Next footer. A summary hides the deck step behind it without unmounting it, so a running stream or
 * pipeline is not aborted by a look at step 1. Runs inside `DeckStateProvider`. Owns the guards: no or unknown
 * step → resume step; a locked step → resume step with a toast saying why.
 */
const props = defineProps<{ presentationId: string; presentation: Presentation }>()

const DECK_STEPS: readonly DeckStepKey[] = ['outline', 'preview', 'avatar', 'export']
type SummaryKey = 'topic' | 'presenter'
const isSummaryKey = (k: string): k is SummaryKey => k === 'topic' || k === 'presenter'
const ORDER: readonly WizardStepKey[] = ['topic', 'presenter', ...DECK_STEPS]
const isDeckStep = (k: string): k is DeckStepKey => (DECK_STEPS as readonly string[]).includes(k)

const route = useRoute()
const router = useRouter()

// Set by the step bodies: the outline or slides are streaming.
// `?stream=1` (reload or link mid-generation, or the push from the outline): slides are still coming, so
// Preview is open even before the first slide lands. The Preview step clears it when the stream ends.
const outlineStreaming = ref(false)
const streamFlag = computed(() => ['1', 'true'].includes(String(route.query.stream ?? '')))
const slidesStreaming = ref(streamFlag.value)

const id = computed(() => props.presentationId)
const deck = computed(() => props.presentation)
/** Read from a PowerPoint: its slides keep the file's design, so the AI outline (stream, Generate slides) never runs. */
const imported = computed(() => props.presentation.source === 'pptx')
// The narration/avatar pipeline lives here, not in the Avatar step: it keeps chaining while the user looks at
// another step or a summary. One per deck: DeckStateProvider (our parent) is keyed on the presentation id.
const deckAvatars = injectDeckAvatars()
const pipeline = useNarrationAvatarPipeline(id, deck, injectDeckNarration(), deckAvatars)
const pipelineRunning = pipeline.running
const templateQuery = computed(() => (typeof route.query.template === 'string' ? route.query.template : null))
const { progress, items, ready, template } = useDeckWizard(id, deck, {
  outlineStreaming,
  slidesStreaming,
  pipelineRunning,
  templateId: templateQuery,
})

const stepParam = computed(() => {
  const s = route.params.step
  return String(Array.isArray(s) ? s[0] : (s ?? ''))
})
const requested = computed<DeckStepKey | null>(() => (isDeckStep(stepParam.value) ? stepParam.value : null))
// Latched once the URL has been judged: a later refetch (e.g. a narration language change) must neither
// swap the open step for a skeleton nor re-judge the step the user is already on.
const judged = ref(false)
/** The step the guard let in. It stays shown until the URL changes, whatever the progress says meanwhile. */
const approved = ref<DeckStepKey | null>(null)
/** The step whose body is mounted: the requested deck step once let in, or the one kept behind a summary. */
const step = computed<DeckStepKey | null>(() => (summary.value ? approved.value : requested.value && requested.value === approved.value ? requested.value : null))
/** Topic or Presenter, when the URL names one. */
const summary = ref<SummaryKey | null>(null)

const go = (target: WizardStepKey, replace = false) => {
  const query = { ...route.query }
  // The stream flag belongs to Preview only; a summary keeps it, because Preview stays mounted (streaming) behind it.
  if (target !== 'preview' && !isSummaryKey(target)) delete query.stream
  const to = { name: 'create', params: { id: props.presentationId, step: target }, query }
  return replace ? router.replace(to) : router.push(to)
}

// Judge the URL once narration and videos are first in, then only when the URL changes: a step the user is
// already on is not taken away when its state shifts underneath (e.g. a note edited elsewhere).
watch(
  [ready, stepParam, streamFlag],
  ([isReady, param, stream], old) => {
    // The outline's in-app replace to `preview?stream=1` keeps this component mounted: slides are now on
    // their way, so Preview must count as open before the new step is judged (same callback, read below).
    if (stream) slidesStreaming.value = true
    if (judged.value) {
      if (old && param === old[1]) return
    } else if (!isReady) return
    judged.value = true
    const want = requested.value
    const resume = progress.value.resume
    if (isSummaryKey(param)) {
      // A summary is its own step; the deck step behind it is the one already open, else the resume step.
      summary.value = param
      approved.value ??= resume
      return
    }
    summary.value = null
    if (!want) {
      void go(resume, true)
      return
    }
    const status = progress.value.steps[want]
    if (status.state === 'locked') {
      if (status.reason) toast.info(status.reason)
      void go(resume, true)
      return
    }
    approved.value = want
  },
  { immediate: true },
)

const current = computed<WizardStepKey>(() => summary.value ?? step.value ?? requested.value ?? progress.value.resume)

const generatingMessage = () => t('create.wizard.waitGenerating')
// Why a step is closed, in the footer's status line (the toast alone vanishes and never reaches a screen reader).
const notice = useFooterNotice()
function explainLocked(item: WizardStepItem) {
  if (item.reason) notice.show(item.reason)
}
/** Leaving Preview mid-generation would abort the stream and lose the deck: summaries stay open, other steps don't. */
const heldOnPreview = (target: DeckStepKey | null) =>
  slidesStreaming.value && approved.value === 'preview' && !!target && target !== 'preview'

function select(key: WizardStepKey) {
  if (!isSummaryKey(key) && heldOnPreview(key)) {
    toast.info(generatingMessage())
    notice.show(generatingMessage())
    return
  }
  notice.clear()
  if (key !== current.value) void go(key)
}

const open = (k: WizardStepKey) => isSummaryKey(k) || progress.value.steps[k].state !== 'locked'
const neighbour = (dir: 'back' | 'next'): WizardStepKey | null => {
  const at = ORDER.indexOf(current.value)
  const list = dir === 'back' ? ORDER.slice(0, at).reverse() : ORDER.slice(at + 1)
  return list.find(open) ?? null
}
const nextStep = computed(() => ORDER[ORDER.indexOf(current.value) + 1] ?? null)
const labelOf = (k: WizardStepKey) => items.value.find((i) => i.key === k)?.label ?? ''
const nextLockReason = computed(() => {
  const n = nextStep.value
  return n && !isSummaryKey(n) && !open(n) ? progress.value.steps[n].reason : null
})

function navigate(dir: 'back' | 'next') {
  const target = neighbour(dir)
  if (target && !isSummaryKey(target) && heldOnPreview(target)) {
    toast.info(generatingMessage())
    notice.show(generatingMessage())
    return
  }
  if (target) void go(target)
  // Alt+→ onto a locked step: say why instead of doing nothing.
  else if (dir === 'next' && nextLockReason.value) {
    toast.info(nextLockReason.value)
    notice.show(nextLockReason.value)
  }
}

// A step with its own actions renders the one footer itself (see `WizardStepFooter`).
const footer = provideWizardFooter(
  { available: computed(() => !!neighbour('back')), go: () => navigate('back') },
  computed(() => !summary.value),
  notice.text,
)
const setFooterTarget = (el: unknown) => (footer.target.value = el instanceof HTMLElement ? el : null)

const COPY = computed<Record<WizardStepKey, { heading: string; lede: string }>>(() => ({
  topic: { heading: t('create.wizard.copy.topic.heading'), lede: t('create.wizard.copy.topic.lede') },
  presenter: { heading: t('create.wizard.copy.presenter.heading'), lede: t('create.wizard.copy.presenter.lede') },
  outline: { heading: t('create.wizard.copy.outline.heading'), lede: t('create.wizard.copy.outline.lede') },
  preview: { heading: t('create.wizard.copy.preview.heading'), lede: t('create.wizard.copy.preview.lede') },
  avatar: { heading: t('create.wizard.copy.avatar.heading'), lede: t('create.wizard.copy.avatar.lede') },
  export: { heading: t('create.wizard.copy.export.heading'), lede: t('create.wizard.copy.export.lede') },
}))
const copy = computed(() => COPY.value[current.value])
// The body is keyed by the deck step only: a summary shown over it must not remount it (and abort its stream).
const panelKey = computed(() => step.value ?? requested.value ?? progress.value.resume)
const title = computed(() => props.presentation.title?.trim() || t('create.wizard.newPresentation'))

const created = computed(() => {
  const d = new Date(props.presentation.created_at)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
})
const avatarWork = computed(() => deckAvatars.placeholderSlides.value.length > 0 && !progress.value.voiceOnly)
const thumbBox = ref<HTMLElement | null>(null)
const { width: thumbBoxWidth } = useElementSize(thumbBox)
const thumbWidth = computed(() => Math.max(160, Math.floor(thumbBoxWidth.value || 260)))
</script>

<template>
  <WizardLayout
    :title="title"
    :heading="copy.heading"
    :lede="copy.lede"
    :items="items"
    :current="current"
    :panel-key="panelKey"
    :parent="{ label: t('create.wizard.library'), to: { name: 'library' } }"
    @select="select"
    @blocked="explainLocked"
    @navigate="navigate"
  >
    <ImportedTopicSummary v-if="summary === 'topic' && imported" :presentation="presentation" />
    <section v-else-if="summary === 'topic'" data-testid="summary-topic" class="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-4 max-[760px]:grid-cols-1">
      <article class="summary-card flex min-w-0 flex-col gap-3">
        <header class="summary-kicker"><PencilLine class="size-3.5" aria-hidden="true" />{{ t('create.steps.topic') }}</header>
        <blockquote class="relative max-h-[320px] overflow-y-auto border-l-2 border-accent/60 pl-4 text-[13.5px] leading-[1.75] whitespace-pre-wrap text-tx-dbe5ea">
          {{ presentation.content?.trim() || t('create.wizard.generatedFromDocs') }}
        </blockquote>
        <footer v-if="created" class="mt-auto flex items-center gap-1.5 pt-1 text-[12px] text-tx-8e9ca4">
          <CalendarDays class="size-3.5" aria-hidden="true" />{{ t('create.wizard.created', { date: created }) }}
        </footer>
      </article>
      <article data-testid="summary-look" class="summary-card flex min-w-0 flex-col gap-3">
        <header class="summary-kicker"><Palette class="size-3.5" aria-hidden="true" />{{ t('create.wizard.look') }}</header>
        <div ref="thumbBox" class="w-full">
          <TemplateCardThumb v-if="template" :template="template" :width="thumbWidth" />
          <div v-else class="grid aspect-video w-full place-items-center rounded border border-dashed border-ov/[0.1] text-[12px] text-tx-8e9ca4">{{ t('create.templates.noPreview') }}</div>
        </div>
        <div class="flex min-w-0 flex-col gap-1">
          <p class="truncate text-[14px] font-medium text-tx-eef6fa">{{ template?.name ?? t('create.wizard.template') }}</p>
          <p class="flex flex-wrap items-center gap-1.5 text-[12px] text-tx-8e9ca4">
            <span v-if="template">{{ t('create.templates.layoutCount', { count: template.layouts.length }, template.layouts.length) }}</span>
          </p>
        </div>
      </article>
    </section>
    <DeckSetupChips v-if="summary === 'topic' && !imported" :presentation="presentation" />
    <PresenterSettings
      v-else-if="summary === 'presenter'"
      data-testid="step-presenter"
      :running="pipelineRunning"
      :language-ok="pipeline.languageOk.value"
      :avatar-work="avatarWork"
    />

    <!-- Step bodies: filled by the Outline, Preview, Narration and Export steps. They stay mounted (hidden) behind the
         Topic summary, so a running stream or pipeline is not aborted by a look at step 1. -->
    <section v-if="step === 'outline'" v-show="!summary" data-testid="step-body-outline">
      <ImportedOutlineSummary v-if="imported" :presentation="presentation" />
      <OutlineStep v-else :presentation="presentation" :pipeline-running="pipelineRunning" @streaming="outlineStreaming = $event" />
    </section>
    <section v-else-if="step === 'preview'" v-show="!summary" data-testid="step-body-preview">
      <PreviewStep :presentation="presentation" @streaming="slidesStreaming = $event" />
    </section>
    <section v-else-if="step === 'avatar'" v-show="!summary" data-testid="step-body-avatar">
      <AvatarStep :presentation="presentation" :progress="progress" :pipeline="pipeline" @edit-setup="select('presenter')" />
    </section>
    <section v-else-if="step === 'export'" v-show="!summary" data-testid="step-body-export">
      <ExportStep :presentation="presentation" :progress="progress" />
    </section>
    <div v-else-if="!summary" aria-busy="true" :aria-label="t('create.wizard.loadingStep')">
      <Skeleton class="h-[320px] w-full rounded-panel" />
    </div>

    <template #footer>
      <div :ref="setFooterTarget" class="contents" />
      <WizardFooter v-if="summary || !footer.claims.value" :status="notice.text.value || (summary === 'topic' ? t('create.wizard.fixedAtCreate') : summary ? undefined : (nextLockReason ?? undefined))">
        <template #back>
          <WizardBackButton v-if="neighbour('back')" @click="navigate('back')" />
        </template>
        <template #primary>
          <Button v-if="nextStep" type="button" :disabled="!!nextLockReason" @click="navigate('next')">
            {{ t('create.wizard.next', { step: labelOf(nextStep) }) }}<ArrowRight class="size-4" aria-hidden="true" />
          </Button>
        </template>
      </WizardFooter>
    </template>
  </WizardLayout>
</template>

<style scoped>
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
