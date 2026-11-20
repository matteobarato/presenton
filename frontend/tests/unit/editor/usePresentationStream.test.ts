/* eslint-disable vue/one-component-per-file -- each test mounts its own host */
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

const mocks = vi.hoisted(() => ({ stream: vi.fn(), warning: vi.fn(), error: vi.fn() }))
vi.mock('@/api/sse', () => ({ streamEvents: mocks.stream }))
vi.mock('@/api/presentations', async (importActual) => ({
  ...(await importActual<typeof import('@/api/presentations')>()),
  getPresentation: vi.fn(async () => ({ id: 'p1', slides: [] })),
}))
vi.mock('@/components/ui/sonner', () => ({ toast: { warning: mocks.warning, error: mocks.error } }))

import { usePresentationStream } from '@/composables/usePresentationStream'

describe('usePresentationStream', () => {
  it('toasts each distinct slide_assets warning once', async () => {
    setActivePinia(createPinia())
    mocks.stream.mockImplementation(async function* () {
      yield { type: 'slide_assets', warnings: [{ detail: 'quota' }] }
      yield { type: 'slide_assets', warnings: [{ detail: 'quota' }, { detail: 'timeout' }] }
      yield { type: 'complete', presentation: { id: 'p1', slides: [] } }
    })
    let status!: { value: string }
    const C = defineComponent({
      setup() {
        status = usePresentationStream(ref('p1'), ref(true)).status
        return () => null
      },
    })
    mount(C, { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } })
    await vi.waitFor(() => expect(status.value).toBe('done'))
    await flushPromises()
    expect(mocks.warning.mock.calls.map((c) => c[1].description)).toEqual(['quota', 'timeout'])
  })

  it('counts only the slides this stream delivers, not the ones already cached', async () => {
    setActivePinia(createPinia())
    const { getPresentation } = await import('@/api/presentations')
    const old = (i: number) => ({ id: `old${i}`, index: i, layout: 'l', content: { title: 'Old' } })
    vi.mocked(getPresentation).mockResolvedValueOnce({ id: 'p1', slides: [old(0), old(1), old(2)] } as never)
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    mocks.stream.mockImplementation(async function* () {
      yield { type: 'chunk', chunk: JSON.stringify({ id: 'n0', index: 0, layout: 'l', content: { title: 'New' } }) }
      yield { type: 'generation_metrics', output_tokens: 10 }
      await gate
      yield { type: 'complete', presentation: { id: 'p1', slides: [] } }
    })
    let received!: { value: ReadonlySet<number> }
    const C = defineComponent({
      setup() {
        received = usePresentationStream(ref('p1'), ref(true)).received
        return () => null
      },
    })
    mount(C, { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } })
    await vi.waitFor(() => expect([...received.value]).toEqual([0]))
    release()
    await flushPromises()
  })
})
