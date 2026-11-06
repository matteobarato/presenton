import { computed, getCurrentScope, onScopeDispose, ref, watch, type ComputedRef, type Ref } from 'vue'
import { ApiError, extractApiErrorMessage } from '@/api/errors'
import { getTask, type AsyncTask } from '@/api/tasks'

type TaskStatus = 'idle' | 'pending' | 'completed' | 'error'

/** 1s, 2s, 3s, then every 5s. */
const DELAYS = [1000, 2000, 3000]
const STEADY_DELAY = 5000

export function useAsyncTask(
  taskId: Ref<string | null>,
  opts: { storageKey?: string; onDone?: (t: AsyncTask) => void } = {},
): {
  task: Ref<AsyncTask | null>
  status: ComputedRef<TaskStatus>
  error: ComputedRef<string | null>
  start(id: string): void
  clear(): void
} {
  const { storageKey, onDone } = opts
  const task = ref<AsyncTask | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0

  function persist(id: string | null) {
    if (!storageKey) return
    if (id) sessionStorage.setItem(storageKey, id)
    else sessionStorage.removeItem(storageKey)
  }

  function stop() {
    generation++
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  function clear() {
    taskId.value = null
  }

  function start(id: string) {
    task.value = null
    taskId.value = id
  }

  async function poll(id: string, run: number, attempt: number) {
    let next = true
    try {
      const t = await getTask(id)
      if (run !== generation) return
      task.value = t
      if (t.status === 'completed' || t.status === 'error') {
        next = false
        if (t.status === 'completed') onDone?.(t)
      }
    } catch (e) {
      if (run !== generation) return
      if (e instanceof ApiError && e.status === 404) {
        clear()
        return
      }
      // Transient failure (backend restarting, network): keep polling.
    }
    if (next && run === generation) {
      const delay = DELAYS[attempt] ?? STEADY_DELAY
      timer = setTimeout(() => void poll(id, run, attempt + 1), delay)
    }
  }

  if (!taskId.value && storageKey) {
    const saved = sessionStorage.getItem(storageKey)
    if (saved) taskId.value = saved
  }

  watch(
    taskId,
    (id) => {
      stop()
      persist(id)
      if (!id) {
        task.value = null
        return
      }
      const run = generation
      timer = setTimeout(() => void poll(id, run, 0), 0)
    },
    { immediate: true, flush: 'sync' },
  )

  if (getCurrentScope()) onScopeDispose(stop)

  const status = computed<TaskStatus>(() => {
    if (task.value?.status === 'completed') return 'completed'
    if (task.value?.status === 'error') return 'error'
    return taskId.value ? 'pending' : 'idle'
  })

  const error = computed<string | null>(() => {
    const t = task.value
    if (t?.status !== 'error') return null
    return extractApiErrorMessage(t.error, t.message || 'The task failed')
  })

  return { task, status, error, start, clear }
}
