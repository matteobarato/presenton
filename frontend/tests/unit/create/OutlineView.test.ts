import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ref } from 'vue'
import draggable from 'vuedraggable'
import OutlineView from '@/views/OutlineView.vue'

const mocks = vi.hoisted(() => ({
  saveOutline: vi.fn(),
  preparePresentation: vi.fn(),
  getTemplate: vi.fn(),
  listTemplates: vi.fn(),
  stream: null as unknown,
}))
vi.mock('@/api/outlines', async (importActual) => ({
  ...(await importActual<typeof import('@/api/outlines')>()),
  saveOutline: mocks.saveOutline,
  preparePresentation: mocks.preparePresentation,
  getTemplate: mocks.getTemplate,
}))
vi.mock('@/api/templates', () => ({ listTemplates: mocks.listTemplates }))
vi.mock('@/composables/useOutlineStream', () => ({
  useOutlineStream: () => mocks.stream,
}))
vi.mock('@/render/SlideView.vue', () => ({
  default: {
    props: ['slide'],
    template: '<div data-testid="slide-view" :data-slide="slide.id" />',
  },
}))

const layout = (n: number) => ({ id: `l${n}` })

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/new/:id/outline', name: 'outline', component: OutlineView },
      { path: '/p/:id', name: 'editor', component: { template: '<div />' } },
    ],
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  await router.push('/new/p1/outline')
  await router.isReady()
  const wrapper = mount(OutlineView, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient }]] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

const contents = (w: VueWrapper) => w.findAll('textarea').map((t) => (t.element as HTMLTextAreaElement).value)

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mocks.saveOutline.mockReset().mockResolvedValue(undefined)
  mocks.preparePresentation.mockReset().mockResolvedValue({})
  mocks.getTemplate.mockReset().mockResolvedValue({
    layouts: [layout(1), layout(2), layout(3), layout(4)],
  })
  mocks.listTemplates.mockReset().mockResolvedValue([
    {
      id: 'modern',
      name: 'Modern',
      layouts: [layout(1), layout(2), layout(3), layout(4), layout(5)],
    },
    { id: 'custom-1', name: 'Mine', layouts: Array.from({ length: 4 }) },
  ])
  mocks.stream = {
    items: ref([{ content: 'A' }, { content: 'B' }, { content: 'C' }]),
    status: ref('Outline ready'),
    streaming: ref(false),
    error: ref(null),
    abort: vi.fn(),
  }
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('OutlineView', () => {
  it('edits items and saves once, debounced by 500ms', async () => {
    const { wrapper } = await mountView()
    const first = wrapper.findAll('textarea')[0]!
    await first.setValue('A1')
    await first.setValue('A12')
    await vi.advanceTimersByTimeAsync(400)
    expect(mocks.saveOutline).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(150)
    expect(mocks.saveOutline).toHaveBeenCalledTimes(1)
    expect(mocks.saveOutline).toHaveBeenCalledWith('p1', [{ content: 'A12' }, { content: 'B' }, { content: 'C' }])
  })

  it('does not save when nothing was edited', async () => {
    await mountView()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(mocks.saveOutline).not.toHaveBeenCalled()
  })

  it('reorders with Alt+ArrowDown and Alt+ArrowUp', async () => {
    const { wrapper } = await mountView()
    await wrapper.findAll('textarea')[0]!.trigger('keydown', { key: 'ArrowDown', altKey: true })
    await flushPromises()
    expect(contents(wrapper)).toEqual(['B', 'A', 'C'])
    await wrapper.findAll('textarea')[2]!.trigger('keydown', { key: 'ArrowUp', altKey: true })
    await flushPromises()
    expect(contents(wrapper)).toEqual(['B', 'C', 'A'])
    await vi.advanceTimersByTimeAsync(600)
    expect(mocks.saveOutline).toHaveBeenLastCalledWith('p1', [{ content: 'B' }, { content: 'C' }, { content: 'A' }])
  })

  it('ignores arrows without Alt and does not move past the ends', async () => {
    const { wrapper } = await mountView()
    await wrapper.findAll('textarea')[0]!.trigger('keydown', { key: 'ArrowUp', altKey: true })
    await wrapper.findAll('textarea')[2]!.trigger('keydown', { key: 'ArrowDown' })
    expect(contents(wrapper)).toEqual(['A', 'B', 'C'])
  })

  it('reorders by drag', async () => {
    const { wrapper } = await mountView()
    wrapper
      .getComponent(draggable)
      .vm.$emit('update:modelValue', [{ content: 'C' }, { content: 'A' }, { content: 'B' }])
    await flushPromises()
    expect(contents(wrapper)).toEqual(['C', 'A', 'B'])
  })

  it('adds and deletes items', async () => {
    const { wrapper } = await mountView()
    await wrapper.get('button[aria-label="Delete slide 2"]').trigger('click')
    expect(contents(wrapper)).toEqual(['A', 'C'])
    const add = wrapper.findAll('button').find((b) => b.text().includes('Add slide'))!
    await add.trigger('click')
    expect(contents(wrapper)).toEqual(['A', 'C', ''])
  })

  it('shows the first 3 layouts of each template, loading custom ones lazily', async () => {
    const { wrapper } = await mountView()
    expect(mocks.getTemplate).toHaveBeenCalledTimes(1)
    expect(mocks.getTemplate).toHaveBeenCalledWith('custom-1')
    expect(wrapper.get('[data-testid="template-modern"]').findAll('[data-testid="slide-view"]')).toHaveLength(3)
    expect(wrapper.get('[data-testid="template-custom-1"]').findAll('[data-testid="slide-view"]')).toHaveLength(3)
  })

  it('disables Generate until a template is chosen, then prepares and routes', async () => {
    const { wrapper, router } = await mountView()
    const generate = () => wrapper.findAll('button').find((b) => /Generate|Select a template/.test(b.text()))!
    expect(generate().attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="template-modern"]').trigger('click')
    expect(generate().attributes('disabled')).toBeUndefined()
    await generate().trigger('click')
    await flushPromises()
    expect(mocks.preparePresentation).toHaveBeenCalledWith({
      presentation_id: 'p1',
      outlines: [{ content: 'A' }, { content: 'B' }, { content: 'C' }],
      layout: 'modern',
    })
    expect(router.currentRoute.value.fullPath).toBe('/p/p1?stream=1')
  })

  it('keeps Generate disabled while streaming and locks editing', async () => {
    ;(mocks.stream as { streaming: { value: boolean } }).streaming.value = true
    const { wrapper } = await mountView()
    await wrapper.get('[data-testid="template-modern"]').trigger('click')
    const generate = wrapper.findAll('button').find((b) => /Generate/.test(b.text()))!
    expect(generate.attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('textarea')[0]!.attributes('disabled')).toBeDefined()
  })
})
