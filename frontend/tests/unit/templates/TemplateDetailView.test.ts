import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { TemplateSummary } from '@/api/templates'

const mocks = vi.hoisted(() => ({ listTemplates: vi.fn(), getTemplate: vi.fn() }))
vi.mock('@/api/templates', async (orig) => ({
  ...(await orig<typeof import('@/api/templates')>()),
  listTemplates: mocks.listTemplates,
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
  return { wrapper, router }
}

const button = (w: ReturnType<typeof mount>, text: string) => w.findAll('button').find((b) => b.text() === text)

beforeEach(() => {
  document.body.innerHTML = ''
  mocks.listTemplates.mockReset()
  mocks.getTemplate.mockReset()
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
