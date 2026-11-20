import { computed, getCurrentScope, onScopeDispose, ref, watch, type ComputedRef, type Ref } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import type { Presentation } from '@/api/types'
import { ApiError } from '@/api/errors'
import { ttsKeys } from '@/api/tts'
import type { DeckNarration } from '@/components/editor/inspector/narration/useDeckNarration'
import type { DeckAvatars } from '@/components/editor/inspector/video/useDeckAvatars'

export type PipelinePhase = 'idle' | 'notes' | 'voice' | 'avatars' | 'done' | 'error'
type WorkPhase = 'notes' | 'voice' | 'avatars'

const WORK: readonly string[] = ['notes', 'voice', 'avatars']
export const pipelineKey = (presentationId: string) => `slideshows.pipeline.${presentationId}`

const message = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Something went wrong')

function readStored(key: string): { phase: WorkPhase; startedAt: number } | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const v = JSON.parse(raw) as { phase?: unknown; startedAt?: unknown }
    if (typeof v.phase !== 'string' || !WORK.includes(v.phase)) return null
    return { phase: v.phase as WorkPhase, startedAt: typeof v.startedAt === 'number' ? v.startedAt : Date.now() }
  } catch {
    return null
  }
}

/**
 * The wizard's one-button narration: notes for slides without any, then the voice (TTS) for slides
 * whose audio is missing or stale, then the presenter avatars (HeyGen) for placeholder slides.
 * Client-orchestrated on top of the deck's own TTS and avatar tasks, which already resume after a
 * reload; a sessionStorage key remembers which phase the pipeline was in, so it can carry on to the
 * next one. A server task started elsewhere (the editor) is only followed, never chained.
 */
