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
})
