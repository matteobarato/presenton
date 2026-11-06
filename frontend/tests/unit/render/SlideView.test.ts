import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Slide } from '@/api/types'
import SlideView from '@/render/SlideView.vue'

const renderer = vi.hoisted(() => ({ fail: false }))
vi.mock('@/render/legacy/lib/template-v2-json-to-html', async (importActual) => {
  const actual = await importActual<typeof import('@/render/legacy/lib/template-v2-json-to-html')>()
  return {
    ...actual,
    templateV2UiToHtmlFragment: vi.fn((...args: Parameters<typeof actual.templateV2UiToHtmlFragment>) => {
      if (renderer.fail) {
        renderer.fail = false
        throw new Error('boom')
      }
      return actual.templateV2UiToHtmlFragment(...args)
    }),
  }
})

const template = JSON.parse(
  readFileSync(resolve(process.cwd(), '../templates/modern/template.json'), 'utf8'),
)
const templateSlide = { id: 't1', ui: template.layouts[0], layout_group: 'modern', layout: 'modern:a' } as unknown as Slide
const smartSlide = { id: 's1', html_content: '<div>hi</div>', layout_group: 'smart-html' } as unknown as Slide

let resizeCallbacks: ResizeObserverCallback[] = []
beforeEach(() => {
  resizeCallbacks = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        resizeCallbacks.push(cb)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SlideView', () => {
  it('renders template slide into shadow root', async () => {
    const wrapper = mount(SlideView, { props: { slide: templateSlide }, attachTo: document.body })
    await wrapper.vm.$nextTick()
    const host = wrapper.find('[data-template-host]').element
    expect(host.shadowRoot!.innerHTML.length).toBeGreaterThan(0)
    expect(wrapper.attributes('data-slide-id')).toBe('t1')
    expect(wrapper.emitted('rendered')).toBeTruthy()
    wrapper.unmount()
  })

  it('smart slide renders sandboxed iframe', () => {
    const wrapper = mount(SlideView, { props: { slide: smartSlide } })
    const frame = wrapper.find('iframe')
    expect(frame.attributes('sandbox')).toBe('allow-scripts')
    expect(frame.attributes('srcdoc')).toContain('<div>hi</div>')
  })

  it('isolates render errors', async () => {
    renderer.fail = true
    const bad = mount(SlideView, { props: { slide: templateSlide }, attachTo: document.body })
    const good = mount(SlideView, { props: { slide: { ...templateSlide, id: 't2' } }, attachTo: document.body })
    await bad.vm.$nextTick()
    await good.vm.$nextTick()
    expect(bad.text()).toContain("Can't render this slide")
    expect(bad.emitted('error')).toBeTruthy()
    expect(good.text()).not.toContain("Can't render this slide")
    expect(good.find('[data-template-host]').element.shadowRoot!.innerHTML.length).toBeGreaterThan(0)
    bad.unmount()
    good.unmount()
  })

  it('scales to container', async () => {
    const wrapper = mount(SlideView, { props: { slide: smartSlide } })
    resizeCallbacks.forEach((cb) =>
      cb([{ contentRect: { width: 640, height: 360 } } as ResizeObserverEntry], {} as ResizeObserver),
    )
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-slide-stage]').attributes('style')).toContain('scale(0.5)')
  })

  it('renders blank slides as a neutral stage', () => {
    const wrapper = mount(SlideView, { props: { slide: { id: 'b', layout: 'blank' } as unknown as Slide } })
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.find('[data-slide-stage]').exists()).toBe(true)
  })

  it('lazy waits for IntersectionObserver', async () => {
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
    const wrapper = mount(SlideView, { props: { slide: smartSlide, lazy: true } })
    expect(wrapper.find('iframe').exists()).toBe(false)
    fire([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('iframe').exists()).toBe(true)
  })
})
