import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import type { ElementSelection, RawUi, Selection } from '@/slide-editor/model'
import { getElementAtSelection } from '@/slide-editor/model'
import type { SlideEditing } from '@/slide-editor/useSlideEditing'
import { useSelectedElement } from '@/slide-editor/useSelectedElement'

const ui = (): RawUi =>
  ({
    components: [
      { id: 'a', elements: [{ type: 'vector', closed: true, keep: 1 }] },
      { id: 'b', elements: [{ type: 'text', text: 'hi' }] },
    ],
  }) as unknown as RawUi

function setup(selection: Selection, initial: RawUi = ui()) {
  const uiRef = ref<RawUi>(initial)
  const ctx = {
    ui: computed(() => uiRef.value),
    selection: ref<Selection>(selection),
    select: vi.fn(),
    commit: vi.fn(async (next: RawUi) => {
      uiRef.value = next
      return true
    }),
  } as unknown as SlideEditing
  return { ctx, uiRef, api: useSelectedElement(ctx) }
}
const at0: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }

describe('useSelectedElement', () => {
  it('targets the lone element of a selected component and none for multi', () => {
    expect(setup({ kind: 'component', componentIndex: 0 }).api.target.value).toEqual(at0)
    expect(setup({ kind: 'multi-component', componentIndexes: [0, 1] }).api.target.value).toBeNull()
    expect(setup(null).api.element.value).toBeNull()
  })

  it('patches the captured element after the selection moved, keeping unknown fields', () => {
    const { ctx, api } = setup({ kind: 'component', componentIndex: 0 })
    const at = api.capture()
    ctx.selection.value = { kind: 'component', componentIndex: 1 }
    api.patch('Fill', (el) => ({ ...el, fill: { color: '#fff' } }), at!)
    const next = (ctx.commit as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RawUi
    expect(getElementAtSelection(next, at0)).toMatchObject({ keep: 1, fill: { color: '#fff' } })
    expect(getElementAtSelection(next, { kind: 'element', componentIndex: 1, elementPath: [0] })).toEqual({ type: 'text', text: 'hi' })
  })

  it('does not commit when the target no longer exists', () => {
    const { ctx, api } = setup({ kind: 'component', componentIndex: 0 })
    api.patch('Fill', (el) => el, { kind: 'element', componentIndex: 5, elementPath: [0] })
    expect(ctx.commit).not.toHaveBeenCalled()
  })
})
