<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { AlertTriangle, ArrowRight, Check, Mic, RotateCcw, Sparkles, X } from 'lucide-vue-next'
import type { Presentation, Slide } from '@/api/types'
import { Button } from '@/components/ui/button'
import WizardStepFooter from '@/components/create/wizard/WizardStepFooter.vue'
import type { DeckProgress, DeckStepKey } from '@/components/create/wizard/progress'
import type { useNarrationAvatarPipeline } from '@/composables/useNarrationAvatarPipeline'
import TtsLanguageSelect from '@/components/editor/inspector/narration/TtsLanguageSelect.vue'
import { injectDeckNarration } from '@/components/editor/inspector/narration/useDeckNarration'
import type { NarrationState } from '@/components/editor/inspector/narration/narration-state'
import PortraitHero from '@/components/editor/inspector/video/PortraitHero.vue'
import AvatarChip from '@/components/editor/inspector/video/AvatarChip.vue'
import { injectDeckAvatars } from '@/components/editor/inspector/video/useDeckAvatars'
import { hasVideoPlaceholder, isFreshVideo } from '@/components/editor/inspector/video/avatar-state'

type Pipeline = ReturnType<typeof useNarrationAvatarPipeline>
type WorkPhase = 'notes' | 'voice' | 'avatars'
type SegmentState = 'pending' | 'running' | 'done' | 'skipped' | 'failed'

/**
 * Step 6: one button narrates the deck (notes → voice → avatars). The pipeline lives in the wizard, so it keeps
 * going while the user looks elsewhere; this step shows its setup, progress and the per-slide state, read-only.
 */
const props = defineProps<{ presentation: Presentation; progress: DeckProgress; pipeline: Pipeline }>()

// The pipeline is a plain object of refs (props don't unwrap them); it lives as long as the wizard.
const { phase, failedPhase, error, running, plan, blocker, languageOk, start, retry } = props.pipeline

const router = useRouter()
const narration = injectDeckNarration()
const avatars = injectDeckAvatars()
const { languages, language, setLanguage, counts, stateOf } = narration
const { videos, videoBySlide, placeholderSlides, portraitMut, chipOf } = avatars

const id = computed(() => props.presentation.id)
const slides = computed(() => [...props.presentation.slides].sort((a, b) => a.index - b.index))
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// ── Setup ──
const portraitOk = computed(() => Boolean(videos.value?.portrait))
const showPortrait = computed(() => plan.value.avatars > 0)
const hasPlaceholders = computed(() => placeholderSlides.value.length > 0)
const narrated = computed(() => counts.value.ready + counts.value.translated)
const withAvatar = computed(() => placeholderSlides.value.filter((s) => isFreshVideo(videoBySlide.value.get(s.id))).length)
const summary = computed(() => `${plural(narrated.value, 'slide')} narrated · ${withAvatar.value} with a presenter avatar`)
const stale = computed(() => counts.value.stale)

// ── Pipeline progress ──
const SEGMENTS: { key: WorkPhase; label: string }[] = [
  { key: 'notes', label: 'Notes' },
  { key: 'voice', label: 'Voice' },
  { key: 'avatars', label: 'Avatars' },
]
const ORDER: WorkPhase[] = ['notes', 'voice', 'avatars']
const needed = (k: WorkPhase) => (k === 'notes' ? plan.value.notes : k === 'voice' ? plan.value.voice : plan.value.avatars > 0)
/**
 * Phases behind the current one are done, whatever the live plan says now (notes written, voice recorded);
 * phases ahead are pending, or skipped when the plan has nothing for them.
 */
function segmentState(k: WorkPhase): SegmentState {
  const p = phase.value
  const at = ORDER.indexOf(k)
  const ahead = needed(k) ? 'pending' : 'skipped'
  if (p === 'notes' || p === 'voice' || p === 'avatars') {
    const cur = ORDER.indexOf(p)
    return at < cur ? 'done' : at === cur ? 'running' : ahead
  }
  if (p === 'error' && failedPhase.value) {
    const cur = ORDER.indexOf(failedPhase.value)
    return at < cur ? 'done' : at === cur ? 'failed' : ahead
  }
  if (p === 'done') return needed(k) ? 'pending' : 'done'
  // Idle: a task started from the editor still shows as running.
  if (k === 'voice' && narration.running.value) return 'running'
  if (k === 'avatars' && avatars.running.value) return 'running'
  return ahead
}
const STATE_LABEL: Record<SegmentState, string> = {
  pending: 'Waiting',
  running: 'In progress',
  done: 'Done',
  skipped: 'Not needed',
  failed: 'Failed',
}

