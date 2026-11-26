<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Check, Languages, Loader2, RotateCcw, Settings2, Sparkles, X } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import { Button } from '@/components/ui/button'
import type { FooterAction } from '@/components/create/wizard/stepFooter'
import WizardStepFooter from '@/components/create/wizard/WizardStepFooter.vue'
import type { DeckProgress, DeckStepKey } from '@/components/create/wizard/progress'
import type { useNarrationAvatarPipeline } from '@/composables/useNarrationAvatarPipeline'
import { injectDeckNarration } from '@/components/editor/inspector/narration/useDeckNarration'
import { injectDeckAvatars } from '@/components/editor/inspector/video/useDeckAvatars'
const { t } = useI18n()

type Pipeline = ReturnType<typeof useNarrationAvatarPipeline>
type WorkPhase = 'notes' | 'voice' | 'avatars'
/** `partial`: idle, some of the work is already saved on the deck (e.g. 4 of 5 slides narrated). */
type SegmentState = 'pending' | 'partial' | 'running' | 'done' | 'skipped' | 'failed'

/**
 * Step 5 (Narration, recommended, never required): one button narrates the deck (notes → voice → presenter videos) in the
 * language and with the presenter set on the Presenter step. Export is open without it. The pipeline lives in the wizard, so it keeps going while the user looks
 * elsewhere; once it starts, this step shows a live checklist of the three jobs.
 */
const props = defineProps<{ presentation: Presentation; progress: DeckProgress; pipeline: Pipeline }>()
const emit = defineEmits<{ 'edit-setup': [] }>()

// The pipeline is a plain object of refs (props don't unwrap them); it lives as long as the wizard.
const { phase, failedPhase, error, running, plan, blocker, start, retry } = props.pipeline

const route = useRoute()
const router = useRouter()
const narration = injectDeckNarration()
const avatars = injectDeckAvatars()
const { languages, language, counts } = narration
const { videos, placeholderSlides } = avatars

const id = computed(() => props.presentation.id)
const slides = computed(() => props.presentation.slides)

// ── Setup ──
/** The deck has presenter slides and the server can render their videos. */
const avatarWork = computed(() => placeholderSlides.value.length > 0 && !props.progress.voiceOnly)
const languageName = computed(() => languages.value?.find((l) => l.code === language.value)?.name ?? language.value)

// ── Pipeline progress ──
const ORDER: WorkPhase[] = ['notes', 'voice', 'avatars']
const needed = (k: WorkPhase) => (k === 'notes' ? plan.value.notes : k === 'voice' ? plan.value.voice : plan.value.avatars > 0)
const stale = computed(() => counts.value.stale)

// From the deck's state, never from a finished run: the pipeline outlives Regenerate and language changes.
const complete = computed(
  () =>
    !running.value &&
    stale.value === 0 &&
    (props.progress.steps.avatar.state === 'done' || (!plan.value.voice && plan.value.avatars === 0 && !plan.value.notes)),
)

// ── Saved work, read from the deck ──
const total = computed(() => slides.value.length)
const notesCount = computed(() => slides.value.filter((s) => (s.speaker_note ?? '').trim()).length)
/** Slides whose narration is recorded and current (`translated` counts as ready, like the step bar). */
const voicedCount = computed(() => Math.min(total.value, counts.value.ready + counts.value.translated))
/** Presenter slides whose video is up to date: what the plan does not still have to render. */
const videosDone = computed(() => Math.max(0, placeholderSlides.value.length - plan.value.avatars))
/** Share (0-100) of a job already saved on the deck; 100 only when nothing is left to do for it. */
function savedPercent(k: WorkPhase): number {
  if (!needed(k)) return 100
  const [done, of] =
    k === 'notes'
      ? [notesCount.value, total.value]
      : k === 'voice'
        ? [voicedCount.value, total.value]
        : [videosDone.value, placeholderSlides.value.length]
  return of ? Math.min(99, Math.round((done / of) * 100)) : 0
}
/** Slides still to narrate: no notes, or audio missing or stale. */
const slidesLeft = computed(() =>
  Math.min(total.value, Math.max(counts.value.missing + counts.value.stale, total.value - notesCount.value)),
)
const startedWork = computed(() => notesCount.value > 0 || voicedCount.value > 0 || videosDone.value > 0)

