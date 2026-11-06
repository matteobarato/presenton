import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Presentation } from '@/api/types'

const api = vi.hoisted(() => ({ getPresentation: vi.fn(), stream: vi.fn() }))
vi.mock('@/api/sse', () => ({ streamEvents: api.stream }))

import EditorView from '@/views/EditorView.vue'
import SlideView from '@/render/SlideView.vue'
import { inspectorTabs } from '@/components/editor/inspector/tabs'
import { useEditorStore } from '@/stores/editor'

const slide = (id: string, index: number) => ({
  id,
  index,
  presentation: 'p1',
  layout: 'smart-html',
  layout_group: 'smart-html',
  content: {},
  html_content: `<p>${id}</p>`,
  properties: null,
})
const deck = () => ({ id: 'p1', title: 'Deck', theme: null, slides: [slide('a', 0), slide('b', 1), slide('c', 2)] }) as unknown as Presentation

async function mountAt(path: string) {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'library', component: { template: '<div />' } },
      { path: '/p/:id', name: 'editor', component: EditorView },
      { path: '/p/:id/present', name: 'present', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  const wrapper = mount(EditorView, {
    global: {
      plugins: [router, [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]],
      stubs: { SlideView: true },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(await api.getPresentation()), { headers: { 'content-type': 'application/json' } })),
  )
  api.getPresentation.mockReset()
  api.getPresentation.mockResolvedValue(deck())
  api.stream.mockReset()
})

describe('EditorView', () => {
  it('renders lazy navigator thumbnails and the active slide on the canvas', async () => {
    const w = await mountAt('/p/p1')
    const views = w.findAllComponents(SlideView)
    const thumbs = views.filter((v) => v.props('lazy'))
    expect(thumbs).toHaveLength(3)
    const canvas = views.filter((v) => !v.props('lazy'))
    expect(canvas).toHaveLength(1)
    expect(canvas[0]!.props('slide').id).toBe('a')
    expect(w.get('[data-testid="slide-position"]').text()).toBe('Slide 1 of 3')
  })

  it('ArrowDown selects the next slide', async () => {
    const w = await mountAt('/p/p1')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await flushPromises()
    expect(useEditorStore().activeSlideId).toBe('b')
    const canvas = w.findAllComponents(SlideView).filter((v) => !v.props('lazy'))
    expect(canvas[0]!.props('slide').id).toBe('b')
  })

  it('builds the inspector tabs from inspectorTabs', async () => {
    const w = await mountAt('/p/p1')
    const tabs = w.findAll('[role="tab"]')
    expect(tabs.map((t) => t.attributes('title'))).toEqual(inspectorTabs.map((t) => t.label))
  })

  it('?stream=1 starts the stream and shows the generation metrics', async () => {
    api.getPresentation.mockResolvedValue({ ...deck(), slides: [] })
    let release!: () => void
    api.stream.mockImplementation(async function* () {
      yield { type: 'generation_metrics', model: 'test-model', output_tokens: 42, total_tokens: 50 }
      await new Promise<void>((r) => (release = r))
    })
    const w = await mountAt('/p/p1?stream=1')
    expect(api.stream).toHaveBeenCalledWith('/api/v1/ppt/presentation/stream/p1', expect.anything())
    const metrics = w.get('[data-testid="generation-metrics"]')
    expect(metrics.text()).toContain('test-model')
    expect(metrics.text()).toContain('42 output tokens')
    release()
  })
})
