import { flushPromises, mount } from '@vue/test-utils'
import { focusManager, QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const mounted: { unmount: () => void }[] = []
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

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
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

// openapi-fetch calls fetch(Request), so read the URL from either form.
const requestUrl = (input: unknown) => (input instanceof Request ? input.url : String(input))
const isPresentationUrl =(url: string) => /\/api\/v1\/ppt\/presentation\/p1(\?|$)/.test(url)
const presentationFetches = () =>
  (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((c) => isPresentationUrl(requestUrl(c[0]))).length

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      // Only the presentation endpoint returns the deck; other tabs' requests (themes…) get an empty list.
      const body = isPresentationUrl(requestUrl(input)) ? await api.getPresentation() : []
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
    }),
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

  it('disables structural edits while generating', async () => {
    api.stream.mockImplementation(async function* () {
      yield { type: 'generation_metrics', model: 'm' }
      await new Promise<void>(() => {})
    })
    const w = await mountAt('/p/p1?stream=1')
    const add = w.findAll('button').find((b) => b.text().includes('Add slide'))!
    expect(add.attributes('disabled')).toBeDefined()
    expect(w.find('button[aria-label="Delete slide 1"]').exists()).toBe(false)
    const calls = presentationFetches()
    await w.get('[data-slide-key="a"]').trigger('keydown', { key: 'Delete' })
    await flushPromises()
    expect(presentationFetches()).toBe(calls)
    expect(w.get('input[aria-label="Presentation title"]').attributes('disabled')).toBeDefined()
  })

  it('refetches on window focus normally, but not while generating', async () => {
    const first = await mountAt('/p/p1')
    let before = presentationFetches()
    focusManager.setFocused(false)
    focusManager.setFocused(true)
    await flushPromises()
    expect(presentationFetches()).toBeGreaterThan(before)
    first.unmount()

    api.stream.mockImplementation(async function* () {
      await new Promise<void>(() => {})
    })
    await mountAt('/p/p1?stream=1')
    await new Promise((r) => setTimeout(r, 50)) // let the stream's own initial load settle
    before = presentationFetches()
    focusManager.setFocused(false)
    focusManager.setFocused(true)
    await flushPromises()
    expect(presentationFetches()).toBe(before)
  })
})