/** A job that is not running or failed, read from the deck. */
function savedState(k: WorkPhase): SegmentState {
  if (k === 'avatars' && !avatarWork.value) return 'skipped'
  if (!needed(k)) return 'done'
  return savedPercent(k) > 0 ? 'partial' : 'pending'
}

function segmentState(k: WorkPhase): SegmentState {
  const p = phase.value
  const at = ORDER.indexOf(k)
  const ahead = savedState(k)
  if (p === 'notes' || p === 'voice' || p === 'avatars') {
    const cur = ORDER.indexOf(p)
    return at < cur ? 'done' : at === cur ? 'running' : ahead
  }
  if (p === 'error' && failedPhase.value) {
    const cur = ORDER.indexOf(failedPhase.value)
    return at < cur ? 'done' : at === cur ? 'failed' : ahead
  }
  if (k === 'voice' && narration.running.value) return 'running'
  if (k === 'avatars' && avatars.running.value) return 'running'
  return ahead
}

function percent(k: WorkPhase): number | null {
  const st = segmentState(k)
  if (st === 'done') return 100
  if (st === 'partial') return savedPercent(k)
  if (st !== 'running') return 0
  if (k === 'notes') return total.value ? Math.round((notesCount.value / total.value) * 100) || null : null
  const v = k === 'voice' ? narration.progress.value : avatars.progress.value
  return v || null // null = indeterminate
}

function detail(k: WorkPhase): string {
  const st = segmentState(k)
  const n = total.value
  if (st === 'failed') return error.value ?? t('create.narration.failedDetail')
  if (k === 'notes') {
    if (st === 'running') return t('create.narration.notesRunning', { count: n }, n)
    if (st === 'done') return t('create.narration.notesDone', { count: n }, n)
    if (st === 'partial') return t('create.narration.notesPartial', { done: notesCount.value, count: n }, n)
    return t('create.narration.notesPending')
  }
  if (k === 'voice') {
    const language = languageName.value
    if (st === 'running') return t('create.narration.voiceRunning', { language })
    if (st === 'done') return t('create.narration.voiceDone', { count: n, language }, n)
    if (st === 'partial') return t('create.narration.voicePartial', { done: voicedCount.value, count: n, language }, n)
    return t('create.narration.voicePending', { language })
  }
  if (st === 'skipped') return placeholderSlides.value.length ? t('create.narration.videosSkippedVoiceOnly') : t('create.narration.videosSkippedNoSlides')
  const videoCount = placeholderSlides.value.length
  if (st === 'running') return t('create.narration.videosRunning', { count: videoCount }, videoCount)
  if (st === 'done') return t('create.narration.videosDone', { count: videoCount }, videoCount)
  if (st === 'partial') return t('create.narration.videosPartial', { done: videosDone.value, count: videoCount }, videoCount)
  return t('create.narration.videosPending', { count: videoCount }, videoCount)
}

const JOBS = computed<{ key: WorkPhase; label: string }[]>(() => [
  { key: 'notes', label: t('create.narration.jobs.notes') },
  { key: 'voice', label: t('create.narration.jobs.voice') },
  { key: 'avatars', label: t('create.narration.jobs.presenter') },
])
const activeJobs = computed(() => JOBS.value.filter((j) => segmentState(j.key) !== 'skipped'))
const overall = computed(() => {
  const list = activeJobs.value
  if (!list.length) return 0
  return Math.round(list.reduce((sum, j) => sum + (percent(j.key) ?? 0), 0) / list.length)
})

