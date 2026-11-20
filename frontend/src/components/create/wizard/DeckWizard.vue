<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlignLeft, ArrowLeft, ArrowRight, CalendarDays, Languages, Layers, MessageSquareQuote, Palette, PencilLine } from 'lucide-vue-next'
import { useQuery } from '@tanstack/vue-query'
import { useElementSize } from '@vueuse/core'
import { listThemes, themeKeys, type ThemeRecord } from '@/api/themes'
import { readDeckLook } from '@/composables/useDeckLook'
import TemplateCardThumb from '@/components/create/TemplateCardThumb.vue'
import type { Presentation } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { useDeckWizard } from '@/composables/useDeckWizard'
import OutlineStep from '@/components/create/steps/OutlineStep.vue'
import PreviewStep from '@/components/create/steps/PreviewStep.vue'
import AvatarStep from '@/components/create/steps/AvatarStep.vue'
import ExportStep from '@/components/create/steps/ExportStep.vue'
import { useNarrationAvatarPipeline } from '@/composables/useNarrationAvatarPipeline'
import { injectDeckNarration } from '@/components/editor/inspector/narration/useDeckNarration'
import { injectDeckAvatars } from '@/components/editor/inspector/video/useDeckAvatars'
import WizardFooter from './WizardFooter.vue'
import WizardLayout from './WizardLayout.vue'
import type { DeckStepKey, WizardStepKey } from './progress'
import { provideWizardFooter } from './stepFooter'

/**
 * Steps 4–7 of the create wizard for one deck. Runs inside `DeckStateProvider`. Owns the deck-step
 * guards: no or unknown step → resume step; a locked step → resume step with a toast saying why.
 */
const props = defineProps<{ presentationId: string; presentation: Presentation }>()

const DECK_STEPS: readonly DeckStepKey[] = ['outline', 'preview', 'avatar', 'export']
type SummaryKey = 'topic' | 'details'
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
// The narration/avatar pipeline lives here, not in the Avatar step: it keeps chaining while the user looks at
// another step or a summary. One per deck: DeckStateProvider (our parent) is keyed on the presentation id.
const pipeline = useNarrationAvatarPipeline(id, deck, injectDeckNarration(), injectDeckAvatars())
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
/** The requested step, once the guard has let it in; until then the body waits. */
const step = computed<DeckStepKey | null>(() => (requested.value && requested.value === approved.value ? requested.value : null))