export function useNarrationAvatarPipeline(
  id: Ref<string>,
  presentation: Ref<Presentation>,
  narration: DeckNarration,
  avatars: DeckAvatars,
): {
  phase: Ref<PipelinePhase>
  failedPhase: Ref<WorkPhase | null>
  error: Ref<string | null>
  running: ComputedRef<boolean>
  plan: ComputedRef<{ notes: boolean; voice: boolean; avatars: number }>
  blocker: ComputedRef<string | null>
  start(): void
  retry(): void
} {
  const qc = useQueryClient()
  const key = () => pipelineKey(id.value)

  const phase = ref<PipelinePhase>('idle')
  const failedPhase = ref<WorkPhase | null>(null)
  const error = ref<string | null>(null)
  /**
   * The current phase's server task: true = started (or being followed), so the phase ends when it
   * stops running; 'armed' = a 409 said one is running but we don't see it yet, so follow it once it shows.
   */
  const waiting = ref<boolean | 'armed'>(false)
  let startedAt = 0
  /** Bumped by start/retry/dispose, so callbacks of an older run are ignored. */
  let run = 0
  /** A HeyGen run is never started twice within one pipeline run. */
  let avatarsStarted = false

  function persist(p: PipelinePhase) {
    try {
      if (WORK.includes(p)) sessionStorage.setItem(key(), JSON.stringify({ phase: p, startedAt }))
      else sessionStorage.removeItem(key())
    } catch {
      // Storage unavailable: the pipeline still runs, it just won't resume after a reload.
    }
  }
  function setPhase(p: PipelinePhase) {
    phase.value = p
    persist(p)
  }
  function fail(p: WorkPhase, e: unknown) {
    waiting.value = false
    failedPhase.value = p
    error.value = typeof e === 'string' ? e : message(e)
    setPhase('error')
  }

  const slides = computed(() => presentation.value.slides)
  const avatarsAvailable = computed(() => avatars.videos.value?.generation_available !== false)
  /** Placeholder slides without an avatar yet, or whose last generation failed. */
  const avatarsToMake = computed(() =>
    avatars.placeholderSlides.value.filter(
      (s) => avatars.planBySlide.value.get(s.id)?.state === 'failed' || !avatars.videoBySlide.value.get(s.id),
    ).length,
  )
  const needsNotes = computed(() => slides.value.some((s) => !(s.speaker_note ?? '').trim()))
  const needsVoice = computed(() => narration.counts.value.missing + narration.counts.value.stale > 0)

  const plan = computed(() => {
    const notes = needsNotes.value
    return {
      notes,
      voice: notes || needsVoice.value,
      avatars: avatarsAvailable.value ? avatarsToMake.value : 0,
    }
  })

  const running = computed(
    () =>
      WORK.includes(phase.value) ||
      narration.running.value ||
      avatars.running.value ||
      Boolean(narration.generateNotes.isPending.value) ||
      Boolean(narration.startTts.isPending.value) ||
      Boolean(avatars.generate.isPending.value),
  )

  const blocker = computed<string | null>(() => {
    const lang = narration.language.value
    const list = narration.languages.value
    if (!lang || (list?.length && !list.some((l) => l.code === lang))) return 'Choose a narration language first.'
    if (plan.value.avatars > 0 && !avatars.videos.value?.portrait) return 'Upload a presenter portrait first.'
    return null
  })

  function enter(p: WorkPhase, opts: { notesRan?: boolean } = {}) {
    const mine = run
    waiting.value = false
    if (p === 'notes') {
      if (!needsNotes.value) return enter('voice')
      setPhase('notes')
      narration.generateNotes.mutate(undefined, {
        onSuccess: () => {
          if (mine === run) enter('voice', { notesRan: true })
        },
        onError: (e) => {
          if (mine === run) fail('notes', e)
        },
      })
      return
    }
    if (p === 'voice') {
      if (!opts.notesRan && !needsVoice.value && !narration.running.value) return enter('avatars')
      setPhase('voice')
      // A TTS task is already going (started elsewhere): wait for it instead of starting another.
      if (narration.running.value) {
        waiting.value = true
        return
      }
      narration.startTts.mutate(
        {},
        {
          onSuccess: () => {
            if (mine === run) waiting.value = true
          },
          onError: (e) => {
            if (mine === run) fail('voice', e)
          },
        },
      )
      return
    }
    // Avatars
    if (avatars.running.value) {
      setPhase('avatars')
      waiting.value = true
      return
    }
    if (avatarsStarted || plan.value.avatars === 0) return setPhase('done')
    const indices = avatars.eligibleSlides.value.map((s) => s.index)
    if (!indices.length) return fail('avatars', 'Every placeholder slide needs up-to-date narration first.')
    setPhase('avatars')
    avatarsStarted = true
    avatars.pendingIndices.value = indices
    avatars.generate.mutate(false, {
      onSuccess: () => {
        if (mine === run) waiting.value = true
      },
      onError: (e) => {
        if (mine !== run) return
        // Another run is going: useDeckAvatars follows it, and so do we.
        if (e instanceof ApiError && e.status === 409) waiting.value = avatars.running.value ? true : 'armed'
        else fail('avatars', e)
      },
    })
  }

  async function afterVoice() {
    const mine = run
    // The TTS task's own refresh is fire-and-forget; the avatar step needs the new audio to pick its slides.
    await qc.refetchQueries({ queryKey: ttsKeys.status(id.value, narration.language.value) }).catch(() => undefined)
    if (mine === run && phase.value === 'voice') enter('avatars')
  }

  watch(
    [phase, waiting, narration.running, avatars.running],
    () => {
      if (phase.value === 'voice' && waiting.value === true && !narration.running.value) {
        waiting.value = false
        if (narration.taskError.value) fail('voice', narration.taskError.value)
        else void afterVoice()
      } else if (phase.value === 'avatars') {
        if (waiting.value === 'armed' && avatars.running.value) waiting.value = true
        else if (waiting.value === true && !avatars.running.value) {
          waiting.value = false
          if (avatars.taskError.value) fail('avatars', avatars.taskError.value)
          else setPhase('done')
        }
      }
    },
    { immediate: true },
  )

  function begin(from: WorkPhase) {
    run++
    failedPhase.value = null
    error.value = null
    avatarsStarted = false
    startedAt = Date.now()
    enter(from)
  }

  function start() {
    if (running.value || blocker.value) return
    begin('notes')
  }

  function retry() {
    const from = failedPhase.value
    if (!from || running.value || blocker.value) return
    begin(from)
  }

  // Resume after a reload: follow the stored phase's task, then carry on.
  const saved = readStored(key())
  if (saved) {
    startedAt = saved.startedAt
    if (saved.phase === 'notes') {
      // Notes are a plain request, not a task: if any are still empty, ask again.
      enter('notes')
    } else {
      phase.value = saved.phase
      if (saved.phase === 'avatars') avatarsStarted = true
      waiting.value = true
    }
  }

  if (getCurrentScope()) onScopeDispose(() => run++)

  return { phase, failedPhase, error, running, plan, blocker, start, retry }
}
