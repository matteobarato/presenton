import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { Selection } from '@/slide-editor/model'
import type { SlideEditing } from '@/slide-editor/useSlideEditing'
import { useSelectionScope } from '@/composables/useSelectionScope'

function setup() {
  const selection = ref<Selection>({ kind: 'component', componentIndex: 0 })
  const ctx = { selection, select: (s: Selection) => (selection.value = s) } as unknown as SlideEditing
  const wrapper = mount(
    defineComponent({
      setup() {
        useSelectionScope(ctx)
        return () =>
          h('div', [
            h('nav', { 'data-slide-navigator': '' }, [h('button', { id: 'thumb' }, 'Slide 1')]),
            h('button', { id: 'elsewhere' }, 'Other'),
          ])
      },
    }),
    { attachTo: document.body },
  )
  return { selection, wrapper }
}

beforeEach(() => setActivePinia(createPinia()))

describe('useSelectionScope', () => {
  it('a press in the slide navigator clears the slide selection', () => {
    const { selection, wrapper } = setup()
    wrapper.get('#thumb').element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(selection.value).toBeNull()
    wrapper.unmount()
  })

  it('focus moving into the navigator clears it too', () => {
    const { selection, wrapper } = setup()
    ;(wrapper.get('#thumb').element as HTMLElement).focus()
    expect(selection.value).toBeNull()
    wrapper.unmount()
  })

  it('a press elsewhere keeps it', () => {
    const { selection, wrapper } = setup()
    wrapper.get('#elsewhere').element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(selection.value).not.toBeNull()
    wrapper.unmount()
  })
})
