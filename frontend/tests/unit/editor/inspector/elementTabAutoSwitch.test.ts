import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { Selection } from '@/slide-editor/model'
import type { SlideEditing } from '@/slide-editor/useSlideEditing'
import { useElementTabAutoSwitch } from '@/composables/useElementTabAutoSwitch'
import { useEditorStore } from '@/stores/editor'

let narrow = false
vi.stubGlobal('matchMedia', (q: string) => ({
  matches: q.includes('max-width: 1050px') ? narrow : false,
  media: q,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
}))

function setup() {
  const selection = ref<Selection>(null)
  const gestureActive = ref(false)
  const ctx = { selection, gestureActive } as unknown as SlideEditing
  mount(defineComponent({ setup() { useElementTabAutoSwitch(ctx); return () => null } }))
  return { selection, gestureActive, editor: useEditorStore() }
}
const sel: Selection = { kind: 'component', componentIndex: 0 }

beforeEach(() => {
  setActivePinia(createPinia())
  narrow = false
})

describe('useElementTabAutoSwitch', () => {
  it('switches to the element tab and opens a closed docked inspector', async () => {
    const { selection, editor } = setup()
    editor.inspectorOpen = false
    selection.value = sel
    await nextTick()
    expect(editor.inspectorTab).toBe('element')
    expect(editor.inspectorOpen).toBe(true)
  })

  it('leaves a closed inspector closed when narrow', async () => {
    narrow = true
    const { selection, editor } = setup()
    editor.inspectorOpen = false
    selection.value = sel
    await nextTick()
    expect(editor.inspectorTab).toBe('element')
    expect(editor.inspectorOpen).toBe(false)
  })

  it('deselect and re-selecting within a selection do not switch tabs', async () => {
    const { selection, editor } = setup()
    selection.value = sel
    await nextTick()
    editor.inspectorTab = 'design'
    selection.value = { kind: 'component', componentIndex: 1 }
    await nextTick()
    expect(editor.inspectorTab).toBe('design')
    selection.value = null
    await nextTick()
    expect(editor.inspectorTab).toBe('design')
  })

  it('waits for the gesture that made the selection to end before opening the inspector', async () => {
    const { selection, gestureActive, editor } = setup()
    editor.inspectorOpen = false
    editor.inspectorTab = 'design'
    gestureActive.value = true // press on an element: a drag may follow
    selection.value = sel
    await nextTick()
    expect(editor.inspectorOpen).toBe(false)
    expect(editor.inspectorTab).toBe('design')
    gestureActive.value = false // pointerup
    await nextTick()
    expect(editor.inspectorTab).toBe('element')
    expect(editor.inspectorOpen).toBe(true)
  })

  it('a selection cleared before the gesture ends opens nothing', async () => {
    const { selection, gestureActive, editor } = setup()
    editor.inspectorOpen = false
    gestureActive.value = true
    selection.value = sel
    await nextTick()
    selection.value = null
    gestureActive.value = false
    await nextTick()
    expect(editor.inspectorOpen).toBe(false)
  })
})
