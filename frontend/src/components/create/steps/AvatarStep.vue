<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ArrowRight, Check, Languages, Loader2, RotateCcw, Settings2, Sparkles, UserRound, X } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import { Button } from '@/components/ui/button'
import WizardStepFooter from '@/components/create/wizard/WizardStepFooter.vue'
import type { DeckProgress, DeckStepKey } from '@/components/create/wizard/progress'
import type { useNarrationAvatarPipeline } from '@/composables/useNarrationAvatarPipeline'
import TtsLanguageSelect from '@/components/editor/inspector/narration/TtsLanguageSelect.vue'
import { injectDeckNarration } from '@/components/editor/inspector/narration/useDeckNarration'
import PortraitHero from '@/components/editor/inspector/video/PortraitHero.vue'
import { injectDeckAvatars } from '@/components/editor/inspector/video/useDeckAvatars'

type Pipeline = ReturnType<typeof useNarrationAvatarPipeline>
type WorkPhase = 'notes' | 'voice' | 'avatars'
type SegmentState = 'pending' | 'running' | 'done' | 'skipped' | 'failed'

/**
 * Step 6: set the narration language and the presenter, then one button narrates the deck
 * (notes → voice → avatars). The pipeline lives in the wizard, so it keeps going while the user looks
 * elsewhere; once it starts, this step shows a live checklist of the three jobs.
 */
const props = defineProps<{ presentation: Presentation; progress: DeckProgress; pipeline: Pipeline }>()

// The pipeline is a plain object of refs (props don't unwrap them); it lives as long as the wizard.
const { phase, failedPhase, error, running, plan, blocker, languageOk, start, retry } = props.pipeline

const route = useRoute()
const router = useRouter()
const narration = injectDeckNarration()
const avatars = injectDeckAvatars()
const { languages, language, setLanguage, counts } = narration
const { videos, placeholderSlides, portraitMut } = avatars

const id = computed(() => props.presentation.id)
const slides = computed(() => props.presentation.slides)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// ── Setup ──
const portraitOk = computed(() => Boolean(videos.value?.portrait))
/** The deck has presenter slides and HeyGen can render them. */
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
  if (k === 'voice' && narration.running.value) return 'running'
  if (k === 'avatars' && avatars.running.value) return 'running'
  if (p === 'done' || complete.value) {
    if (k === 'avatars' && !avatarWork.value) return 'skipped'
    return needed(k) ? 'pending' : 'done'
  }
  return ahead
}

const notesCount = computed(() => slides.value.filter((s) => (s.speaker_note ?? '').trim()).length)
function percent(k: WorkPhase): number | null {
  const st = segmentState(k)
  if (st === 'done') return 100
  if (st !== 'running') return 0
  const total = slides.value.length
  if (k === 'notes') return total ? Math.round((notesCount.value / total) * 100) || null : null
  const v = k === 'voice' ? narration.progress.value : avatars.progress.value
  return v || null // null = indeterminate
}

function detail(k: WorkPhase): string {
  const st = segmentState(k)
  const total = slides.value.length
  if (st === 'failed') return error.value ?? 'Failed'
  if (k === 'notes') {
    if (st === 'running') return `Writing speaker notes for ${plural(total, 'slide')}…`
    if (st === 'done') return `${plural(total, 'slide')} with speaker notes`
    return 'Speaker notes for every slide'
  }
  if (k === 'voice') {
    if (st === 'running') return `Recording narration in ${languageName.value}…`
    if (st === 'done') return `${plural(total, 'slide')} narrated in ${languageName.value}`
    return `Narration in ${languageName.value}`
  }
  if (st === 'skipped') return placeholderSlides.value.length ? 'Voice bubble only (HeyGen not configured)' : 'No presenter slides in this deck'
  const n = placeholderSlides.value.length
  if (st === 'running') return `Rendering ${plural(n, 'presenter video')} with HeyGen…`
  if (st === 'done') return `${plural(n, 'presenter video')} ready`
  return `${plural(n, 'presenter video')}`
}

