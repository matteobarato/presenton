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
  listTemplates: vi.fn(),
  listImportTasks: vi.fn(),
}))
vi.mock('@/api/templates', async (orig) => ({
  ...(await orig<typeof import('@/api/templates')>()),
  listTemplates: mocks.listTemplates,
}))
vi.mock('@/api/templateImport', async (orig) => ({
  ...(await orig<typeof import('@/api/templateImport')>()),
  listImportTasks: mocks.listImportTasks,
  checkFonts: mocks.checkFonts,
  prepareImport: mocks.prepareImport,
  startImport: mocks.startImport,
  retryImport: mocks.retryImport,
}))
vi.mock('@/api/tasks', () => ({ getTask: mocks.getTask }))

import { ApiError } from '@/api/errors'
import TemplatesView from '@/views/TemplatesView.vue'
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

const mounted: ReturnType<typeof mount>[] = []

/** The import runs in a dialog over the Templates page, opened by `?import=new|<task id>`. */
async function mountAt(path = '/templates?import=new') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/templates', name: 'templates', component: TemplatesView },
      { path: '/templates/:id', name: 'template', component: { template: '<div data-testid="detail" />' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router, [VueQueryPlugin, { queryClient }]] }, attachTo: document.body })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

async function pick(file: File) {
  const input = dialog()!.querySelector<HTMLInputElement>('[data-testid="import-file-input"]')!
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change'))
  await flushPromises()
}

// The dialog is teleported to <body>, so look there rather than inside the wrapper.
const dialog = () => document.querySelector<HTMLElement>('[data-testid="import-dialog"]')
const dialogText = () => dialog()?.textContent ?? ''
const has = (selector: string) => !!dialog()?.querySelector(selector)
const button = (text: string) => [...(dialog()?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.includes(text))!
async function click(el: HTMLElement) {
  el.click()
  await flushPromises()
}

describe('ImportTemplateDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    sessionStorage.clear()
    Object.values(mocks).forEach((m) => m.mockReset())
    mocks.listTemplates.mockResolvedValue([])
    mocks.listImportTasks.mockResolvedValue([])
  })
  afterEach(() => {
    // An open dialog keeps a focus-trap observer alive; unmount before the DOM is torn down.
    mounted.splice(0).forEach((w) => w.unmount())
    vi.useRealTimers()
  })

  it('opens over the Templates page at the upload step', async () => {
    await mountAt()
    expect(has('[data-testid="import-dropzone"]')).toBe(true)
    expect(dialogText()).toContain('Turn a deck into a template.')
  })

  it('walks upload → review → create', async () => {
    mocks.checkFonts.mockResolvedValue([])
    mocks.prepareImport.mockResolvedValue(preview)
    mocks.startImport.mockResolvedValue(task('pending'))
    mocks.getTask.mockResolvedValue(task('pending', { created_layouts: 1, remaining_layouts: 2 }))
    await mountAt()
    await pick(new File(['pk'], 'deck.pptx'))
    expect(dialog()!.querySelectorAll('[data-testid="import-review"] img')).toHaveLength(3)
    expect(dialogText()).toContain('3 slides found')
    expect(dialog()!.querySelector<HTMLInputElement>('#import-name')!.value).toBe('deck')
    await click(button('Create template'))
    expect(mocks.startImport).toHaveBeenCalledWith(preview, { name: 'deck', description: '' })
    expect(has('[data-testid="import-progress"]')).toBe(true)
    await flushPromises()
    expect(dialogText()).toContain('1 of 3 slides')
    expect(dialog()!.querySelectorAll('[data-testid="import-slide-done"]')).toHaveLength(1)
  })

  it('rejects a non-pptx file with a message', async () => {
    await mountAt()
    await pick(new File([''], 'deck.key'))
    expect(dialogText()).toContain('Choose a PowerPoint file (.pptx).')
    expect(mocks.checkFonts).not.toHaveBeenCalled()
  })

  it('shows fonts step and continues', async () => {
    mocks.checkFonts.mockResolvedValue([{ name: 'Gotham Bold' }])
    mocks.prepareImport.mockResolvedValue(preview)
    await mountAt()
    await pick(new File(['pk'], 'deck.pptx'))
    expect(dialogText()).toContain('Gotham Bold')
    expect(dialogText()).toContain("Some fonts aren't installed")
    await click(button('Continue'))
    expect(mocks.prepareImport).toHaveBeenCalled()
    expect(has('[data-testid="import-review"]')).toBe(true)
  })

  it('navigates to the template when done', async () => {
    mocks.getTask.mockResolvedValue(task('completed', { template_v2_id: 'tpl', created_layouts: 3, remaining_layouts: 0 }))
    const { router } = await mountAt('/templates?import=t1')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/templates/tpl')
  })

  it('does not reopen an import that finished while away', async () => {
    sessionStorage.setItem(IMPORT_TASK_STORAGE_KEY, 't1')
    mocks.getTask.mockResolvedValue(task('completed', { template_v2_id: 'tpl', created_layouts: 3, remaining_layouts: 0 }))
    const { router } = await mountAt()
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/templates?import=new')
    expect(has('[data-testid="import-dropzone"]')).toBe(true)
  })

  it('can start another import while one runs', async () => {
    sessionStorage.setItem(IMPORT_TASK_STORAGE_KEY, 't1')
    mocks.getTask.mockResolvedValue(task('pending', { created_layouts: 1, remaining_layouts: 2 }))
    await mountAt()
    await flushPromises()
    expect(dialogText()).toContain('if you close this window')
    await click(button('Import another'))
    expect(has('[data-testid="import-dropzone"]')).toBe(true)
    expect(sessionStorage.getItem(IMPORT_TASK_STORAGE_KEY)).toBeNull()
  })

  it('starting over from an adopted task keeps the dialog open on a fresh import', async () => {
    mocks.getTask.mockResolvedValue(task('pending', { created_layouts: 0, remaining_layouts: 2 }))
    const { router } = await mountAt('/templates?import=t5')
    await click(button('Import another'))
    expect(router.currentRoute.value.query.import).toBe('new')
    expect(has('[data-testid="import-dropzone"]')).toBe(true)
  })

  it('shows why a retry failed', async () => {
    sessionStorage.setItem(IMPORT_TASK_STORAGE_KEY, 't1')
    mocks.getTask.mockResolvedValue(task('error', {}, { error: { detail: 'LLM down' } }))
    mocks.retryImport.mockRejectedValue(new ApiError('Template has already been created', 409, { detail: 'Template has already been created' }))
    await mountAt()
    await flushPromises()
    await click(button('Try again'))
    expect(dialogText()).toContain('Template has already been created')
  })

  it('adopts the task in the query', async () => {
    mocks.getTask.mockResolvedValue(task('pending', { created_layouts: 0, remaining_layouts: 2 }))
    await mountAt('/templates?import=t5')
    expect(mocks.getTask).toHaveBeenCalledWith('t5')
    expect(has('[data-testid="import-progress"]')).toBe(true)
  })

  it('shows retry on failure', async () => {
    sessionStorage.setItem(IMPORT_TASK_STORAGE_KEY, 't1')
    mocks.getTask.mockResolvedValue(task('error', { created_layouts: 0, remaining_layouts: 2 }, { error: { detail: 'LLM down' } }))
    mocks.retryImport.mockResolvedValue(task('pending'))
    await mountAt()
    await flushPromises()
    expect(dialogText()).toContain('LLM down')
    await click(button('Try again'))
    expect(mocks.retryImport).toHaveBeenCalledWith('t1')
  })
})
