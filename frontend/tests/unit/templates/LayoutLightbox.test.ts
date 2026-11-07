import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/render/SlideView.vue', () => ({
  default: { props: ['slide'], template: '<div data-testid="slide-view" :data-slide="slide.id" />' },
}))

import LayoutLightbox from '@/components/templates/LayoutLightbox.vue'

const slides = [0, 1, 2].map((i) => ({ id: `t-preview-${i}` })) as never[]

function mountBox(index: number | null = 1) {
  const w = mount(LayoutLightbox, {
    props: { slides, title: 'Brand', index, 'onUpdate:index': (v: number | null) => w.setProps({ index: v }) },
    attachTo: document.body,
  })
  return w
}
const q = (s: string) => document.body.querySelector(s) as HTMLElement | null
const byLabel = (l: string) => q(`[aria-label="${l}"]`) as HTMLButtonElement

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('LayoutLightbox', () => {
  it('opens at the given index with a counter', async () => {
    mountBox(1)
    await nextTick()
    expect(q('[data-testid="lightbox-counter"]')?.textContent).toBe('2 / 3')
    expect(q('[data-testid="slide-view"]')?.getAttribute('data-slide')).toBe('t-preview-1')
  })

  it('arrow keys and buttons move, clamped at ends', async () => {
    mountBox(1)
    await nextTick()
    const key = async (k: string) => {
      q('[aria-label="Next layout"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
      await flushPromises()
    }
    await key('ArrowRight')
    expect(q('[data-testid="lightbox-counter"]')?.textContent).toBe('3 / 3')
    await key('ArrowRight')
    expect(q('[data-testid="lightbox-counter"]')?.textContent).toBe('3 / 3')
    byLabel('Previous layout').click()
    await flushPromises()
    expect(q('[data-testid="lightbox-counter"]')?.textContent).toBe('2 / 3')
    await key('ArrowLeft')
    await key('ArrowLeft')
    expect(q('[data-testid="lightbox-counter"]')?.textContent).toBe('1 / 3')
    expect(byLabel('Previous layout').getAttribute('aria-disabled')).toBe('true')
  })

  it('arrow keys still work from a focused end button', async () => {
    mountBox(1)
    await nextTick()
    const next = byLabel('Next layout')
    next.focus()
    next.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await flushPromises()
    expect(q('[data-testid="lightbox-counter"]')?.textContent).toBe('3 / 3')
    expect(next.disabled).toBe(false)
    expect(next.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(next)
    next.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await flushPromises()
    expect(q('[data-testid="lightbox-counter"]')?.textContent).toBe('2 / 3')
  })

  it('Escape closes', async () => {
    const w = mountBox(0)
    await nextTick()
    q('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(w.emitted('update:index')?.at(-1)).toEqual([null])
  })
})
