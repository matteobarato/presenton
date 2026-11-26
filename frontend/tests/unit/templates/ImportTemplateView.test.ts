import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createMemoryHistory, createRouter } from 'vue-router'

const mocks = vi.hoisted(() => ({
  checkFonts: vi.fn(),
  prepareImport: vi.fn(),
  startImport: vi.fn(),
  retryImport: vi.fn(),
  getTask: vi.fn(),
}))
vi.mock('@/api/templateImport', async (orig) => ({
  ...(await orig<typeof import('@/api/templateImport')>()),
  checkFonts: mocks.checkFonts,
  prepareImport: mocks.prepareImport,
  startImport: mocks.startImport,
  retryImport: mocks.retryImport,
}))
vi.mock('@/api/tasks', () => ({ getTask: mocks.getTask }))

import { router as appRouter } from '@/router'
import ImportTemplateView from '@/views/ImportTemplateView.vue'
import { IMPORT_TASK_STORAGE_KEY } from '@/composables/useTemplateImport'

const preview = {
  slide_image_urls: ['/app_data/1.png', '/app_data/2.png', '/app_data/3.png'],
  pptx_url: '/p.pptx',
  modified_pptx_url: '/m.pptx',
  fonts: {},
}
const task = (status: string, data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  id: 't1', type: 'template.create', status, data, ...extra,
})

async function mountAt(path = '/templates/import') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/templates', name: 'templates', component: { template: '<div />' } },
      { path: '/templates/import', name: 'template-import', component: ImportTemplateView },
      { path: '/templates/:id', name: 'template', component: { template: '<div data-testid="detail" />' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router, [VueQueryPlugin, { queryClient }]] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

async function pick(wrapper: ReturnType<typeof mount>, file: File) {
  const input = wrapper.get('[data-testid="import-file-input"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

const button = (w: ReturnType<typeof mount>, text: string) => w.findAll('button').find((b) => b.text().includes(text))

describe('ImportTemplateView', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    sessionStorage.clear()
    Object.values(mocks).forEach((m) => m.mockReset())
  })
  afterEach(() => vi.useRealTimers())

  it('routes /templates/import to the import view, not the detail view', async () => {
    expect(appRouter.resolve('/templates/import').name).toBe('template-import')
    expect(appRouter.resolve('/templates/abc').name).toBe('template')
    const { wrapper } = await mountAt()
    expect(wrapper.find('[data-testid="import-dropzone"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Turn a deck into a template.')
  })

  it('walks upload → review → create', async () => {
    mocks.checkFonts.mockResolvedValue([])
    mocks.prepareImport.mockResolvedValue(preview)
    mocks.startImport.mockResolvedValue(task('pending'))
    mocks.getTask.mockResolvedValue(task('pending', { created_layouts: 1, remaining_layouts: 2 }))
    const { wrapper } = await mountAt()
    await pick(wrapper, new File(['pk'], 'deck.pptx'))
    expect(wrapper.findAll('[data-testid="import-review"] img')).toHaveLength(3)
    expect(wrapper.text()).toContain('3 slides found')
    expect((wrapper.get('#import-name').element as HTMLInputElement).value).toBe('deck')
    await button(wrapper, 'Create template')!.trigger('click')
    await flushPromises()
    expect(mocks.startImport).toHaveBeenCalledWith(preview, { name: 'deck', description: '' })
    expect(wrapper.find('[data-testid="import-progress"]').exists()).toBe(true)
    await flushPromises()
    expect(wrapper.text()).toContain('1 of 3 slides')
    expect(wrapper.findAll('[data-testid="import-slide-done"]')).toHaveLength(1)
  })

  it('rejects a non-pptx file with a message', async () => {
    const { wrapper } = await mountAt()
    await pick(wrapper, new File([''], 'deck.key'))
    expect(wrapper.text()).toContain('Choose a PowerPoint file (.pptx).')
    expect(mocks.checkFonts).not.toHaveBeenCalled()
  })

  it('shows fonts step and continues', async () => {
    mocks.checkFonts.mockResolvedValue([{ name: 'Gotham Bold' }])
    mocks.prepareImport.mockResolvedValue(preview)
    const { wrapper } = await mountAt()
    await pick(wrapper, new File(['pk'], 'deck.pptx'))
    expect(wrapper.text()).toContain('Gotham Bold')
    expect(wrapper.text()).toContain("Some fonts aren't installed")
    await button(wrapper, 'Continue')!.trigger('click')
    await flushPromises()
    expect(mocks.prepareImport).toHaveBeenCalled()
    expect(wrapper.find('[data-testid="import-review"]').exists()).toBe(true)
  })

  it('navigates to the template when done', async () => {
    sessionStorage.setItem(IMPORT_TASK_STORAGE_KEY, 't1')
    mocks.getTask.mockResolvedValue(task('completed', { template_v2_id: 'tpl', created_layouts: 3, remaining_layouts: 0 }))
    const { router } = await mountAt()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/templates/tpl')
  })

  it('adopts the task in the query', async () => {
    mocks.getTask.mockResolvedValue(task('pending', { created_layouts: 0, remaining_layouts: 2 }))
    const { wrapper } = await mountAt('/templates/import?task=t5')
    expect(mocks.getTask).toHaveBeenCalledWith('t5')
    expect(wrapper.find('[data-testid="import-progress"]').exists()).toBe(true)
  })

  it('shows retry on failure', async () => {
    sessionStorage.setItem(IMPORT_TASK_STORAGE_KEY, 't1')
    mocks.getTask.mockResolvedValue(task('error', { created_layouts: 0, remaining_layouts: 2 }, { error: { detail: 'LLM down' } }))
    mocks.retryImport.mockResolvedValue(task('pending'))
    const { wrapper } = await mountAt()
    await flushPromises()
    expect(wrapper.text()).toContain('LLM down')
    await button(wrapper, 'Try again')!.trigger('click')
    await flushPromises()
    expect(mocks.retryImport).toHaveBeenCalledWith('t1')
  })
})
