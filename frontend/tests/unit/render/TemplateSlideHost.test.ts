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

describe('TemplateSlideHost avatar video', () => {
  const ui = () => ({
    components: [
      { id: 'text', position: { x: 0, y: 0 }, elements: [{ type: 'text', text: 'Hi', position: { x: 0, y: 0 }, size: { width: 200, height: 40 } }] },
      {
        id: 'video_placeholder',
        position: { x: 900, y: 400 },
        elements: [{ type: 'image', data: '/p.png', video_placeholder: true, position: { x: 0, y: 0 }, size: { width: 320, height: 240 } }],
      },
    ],
  })
  const shadowOf = (wrapper: ReturnType<typeof mount>) => (wrapper.find('[data-template-host]').element as HTMLElement).shadowRoot!

  it('plays the slide video in the placeholder, in place of its picture', async () => {
    const wrapper = mount(TemplateSlideHost, { props: { ui: ui(), annotate: true } })
    expect(shadowOf(wrapper).querySelector('video')).toBeNull()
    expect(shadowOf(wrapper).querySelector('[data-video-placeholder]')).not.toBeNull()

    await wrapper.setProps({ videoSrc: '/app_data/videos/s1.mp4' })
    await nextTick()
    const video = shadowOf(wrapper).querySelector('video')!
    expect(video.getAttribute('src')).toBe('/app_data/videos/s1.mp4#t=0.1')
    expect(video.style.objectFit).toBe('cover')
    expect(shadowOf(wrapper).querySelector('img[src="/p.png"]')).toBeNull()
    wrapper.unmount()
  })
})