const go = (target: DeckStepKey, replace = false) => {
  const query = { ...route.query }
  // The stream flag belongs to Preview only.
  if (target !== 'preview') delete query.stream
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

// Steps 1–3 of a created deck are read-only summaries shown in place.
const summary = ref<SummaryKey | null>(null)
watch(stepParam, () => (summary.value = null))

const current = computed<WizardStepKey>(() => summary.value ?? step.value ?? requested.value ?? progress.value.resume)

const GENERATING = 'Wait for the slides to finish generating'
/** Leaving Preview mid-generation would abort the stream and lose the deck: summaries stay open, other steps don't. */
const heldOnPreview = (target: DeckStepKey | null) =>
  slidesStreaming.value && requested.value === 'preview' && !!target && target !== 'preview'

function select(key: WizardStepKey) {
  if (key === 'topic' || key === 'details') {
    summary.value = key
    return
  }
  if (heldOnPreview(key)) {
    toast.info(GENERATING)
    return
  }
  summary.value = null
  if (key !== requested.value) void go(key)
}

const open = (k: DeckStepKey) => progress.value.steps[k].state !== 'locked'
const neighbour = (dir: 'back' | 'next'): DeckStepKey | null => {
  const at = DECK_STEPS.indexOf(requested.value ?? progress.value.resume)
  const list = dir === 'back' ? DECK_STEPS.slice(0, at).reverse() : DECK_STEPS.slice(at + 1)
  return list.find(open) ?? null
}
const nextStep = computed(() => {
  const at = DECK_STEPS.indexOf(requested.value ?? progress.value.resume)
  return DECK_STEPS[at + 1] ?? null
})
const nextLockReason = computed(() => {
  const n = nextStep.value
  return n && !open(n) ? progress.value.steps[n].reason : null
})

function navigate(dir: 'back' | 'next') {
  if (summary.value) {
    summary.value = null
    return
  }
  const target = neighbour(dir)
  if (heldOnPreview(target)) {
    toast.info(GENERATING)
    return
  }
  if (target) void go(target)
  // Alt+→ onto a locked step: say why instead of doing nothing.
  else if (dir === 'next' && nextLockReason.value) toast.info(nextLockReason.value)
}

// A step with its own actions renders the one footer itself (see `WizardStepFooter`).
const footer = provideWizardFooter(
  { available: computed(() => !!neighbour('back')), go: () => navigate('back') },
  computed(() => !summary.value),
)
const setFooterTarget = (el: unknown) => (footer.target.value = el instanceof HTMLElement ? el : null)

const COPY: Record<WizardStepKey, { heading: string; lede: string }> = {
  topic: { heading: 'Topic & look', lede: 'What this deck is about and the template it’s built from. Both were set when the deck was created.' },
  details: { heading: 'Details', lede: 'How the deck was generated. Tune individual slides in the editor.' },
  outline: { heading: 'Shape the story', lede: 'Each card becomes one slide. Read it through, then generate the slides.' },
  preview: { heading: 'Preview your slides', lede: 'Your deck, slide by slide. Fine-tuning lives in the editor.' },
  avatar: { heading: 'Voice and avatar', lede: 'Narrate every slide and add the presenter where the deck calls for one.' },
  export: { heading: 'Export', lede: 'Download the deck, or the narrated video.' },
}
const copy = computed(() => COPY[current.value])
// The body is keyed by the deck step only: a summary shown over it must not remount it (and abort its stream).
const panelKey = computed(() => step.value ?? requested.value ?? progress.value.resume)
const title = computed(() => props.presentation.title?.trim() || 'New presentation')

const themes = useQuery({ queryKey: themeKeys.all, queryFn: listThemes })
const deckTheme = computed(() => {
  const tid = (typeof route.query.theme === 'string' && route.query.theme) || readDeckLook(props.presentationId)?.theme
  const list: unknown = themes.data.value
  return tid && Array.isArray(list) ? (list as ThemeRecord[]).find((t) => t?.id === tid) : undefined
})
const created = computed(() => {
  const d = new Date(props.presentation.created_at)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
})
const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1)
const details = computed(() => {
  const p = props.presentation
  return [
    { label: 'Slides', value: String(p.n_slides), icon: Layers },
    { label: 'Language', value: p.language, icon: Languages },
    { label: 'Tone', value: p.tone ? cap(p.tone) : '', icon: MessageSquareQuote },
    { label: 'Verbosity', value: p.verbosity ? cap(p.verbosity) : '', icon: AlignLeft },
  ].filter((d) => Boolean(d.value))
})
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
    :parent="{ label: 'Library', to: { name: 'library' } }"
    @select="select"
    @navigate="navigate"
  >
    <section v-if="summary === 'topic'" data-testid="summary-topic" class="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-4 max-[760px]:grid-cols-1">
      <article class="summary-card flex min-w-0 flex-col gap-3">
        <header class="summary-kicker"><PencilLine class="size-3.5" aria-hidden="true" />Topic</header>
        <blockquote class="relative max-h-[320px] overflow-y-auto border-l-2 border-accent/60 pl-4 text-[13.5px] leading-[1.75] whitespace-pre-wrap text-[#dbe5ea]">
          {{ presentation.content?.trim() || 'Generated from uploaded documents.' }}
        </blockquote>
        <footer v-if="created" class="mt-auto flex items-center gap-1.5 pt-1 text-[11px] text-[#8e9ca4]">
          <CalendarDays class="size-3.5" aria-hidden="true" />Created {{ created }}
        </footer>
      </article>
      <article data-testid="summary-look" class="summary-card flex min-w-0 flex-col gap-3">
        <header class="summary-kicker"><Palette class="size-3.5" aria-hidden="true" />Look</header>
        <div ref="thumbBox" class="w-full">
          <TemplateCardThumb v-if="template" :template="template" :width="thumbWidth" :theme-override="deckTheme" />
          <div v-else class="grid aspect-video w-full place-items-center rounded border border-dashed border-white/[0.1] text-[11px] text-[#8e9ca4]">No preview</div>
        </div>
        <div class="flex min-w-0 flex-col gap-1">
          <p class="truncate text-[14px] font-medium text-[#eef6fa]">{{ template?.name ?? 'Template' }}</p>
          <p class="flex flex-wrap items-center gap-1.5 text-[11px] text-[#8e9ca4]">
            <span v-if="template">{{ template.layouts.length }} {{ template.layouts.length === 1 ? 'layout' : 'layouts' }}</span>
            <span v-if="template && deckTheme" aria-hidden="true">·</span>
            <span v-if="deckTheme" class="rounded-full border border-white/[0.12] px-2 py-px text-[10.5px] text-[#a9c4d2]">{{ deckTheme.name }}</span>
          </p>
        </div>
      </article>
    </section>
    <section v-else-if="summary === 'details'" data-testid="summary-details" class="grid grid-cols-4 gap-3 max-[760px]:grid-cols-2">
      <div v-for="d in details" :key="d.label" class="summary-card flex min-w-0 flex-col gap-3">
        <span class="grid size-8 place-items-center rounded-full bg-[#bee3f31a] text-accent" aria-hidden="true"><component :is="d.icon" class="size-4" /></span>
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="text-[10.5px] tracking-[0.06em] text-[#8e9ca4] uppercase">{{ d.label }}</span>
          <span class="truncate text-[18px] leading-tight font-medium tracking-[-0.02em] text-[#eef6fa]" :title="d.value">{{ d.value }}</span>
        </div>
      </div>
    </section>

    <!-- Step bodies: filled by the Outline, Preview, Avatar and Export steps. They stay mounted (hidden) behind a
         summary, so a running stream or pipeline is not aborted by a look at steps 1–3. -->
    <section v-if="step === 'outline'" v-show="!summary" data-testid="step-body-outline">
      <OutlineStep :presentation="presentation" :pipeline-running="pipelineRunning" @streaming="outlineStreaming = $event" />
    </section>
    <section v-else-if="step === 'preview'" v-show="!summary" data-testid="step-body-preview">
      <PreviewStep :presentation="presentation" :progress="progress" @streaming="slidesStreaming = $event" />
    </section>
    <section v-else-if="step === 'avatar'" v-show="!summary" data-testid="step-body-avatar">
      <AvatarStep :presentation="presentation" :progress="progress" :pipeline="pipeline" />
    </section>
    <section v-else-if="step === 'export'" v-show="!summary" data-testid="step-body-export">
      <ExportStep :presentation="presentation" />
    </section>
    <div v-else-if="!summary" aria-busy="true" aria-label="Loading step">
      <Skeleton class="h-[320px] w-full rounded-panel" />
    </div>

    <template #footer>
      <div :ref="setFooterTarget" class="contents" />
      <WizardFooter v-if="summary || !footer.claims.value" :status="summary ? 'Set when the deck was created' : (nextLockReason ?? undefined)">
        <template #back>
          <Button v-if="summary || neighbour('back')" type="button" variant="ghost" @click="navigate('back')">
            <ArrowLeft class="size-4" aria-hidden="true" />{{ summary ? 'Back to step' : 'Back' }}
          </Button>
        </template>
        <template #primary>
          <Button v-if="!summary && nextStep" type="button" :disabled="!!nextLockReason" @click="navigate('next')">
            Next<ArrowRight class="size-4" aria-hidden="true" />
          </Button>
        </template>
      </WizardFooter>
    </template>
  </WizardLayout>
</template>

<style scoped>
.summary-card {
  border-radius: var(--radius-card, 12px);
  border: 1px solid rgb(255 255 255 / 0.07);
  background: linear-gradient(180deg, rgb(255 255 255 / 0.035), rgb(255 255 255 / 0.012));
  padding: 18px;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.04);
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
