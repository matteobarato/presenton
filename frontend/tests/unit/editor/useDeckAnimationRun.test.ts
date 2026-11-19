import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { useDeckAnimationRun, type DeckAnimationRun } from '@/composables/useDeckAnimationRun'

const m = vi.hoisted(() => ({ getTask: vi.fn(), generateAnimationsAsync: vi.fn() }))
vi.mock('@/api/tasks', () => ({ getTask: m.getTask }))
vi.mock('@/api/animations', async (orig) => ({
  ...(await orig<typeof import('@/api/animations')>()),
  generateAnimationsAsync: m.generateAnimationsAsync,
}))
vi.mock('@/components/ui/sonner', () => ({ toast: { error: vi.fn() } }))

const KEY = 'presenton.task.animations.p1'

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const spy = vi.spyOn(queryClient, 'invalidateQueries')
  let run!: DeckAnimationRun
  const w = mount(
    defineComponent({
      setup() {
        run = useDeckAnimationRun(ref('p1'))
        return () => h('div')
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  )
  return { run, spy, w }
}

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  sessionStorage.clear()
})

describe('useDeckAnimationRun', () => {
  it('starts the deck run, tracks it and refreshes the plans when it completes', async () => {
    m.generateAnimationsAsync.mockResolvedValue({ id: 't1', status: 'pending' })
    let finish!: (v: unknown) => void
    m.getTask.mockReturnValue(new Promise((r) => (finish = r)))
    const { run, spy } = setup()
    await run.run()
    await flushPromises()
    expect(m.generateAnimationsAsync).toHaveBeenCalledWith('p1', {})
    expect(run.running.value).toBe(true)
    expect(sessionStorage.getItem(KEY)).toBe('t1')
    finish({ id: 't1', status: 'completed' })
    await flushPromises()
    expect(spy).toHaveBeenCalledWith({ queryKey: ['animations', 'p1'] })
    expect(run.running.value).toBe(false)
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('a failed run shows its error once: it stays in view but is dropped from storage', async () => {
    sessionStorage.setItem(KEY, 't9')
    m.getTask.mockResolvedValue({ id: 't9', status: 'error', message: 'LLM down' })
    const { run, spy } = setup()
    await vi.waitFor(() => expect(run.error.value).toBe('LLM down'))
    expect(spy).toHaveBeenCalledWith({ queryKey: ['animations', 'p1'] })
    expect(run.running.value).toBe(false)
    expect(sessionStorage.getItem(KEY)).toBeNull()
    run.dismiss()
    expect(run.error.value).toBeNull()
  })

  it('reports a failure to start', async () => {
    m.generateAnimationsAsync.mockRejectedValue(new Error('Busy'))
    const { run } = setup()
    await run.run()
    expect(run.error.value).toBe('Busy')
    expect(run.running.value).toBe(false)
  })
})
