<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight } from 'lucide-vue-next'
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
type SummaryKey = 'topic' | 'look' | 'details'
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
const { progress, items, ready } = useDeckWizard(id, deck, {
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
  if (key === 'topic' || key === 'look' || key === 'details') {
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
  topic: { heading: 'Topic', lede: 'What this deck is about. It was set when the deck was created.' },
  look: { heading: 'Look', lede: 'The template the slides are built from. Change layouts and styling in the editor.' },
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

const lookName = computed(() => items.value.find((i) => i.key === 'look')?.summary ?? 'Template')
const details = computed(() => {
  const p = props.presentation
  return [
    { label: 'Slides', value: String(p.n_slides) },
    { label: 'Language', value: p.language },
    { label: 'Tone', value: p.tone },
    { label: 'Verbosity', value: p.verbosity },
  ].filter((d): d is { label: string; value: string } => Boolean(d.value))
})
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
    <section v-if="summary === 'topic'" data-testid="summary-topic" class="rounded-card border border-white/[0.06] bg-white/[0.015] p-4">
      <p class="text-[13px] leading-[1.7] whitespace-pre-wrap text-[#d4dee3]">{{ presentation.content }}</p>
    </section>
    <section v-else-if="summary === 'look'" data-testid="summary-look" class="rounded-card border border-white/[0.06] bg-white/[0.015] p-4">
      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[12px]">
        <dt class="text-[#8e9ca4]">Template</dt>
        <dd class="text-[#d4dee3]">{{ lookName }}</dd>
      </dl>
    </section>
    <section v-else-if="summary === 'details'" data-testid="summary-details" class="rounded-card border border-white/[0.06] bg-white/[0.015] p-4">
      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[12px]">
        <template v-for="d in details" :key="d.label">
          <dt class="text-[#8e9ca4]">{{ d.label }}</dt>
          <dd class="text-[#d4dee3]">{{ d.value }}</dd>
        </template>
      </dl>
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
