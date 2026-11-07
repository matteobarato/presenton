import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import type { Slide } from '@/api/types'

const editSlideUi = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useSlideMutations', () => ({ useSlideMutations: () => ({ editSlideUi }) }))
vi.mock('@/api/presentations', () => ({ usePresentation: () => ({ data: ref(undefined) }) }))

import EditorCanvas from '@/components/editor/EditorCanvas.vue'
import EditableSlide from '@/components/editor/canvas/EditableSlide.vue'
import SlideView from '@/render/SlideView.vue'
import { absoluteBoxForSelection, type RawUi } from '@/slide-editor/model'
import { useEditorStore } from '@/stores/editor'
import { useSlideEditing } from '@/slide-editor/useSlideEditing'
import { uiTwoComponents, uiWithText } from '../../slide-editor/fixtures'
import { mountEditable, pointer, stubRect, tpl } from './harness'

let rect: ReturnType<typeof stubRect>
let current: ReturnType<typeof mountEditable> | null = null

function setup(ui: RawUi) {
  current = mountEditable(tpl('a', ui))
  // The committed ui reaches the slide as the cache write would.
  editSlideUi.mockImplementation(async (_id: string, next: RawUi) => {
    current!.slide.value = tpl('a', next)
    return true
  })
  return current
}

const overlay = () => current!.wrapper.get('[data-testid="selection-overlay"]').element
const committedUi = (call = 0) => editSlideUi.mock.calls[call]![1] as RawUi
const componentX = (ui: RawUi, i: number) => (ui.components as { position: { x: number } }[])[i]!.position.x

async function drag(fromX: number, fromY: number, toX: number, toY: number) {
  pointer(overlay(), 'pointerdown', fromX, fromY)
  pointer(overlay(), 'pointermove', fromX + 4, fromY)
  pointer(overlay(), 'pointermove', toX, toY)
  pointer(overlay(), 'pointerup', toX, toY)
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  editSlideUi.mockReset()
  rect = stubRect()
})
afterEach(() => {
  current?.wrapper.unmount()
  current = null
  rect.mockRestore()
})

