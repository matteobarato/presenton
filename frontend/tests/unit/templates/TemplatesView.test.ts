import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { TemplateSummary } from '@/api/templates'

const mocks = vi.hoisted(() => ({ listTemplates: vi.fn(), getTemplate: vi.fn(), listImportTasks: vi.fn() }))
vi.mock('@/api/templates', async (orig) => ({
  ...(await orig<typeof import('@/api/templates')>()),
  listTemplates: mocks.listTemplates,
}))
vi.mock('@/api/templateImport', async (orig) => ({
  ...(await orig<typeof import('@/api/templateImport')>()),
  listImportTasks: mocks.listImportTasks,
}))
vi.mock('@/api/outlines', async (orig) => ({
  ...(await orig<typeof import('@/api/outlines')>()),
  getTemplate: mocks.getTemplate,
}))
vi.mock('@/render/SlideView.vue', () => ({
  default: {
    props: ['slide'],
    template: '<div data-testid="slide-view" :data-slide="slide.id" />',
  },
}))

import TemplatesView from '@/views/TemplatesView.vue'

const builtins: TemplateSummary[] = [
  { id: 'general', name: 'General', kind: 'builtin', layouts: [{ id: 'g0' }, { id: 'g1' }] },
  { id: 'modern', name: 'Modern', kind: 'builtin', layouts: [{ id: 'm0' }, { id: 'm1' }] },
]
const custom: TemplateSummary = { id: 'c1', name: 'Brand Kit', kind: 'custom', layouts: [1, 2, 3] }

const mounted: ReturnType<typeof mount>[] = []
// An open import dialog keeps a focus-trap observer alive; unmount before the DOM is torn down.
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

async function mountAt(path = '/templates', client?: QueryClient) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/templates', name: 'templates', component: TemplatesView },
      { path: '/templates/:id', name: 'template', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  // Same defaults as the app (src/api/query.ts): cached data stays fresh for 30s.
  const queryClient = client ?? new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
  const wrapper = mount(TemplatesView, { global: { plugins: [router, [VueQueryPlugin, { queryClient }]] }, attachTo: document.body })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, router, queryClient }
}

const names = (w: ReturnType<typeof mount>) => w.findAll('[data-testid="template-card"] h3').map((h) => h.text())
const button = (w: ReturnType<typeof mount>, text: string) => w.findAll('button').find((b) => b.text() === text)

beforeEach(() => {
  document.body.innerHTML = ''
  mocks.listTemplates.mockReset()
  mocks.getTemplate.mockReset()
  mocks.listTemplates.mockResolvedValue([custom, ...builtins])
  mocks.getTemplate.mockResolvedValue({ layouts: [{ id: 'c-l0' }], theme: {}, fonts: [] })
  mocks.listImportTasks.mockReset()
  mocks.listImportTasks.mockResolvedValue([])
})

const running = {
  id: 'task-1', type: 'template.create', status: 'pending', created_at: '', updated_at: '',
  data: { name: 'Brand deck', created_layouts: 1, remaining_layouts: 3, template_v2_id: 'x' },
}

