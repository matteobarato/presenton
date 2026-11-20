import { computed, hasInjectionContext, inject, provide, ref, watch, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { animationKeys, generateAnimationsAsync } from '@/api/animations'
import { ApiError } from '@/api/errors'
import type { AsyncTask } from '@/api/types'
import { useAsyncTask } from '@/composables/useAsyncTask'
import { toast } from '@/components/ui/sonner'

export interface DeckAnimationRun {
  /** A deck-wide planning task is in flight. */
  running: ComputedRef<boolean>
  /** Why the last run could not start or failed; shown until dismissed or the next run. */
  error: Ref<string | null>
  /** Starts a deck run (`generateAnimationsAsync` unless `starter` is given) and tracks it. */
  run(starter?: () => Promise<AsyncTask>): Promise<void>
  dismiss(): void
}

const storageKey = (id: string) => `slideshows.task.animations.${id}`

/** The pending run's id from a 409 `{ detail: { task_id } }`, else null. */
function runningTaskId(e: unknown): string | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null
  const detail = (e.body as { detail?: { task_id?: unknown } } | null)?.detail
  return typeof detail?.task_id === 'string' ? detail.task_id : null
}

/**
 * The one deck-wide animation planning run ("Generate for all slides", or the run after a generation
 * created with `animate`). It resumes after a reload, refreshes `animationKeys.one` when it ends, and
 * forgets the stored task once it ends, so a failure is reported once and never comes back.
 */
export function createDeckAnimationRun(presentationId: Ref<string>): DeckAnimationRun {
  const queryClient = useQueryClient()
  const taskId = ref<string | null>(null)
  const error = ref<string | null>(null)
  // The deck the tracked task belongs to; the route id may move on before it ends.
  let owner = presentationId.value
  const { status, error: taskError, start, clear } = useAsyncTask(taskId)

  function read(id: string): string | null {
    try {
      return id ? sessionStorage.getItem(storageKey(id)) : null
    } catch {
      return null
    }
  }
  function persist(id: string | null) {
    if (!owner) return
    try {
      if (id) sessionStorage.setItem(storageKey(owner), id)
      else sessionStorage.removeItem(storageKey(owner))
    } catch {
      // Storage unavailable: the run is simply not resumed after a reload.
    }
  }

  watch(
    presentationId,
    (id) => {
      owner = id
      error.value = null
      taskId.value = read(id)
    },
    { immediate: true, flush: 'sync' },
  )
  watch(taskId, persist, { flush: 'sync' })

  watch(status, (now, before) => {
    if (before !== 'pending' || now === 'pending') return
    void queryClient.invalidateQueries({ queryKey: animationKeys.one(owner) })
    if (now === 'error') {
      // Kept apart from the task: clearing it below would drop the message before anyone saw it.
      error.value = taskError.value
      toast.error('Motion planning failed', { description: taskError.value ?? undefined })
    }
    if (now !== 'idle') clear()
  })

  async function run(starter?: () => Promise<AsyncTask>) {
    error.value = null
    const id = presentationId.value
    try {
      const task = await (starter ? starter() : generateAnimationsAsync(id, {}))
      if (presentationId.value === id) start(task.id)
    } catch (e) {
      // A run for this deck is already pending (POST /animations/async answers 409): follow that one.
      const pendingId = runningTaskId(e)
      if (pendingId) {
        if (presentationId.value === id) start(pendingId)
        return
      }
      error.value = e instanceof Error && e.message ? e.message : 'Could not start planning the deck.'
    }
  }

  return {
    running: computed(() => status.value === 'pending'),
    error,
    run,
    dismiss: () => (error.value = null),
  }
}

const KEY: InjectionKey<DeckAnimationRun> = Symbol('deck-animation-run')

/** Builds the deck's run and provides it to descendants (the editor does this once). */
export function provideDeckAnimationRun(presentationId: Ref<string>): DeckAnimationRun {
  const run = createDeckAnimationRun(presentationId)
  provide(KEY, run)
  return run
}

/** The editor's shared run; outside a provider (tests, standalone use) a local one. */
export function useDeckAnimationRun(presentationId: Ref<string>): DeckAnimationRun {
  return (hasInjectionContext() ? inject(KEY, null) : null) ?? createDeckAnimationRun(presentationId)
}