describe('EditableSlide', () => {
  it('click selects the component under the pointer', async () => {
    const { api } = setup(uiTwoComponents())
    pointer(overlay(), 'pointerdown', 150, 100)
    pointer(overlay(), 'pointerup', 150, 100)
    expect(api().selection.value).toEqual({ kind: 'component', componentIndex: 0 })
  })

  it('shift-click adds a component to a multi-selection', async () => {
    const { api } = setup(uiTwoComponents())
    pointer(overlay(), 'pointerdown', 150, 100)
    pointer(overlay(), 'pointerup', 150, 100)
    pointer(overlay(), 'pointerdown', 700, 300, { shiftKey: true })
    pointer(overlay(), 'pointerup', 700, 300, { shiftKey: true })
    expect(api().selection.value).toEqual({ kind: 'multi-component', componentIndexes: [0, 1] })
  })

  it('click on empty slide clears the selection', async () => {
    const { api } = setup(uiTwoComponents())
    api().select({ kind: 'component', componentIndex: 0 })
    pointer(overlay(), 'pointerdown', 50, 650)
    pointer(overlay(), 'pointerup', 50, 650)
    expect(api().selection.value).toBeNull()
  })

  it('drag moves the component and commits once', async () => {
    setup(uiWithText())
    await drag(150, 100, 250, 100)
    expect(editSlideUi).toHaveBeenCalledTimes(1)
    expect(editSlideUi.mock.calls[0]![2]).toBe('Move')
    expect(componentX(committedUi(), 0)).toBe(200)
  })

  it('a move under the 3 screen px threshold does not commit', async () => {
    setup(uiWithText())
    pointer(overlay(), 'pointerdown', 150, 100)
    pointer(overlay(), 'pointermove', 154, 100)
    pointer(overlay(), 'pointerup', 154, 100)
    await flushPromises()
    expect(editSlideUi).not.toHaveBeenCalled()
  })

  it('drag snaps to the slide centre within the threshold', async () => {
    setup(uiWithText())
    // Unsnapped, the box would land at x 430 (centre 630): 10 slide px from the centre, under 8 screen px.
    await drag(150, 100, 480, 100)
    const box = absoluteBoxForSelection(committedUi(), { kind: 'component', componentIndex: 0 })!
    expect(box.x + box.width / 2).toBe(640)
  })

  it('shows guides while dragging and translates the dragged layer', async () => {
    const { wrapper, api } = setup(uiWithText())
    pointer(overlay(), 'pointerdown', 150, 100)
    pointer(overlay(), 'pointermove', 160, 100)
    pointer(overlay(), 'pointermove', 480, 100)
    await nextTick()
    expect(api().guides.value.some((g) => g.axis === 'vertical' && g.coordinate === 640)).toBe(true)
    expect(wrapper.findAll('[data-guide]').length).toBeGreaterThan(0)
    const host = wrapper.get('[data-template-host]').element as HTMLElement
    const layer = host.shadowRoot!.querySelector<HTMLElement>('[data-hf-el="e0"]')!
    expect(layer.style.transform).toMatch(/^translate\(340px(, 0px)?\)$/)
    pointer(overlay(), 'pointerup', 480, 100)
    expect(layer.style.transform).toBe('')
    await flushPromises()
    expect(api().guides.value).toEqual([])
  })

  it('drag is clamped into the slide', async () => {
    setup(uiWithText())
    await drag(150, 100, 1500, 100)
    expect(componentX(committedUi(), 0)).toBe(880)
  })

  it('pointerup outside ends drag', async () => {
    const { api } = setup(uiWithText())
    pointer(overlay(), 'pointerdown', 150, 100)
    pointer(overlay(), 'pointermove', 160, 100)
    pointer(overlay(), 'pointermove', 250, 100)
    pointer(window, 'pointerup', 250, 100)
    await flushPromises()
    pointer(overlay(), 'pointerup', 250, 100)
    overlay().dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1 }))
    await flushPromises()
    expect(editSlideUi).toHaveBeenCalledTimes(1)
    expect(api().draftUi.value).toBeNull()
  })

  it('resize via the right handle widens the component', async () => {
    const { wrapper, api } = setup(uiWithText())
    api().select({ kind: 'component', componentIndex: 0 })
    await nextTick()
    const handle = wrapper.get('[data-handle="e"]').element
    pointer(handle, 'pointerdown', 500, 140)
    pointer(handle, 'pointermove', 700, 140)
    pointer(handle, 'pointerup', 700, 140)
    await flushPromises()
    expect(editSlideUi).toHaveBeenCalledTimes(1)
    expect(editSlideUi.mock.calls[0]![2]).toBe('Resize')
    const box = absoluteBoxForSelection(committedUi(), { kind: 'component', componentIndex: 0 })!
    expect(box).toMatchObject({ x: 100, width: 600, height: 120 })
    expect(api().draftUi.value).toBeNull()
  })

  it('corner resize scales the content and shift keeps the ratio', async () => {
    const { wrapper, api } = setup(uiWithText())
    api().select({ kind: 'component', componentIndex: 0 })
    await nextTick()
    const handle = wrapper.get('[data-handle="se"]').element
    pointer(handle, 'pointerdown', 500, 200)
    pointer(handle, 'pointermove', 900, 220, { shiftKey: true })
    pointer(handle, 'pointerup', 900, 220, { shiftKey: true })
    await flushPromises()
    const ui = committedUi()
    const box = absoluteBoxForSelection(ui, { kind: 'component', componentIndex: 0 })!
    expect(box).toMatchObject({ x: 100, y: 80, width: 800, height: 240 })
    const text = (ui.components as { elements: { font: { size: number } }[] }[])[0]!.elements[0]!
    expect(text.font.size).toBeCloseTo(48)
  })

  it('resize shows the draft while the handle moves', async () => {
    const { wrapper, api } = setup(uiWithText())
    api().select({ kind: 'component', componentIndex: 0 })
    await nextTick()
    const handle = wrapper.get('[data-handle="e"]').element
    pointer(handle, 'pointerdown', 500, 140)
    pointer(handle, 'pointermove', 700, 140)
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(absoluteBoxForSelection(api().draftUi.value!, { kind: 'component', componentIndex: 0 })!.width).toBe(600)
    pointer(handle, 'pointerup', 700, 140)
    await flushPromises()
  })

  it('no handles for a multi-selection', async () => {
    const { wrapper, api } = setup(uiTwoComponents())
    api().select({ kind: 'multi-component', componentIndexes: [0, 1] })
    await nextTick()
    expect(wrapper.findAll('[data-handle]')).toHaveLength(0)
    expect(wrapper.findAll('[data-selection-box]')).toHaveLength(2)
  })

  it('a drag in progress is cancelled on slide change', async () => {
    const { slide, api } = setup(uiWithText())
    pointer(overlay(), 'pointerdown', 150, 100)
    pointer(overlay(), 'pointermove', 160, 100)
    pointer(overlay(), 'pointermove', 250, 100)
    slide.value = tpl('b', uiTwoComponents())
    await nextTick()
    pointer(window, 'pointerup', 250, 100)
    await flushPromises()
    expect(editSlideUi).not.toHaveBeenCalled()
    expect(api().draftUi.value).toBeNull()
    expect(api().guides.value).toEqual([])
  })

  it('a resize in progress is cancelled on slide change and leaks no draft', async () => {
    const { wrapper, slide, api } = setup(uiWithText())
    api().select({ kind: 'component', componentIndex: 0 })
    await nextTick()
    const handle = wrapper.get('[data-handle="e"]').element
    pointer(handle, 'pointerdown', 500, 140)
    pointer(handle, 'pointermove', 700, 140)
    slide.value = tpl('b', uiTwoComponents())
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    pointer(window, 'pointerup', 700, 140)
    await flushPromises()
    expect(editSlideUi).not.toHaveBeenCalled()
    expect(api().draftUi.value).toBeNull()
  })

  it('no overlay while the deck is busy', async () => {
    const { wrapper } = setup(uiWithText())
    useEditorStore().deckBusy = 1
    await nextTick()
    expect(wrapper.find('[data-testid="selection-overlay"]').exists()).toBe(false)
  })
})

