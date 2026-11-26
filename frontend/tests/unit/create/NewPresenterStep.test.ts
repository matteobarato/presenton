import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import NewPresenterStep from '@/components/create/NewPresenterStep.vue'
import type { CreateOptions } from '@/components/create/options'

const base: CreateOptions = {
  slides: '', images: '', videos: '3', language: 'English', tone: 'default', verbosity: 'standard',
  instructions: '', includeTitleSlide: false, includeTableOfContents: false, webSearch: false, animate: true,
}
const photo = new File(['x'], 'p.png', { type: 'image/png' })
const mountStep = (extra: Record<string, unknown> = {}) =>
  mount(NewPresenterStep, { props: { modelValue: photo, options: base, wants: true, ...extra } })

describe('NewPresenterStep', () => {
  it('shows the import note and caps videos when given a slide count', () => {
    const w = mountStep({ slideCount: 2 })
    expect(w.get('[data-testid="presenter-note"]').text()).toContain('2 of 2 slides')
    expect(w.get('[aria-label="Presenter video count"]').findAll('[role="radio"]').map((r) => r.text())).toEqual(['Auto', 'None', '1'])
    expect(w.find('[data-testid="presenter-choice-photo"]').exists()).toBe(true)
  })
  it('keeps the usual note without a slide count', () => {
    const w = mountStep()
    expect(w.get('[data-testid="presenter-note"]').text()).toContain('Adds 3 presenter videos')
  })
})