const heading = computed(() => {
  if (phase.value === 'error') return t('create.narration.headingFailed')
  if (running.value) return t('create.narration.headingRunning')
  if (complete.value) return t('create.narration.headingComplete')
  if (!startedWork.value) return t('create.narration.headingReady')
  if (slidesLeft.value > 0) return t('create.narration.headingSlidesLeft', { count: slidesLeft.value }, slidesLeft.value)
  if (plan.value.avatars > 0) return t('create.narration.headingVideosLeft', { count: plan.value.avatars }, plan.value.avatars)
  return t('create.narration.headingReady')
})

// ── Footer ──
// The pipeline skips what is already saved (notes: no `regenerate`; voice: only missing or stale slides;
// avatars: only slides without an up-to-date video), so "remaining" is exactly what a run does.
/** On a phone the primary says "video" instead of "presenter video" and drops "remaining", so it never wraps. */
const narrow = useMediaQuery('(max-width: 520px)')
const primaryLabel = computed(() => {
  const left = slidesLeft.value
  const videos = plan.value.avatars
  if (left > 0) {
    const remaining = left < total.value && !narrow.value
    const narrate = t(remaining ? 'create.narration.narrateRemaining' : 'create.narration.narrate', { count: left }, left)
    if (!videos) return narrate
    return `${narrate} + ${t(narrow.value ? 'create.narration.videoShort' : 'create.narration.videoLong', { count: videos }, videos)}`
  }
  if (videos > 0) {
    if (narrow.value) return t('create.narration.renderVideosShort', { count: videos }, videos)
    return t(videosDone.value > 0 ? 'create.narration.renderVideosRemaining' : 'create.narration.renderVideos', { count: videos }, videos)
  }
  return t('create.narration.narrateDeck')
})
/**
 * What the primary will do, as counts only (no timing is known). Presenter videos are rendered by a paid service: the
 * deck's own dialog says credits are spent for each slide, so say that plainly.
 */
