import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const sources = vi.hoisted(() => ({ calls: 0 }))
vi.mock('@/render/legacy/lib/template-v2-json-to-html', async (importActual) => {
  const actual = await importActual<typeof import('@/render/legacy/lib/template-v2-json-to-html')>()
  return {
    ...actual,
    templateV2ItemSources: (ui: unknown) => {
      sources.calls += 1
      return actual.templateV2ItemSources(ui)
    },
  }
})

import TemplateSlideHost from '@/render/TemplateSlideHost.vue'
import { uiTwoComponents, uiWithText } from '../slide-editor/fixtures'

describe('TemplateSlideHost layerFor', () => {
  it('returns the annotated layer of a component', () => {
    const wrapper = mount(TemplateSlideHost, { props: { ui: uiWithText(), annotate: true } })
    const layer = wrapper.vm.layerFor({ kind: 'component', index: 0 })
    expect(layer?.hasAttribute('data-hf-el')).toBe(true)
    expect(wrapper.vm.layerFor({ kind: 'component', index: 9 })).toBeNull()
    wrapper.unmount()
  })

  it('maps sources with the ones computed for the rendered DOM, not per call', async () => {
    const wrapper = mount(TemplateSlideHost, { props: { ui: uiWithText(), annotate: true } })
    const afterRender = sources.calls
    wrapper.vm.layerFor({ kind: 'component', index: 0 })
    wrapper.vm.layerFor({ kind: 'component', index: 0 })
    expect(sources.calls).toBe(afterRender)

    await wrapper.setProps({ ui: uiTwoComponents() })
    await nextTick()
    expect(wrapper.vm.layerFor({ kind: 'component', index: 1 })?.getAttribute('data-hf-el')).toBe('e1')
    wrapper.unmount()
  })
})
