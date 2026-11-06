import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useAsyncTask } from '@/composables/useAsyncTask'

const task = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 't1', type: 'x', status, created_at: '', updated_at: '', ...extra,
})
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('useAsyncTask', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('polls until completed and calls onDone', async () => {
    const onDone = vi.fn()
    fetchMock
      .mockResolvedValueOnce(json(task('pending')))
      .mockResolvedValueOnce(json(task('pending')))
      .mockResolvedValueOnce(json(task('completed', { data: { ok: true } })))
    const scope = effectScope()
    const t = scope.run(() => useAsyncTask(ref<string | null>(null), { storageKey: 'k', onDone }))!
    t.start('t1')
    expect(t.status.value).toBe('pending')
    expect(sessionStorage.getItem('k')).toBe('t1')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(t.status.value).toBe('completed')
    expect(onDone).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    scope.stop()
  })

  it('slows to 5s after the third wait', async () => {
    fetchMock.mockImplementation(async () => json(task('pending')))
    const scope = effectScope()
    const t = scope.run(() => useAsyncTask(ref<string | null>(null)))!
    t.start('t1')
    await vi.advanceTimersByTimeAsync(0) // poll 1
    await vi.advanceTimersByTimeAsync(1000) // poll 2
    await vi.advanceTimersByTimeAsync(2000) // poll 3
    await vi.advanceTimersByTimeAsync(3000) // poll 4
    expect(fetchMock).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(4999)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(5)
    scope.stop()
  })

  it('error status exposes message', async () => {
    fetchMock.mockResolvedValue(json(task('error', { message: 'TTS failed', error: { detail: 'quota' } })))
    const scope = effectScope()
    const t = scope.run(() => useAsyncTask(ref<string | null>(null)))!
    t.start('t1')
    await vi.advanceTimersByTimeAsync(0)
    expect(t.status.value).toBe('error')
    expect(t.error.value).toBe('quota')
    scope.stop()
  })

  it('resumes and clears unknown task', async () => {
    sessionStorage.setItem('k', 'stale')
    fetchMock.mockResolvedValue(json({ detail: 'Task not found' }, 404))
    const taskId = ref<string | null>(null)
    const scope = effectScope()
    const t = scope.run(() => useAsyncTask(taskId, { storageKey: 'k' }))!
    expect(taskId.value).toBe('stale')
    await vi.advanceTimersByTimeAsync(0)
    expect(taskId.value).toBeNull()
    expect(sessionStorage.getItem('k')).toBeNull()
    expect(t.status.value).toBe('idle')
    scope.stop()
  })

  it('keeps polling through transient network errors', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('down')).mockResolvedValueOnce(json(task('completed')))
    const scope = effectScope()
    const t = scope.run(() => useAsyncTask(ref<string | null>(null)))!
    t.start('t1')
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(t.status.value).toBe('completed')
    scope.stop()
  })
})
