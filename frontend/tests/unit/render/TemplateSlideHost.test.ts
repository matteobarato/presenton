import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TemplateSlideHost from '@/render/TemplateSlideHost.vue'
import { uiWithText } from '../slide-editor/fixtures'

describe('TemplateSlideHost layerFor', () => {
  it('returns the annotated layer of a component', () => {
    const wrapper = mount(TemplateSlideHost, { props: { ui: uiWithText(), annotate: true } })
    const layer = wrapper.vm.layerFor({ kind: 'component', index: 0 })
    expect(layer?.hasAttribute('data-hf-el')).toBe(true)
    expect(wrapper.vm.layerFor({ kind: 'component', index: 9 })).toBeNull()
    wrapper.unmount()
  })
})