const JOBS: { key: WorkPhase; label: string }[] = [
  { key: 'notes', label: 'Notes' },
  { key: 'voice', label: 'Voice' },
  { key: 'avatars', label: 'Avatar' },
]
const activeJobs = computed(() => JOBS.filter((j) => segmentState(j.key) !== 'skipped'))
const overall = computed(() => {
  const list = activeJobs.value
  if (!list.length) return 0
  return Math.round(list.reduce((sum, j) => sum + (percent(j.key) ?? 0), 0) / list.length)
})

// Language and presenter are chosen before the deck exists: once both are in place the step shows them as a
// summary, and only opens the controls on request or when something is missing (a failed photo upload).
const settingsOpen = ref(false)
const setupDone = computed(() => languageOk.value && (!avatarWork.value || portraitOk.value))

// ── View: setup until a run starts, then the live checklist ──
const editing = ref(false)
const showProgress = computed(
  () => !editing.value && (running.value || phase.value === 'done' || phase.value === 'error' || complete.value),
)
watch(running, (r) => {
  if (r) editing.value = false
})

const heading = computed(() => {
  if (phase.value === 'error') return 'Something needs another try'
  if (running.value) return 'Bringing your deck to life'
  return 'Your deck is narrated'
})

// ── Footer ──
const primaryLabel = computed(() => (plan.value.avatars > 0 ? 'Generate voice & avatar' : 'Generate voice'))
const exportLock = computed(() =>
  props.progress.steps.export.state === 'locked' ? props.progress.steps.export.reason : null,
)
const footerStatus = computed(() => {
  if (running.value) return "You can leave this page; we'll keep going."
  if (complete.value) return exportLock.value ?? undefined
  return blocker.value ?? undefined
})
const PHASE_LABEL: Record<WorkPhase, string> = { notes: 'Notes', voice: 'Voice', avatars: 'Avatar' }
const canGenerate = computed(() => !running.value && !blocker.value)
const failed = computed(() => (phase.value === 'error' && failedPhase.value ? failedPhase.value : null))
const optional = computed(() => props.progress.avatarRequirement === 'optional')