describe('TemplatesView imports', () => {
  it('opens the import dialog from the header button', async () => {
    const { wrapper, router } = await mountAt()
    expect(document.querySelector('[data-testid="import-dialog"]')).toBeNull()
    await wrapper.findAll('button').find((b) => b.text().includes('Import PowerPoint'))!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.import).toBe('new')
    expect(document.querySelector('[data-testid="import-dialog"] [data-testid="import-dropzone"]')).not.toBeNull()
  })

  it('closes the import dialog and drops it from the url', async () => {
    const { router } = await mountAt('/templates?kind=custom&import=new')
    expect(document.querySelector('[data-testid="import-dialog"]')).not.toBeNull()
    ;(document.querySelector('[data-testid="import-dialog"] button[aria-label="Close dialog"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ kind: 'custom' })
    expect(document.querySelector('[data-testid="import-dialog"]')).toBeNull()
  })

  it('shows running imports first', async () => {
    mocks.listImportTasks.mockResolvedValue([running])
    const { wrapper } = await mountAt()
    const grid = wrapper.get('[data-testid="import-task-card"]').element.parentElement!
    expect((grid.firstElementChild as HTMLElement).dataset.testid).toBe('import-task-card')
    const card = wrapper.get('[data-testid="import-task-card"]')
    expect(card.text()).toContain('Brand deck')
    expect(card.text()).toContain('1 of 4')
    expect(card.get('a').attributes('href')).toBe('/templates?import=task-1')
  })

  it('shows a running import started after the list was cached', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    const first = await mountAt('/templates', client)
    first.wrapper.unmount()
    mocks.listImportTasks.mockResolvedValue([running])
    const { wrapper } = await mountAt('/templates', client)
    expect(wrapper.find('[data-testid="import-task-card"]').exists()).toBe(true)
  })

  it('shows failed imports with a link to retry', async () => {
    mocks.listImportTasks.mockResolvedValue([{ ...running, status: 'error' }])
    const { wrapper } = await mountAt()
    const card = wrapper.get('[data-testid="import-task-card"]')
    expect(card.text()).toContain('Import failed')
    expect(card.get('a').attributes('href')).toBe('/templates?import=task-1')
  })

  it('hides running imports for built-in filter', async () => {
    mocks.listImportTasks.mockResolvedValue([running])
    const { wrapper } = await mountAt('/templates?kind=builtin')
    expect(wrapper.find('[data-testid="import-task-card"]').exists()).toBe(false)
  })

  it('offers import in the empty custom state', async () => {
    mocks.listTemplates.mockResolvedValue(builtins)
    const { wrapper } = await mountAt('/templates?kind=custom')
    expect(wrapper.text()).toContain('No custom templates')
    const buttons = wrapper.findAll('button').filter((b) => b.text().includes('Import PowerPoint'))
    expect(buttons.length).toBe(2)
  })

  it('refreshes the templates when a running import finishes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mocks.listImportTasks.mockResolvedValueOnce([running]).mockResolvedValue([])
    const { wrapper } = await mountAt()
    expect(wrapper.find('[data-testid="import-task-card"]').exists()).toBe(true)
    const calls = mocks.listTemplates.mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    await flushPromises()
    expect(wrapper.find('[data-testid="import-task-card"]').exists()).toBe(false)
    expect(mocks.listTemplates.mock.calls.length).toBeGreaterThan(calls)
    vi.useRealTimers()
  })
})