/** What runs right now, also when the task was started from the editor. */
const liveText = computed(() => {
  const p = phase.value
  if (p === 'notes') return 'Writing speaker notes…'
  if (p === 'voice' || (p !== 'avatars' && narration.running.value))
    return narration.progress.value ? `Recording narration… ${narration.progress.value}%` : 'Recording narration…'
  if (p === 'avatars' || avatars.running.value)
    return avatars.progress.value ? `Rendering avatars with HeyGen… ${avatars.progress.value}%` : 'Rendering avatars with HeyGen…'
  return 'Starting…'
})

// ── Footer ──
const complete = computed(
  () =>
    !running.value &&
    stale.value === 0 &&
    (phase.value === 'done' ||
      props.progress.steps.avatar.state === 'done' ||
      (!plan.value.voice && plan.value.avatars === 0)),
)
const primaryLabel = computed(() => (plan.value.avatars > 0 ? 'Generate voice & avatars' : 'Generate voice'))
/** What a run will do, from the plan: the confirmation for a paid HeyGen run, so it never claims more or less. */
const willRun = computed(() => {
  const parts: string[] = []
  if (plan.value.voice) {
    const voice = counts.value.missing + counts.value.stale
    parts.push(`narrate ${plural(voice || slides.value.length, 'slide')}`)
  }
  if (plan.value.avatars > 0) parts.push(`render ${plural(plan.value.avatars, 'avatar')} with HeyGen`)
  return parts.length ? `Will ${parts.join(' and ')}` : undefined
})
const exportLock = computed(() =>
  props.progress.steps.export.state === 'locked' ? props.progress.steps.export.reason : null,
)
const footerStatus = computed(() => {
  if (running.value) return `${liveText.value} You can leave this page; we'll keep going.`
  if (phase.value === 'error') return blocker.value ?? willRun.value
  if (complete.value) return exportLock.value ?? summary.value
  if (blocker.value) return blocker.value
  return willRun.value
})
const PHASE_LABEL: Record<WorkPhase, string> = { notes: 'Notes', voice: 'Voice', avatars: 'Avatars' }
const footerError = computed(() =>
  phase.value === 'error' && error.value
    ? `${failedPhase.value ? `${PHASE_LABEL[failedPhase.value]}: ` : ''}${error.value}`
    : null,
)
const canGenerate = computed(() => !running.value && !blocker.value)
const failed = computed(() => (phase.value === 'error' && failedPhase.value ? failedPhase.value : null))
const optional = computed(() => props.progress.avatarRequirement === 'optional')

function generate() {
  if (!canGenerate.value) return
  start()
}
function retryFailed() {
  if (canGenerate.value) retry()
}
function go(step: DeckStepKey) {
  void router.push({ name: 'create', params: { id: id.value, step } })
}

// ── Slides ──
const VOICE_LABEL: Record<NarrationState, string> = {
  missing: 'No narration',
  ready: 'Narrated',
  stale: 'Out of date',
  translated: 'Narrated (translated)',
}
const showChip = (s: Slide) => hasVideoPlaceholder(s) || videoBySlide.value.has(s.id)
</script>

