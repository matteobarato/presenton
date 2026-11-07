import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { TemplateSummary } from '@/api/templates'
import { ApiError } from '@/api/errors'

const mocks = vi.hoisted(() => ({
  listTemplates: vi.fn(),
  getTemplate: vi.fn(),
  renameTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/components/ui/sonner', () => ({ toast: mocks.toast }))
vi.mock('@/api/templates', async (orig) => ({
  ...(await orig<typeof import('@/api/templates')>()),
  listTemplates: mocks.listTemplates,
  renameTemplate: mocks.renameTemplate,
  deleteTemplate: mocks.deleteTemplate,
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

import TemplateDetailView from '@/views/TemplateDetailView.vue'

const custom: TemplateSummary = { id: 'c1', name: 'Brand Kit', kind: 'custom', layouts: [1, 2, 3], description: 'Our brand look' }
const builtin: TemplateSummary = { id: 'general', name: 'General', kind: 'builtin', layouts: [{ id: 'g0' }] }

async function mountAt(path = '/templates/c1') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/templates', name: 'templates', component: { template: '<div />' } },
      { path: '/templates/:id', name: 'template', component: TemplateDetailView },
      { path: '/new', name: 'new', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = mount(
    { template: '<RouterView />' },
    { global: { plugins: [router, [VueQueryPlugin, { queryClient }]] }, attachTo: document.body },
  )
  await flushPromises()
  return { wrapper, router, queryClient }
}

const button = (w: ReturnType<typeof mount>, text: string) => w.findAll('button').find((b) => b.text() === text)

beforeEach(() => {
  document.body.innerHTML = ''
  mocks.listTemplates.mockReset()
  mocks.getTemplate.mockReset()
  mocks.renameTemplate.mockReset()
  mocks.deleteTemplate.mockReset()
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
  mocks.listTemplates.mockResolvedValue([custom, builtin])
  mocks.getTemplate.mockResolvedValue({ layouts: [{ id: 'l0' }, { id: 'l1' }, { id: 'l2' }], theme: {}, fonts: [] })
})

describe('TemplateDetailView', () => {
  it('renders header and every layout', async () => {
    const { wrapper } = await mountAt()
    expect(wrapper.find('h1').text()).toBe('Brand Kit')
    expect(wrapper.text()).toContain('Custom')
    expect(wrapper.text()).toContain('3 layouts')
    expect(wrapper.text()).toContain('Our brand look')
    const cards = wrapper.findAll('[data-testid="layout-card"]')
    expect(cards).toHaveLength(3)
    expect(cards.map((c) => c.text())).toEqual(['01', '02', '03'])
    expect(wrapper.find('[data-testid="template-actions"]').exists()).toBe(true)
  })

  it('hides management actions for built-ins', async () => {
    const { wrapper } = await mountAt('/templates/general')
    expect(wrapper.text()).toContain('Built-in')
    expect(wrapper.find('[data-testid="template-actions"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="layout-card"]')).toHaveLength(1)
  })

  it('unknown id shows not-found with link back', async () => {
    const { wrapper, router } = await mountAt('/templates/nope')
    expect(wrapper.text()).toContain('Template not found')
    expect(wrapper.find('main a[href="/templates"], section a[href="/templates"]').exists()).toBe(true)
    expect(router.currentRoute.value.fullPath).toBe('/templates/nope')
  })

  it('layout load error shows Retry', async () => {
    mocks.getTemplate.mockRejectedValueOnce(new Error('boom'))
    const { wrapper } = await mountAt()
    expect(wrapper.find('[data-testid="layout-card"]').exists()).toBe(false)
    await button(wrapper, 'Retry')!.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="layout-card"]')).toHaveLength(3)
  })

  it('zero layouts disables Use this template', async () => {
    mocks.listTemplates.mockResolvedValue([{ ...custom, layouts: [] }])
    const { wrapper } = await mountAt()
    expect(button(wrapper, 'Use this template')!.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="layout-card"]').exists()).toBe(false)
  })

  it('Use this template navigates to /new?template=<id>', async () => {
    const { wrapper, router } = await mountAt()
    await button(wrapper, 'Use this template')!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/new?template=c1')
  })

  it('breadcrumb keeps the gallery filter', async () => {
    const parent = (w: ReturnType<typeof mount>) =>
      w.findAll('nav a').find((a) => a.text() === 'Templates')!.attributes('href')
    expect(parent((await mountAt('/templates/c1')).wrapper)).toBe('/templates')
    expect(parent((await mountAt('/templates/c1?from=custom')).wrapper)).toBe('/templates?kind=custom')
    expect(parent((await mountAt('/templates/c1?from=bogus')).wrapper)).toBe('/templates')
  })
})

describe('TemplateDetailView lightbox', () => {
  it('clicking a layout opens the lightbox and focus returns on close', async () => {
    const { wrapper } = await mountAt()
    const card = wrapper.findAll('[data-testid="layout-card"]')[1]
    expect(card.attributes('aria-label')).toBe('Preview layout 02')
    await card.trigger('click')
    await flushPromises()
    expect(document.body.querySelector('[data-testid="lightbox-counter"]')?.textContent).toBe('2 / 3')
    document.body.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(card.element)
  })
})

describe('TemplateDetailView rename and delete', () => {
  const c1: TemplateSummary = { ...custom, name: 'Custom 1' }
  beforeEach(() => mocks.listTemplates.mockResolvedValue([c1, builtin]))

  async function openItem(w: ReturnType<typeof mount>, label: string) {
    w.get('[data-testid="template-actions"]').element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    await flushPromises()
    const item = [...document.body.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent === label)!
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
  }
  const input = () => document.body.querySelector<HTMLInputElement>('input[aria-label="Template name"]')!
  const dialogButton = (text: string) =>
    [...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => b.textContent === text)!
  async function type(value: string) {
    input().value = value
    input().dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
  }

  it('rename updates optimistically and toasts', async () => {
    let resolve!: () => void
    mocks.renameTemplate.mockReturnValue(new Promise<void>((r) => (resolve = r)))
    const { wrapper } = await mountAt()
    await openItem(wrapper, 'Rename')
    expect(input().value).toBe('Custom 1')
    await type('  Pitch  ')
    input().form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(mocks.renameTemplate).toHaveBeenCalledWith('c1', 'Pitch')
    expect(wrapper.find('h1').text()).toBe('Pitch')
    resolve()
    await flushPromises()
    expect(mocks.toast.success).toHaveBeenCalled()
  })

  it('rename rolls back on failure', async () => {
    mocks.renameTemplate.mockRejectedValue(new ApiError('Forbidden', 403, { detail: 'Not allowed to rename' }))
    const { wrapper } = await mountAt()
    await openItem(wrapper, 'Rename')
    await type('Pitch')
    input().form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('Custom 1')
    expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining('Not allowed to rename'))
  })

  it('rename submit disabled for blank or unchanged', async () => {
    const { wrapper } = await mountAt()
    await openItem(wrapper, 'Rename')
    for (const v of ['   ', 'Custom 1']) {
      await type(v)
      expect(dialogButton('Save').disabled).toBe(true)
      input().form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flushPromises()
    }
    expect(mocks.renameTemplate).not.toHaveBeenCalled()
  })

  it('delete confirms, removes caches and returns to gallery', async () => {
    mocks.deleteTemplate.mockResolvedValue(undefined)
    const { wrapper, router } = await mountAt()
    const before = mocks.getTemplate.mock.calls.length
    await openItem(wrapper, 'Delete')
    expect(document.body.textContent).toContain('keep their slides')
    dialogButton('Delete').click()
    await flushPromises()
    expect(mocks.deleteTemplate).toHaveBeenCalledWith('c1')
    expect(router.currentRoute.value.name).toBe('templates')
    expect(mocks.getTemplate.mock.calls.length).toBe(before)
    expect(mocks.toast.success).toHaveBeenCalled()
  })

  it('delete failure stays on page', async () => {
    mocks.deleteTemplate.mockRejectedValue(new ApiError('x', 500, { detail: 'nope' }))
    const { wrapper, router } = await mountAt()
    await openItem(wrapper, 'Delete')
    dialogButton('Delete').click()
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/templates/c1')
    expect(mocks.toast.error).toHaveBeenCalled()
  })

  it('failed background list refetch keeps the loaded page', async () => {
    const { wrapper, queryClient } = await mountAt()
    const query = queryClient.getQueryCache().find({ queryKey: ['templates'] })!
    query.setState({ ...query.state, status: 'error', error: new Error('boom'), fetchStatus: 'idle' })
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('Custom 1')
    expect(wrapper.text()).not.toContain('Could not load templates')
  })
})