describe('EditableSlide of a slide the context has left', () => {
  it('has no overlay, so no hover or gestures', async () => {
    const slide = ref<Slide | null>(tpl('b', uiWithText()))
    const w = mount(
      defineComponent({
        setup() {
          useSlideEditing(ref('p1'), slide)
          // the leaving slide of an out-in transition still renders its own slide
          return () => h(EditableSlide, { slide: tpl('a', uiWithText()) })
        },
      }),
    )
    await nextTick()
    expect(w.find('[data-testid="selection-overlay"]').exists()).toBe(false)
    w.unmount()
  })
})

describe('EditorCanvas', () => {
  const mountCanvas = (slide: Slide) =>
    mount(
      defineComponent({
        setup() {
          // EditorView provides the editing state in the app.
          useSlideEditing(ref('p1'), ref<Slide | null>(slide))
          return () => h(EditorCanvas, { presentationId: 'p1', slide })
        },
      }),
      { global: { stubs: { FloatingToolbar: true, SlideView: true } } },
    )

  it('smart slide renders SlideView and no overlay', async () => {
    const w = mountCanvas({ id: 's', index: 0, html_content: '<p>x</p>', layout_group: 'smart-html' } as unknown as Slide)
    await nextTick()
    expect(w.findComponent(SlideView).exists()).toBe(true)
    expect(w.findComponent(EditableSlide).exists()).toBe(false)
    expect(w.find('[data-testid="selection-overlay"]').exists()).toBe(false)
    w.unmount()
  })

  it('template slide renders EditableSlide with the overlay', async () => {
    const w = mountCanvas(tpl('a', uiWithText()))
    await nextTick()
    expect(w.findComponent(EditableSlide).exists()).toBe(true)
    expect(w.find('[data-testid="selection-overlay"]').exists()).toBe(true)
    w.unmount()
  })
})