<template>
  <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 max-[860px]:grid-cols-1">
    <!-- Setup -->
    <section class="flex flex-col gap-3 rounded-card border border-white/[0.06] bg-white/[0.015] p-4" aria-label="Setup" data-testid="avatar-setup">
      <h3 class="text-[12px] font-semibold text-[#f6f8f9]">Setup</h3>

      <div class="flex flex-col gap-2" data-testid="setup-language" :data-ok="String(languageOk)">
        <span class="flex items-center gap-1.5 text-[12px] text-[#d4dee3]">
          <Check v-if="languageOk" class="size-3.5 text-accent" aria-label="Done" />
          <X v-else class="size-3.5 text-[#e8a2a2]" aria-label="To do" />Narration language
        </span>
        <TtsLanguageSelect :languages="languages ?? []" :model-value="language" :disabled="running" @update:model-value="setLanguage" />
      </div>

      <div v-if="showPortrait" class="flex flex-col gap-2" data-testid="setup-portrait" :data-ok="String(portraitOk)">
        <span class="flex items-center gap-1.5 text-[12px] text-[#d4dee3]">
          <Check v-if="portraitOk" class="size-3.5 text-accent" aria-label="Done" />
          <X v-else class="size-3.5 text-[#e8a2a2]" aria-label="To do" />Presenter portrait
        </span>
        <PortraitHero
          :portrait="videos?.portrait"
          :busy="running || portraitMut.isPending.value"
          @upload="portraitMut.mutate($event)"
          @remove="portraitMut.mutate(null)"
        />
      </div>

      <div v-if="hasPlaceholders" class="flex items-start gap-1.5 text-[12px] text-[#d4dee3]" data-testid="setup-service">
        <template v-if="progress.voiceOnly">
          <AlertTriangle class="mt-0.5 size-3.5 flex-none text-[#e6c07b]" aria-hidden="true" />
          <span>Avatar service not configured. Placeholder slides will use the voice bubble.</span>
        </template>
        <template v-else>
          <Check class="size-3.5 text-accent" aria-label="Done" />
          <span>Avatar service ready (HeyGen)</span>
        </template>
      </div>

      <div v-if="stale > 0 && !running && !failed" class="flex items-center gap-2 text-[12px] text-[#e6c07b]" data-testid="setup-stale">
        <span class="flex-1">{{ plural(stale, 'slide') }} out of date</span>
        <Button type="button" size="sm" variant="outline" :disabled="!canGenerate" @click="generate">Update</Button>
      </div>

      <p class="border-t border-white/[0.06] pt-3 text-[12px] text-muted" data-testid="setup-summary">{{ summary }}</p>
    </section>

    <div class="flex flex-col gap-4">
      <!-- Pipeline -->
      <ol class="grid list-none grid-cols-3 gap-2" aria-label="Progress">
        <li
          v-for="s in SEGMENTS"
          :key="s.key"
          :data-testid="`pipeline-${s.key}`"
          :data-state="segmentState(s.key)"
          class="flex flex-col gap-1.5 rounded-card border border-white/[0.06] p-2.5"
        >
          <span
            class="h-1 rounded-full"
            :class="{
              'bg-white/[0.08]': segmentState(s.key) === 'pending' || segmentState(s.key) === 'skipped',
              'animate-pulse bg-accent/70': segmentState(s.key) === 'running',
              'bg-accent': segmentState(s.key) === 'done',
              'bg-[#e8a2a2]': segmentState(s.key) === 'failed',
            }"
            aria-hidden="true"
          />
          <span class="text-[12px] font-semibold text-[#d4dee3]">{{ s.label }}</span>
          <span class="text-[11px] text-muted">{{ STATE_LABEL[segmentState(s.key)] }}</span>
        </li>
      </ol>

      <!-- Slides (read-only; per-slide work is in the editor) -->
      <section class="flex flex-col rounded-card border border-white/[0.06]" aria-label="Slides" data-testid="avatar-step-slides">
        <h3 class="px-3 pt-3 pb-2 text-[12px] font-semibold text-[#f6f8f9]">Slides</h3>
        <ul class="flex max-h-80 flex-col overflow-y-auto border-t border-white/[0.06]">
          <li v-for="s in slides" :key="s.id ?? s.index" class="flex items-center gap-2.5 px-3 py-2" :data-testid="`avatar-step-row-${s.index}`">
            <span class="grid aspect-video w-12 flex-none place-items-center rounded-control bg-black/25 text-[11px] text-faint">{{ s.index + 1 }}</span>
            <span class="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-[#d4dadd]">
              <Mic class="size-3 flex-none text-muted" aria-hidden="true" />{{ VOICE_LABEL[stateOf(s)] }}
            </span>
            <AvatarChip v-if="showChip(s)" :kind="chipOf(s)" />
          </li>
        </ul>
      </section>
    </div>
  </div>

  <!-- No footer Retry: in the error state the primary is "Retry from <phase>", disabled with the blocker as the reason. -->
  <WizardStepFooter :status="footerStatus" :error="footerError" :busy="running">
    <template #secondary>
      <Button v-if="complete" as-child variant="ghost">
        <RouterLink :to="{ name: 'editor', params: { id } }">Fine-tune voice and avatars in the editor</RouterLink>
      </Button>
      <Button v-else-if="optional" type="button" variant="ghost" @click="go('export')">Skip</Button>
    </template>
    <template #primary>
      <Button v-if="complete" type="button" :disabled="!!exportLock" @click="go('export')">
        Continue to Export<ArrowRight class="size-4" aria-hidden="true" />
      </Button>
      <Button v-else-if="failed" type="button" :disabled="!canGenerate" @click="retryFailed">
        <RotateCcw class="size-4" aria-hidden="true" />Retry from {{ PHASE_LABEL[failed] }}
      </Button>
      <Button v-else type="button" :disabled="!canGenerate" @click="generate">
        <Sparkles class="size-4" aria-hidden="true" />{{ primaryLabel }}
      </Button>
    </template>
  </WizardStepFooter>
</template>
