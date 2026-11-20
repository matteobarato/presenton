import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Presentation } from '@/api/types'
import ExportStep from '@/components/create/steps/ExportStep.vue'

vi.mock('@/components/editor/export/ExportOptions.vue', () => ({
  default: { props: ['presentationId', 'presentation'], template: '<div data-testid="export-options" :data-id="presentationId" />' },
}))

const deck = { id: 'p1', title: 'Octopus minds', n_slides: 3, slides: [{ id: 's0' }, { id: 's1' }, { id: 's2' }] } as unknown as Presentation

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ExportStep', () => {
  it('renders export options and present link', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'library', component: { template: '<div />' } },
        { path: '/p/:id', name: 'editor', component: { template: '<div />' } },
        { path: '/p/:id/present', name: 'present', component: { template: '<div />' } },
        { path: '/p/:id/create/:step?', name: 'create', component: { template: '<div />' } },
      ],
    })
    await router.push('/p/p1/create/export')
    await router.isReady()
    const wrapper = mount(ExportStep, { props: { presentation: deck }, global: { plugins: [router] }, attachTo: document.body })
    await flushPromises()

    expect(wrapper.get('[data-testid="export-heading"]').text()).toBe('Octopus minds · 3 slides')
    expect(wrapper.get('[data-testid="export-options"]').attributes('data-id')).toBe('p1')
    const link = (re: RegExp) => wrapper.findAll('a').find((a) => re.test(a.text()))
    expect(link(/Present/)!.attributes('href')).toBe('/p/p1/present')
    expect(link(/Open in editor/)!.attributes('href')).toBe('/p/p1')
    expect(link(/Back to library/)!.attributes('href')).toBe('/')
    // The footer has no primary of its own: the export card's button is the action.
    const footer = wrapper.get('[data-testid="wizard-footer"]')
    expect(footer.findAll('button').map((b) => b.text())).toEqual([])
  })
})
