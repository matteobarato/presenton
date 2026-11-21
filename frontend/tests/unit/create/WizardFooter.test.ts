import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import WizardFooter from '@/components/create/wizard/WizardFooter.vue'

const onSelect = vi.fn()
const actions = [
  { key: 'present', label: 'Present', to: '/p' },
  { key: 'skip', label: 'Skip to Export', link: true, testid: 'skip-to-export', onSelect },
]

function mountFooter() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }] })
  return mount(WizardFooter, {
    props: { status: 'Ready', actions },
    slots: { primary: '<button data-testid="primary">Go</button>' },
    global: { plugins: [router] },
    attachTo: document.body,
  })
}

function narrow(on: boolean) {
  window.matchMedia = ((q: string) => ({ matches: on && q.includes('559'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
}

beforeEach(() => {
  document.body.innerHTML = ''
  onSelect.mockClear()
})
afterEach(() => narrow(false))

describe('WizardFooter secondary actions', () => {
  it('shows them inline from 560px', () => {
    narrow(false)
    const w = mountFooter()
    expect(w.find('[data-testid="footer-more"]').exists()).toBe(false)
    expect(w.text()).toContain('Present')
    expect(w.find('[data-testid="skip-to-export"]').exists()).toBe(true)
  })

  it('folds them into a More menu under 560px, leaving Back and the primary on one row', async () => {
    narrow(true)
    const w = mountFooter()
    await flushPromises()
    expect(w.find('[data-testid="skip-to-export"]').exists()).toBe(false)
    const more = w.get('[data-testid="footer-more"]')
    expect(more.attributes('aria-label')).toBe('More actions')
    expect(w.find('[data-testid="primary"]').exists()).toBe(true)
    await more.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    const item = document.body.querySelector<HTMLElement>('[data-testid="more-skip"]')
    expect(item?.textContent).toContain('Skip to Export')
    expect(document.body.querySelector('[data-testid="more-present"]')?.textContent).toContain('Present')
  })
})
