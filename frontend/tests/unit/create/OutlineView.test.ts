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
  listThemes: vi.fn(),
  updatePresentation: vi.fn(),
  toastError: vi.fn(),
  stream: null as unknown,
}))
vi.mock('@/api/outlines', async (importActual) => ({
  ...(await importActual<typeof import('@/api/outlines')>()),
  saveOutline: mocks.saveOutline,
  preparePresentation: mocks.preparePresentation,
  getTemplate: mocks.getTemplate,
}))
vi.mock('@/api/templates', () => ({ listTemplates: mocks.listTemplates }))
vi.mock('@/api/themes', async (orig) => ({ ...(await orig<typeof import('@/api/themes')>()), listThemes: mocks.listThemes }))
vi.mock('@/api/presentations', async (orig) => ({ ...(await orig<typeof import('@/api/presentations')>()), updatePresentation: mocks.updatePresentation }))
vi.mock('@/components/ui/sonner', () => ({ toast: { error: mocks.toastError } }))
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

async function mountView(path = '/new/p1/outline') {
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
  await router.push(path)
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
  mocks.listThemes.mockReset().mockResolvedValue([{ id: 't1', name: 'Ocean', user: 'u', data: { colors: {} } }])
  mocks.updatePresentation.mockReset().mockResolvedValue({})
  mocks.toastError.mockReset()
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
    retry: vi.fn(),
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

  it('flushes the pending save on unmount instead of dropping it', async () => {
    const { wrapper } = await mountView()
    await wrapper.findAll('textarea')[0]!.setValue('A!')
    expect(mocks.saveOutline).not.toHaveBeenCalled()
    wrapper.unmount()
    expect(mocks.saveOutline).toHaveBeenCalledTimes(1)
    expect(mocks.saveOutline).toHaveBeenCalledWith('p1', [{ content: 'A!' }, { content: 'B' }, { content: 'C' }])
  })

  it('shows a Retry button for a load error', async () => {
    ;(mocks.stream as { error: { value: string | null } }).error.value = 'Bad gateway'
    const { wrapper } = await mountView()
    const retry = wrapper.findAll('button').find((b) => b.text() === 'Retry')!
    await retry.trigger('click')
    expect((mocks.stream as { retry: ReturnType<typeof vi.fn> }).retry).toHaveBeenCalledTimes(1)
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

  it('shows a template chosen on the New page as a summary, with the picker behind Change', async () => {
    const { wrapper } = await mountView('/new/p1/outline?template=modern')
    expect(wrapper.get('[data-testid="chosen-template"]').text()).toContain('Modern')
    expect(wrapper.find('[data-testid="template-modern"]').exists()).toBe(false)
    await wrapper.get('[data-testid="chosen-template"] button').trigger('click')
    expect(wrapper.get('[data-testid="template-modern"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.findAll('button').some((b) => b.text().includes('Generate presentation'))).toBe(true)
  })

  it('ignores an unknown ?template', async () => {
    const { wrapper } = await mountView('/new/p1/outline?template=nope')
    expect(wrapper.get('[data-testid="template-modern"]').attributes('aria-checked')).toBe('false')
    expect(wrapper.get('[data-testid="template-custom-1"]').attributes('aria-checked')).toBe('false')
    expect(wrapper.findAll('button').some((b) => b.text().includes('Select a template'))).toBe(true)
  })

  it('changing the selection updates the query and generates with it', async () => {
    const { wrapper, router } = await mountView('/new/p1/outline?template=modern')
    await wrapper.get('[data-testid="chosen-template"] button').trigger('click')
    await wrapper.get('[data-testid="template-custom-1"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.template).toBe('custom-1')
    await wrapper.findAll('button').find((b) => b.text().includes('Generate presentation'))!.trigger('click')
    await flushPromises()
    expect(mocks.preparePresentation).toHaveBeenCalledWith(expect.objectContaining({ layout: 'custom-1' }))
  })

  it('renders each slide as markdown and shows the source while editing', async () => {
    mocks.stream = { ...(mocks.stream as object), items: ref([{ content: '# Intro\n- **One**\n- Two' }]) }
    const { wrapper } = await mountView()
    const preview = wrapper.get('[data-testid="outline-preview"]')
    expect(preview.find('h1').text()).toBe('Intro')
    expect(preview.findAll('li').map((l) => l.text())).toEqual(['One', 'Two'])
    expect(preview.find('strong').exists()).toBe(true)
    await wrapper.get('textarea').trigger('focus')
    expect(preview.isVisible()).toBe(false)
    await wrapper.get('textarea').trigger('blur')
    expect(preview.isVisible()).toBe(true)
  })

  it('shows the progress card while the outline streams', async () => {
    ;(mocks.stream as { streaming: { value: boolean } }).streaming.value = true
    const { wrapper } = await mountView()
    expect(wrapper.get('[role="progressbar"]').attributes('aria-label')).toBe('Outline progress')
    expect(wrapper.text()).toContain('3 slides drafted')
  })

  it('keeps Generate disabled while streaming and locks editing', async () => {
    ;(mocks.stream as { streaming: { value: boolean } }).streaming.value = true
    const { wrapper } = await mountView()
    await wrapper.get('[data-testid="template-modern"]').trigger('click')
    const generate = wrapper.findAll('button').find((b) => /Generate/.test(b.text()))!
    expect(generate.attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('textarea')[0]!.attributes('disabled')).toBeDefined()
  })

  describe('theme', () => {
    const clickGenerate = async (w: VueWrapper) => {
      await w.findAll('button').find((b) => b.text().includes('Generate presentation'))!.trigger('click')
      await flushPromises()
    }

    it('applies the chosen theme after prepare, then opens the editor', async () => {
      const { wrapper, router } = await mountView('/new/p1/outline?template=modern&theme=t1')
      await clickGenerate(wrapper)
      expect(mocks.updatePresentation).toHaveBeenCalledWith({ id: 'p1', theme: expect.objectContaining({ id: 't1' }) })
      expect(mocks.preparePresentation.mock.invocationCallOrder[0]).toBeLessThan(mocks.updatePresentation.mock.invocationCallOrder[0]!)
      expect(router.currentRoute.value.name).toBe('editor')
      expect(router.currentRoute.value.query.stream).toBe('1')
    })

    it('tells the user when a chosen theme could not be loaded, and still opens the editor', async () => {
      mocks.listThemes.mockRejectedValue(new Error('boom'))
      const { wrapper, router } = await mountView('/new/p1/outline?template=modern&theme=t1')
      await clickGenerate(wrapper)
      expect(mocks.updatePresentation).not.toHaveBeenCalled()
      expect(mocks.toastError).toHaveBeenCalledWith("Couldn't apply theme — set it in Design")
      expect(router.currentRoute.value.name).toBe('editor')
    })

    it('holds Generate while a chosen theme is still loading', async () => {
      mocks.listThemes.mockReturnValue(new Promise(() => {}))
      const { wrapper } = await mountView('/new/p1/outline?template=modern&theme=t1')
      const gen = wrapper.findAll('button').find((b) => b.text().includes('Generate presentation'))!
      expect(gen.attributes('disabled')).toBeDefined()
    })

    it('makes no theme call with Template colours', async () => {
      const { wrapper } = await mountView('/new/p1/outline?template=modern')
      await clickGenerate(wrapper)
      expect(mocks.updatePresentation).not.toHaveBeenCalled()
    })

    it('still opens the editor when applying the theme fails', async () => {
      mocks.updatePresentation.mockRejectedValue(new Error('nope'))
      const { wrapper, router } = await mountView('/new/p1/outline?template=modern&theme=t1')
      await clickGenerate(wrapper)
      expect(router.currentRoute.value.name).toBe('editor')
      expect(mocks.toastError).toHaveBeenCalledWith("Couldn't apply theme — set it in Design")
    })

    it('keeps ?theme when the template changes', async () => {
      const { wrapper, router } = await mountView('/new/p1/outline?template=modern&theme=t1')
      await wrapper.get('[data-testid="chosen-template"] button').trigger('click')
      await wrapper.get('[data-testid="template-custom-1"]').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query).toMatchObject({ template: 'custom-1', theme: 't1' })
    })

    it('shows the chosen theme as a summary, with the picker behind Change', async () => {
      const { wrapper } = await mountView('/new/p1/outline?template=modern&theme=t1')
      expect(wrapper.get('[data-testid="chosen-theme"]').text()).toContain('Ocean')
      expect(wrapper.find('[data-testid="theme-option-none"]').exists()).toBe(false)
      await wrapper.get('[data-testid="chosen-theme"] button').trigger('click')
      expect(wrapper.find('[data-testid="theme-option-none"]').exists()).toBe(true)
    })
  })
})
