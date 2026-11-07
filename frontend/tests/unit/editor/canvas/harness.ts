import { vi } from 'vitest'
import { defineComponent, h, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { Slide } from '@/api/types'
import EditableSlide from '@/components/editor/canvas/EditableSlide.vue'
import { useSlideEditing, type SlideEditing } from '@/slide-editor/useSlideEditing'

export const tpl = (id: string, ui: unknown) =>
  ({ id, index: 0, layout: 'template-v2-x:a', layout_group: 'template-v2-x', content: {}, ui }) as unknown as Slide

// The slide box is 640×360 on screen: one screen px is two slide px.
export function stubRect() {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, width: 640, height: 360, right: 640, bottom: 360, toJSON: () => ({}),
  } as DOMRect)
}

export function mountEditable(initial: Slide) {
  const slide = ref<Slide>(initial) as Ref<Slide | null>
  let api!: SlideEditing
  const onOpenEditor = vi.fn()
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useSlideEditing(ref('p1'), slide)
        return () => h(EditableSlide, { slide: slide.value!, onOpenEditor })
      },
    }),
    { attachTo: document.body },
  )
  return { wrapper, slide, api: () => api, onOpenEditor }
}

/** Pointer at slide coordinates (screen = slide / 2). */
export function pointer(target: EventTarget, type: string, x: number, y: number, init: PointerEventInit = {}) {
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: x / 2, clientY: y / 2, ...init }),
  )
}