describe('TemplatesView', () => {
  it('renders built-in then custom cards with meta', async () => {
    const { wrapper } = await mountAt()
    expect(names(wrapper)).toEqual(['General', 'Modern', 'Brand Kit'])
    const cards = wrapper.findAll('[data-testid="template-card"]')
    expect(cards[0].text()).toContain('2 layouts · Built-in')
    expect(cards[2].text()).toContain('3 layouts · Custom')
    expect(cards.map((c) => c.get('a').attributes('href'))).toEqual(['/templates/general', '/templates/modern', '/templates/c1'])
    expect(wrapper.text()).toContain('A head start on something great.')
    expect(wrapper.text()).toContain('Every layout your next deck can be built from.')
  })

  it('card links carry the active kind filter as ?from', async () => {
    const { wrapper } = await mountAt('/templates?kind=custom')
    expect(wrapper.get('[data-testid="template-card"] a').attributes('href')).toBe('/templates/c1?from=custom')
  })

  it('filters by search, case-insensitive', async () => {
    const { wrapper } = await mountAt()
    await wrapper.get('input[type="search"]').setValue('BRAND')
    expect(names(wrapper)).toEqual(['Brand Kit'])
  })

  it('reads and writes ?kind', async () => {
    const { wrapper, router } = await mountAt('/templates?kind=custom')
    expect(names(wrapper)).toEqual(['Brand Kit'])
    await button(wrapper, 'All')!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.kind).toBeUndefined()
    expect(names(wrapper)).toEqual(['General', 'Modern', 'Brand Kit'])
    await button(wrapper, 'Built-in')!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.kind).toBe('builtin')
    expect(names(wrapper)).toEqual(['General', 'Modern'])
  })

  it('treats an invalid ?kind as all', async () => {
    const { wrapper } = await mountAt('/templates?kind=bogus')
    expect(names(wrapper)).toHaveLength(3)
  })

  it('shows no-match state and Clear resets', async () => {
    const { wrapper, router } = await mountAt('/templates?kind=custom')
    await wrapper.get('input[type="search"]').setValue('zzz')
    expect(wrapper.text()).toContain('No templates match “zzz”')
    expect(names(wrapper)).toEqual([])
    await button(wrapper, 'Clear')!.trigger('click')
    await flushPromises()
    expect(names(wrapper)).toEqual(['General', 'Modern', 'Brand Kit'])
    expect(router.currentRoute.value.query.kind).toBeUndefined()
    expect((wrapper.get('input[type="search"]').element as HTMLInputElement).value).toBe('')
  })

  it('custom filter with no custom templates', async () => {
    mocks.listTemplates.mockResolvedValue(builtins)
    const { wrapper } = await mountAt('/templates?kind=custom')
    expect(wrapper.text()).toContain('Custom templates will appear here once they’re created.')
    expect(button(wrapper, 'Clear')).toBeUndefined()
    expect(wrapper.find('[data-testid="template-card"]').exists()).toBe(false)
  })

  it('list error shows Retry', async () => {
    mocks.listTemplates.mockRejectedValueOnce(new Error('boom'))
    const { wrapper } = await mountAt()
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not load templates')
    await button(wrapper, 'Retry')!.trigger('click')
    await flushPromises()
    expect(names(wrapper)).toHaveLength(3)
  })

  it('failed background refetch keeps the loaded gallery', async () => {
    const { wrapper, queryClient } = await mountAt()
    const q = queryClient.getQueryCache().find({ queryKey: ['templates'] })!
    q.setState({ ...q.state, status: 'error', error: new Error('boom'), fetchStatus: 'idle' })
    await flushPromises()
    expect(names(wrapper)).toHaveLength(3)
    expect(wrapper.text()).not.toContain('Could not load templates')
  })

  it('?kind=builtin matching nothing shows no-match state with Clear', async () => {
    mocks.listTemplates.mockResolvedValue([custom])
    const { wrapper, router } = await mountAt('/templates?kind=builtin')
    expect(wrapper.text()).toContain('No built-in templates')
    await button(wrapper, 'Clear')!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.kind).toBeUndefined()
    expect(names(wrapper)).toEqual(['Brand Kit'])
  })

  it('card whose layouts fail still links', async () => {
    mocks.getTemplate.mockRejectedValue(new Error('nope'))
    const { wrapper } = await mountAt()
    const card = wrapper.findAll('[data-testid="template-card"]').find((c) => c.text().includes('Brand Kit'))!
    expect(card.get('a').attributes('href')).toBe('/templates/c1')
    expect(card.find('[data-testid="cover-skeleton"]').exists()).toBe(false)
    expect(card.find('[data-testid="slide-view"]').exists()).toBe(false)
  })

  it('previews the first layout of each card', async () => {
    const { wrapper } = await mountAt()
    const card = wrapper.findAll('[data-testid="template-card"]')[0]
    expect(card.get('[data-testid="slide-view"]').attributes('data-slide')).toBe('general-preview-0')
    const custom = wrapper.findAll('[data-testid="template-card"]')[2]
    expect(custom.get('[data-testid="slide-view"]').attributes('data-slide')).toBe('c1-preview-0')
  })
})
