import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import PresentStage from '@/components/present/PresentStage.vue'
import type { AnimationTween } from '@/api/types'

const m = vi.hoisted(() => ({ createPreview: vi.fn(), play: vi.fn(), dispose: vi.fn() }))
vi.mock('@/motion/preview', () => ({
  createPreview: (...args: unknown[]) => {
    m.createPreview(...args)
    return { play: m.play, dispose: m.dispose }
  },
}))
// A stand-in slide: a [data-slide-stage] holding one host with an open shadow root, like the real one.
vi.mock('@/render/SlideView.vue', () => ({
  default: {
    props: ['slide', 'annotate'],
    emits: ['rendered'],
    mounted() {
      const host = (this as { $el: HTMLElement }).$el.querySelector('[data-host]') as HTMLElement
      host.attachShadow({ mode: 'open' })
    },
    template: '<div :data-annotate="annotate"><div data-slide-stage><div data-host /></div><button data-render @click="$emit(\'rendered\')" /></div>',
  },
}))

const rise: AnimationTween = { target: 'e0', from_values: { opacity: 0, y: 32 }, duration: 0.6, delay: 0, ease: 'power2.out' }
const slide = (id: string) => ({ id, index: 0, ui: {} }) as never

function mountStage(props: Record<string, unknown>) {
  return mount(PresentStage, {
    props: { slide: slide('s1'), reducedMotion: false, avatar: null, playing: false, ...props },
    attachTo: document.body,
  })
}

describe('PresentStage: entrance motion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('plays the stored plan once the slide has rendered, on the slide shadow root', async () => {
    const w = mountStage({ tweens: [rise] })
    expect(m.createPreview).not.toHaveBeenCalled()
    await w.get('[data-render]').trigger('click')
    expect(m.createPreview).toHaveBeenCalledTimes(1)
    const [root, tweens, opts] = m.createPreview.mock.calls[0]
    expect(root).toBeInstanceOf(ShadowRoot)
    expect(tweens).toEqual([rise])
    expect(opts).toEqual({ reducedMotion: false })
    expect(m.play).toHaveBeenCalledTimes(1)
  })

  it('annotates the slide only when there is a plan, and does nothing without one', async () => {
    const w = mountStage({ tweens: [] })
    expect(w.get('[data-annotate]').attributes('data-annotate')).toBe('false')
    await w.get('[data-render]').trigger('click')
    expect(m.createPreview).not.toHaveBeenCalled()
  })

  it('starts when the plan arrives after the slide rendered', async () => {
    const w = mountStage({ tweens: [] })
    await w.get('[data-render]').trigger('click')
    await w.setProps({ tweens: [rise] })
    await w.get('[data-render]').trigger('click') // annotate re-renders the host
    expect(m.createPreview).toHaveBeenCalled()
    expect(m.play).toHaveBeenCalled()
  })

  it('passes reduced motion through, and restores the slide on change and unmount', async () => {
    const w = mountStage({ tweens: [rise], reducedMotion: true })
    await w.get('[data-render]').trigger('click')
    expect(m.createPreview.mock.calls[0][2]).toEqual({ reducedMotion: true })
    await w.setProps({ slide: slide('s2'), tweens: [] })
    await nextTick()
    expect(m.dispose).toHaveBeenCalledTimes(1)
  })

  it('restores the slide when present mode closes mid-animation', async () => {
    const w = mountStage({ tweens: [rise] })
    await w.get('[data-render]').trigger('click')
    w.unmount()
    expect(m.dispose).toHaveBeenCalledTimes(1)
  })
})
