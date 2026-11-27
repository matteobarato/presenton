import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, defineComponent, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { SlideAnimation } from '@/api/types'
import { motionTargetFor, selectionForMotionTarget, useMotionSelectionSync } from '@/composables/useMotionSelectionSync'
import { ROOT_ELEMENTS_COMPONENT_INDEX, type Selection } from '@/slide-editor/model'
import { useEditorStore } from '@/stores/editor'
import { uiWithText } from '../slide-editor/fixtures'

const rootText = (text: string) => ({ type: 'text', position: { x: 0, y: 0 }, size: { width: 100, height: 40 }, text })
// e0 = root element 0, e1 = component 0.
const ui = { ...(uiWithText() as object), elements: [rootText('a')] }
const rootSel: Selection = { kind: 'element', componentIndex: ROOT_ELEMENTS_COMPONENT_INDEX, elementPath: [0] }
const componentSel: Selection = { kind: 'component', componentIndex: 0 }

function setup(targets = ['e0', 'e1']) {
  const selection = ref<Selection>(null)
  const stale = ref(false)
  const animation = computed(() => ({ targets: targets.map((id) => ({ id })) }) as unknown as SlideAnimation)
  const editing = { ui: computed(() => ui), selection, select: (s: Selection) => (selection.value = s) }
  mount(
    defineComponent({
      setup() {
        useMotionSelectionSync(editing as never, { animation, stale: computed(() => stale.value) })
        return () => null
      },
    }),
  )
  return { selection, stale, editor: useEditorStore() }
}

beforeEach(() => setActivePinia(createPinia()))

describe('motion target mapping', () => {
  it('maps root elements and components to their rendered item, and back', () => {
    expect(motionTargetFor(ui, rootSel)).toBe('e0')
    expect(motionTargetFor(ui, componentSel)).toBe('e1')
    expect(selectionForMotionTarget(ui, 'e0')).toEqual(rootSel)
    expect(selectionForMotionTarget(ui, 'e1')).toEqual(componentSel)
  })

  it('maps an element nested in a component to that component', () => {
    expect(motionTargetFor(ui, { kind: 'element', componentIndex: 0, elementPath: [0] })).toBe('e1')
  })

  it('maps nothing, several components or an unknown id to none', () => {
    expect(motionTargetFor(ui, null)).toBeNull()
    expect(motionTargetFor(ui, { kind: 'multi-component', componentIndexes: [0] })).toBeNull()
    expect(selectionForMotionTarget(ui, 'e9')).toBeNull()
    expect(selectionForMotionTarget(ui, 'bogus')).toBeNull()
  })
})

describe('useMotionSelectionSync', () => {
  it('selecting on the slide picks the motion track', async () => {
    const { selection, editor } = setup()
    selection.value = componentSel
    await nextTick()
    expect(editor.motionTarget).toBe('e1')
    selection.value = null
    await nextTick()
    expect(editor.motionTarget).toBeNull()
  })

  it('picking a track selects its element on the slide', async () => {
    const { selection, editor } = setup()
    editor.motionTarget = 'e0'
    await nextTick()
    expect(selection.value).toEqual(rootSel)
  })

  it('keeps a nested selection inside the picked track', async () => {
    const { selection, editor } = setup()
    const nested: Selection = { kind: 'element', componentIndex: 0, elementPath: [0] }
    selection.value = nested
    await nextTick()
    expect(editor.motionTarget).toBe('e1')
    await nextTick()
    expect(selection.value).toEqual(nested)
  })

  it('an element with no track clears the picked track', async () => {
    const { selection, editor } = setup(['e1'])
    editor.motionTarget = 'e1'
    await nextTick()
    selection.value = rootSel
    await nextTick()
    expect(editor.motionTarget).toBeNull()
  })

  it('leaves both alone while the preview runs, and reselects the track when it stops', async () => {
    const { selection, editor } = setup()
    editor.motionTarget = 'e1'
    await nextTick()
    editor.motionTime = 0.5
    selection.value = null // the preview clears the slide selection
    await nextTick()
    expect(editor.motionTarget).toBe('e1')
    editor.motionTime = null
    await nextTick()
    expect(selection.value).toEqual(componentSel)
  })

  it('does not sync a stale plan', async () => {
    const { selection, stale, editor } = setup()
    stale.value = true
    editor.motionTarget = 'e0'
    await nextTick()
    expect(selection.value).toBeNull()
  })
})
