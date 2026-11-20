import { flushPromises, mount } from '@vue/test-utils'
import { focusManager, QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Presentation } from '@/api/types'

const api = vi.hoisted(() => ({ getPresentation: vi.fn(), stream: vi.fn(), generateAnimationsAsync: vi.fn(), getTask: vi.fn() }))
vi.mock('@/api/sse', () => ({ streamEvents: api.stream }))
vi.mock('@/api/tasks', () => ({ getTask: api.getTask }))
vi.mock('@/api/animations', async (orig) => ({
  ...(await orig<typeof import('@/api/animations')>()),
  generateAnimationsAsync: api.generateAnimationsAsync,
}))

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

let lastClient: QueryClient
const mounted: { unmount: () => void }[] = []
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

let lastRouter: ReturnType<typeof createRouter>
async function mountAt(path: string) {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'library', component: { template: '<div />' } },
      { path: '/p/:id', name: 'editor', component: EditorView },
      { path: '/p/:id/present', name: 'present', component: { template: '<div />' } },
      { path: '/p/:id/create/:step?', name: 'create', component: { template: '<div />' } },
    ],
  })
  lastRouter = router
  await router.push(path)
  lastClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = mount(EditorView, {
    global: {
      plugins: [router, [VueQueryPlugin, { queryClient: lastClient }]],
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
const animationFetches = () =>
  (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((c) => /\/presentation\/p1\/animations(\?|$)/.test(requestUrl(c[0]))).length
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
  api.generateAnimationsAsync.mockReset()
  api.generateAnimationsAsync.mockResolvedValue({ id: 'anim-task', status: 'pending' })
  api.getTask.mockReset()
  api.getTask.mockReturnValue(new Promise(() => {}))
  sessionStorage.clear()
})

describe('EditorView', () => {
  it('an empty deck opened without a stream redirects to the wizard outline step', async () => {
    api.getPresentation.mockResolvedValue({ ...deck(), slides: [] })
    await mountAt('/p/p1')
    expect(lastRouter.currentRoute.value.name).toBe('create')
    expect(lastRouter.currentRoute.value.params).toMatchObject({ id: 'p1', step: 'outline' })
  })

  it('a streaming empty deck stays in the editor', async () => {
    api.getPresentation.mockResolvedValue({ ...deck(), slides: [] })
    api.stream.mockImplementation(async function* () {
      await new Promise<void>(() => {})
    })
    await mountAt('/p/p1?stream=1')
    expect(lastRouter.currentRoute.value.name).toBe('editor')
  })

  it('a deck with slides stays in the editor', async () => {
    await mountAt('/p/p1')
    expect(lastRouter.currentRoute.value.name).toBe('editor')
  })

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

  it('keeps the selection at the same position when the active slide is re-ided by a refetch', async () => {
    await mountAt('/p/p1')
    const editor = useEditorStore()
    editor.select('b')
    await flushPromises()
    const edited = deck()
    edited.slides[1] = { ...edited.slides[1]!, id: 'b2' }
    api.getPresentation.mockResolvedValue(edited)
    await lastClient.invalidateQueries({ queryKey: ['presentation', 'p1'] })
    await flushPromises()
    expect(editor.activeSlideId).toBe('b2')
  })

  it('falls back to the last slide when the active one vanishes from the end', async () => {
    await mountAt('/p/p1')
    const editor = useEditorStore()
    editor.select('c')
    await flushPromises()
    const shorter = deck()
    shorter.slides = shorter.slides.slice(0, 2)
    api.getPresentation.mockResolvedValue(shorter)
    await lastClient.invalidateQueries({ queryKey: ['presentation', 'p1'] })
    await flushPromises()
    expect(editor.activeSlideId).toBe('b')
  })

  it('ArrowDown selects the next slide', async () => {
    const w = await mountAt('/p/p1')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await flushPromises()
    expect(useEditorStore().activeSlideId).toBe('b')
    const canvas = w.findAllComponents(SlideView).filter((v) => !v.props('lazy'))
    expect(canvas[0]!.props('slide').id).toBe('b')
  })

  it('slide navigation keys yield while an on-slide element is selected', async () => {
    await mountAt('/p/p1')
    const editor = useEditorStore()
    editor.slideSelectionActive = true
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await flushPromises()
    expect(editor.activeSlideId).toBe('a')
    editor.slideSelectionActive = false
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await flushPromises()
    expect(editor.activeSlideId).toBe('b')
  })

  it('builds the inspector tabs from inspectorTabs', async () => {
    const w = await mountAt('/p/p1')
    const tabs = w.findAll('[role="tablist"][aria-label="Inspector sections"] [role="tab"]')
    expect(tabs.map((t) => t.attributes('title'))).toEqual(inspectorTabs.map((t) => t.label))
  })

  it('Ask AI opens its own panel beside the inspector, and Ctrl+K toggles it', async () => {
    const w = await mountAt('/p/p1')
    expect(w.get('#ask-ai-panel').attributes('data-state')).toBe('closed')
    expect(w.findAll('[role="tab"]').map((t) => t.attributes('title'))).not.toContain('Chat')
    await w.get('[data-ask-button]').trigger('click')
    await flushPromises()
    const panel = w.get('#ask-ai-panel')
    expect(panel.attributes('data-state')).toBe('open')
    expect(w.get('aside[aria-label="Inspector"]').element.contains(panel.element)).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    await flushPromises()
    expect(useEditorStore().chatOpen).toBe(false)
    expect(w.get('#ask-ai-panel').attributes('data-state')).toBe('closed')
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

  describe('motion after generation', () => {
    const completes = () =>
      api.stream.mockImplementation(async function* () {
        yield { type: 'complete', presentation: deck() }
      })

    it('plans the deck motion once when a deck created with animate finishes generating', async () => {
      sessionStorage.setItem('slideshows.animate.p1', '1')
      completes()
      const w = await mountAt('/p/p1?stream=1')
      await flushPromises()
      expect(api.generateAnimationsAsync).toHaveBeenCalledTimes(1)
      expect(api.generateAnimationsAsync).toHaveBeenCalledWith('p1', {})
      expect(sessionStorage.getItem('slideshows.animate.p1')).toBeNull()
      expect(w.find('[aria-label="Deck motion planning"]').exists()).toBe(true)
      await flushPromises()
      expect(api.generateAnimationsAsync).toHaveBeenCalledTimes(1)
    })

    it('does not plan motion without the flag', async () => {
      completes()
      await mountAt('/p/p1?stream=1')
      await flushPromises()
      expect(api.generateAnimationsAsync).not.toHaveBeenCalled()
    })

    it('does not plan motion before generation finishes, nor when it fails', async () => {
      sessionStorage.setItem('slideshows.animate.p1', '1')
      api.stream.mockImplementation(async function* () {
        yield { type: 'generation_metrics', model: 'm' }
        await new Promise<void>(() => {})
      })
      await mountAt('/p/p1?stream=1')
      await flushPromises()
      expect(api.generateAnimationsAsync).not.toHaveBeenCalled()
      expect(sessionStorage.getItem('slideshows.animate.p1')).toBe('1')
    })

    it('does not read the deck motion while the deck streams in, and reads it once the stream is done', async () => {
      let release!: () => void
      api.stream.mockImplementation(async function* () {
        yield { type: 'generation_metrics', model: 'm' }
        await new Promise<void>((r) => (release = r))
        yield { type: 'complete', presentation: deck() }
      })
      await mountAt('/p/p1?stream=1')
      await flushPromises()
      expect(animationFetches()).toBe(0)
      const spy = vi.spyOn(lastClient, 'invalidateQueries')
      release()
      await flushPromises()
      // Done: whatever another reader cached mid-stream is stale, and the read runs.
      expect(spy).toHaveBeenCalledWith({ queryKey: ['animations', 'p1'] })
      await vi.waitFor(() => expect(animationFetches()).toBeGreaterThan(0))
    })

    it('reads the deck motion at once when opening a deck without a stream', async () => {
      await mountAt('/p/p1')
      await vi.waitFor(() => expect(animationFetches()).toBeGreaterThan(0))
    })

    it('does not plan motion when opening a deck without a stream', async () => {
      sessionStorage.setItem('slideshows.animate.p1', '1')
      await mountAt('/p/p1')
      await flushPromises()
      expect(api.generateAnimationsAsync).not.toHaveBeenCalled()
    })
  })
})
