import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { TemplateSummary } from '@/api/templates'

vi.mock('@/render/SlideView.vue', () => ({
  default: { props: ['slide', 'scale'], template: '<div data-testid="slide-view" :data-slide="slide.id" :data-scale="scale" />' },
}))

import NewTemplateSelector from '@/components/create/NewTemplateSelector.vue'

const templates = [
  { id: 'a', name: 'Alpha', kind: 'builtin', layouts: [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }] },
  { id: 'b', name: 'Beta', kind: 'custom', layouts: [{ id: 'm1' }] },
] as unknown as TemplateSummary[]

function mountSelector(modelValue: string | null = null) {
  const w = mount(NewTemplateSelector, {
    props: { templates, modelValue, 'onUpdate:modelValue': (v: string | null) => w.setProps({ modelValue: v }) },
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
    attachTo: document.body,
  })
  return w
}
type W = ReturnType<typeof mountSelector>
const radios = (w: W) => w.findAll('[role="radio"]')

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('NewTemplateSelector', () => {
  it('offers "Decide later" first and checks it when nothing is chosen', () => {
    const w = mountSelector()
    expect(radios(w)).toHaveLength(3)
    expect(radios(w)[0].text()).toContain('Decide later')
    expect(radios(w)[0].attributes('aria-checked')).toBe('true')
  })

  it('identifies each template by its main image (first layout) and name', async () => {
    const w = mountSelector()
    await flushPromises()
    const a = w.get('[data-testid="new-template-a"]')
    expect(a.text()).toContain('Alpha')
    expect(a.findAll('[data-testid="slide-view"]').map((v) => v.attributes('data-slide'))).toEqual(['a-preview-0'])
    expect(w.get('[data-testid="new-template-b"] [data-testid="slide-view"]').attributes('data-slide')).toBe('b-preview-0')
  })

  it('selecting a template updates the model and checks it', async () => {
    const w = mountSelector()
    await w.get('[data-testid="new-template-b"]').trigger('click')
    expect(w.props('modelValue')).toBe('b')
    expect(w.get('[data-testid="new-template-b"]').attributes('aria-checked')).toBe('true')
    expect(radios(w)[0].attributes('aria-checked')).toBe('false')
  })

  it('"Decide later" clears the selection', async () => {
    const w = mountSelector('a')
    await radios(w)[0].trigger('click')
    expect(w.props('modelValue')).toBeNull()
  })

  it('disables every option when disabled', () => {
    const w = mount(NewTemplateSelector, {
      props: { templates, modelValue: null, disabled: true },
      global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
    })
    expect(w.findAll('[role="radio"]').every((r) => r.attributes('disabled') !== undefined)).toBe(true)
  })
})
