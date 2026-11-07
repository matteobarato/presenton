import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import BlockThumb from '@/components/editor/inspector/insert/BlockThumb.vue'
import TemplateSlideHost from '@/render/TemplateSlideHost.vue'

vi.mock('@/render/TemplateSlideHost.vue', () => ({
  default: defineComponent({ props: { ui: null, theme: null, fonts: null }, setup: () => () => h('div', { 'data-testid': 'host' }) }),
}))

const block = { key: 'b', title: 'B', description: '', elementCount: 0, raw: { id: 'b', elements: [] } }

afterEach(() => vi.unstubAllGlobals())

describe('BlockThumb', () => {
  it('mounts the slide host only once scrolled into view, with the block alone', async () => {
    let fire: IntersectionObserverCallback = () => {}
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          fire = cb
        }
        observe() {}
        disconnect() {}
      },
    )
    const wrapper = mount(BlockThumb, { props: { block, theme: { a: 1 }, fonts: null } })
    expect(wrapper.find('[data-testid="host"]').exists()).toBe(false)
    fire([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    await nextTick()
    const host = wrapper.findComponent(TemplateSlideHost)
    expect(host.props('ui')).toEqual({ components: [block.raw] })
    expect(host.props('theme')).toEqual({ a: 1 })
  })
})