const scope = computed(() => {
  const parts: string[] = []
  const notes = Math.max(0, total.value - notesCount.value)
  if (plan.value.notes && notes > 0) parts.push(t('create.narration.scopeNotes', { count: notes }, notes))
  if (plan.value.voice && slidesLeft.value > 0) parts.push(t('create.narration.scopeVoice', { count: slidesLeft.value, language: languageName.value }, slidesLeft.value))
  if (plan.value.avatars > 0) parts.push(t('create.narration.scopeVideos', { count: plan.value.avatars }, plan.value.avatars))
  if (!parts.length) return ''
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} ${t('create.narration.listAnd')} ${parts[parts.length - 1]}` : parts[0]
  const paid = plan.value.avatars > 0 ? ` ${t('create.narration.scopePaid')}` : ''
  return `${list[0].toUpperCase()}${list.slice(1)}.${paid}`
})
/** The footer keeps one short scope line; the full plan sentence lives in the card (`scope`). */
const footerStatus = computed(() => {
  if (running.value) return t('create.narration.footerRunning')
  if (complete.value) return undefined
  if (blocker.value) return blocker.value
  return plan.value.avatars > 0 ? t('create.narration.footerVideos', { count: plan.value.avatars }, plan.value.avatars) : undefined
})
const showPlan = computed(() => !running.value && !complete.value && !failed.value && !!scope.value)
/** Skipping is safe: the editor has the same narration and presenter tools, and Export never needs narration. */
const showSkip = computed(() => (!complete.value || !!failed.value) && !running.value)
const phaseLabel = (k: WorkPhase) => t(`create.narration.phases.${k}`)
const canGenerate = computed(() => !running.value && !blocker.value)
const failed = computed(() => (phase.value === 'error' && failedPhase.value ? failedPhase.value : null))

function generate() {
  if (!canGenerate.value) return
  start()
}
function retryFailed() {
  if (canGenerate.value) retry()
}
const actions = computed<FooterAction[]>(() => {
  const list: FooterAction[] = []
  if (!failed.value && complete.value) list.push({ key: 'editor', label: t('create.narration.fineTune'), to: { name: 'editor', params: { id: id.value } } })
  else if (blocker.value && !running.value) list.push({ key: 'setup', label: t('create.narration.setupPresenter'), onSelect: () => emit('edit-setup') })
  if (showSkip.value) list.push({ key: 'skip', label: t('create.skipToExport'), link: true, testid: 'skip-to-export', onSelect: () => go('export') })
  return list
})
/** Keeps the rest of the query (template); the stream flag belongs to Preview only. */
function go(step: DeckStepKey) {
  const query = { ...route.query }
  delete query.stream
  void router.push({ name: 'create', params: { id: id.value, step }, query })
}
</script>

<template>
  <div class="flex w-full flex-col gap-5">
    <!-- Generation: live checklist -->
    <section
      class="flex flex-col gap-5 rounded-card border border-ov/[0.06] bg-ov/[0.015] p-6 max-[520px]:p-4"
      :aria-label="t('create.narration.progressAria')"
      data-testid="avatar-progress"
    >
      <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div
          class="relative grid size-14 flex-none place-items-center"
          role="progressbar"
          :aria-label="t('create.narration.progressLabel')"
          :aria-valuenow="overall"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuetext="`${overall}%`"
          data-testid="avatar-overall"
        >
          <svg viewBox="0 0 36 36" class="absolute inset-0 size-full -rotate-90" aria-hidden="true">
            <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" stroke-width="2.5" class="text-strong/[0.06]" />
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              :stroke-dasharray="`${(overall / 100) * 100.5} 100.5`"
              class="transition-[stroke-dasharray] duration-500"
              :class="phase === 'error' ? 'text-tx-e8a2a2' : 'text-accent'"
            />
          </svg>
          <Transition name="pop" mode="out-in">
            <Check v-if="complete && !running && phase !== 'error'" key="ok" class="size-6 text-accent" aria-hidden="true" />
            <span v-else key="pct" class="text-[12px] font-semibold tabular-nums text-tx-f6f8f9">{{ overall }}%</span>
          </Transition>
        </div>
        <div class="flex min-w-[8rem] flex-1 flex-col gap-0.5">
          <!-- Polite, and only the heading: it changes per phase, so a run is announced a few times, not on every percent. -->
          <div role="status" aria-live="polite" aria-atomic="true"><h3 class="text-[15px] font-semibold text-tx-f6f8f9">{{ heading }}</h3></div>
          <p class="flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
            <span class="inline-flex items-center gap-1"><Languages class="size-3.5" aria-hidden="true" />{{ languageName }}</span>
            <span v-if="avatarWork && videos?.portrait" class="inline-flex items-center gap-1.5">
              <img :src="videos.portrait.url" alt="" class="size-4 rounded-full object-cover" />{{ t('create.narration.presenterSet') }}
            </span>
          </p>
        </div>
        <Button v-if="!running" type="button" size="sm" variant="ghost" class="max-[559px]:h-11" @click="emit('edit-setup')">
          <Settings2 class="size-3.5" aria-hidden="true" />{{ t('create.narration.presenterAndLanguage') }}
        </Button>
      </div>

      <p v-if="showPlan" class="max-w-[60ch] text-[12px] leading-[1.6] text-tx-b4c3cb" data-testid="avatar-plan">{{ scope }}</p>

      <ol class="flex list-none flex-col gap-2">
        <li
          v-for="j in JOBS"
          :key="j.key"
          :data-testid="`pipeline-${j.key}`"
          :data-state="segmentState(j.key)"
          class="flex items-center gap-3 rounded-control border border-ov/[0.05] px-3.5 py-3 transition-colors duration-300"
          :class="{ 'bg-accent/[0.04]': segmentState(j.key) === 'running' }"
        >
          <!-- Pending and skipped rows dim the icon and bar only: the detail text must stay readable. -->
          <span
            class="grid size-7 flex-none place-items-center"
            :class="{ 'opacity-50': segmentState(j.key) === 'pending' || segmentState(j.key) === 'skipped' }"
          >
            <Transition name="pop" mode="out-in">
              <span v-if="segmentState(j.key) === 'done'" key="done" class="grid size-7 place-items-center rounded-full bg-accent text-tx-0b1215">
                <Check class="size-4" stroke-width="3" role="img" :aria-label="t('create.done')" />
              </span>
              <Loader2 v-else-if="segmentState(j.key) === 'running'" key="run" class="size-5 animate-spin text-accent" aria-hidden="true" />
              <span v-else-if="segmentState(j.key) === 'failed'" key="fail" class="grid size-7 place-items-center rounded-full bg-sx-e8a2a2/15 text-tx-e8a2a2">
                <X class="size-4" role="img" :aria-label="t('create.narration.failedAria')" />
              </span>
              <svg v-else-if="segmentState(j.key) === 'partial'" key="part" viewBox="0 0 20 20" class="size-5 -rotate-90 text-accent" role="img" :aria-label="t('create.narration.savedAria', { percent: percent(j.key) })">
                <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width="2.5" />
                <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" :stroke-dasharray="`${((percent(j.key) ?? 0) / 100) * 50.3} 50.3`" />
              </svg>
              <span v-else key="wait" class="size-2.5 rounded-full border border-ov/20" aria-hidden="true" />
            </Transition>
          </span>
          <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span class="text-[13px] font-semibold text-tx-f6f8f9">{{ j.label }}</span>
              <span class="min-w-0 flex-1 text-[12px] leading-snug max-[520px]:order-last max-[520px]:basis-full" :class="segmentState(j.key) === 'failed' ? 'text-tx-e8a2a2' : 'text-muted'">{{ detail(j.key) }}</span>
              <span v-if="segmentState(j.key) === 'running' && percent(j.key) !== null" class="text-[12px] tabular-nums text-tx-d4dee3 max-[520px]:ml-auto">{{ percent(j.key) }}%</span>
            </div>
            <div
              v-if="segmentState(j.key) !== 'skipped'"
              class="h-1 overflow-hidden rounded-full bg-ov/[0.06]"
              :class="{ 'opacity-60': segmentState(j.key) === 'pending' }"
            >
              <div
                v-if="segmentState(j.key) === 'running' && percent(j.key) === null"
                class="h-full w-1/3 animate-pulse rounded-full bg-accent/70"
              />
              <div
                v-else
                class="h-full rounded-full transition-[width] duration-500"
                :class="segmentState(j.key) === 'failed' ? 'bg-sx-e8a2a2' : 'bg-accent'"
                :style="{ width: `${percent(j.key) ?? 0}%` }"
              />
            </div>
          </div>
        </li>
      </ol>
    </section>
    <p v-if="showSkip" class="text-[12px] leading-[1.6] text-tx-a9b8c0" data-testid="skip-reason">{{ t('create.narration.skipReason') }}</p>
  </div>

  <WizardStepFooter :status="footerStatus" :busy="running" :actions="actions">
    <template #primary>
      <Button v-if="failed" type="button" :disabled="!canGenerate" @click="retryFailed">
        <RotateCcw class="size-4" aria-hidden="true" />{{ t('create.narration.retryPhase', { phase: phaseLabel(failed) }) }}
      </Button>
      <Button v-else-if="complete" type="button" @click="go('export')">
        {{ t('create.narration.continueToExport') }}<ArrowRight class="size-4" aria-hidden="true" />
      </Button>
      <Button v-else type="button" class="max-w-full whitespace-nowrap" :disabled="!canGenerate" @click="generate">
        <Sparkles class="size-4" aria-hidden="true" />{{ primaryLabel }}
      </Button>
    </template>
  </WizardStepFooter>
</template>

<style scoped>
.pop-enter-active {
  transition:
    transform 280ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 200ms ease-out;
}
.pop-leave-active {
  transition: opacity 120ms ease-in;
}
.pop-enter-from {
  transform: scale(0.7);
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .pop-enter-active,
  .pop-leave-active {
    transition: opacity 120ms ease-out;
  }
  .pop-enter-from {
    transform: none;
  }
}
.pop-leave-to {
  opacity: 0;
}
</style>
