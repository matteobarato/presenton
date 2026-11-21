import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Presentation } from '@/api/types'
import ExportStep from '@/components/create/steps/ExportStep.vue'
import type { DeckProgress } from '@/components/create/wizard/progress'

vi.mock('@/components/editor/export/ExportOptions.vue', () => ({
  default: {
    props: ['presentationId', 'presentation', 'videoNote'],
    template: '<div data-testid="export-options" :data-id="presentationId"><p v-if="videoNote" data-testid="mp4-note">{{ videoNote }}</p></div>',
  },
}))

const deck = { id: 'p1', title: 'Octopus minds', n_slides: 3, slides: [{ id: 's0' }, { id: 's1' }, { id: 's2' }] } as unknown as Presentation

const progress = (missing: DeckProgress['missing'] = { narration: 0, presenterVideos: 0 }) =>
  ({ steps: {}, voiceOnly: false, missing, resume: 'export' }) as unknown as DeckProgress

async function mountStep(missing?: DeckProgress['missing']) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'library', component: { template: '<div />' } },
      { path: '/p/:id', name: 'editor', component: { template: '<div />' } },
      { path: '/p/:id/present', name: 'present', component: { template: '<div />' } },
      { path: '/p/:id/create/:step?', name: 'create', component: { template: '<div />' } },
    ],
  })
  await router.push('/p/p1/create/export?template=modern')
  await router.isReady()
  const wrapper = mount(ExportStep, { props: { presentation: deck, progress: progress(missing) }, global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ExportStep', () => {
  it('renders export options and present link', async () => {
    const { wrapper } = await mountStep()

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

  it('shows no warning and no video note when nothing is missing', async () => {
    const { wrapper } = await mountStep()
    expect(wrapper.find('[data-testid="export-gaps"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mp4-note"]').exists()).toBe(false)
  })

  it('warns inline about missing presenter videos and narration, links to Narration, and does not block', async () => {
    const { wrapper } = await mountStep({ narration: 1, presenterVideos: 1 })
    const gaps = wrapper.get('[data-testid="export-gaps"]')
    expect(gaps.text()).toContain('1 presenter slide has no video · 1 slide has no narration')
    expect(gaps.text()).toContain('You can still export now')
    expect(wrapper.get('[data-testid="export-gaps-link"]').attributes('href')).toBe('/p/p1/create/avatar?template=modern')
    // The export card is there and the video option carries the same facts.
    expect(wrapper.find('[data-testid="export-options"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="mp4-note"]').text()).toContain('1 presenter slide has no video · 1 slide has no narration')
  })

  it('pluralises the warning', async () => {
    const { wrapper } = await mountStep({ narration: 3, presenterVideos: 2 })
    expect(wrapper.get('[data-testid="export-gaps"]').text()).toContain('2 presenter slides have no video · 3 slides have no narration')
  })
})