function generate() {
  if (!canGenerate.value) return
  editing.value = false
  start()
}
function retryFailed() {
  if (canGenerate.value) retry()
}
/** Keeps the rest of the query (template); the stream flag belongs to Preview only. */
function go(step: DeckStepKey) {
  const query = { ...route.query }
  delete query.stream
  void router.push({ name: 'create', params: { id: id.value, step }, query })
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-[720px] flex-col gap-5">
    <!-- Setup: language + presenter -->
    <div v-if="!showProgress && setupDone && !settingsOpen" class="flex flex-col gap-3" data-testid="narration-summary">
      <section class="flex items-center gap-3 rounded-card border border-white/[0.06] bg-white/[0.015] px-4 py-3">
        <span class="grid size-8 flex-none place-items-center rounded-full bg-accent/10 text-accent"><Languages class="size-4" aria-hidden="true" /></span>
        <div class="flex min-w-0 flex-1 flex-col">
          <h3 class="text-[13px] font-semibold text-[#f6f8f9]">{{ languageName }}</h3>
          <span class="text-[11px] text-muted">{{ avatarWork ? 'Presenter photo set' : 'Voice only, no presenter slides' }}</span>
        </div>
        <img v-if="avatarWork && videos?.portrait" :src="videos.portrait.url" alt="" class="size-8 rounded-full object-cover" />
        <Button type="button" size="sm" variant="ghost" @click="settingsOpen = true"><Settings2 class="size-3.5" aria-hidden="true" />Settings</Button>
      </section>
    </div>
    <div v-else-if="!showProgress" class="flex flex-col gap-3" data-testid="avatar-setup">
      <!-- Language: one full-width row -->
      <section
        class="flex items-center gap-3 rounded-card border border-white/[0.06] bg-white/[0.015] px-4 py-3 max-[560px]:flex-col max-[560px]:items-stretch"
        data-testid="setup-language"
        :data-ok="String(languageOk)"
      >
        <div class="flex min-w-0 flex-1 items-center gap-2.5">
          <span class="grid size-8 flex-none place-items-center rounded-full bg-accent/10 text-accent"><Languages class="size-4" aria-hidden="true" /></span>
          <div class="flex min-w-0 flex-col">
            <h3 class="text-[13px] font-semibold text-[#f6f8f9]">Language</h3>
            <span class="text-[11px] text-muted">The voice speaks in this language</span>
          </div>
        </div>
        <div class="flex w-[260px] flex-none items-center gap-2 max-[560px]:w-full">
          <div class="min-w-0 flex-1">
            <TtsLanguageSelect :languages="languages ?? []" :model-value="language" :disabled="running" @update:model-value="setLanguage" />
          </div>
          <Check v-if="languageOk" class="size-4 flex-none text-accent" role="img" aria-label="Done" />
        </div>
      </section>

      <!-- Avatar: the big card -->
      <section
        v-if="avatarWork"
        class="flex flex-col gap-4 rounded-card border border-white/[0.06] bg-white/[0.015] p-5"
        data-testid="setup-portrait"
        :data-ok="String(portraitOk)"
      >
        <div class="flex items-center gap-2.5">
          <span class="grid size-8 flex-none place-items-center rounded-full bg-accent/10 text-accent"><UserRound class="size-4" aria-hidden="true" /></span>
          <div class="flex flex-col">
            <h3 class="text-[13px] font-semibold text-[#f6f8f9]">Avatar</h3>
            <span class="text-[11px] text-muted">{{ portraitOk ? 'Your presenter for this deck' : 'Add a photo of your presenter' }}</span>
          </div>
          <Check v-if="portraitOk" class="ml-auto size-4 text-accent" role="img" aria-label="Done" />
        </div>
        <PortraitHero
          class="mx-auto w-full max-w-[380px]"
          :portrait="videos?.portrait"
          :busy="running || portraitMut.isPending.value"
          @upload="portraitMut.mutate($event)"
          @remove="portraitMut.mutate(null)"
        />
      </section>
    </div>

    <!-- Generation: live checklist -->
    <section
      v-else
      class="flex flex-col gap-5 rounded-card border border-white/[0.06] bg-white/[0.015] p-6"
      aria-label="Progress"
      data-testid="avatar-progress"
    >
      <div class="flex items-center gap-4">
        <div class="relative grid size-14 flex-none place-items-center">
          <svg viewBox="0 0 36 36" class="absolute inset-0 size-full -rotate-90" aria-hidden="true">
            <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" stroke-width="2.5" class="text-white/[0.06]" />
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
              :class="phase === 'error' ? 'text-[#e8a2a2]' : 'text-accent'"
            />
          </svg>
          <Transition name="pop" mode="out-in">
            <Check v-if="!running && phase !== 'error'" key="ok" class="size-6 text-accent" aria-hidden="true" />
            <span v-else key="pct" class="text-[12px] font-semibold tabular-nums text-[#f6f8f9]">{{ overall }}%</span>
          </Transition>
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 class="text-[15px] font-semibold text-[#f6f8f9]">{{ heading }}</h3>
          <p class="flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
            <span class="inline-flex items-center gap-1"><Languages class="size-3.5" aria-hidden="true" />{{ languageName }}</span>
            <span v-if="avatarWork && videos?.portrait" class="inline-flex items-center gap-1.5">
              <img :src="videos.portrait.url" alt="" class="size-4 rounded-full object-cover" />Presenter set
            </span>
          </p>
        </div>
        <Button v-if="!running" type="button" size="sm" variant="ghost" @click="editing = true">
          <Settings2 class="size-3.5" aria-hidden="true" />Settings
        </Button>
      </div>

      <ol class="flex list-none flex-col gap-2">
        <li
          v-for="j in JOBS"
          :key="j.key"
          :data-testid="`pipeline-${j.key}`"
          :data-state="segmentState(j.key)"
          class="flex items-center gap-3 rounded-control border border-white/[0.05] px-3.5 py-3 transition-colors duration-300"
          :class="{
            'bg-accent/[0.04]': segmentState(j.key) === 'running',
            'opacity-50': segmentState(j.key) === 'pending' || segmentState(j.key) === 'skipped',
          }"
        >
          <span class="grid size-7 flex-none place-items-center">
            <Transition name="pop" mode="out-in">
              <span v-if="segmentState(j.key) === 'done'" key="done" class="grid size-7 place-items-center rounded-full bg-accent text-[#0b1215]">
                <Check class="size-4" stroke-width="3" role="img" aria-label="Done" />
              </span>
              <Loader2 v-else-if="segmentState(j.key) === 'running'" key="run" class="size-5 animate-spin text-accent" aria-hidden="true" />
              <span v-else-if="segmentState(j.key) === 'failed'" key="fail" class="grid size-7 place-items-center rounded-full bg-[#e8a2a2]/15 text-[#e8a2a2]">
                <X class="size-4" role="img" aria-label="Failed" />
              </span>
              <span v-else key="wait" class="size-2.5 rounded-full border border-white/20" aria-hidden="true" />
            </Transition>
          </span>
          <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <div class="flex items-baseline gap-2">
              <span class="text-[13px] font-semibold text-[#f6f8f9]">{{ j.label }}</span>
              <span class="min-w-0 flex-1 truncate text-[12px]" :class="segmentState(j.key) === 'failed' ? 'text-[#e8a2a2]' : 'text-muted'">{{ detail(j.key) }}</span>
              <span v-if="segmentState(j.key) === 'running' && percent(j.key) !== null" class="text-[11px] tabular-nums text-[#d4dee3]">{{ percent(j.key) }}%</span>
            </div>
            <div v-if="segmentState(j.key) !== 'skipped'" class="h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                v-if="segmentState(j.key) === 'running' && percent(j.key) === null"
                class="h-full w-1/3 animate-pulse rounded-full bg-accent/70"
              />
              <div
                v-else
                class="h-full rounded-full transition-[width] duration-500"
                :class="segmentState(j.key) === 'failed' ? 'bg-[#e8a2a2]' : 'bg-accent'"
                :style="{ width: `${percent(j.key) ?? 0}%` }"
              />
            </div>
          </div>
        </li>
      </ol>
    </section>
  </div>

  <WizardStepFooter :status="footerStatus" :busy="running">
    <template #secondary>
      <Button v-if="!failed && complete && !editing" as-child variant="ghost">
        <RouterLink :to="{ name: 'editor', params: { id } }">Fine-tune in the editor</RouterLink>
      </Button>
      <Button v-else-if="optional && !running" type="button" variant="ghost" @click="go('export')">Skip</Button>
    </template>
    <template #primary>
      <Button v-if="failed" type="button" :disabled="!canGenerate" @click="retryFailed">
        <RotateCcw class="size-4" aria-hidden="true" />Retry {{ PHASE_LABEL[failed] }}
      </Button>
      <Button v-else-if="complete && !editing" type="button" :disabled="!!exportLock" @click="go('export')">
        Continue to Export<ArrowRight class="size-4" aria-hidden="true" />
      </Button>
      <Button v-else-if="complete" type="button" @click="editing = false">
        <Check class="size-4" aria-hidden="true" />Done
      </Button>
      <Button v-else type="button" :disabled="!canGenerate" @click="generate">
        <Sparkles class="size-4" aria-hidden="true" />{{ primaryLabel }}
      </Button>
    </template>
  </WizardStepFooter>
</template>

<style scoped>
.pop-enter-active {
  transition:
    transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 200ms ease-out;
}
.pop-leave-active {
  transition: opacity 120ms ease-in;
}
.pop-enter-from {
  transform: scale(0.4);
  opacity: 0;
}
.pop-leave-to {
  opacity: 0;
}
</style>
