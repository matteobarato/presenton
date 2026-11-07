import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, defineComponent, h, provide, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import type { RawUi, Selection } from '@/slide-editor/model'
import { SLIDE_EDITING_KEY, type SlideEditing } from '@/slide-editor/useSlideEditing'
import FloatingToolbar from '@/components/editor/FloatingToolbar.vue'
import { uiTwoComponents } from '../../slide-editor/fixtures'

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'p1' } }) }))
vi.mock('@/api/presentations', () => ({ usePresentation: () => ({ data: ref({ slides: [] }) }) }))
vi.mock('@/composables/useEditorFetchGate', () => ({ useEditorFetchGate: () => ref(true) }))
vi.mock('@/composables/useUndoRedo', () => ({
  useUndoRedo: () => ({
    history: { canUndo: true, canRedo: false, undoLabel: '', redoLabel: '' },
    undo: vi.fn(),
    redo: vi.fn(),
  }),
}))

function mountToolbar(sel: Selection, withContext = true, inlineEditing = false) {
  const ui = uiTwoComponents() as RawUi
  const selection = ref<Selection>(sel)
  const ctx = {
    enabled: computed(() => true),
    ui: computed(() => ui),
    selection,
    inlineEdit: shallowRef(inlineEditing ? { selection: sel } : null),
    commit: vi.fn().mockResolvedValue(true),
    select: vi.fn((s: Selection) => {
      selection.value = s
    }),
  } as unknown as SlideEditing
  const wrapper = mount(
    defineComponent({
      setup() {
        if (withContext) provide(SLIDE_EDITING_KEY, ctx)
        return () => h(FloatingToolbar)
      },
    }),
  )
  return { wrapper, ctx, selection }
}

const label = (w: ReturnType<typeof mountToolbar>['wrapper'], l: string) => w.find(`button[aria-label="${l}"]`)

beforeEach(() => setActivePinia(createPinia()))

describe('context toolbar', () => {
  it('shows the slide tools without a selection or a context', () => {
    expect(label(mountToolbar(null).wrapper, 'Undo').exists()).toBe(true)
    expect(label(mountToolbar(null, false).wrapper, 'Undo').exists()).toBe(true)
  })

  it('shows generic tools for a component selection', () => {
    const { wrapper } = mountToolbar({ kind: 'component', componentIndex: 0 })
    expect(label(wrapper, 'Undo').exists()).toBe(false)
    for (const l of ['Deselect', 'Delete', 'Duplicate', 'Copy']) expect(label(wrapper, l).exists()).toBe(true)
    expect(label(wrapper, 'Group').exists()).toBe(false)
    expect(label(wrapper, 'Ungroup').exists()).toBe(false)
  })

  it('shows Group for a multi selection', () => {
    const { wrapper } = mountToolbar({ kind: 'multi-component', componentIndexes: [0, 1] })
    expect(label(wrapper, 'Group').exists()).toBe(true)
    expect(label(wrapper, 'Delete').exists()).toBe(true)
  })

  it('Delete commits with the Delete label and selection follows', async () => {
    const { wrapper, ctx } = mountToolbar({ kind: 'component', componentIndex: 0 })
    await label(wrapper, 'Delete').trigger('click')
    expect(ctx.commit).toHaveBeenCalledWith(expect.anything(), 'Delete')
    expect(ctx.select).toHaveBeenCalled()
  })

  it('Duplicate commits with the Duplicate label', async () => {
    const { wrapper, ctx } = mountToolbar({ kind: 'component', componentIndex: 0 })
    await label(wrapper, 'Duplicate').trigger('click')
    expect(ctx.commit).toHaveBeenCalledWith(expect.anything(), 'Duplicate')
  })

  it('ignores a second structural click while a commit is pending', async () => {
    const { wrapper, ctx } = mountToolbar({ kind: 'component', componentIndex: 0 })
    ;(ctx.commit as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}))
    await label(wrapper, 'Duplicate').trigger('click')
    await label(wrapper, 'Duplicate').trigger('click')
    expect(ctx.commit).toHaveBeenCalledTimes(1)
  })

  it('buttons do not take focus on mousedown', () => {
    const { wrapper } = mountToolbar({ kind: 'component', componentIndex: 0 })
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    label(wrapper, 'Delete').element.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })

  it('structural tools are disabled while the inline text editor is open', async () => {
    const single = mountToolbar({ kind: 'component', componentIndex: 0 }, true, true)
    for (const l of ['Delete', 'Duplicate', 'Copy']) expect(label(single.wrapper, l).attributes('disabled')).toBeDefined()
    await label(single.wrapper, 'Delete').trigger('click')
    expect(single.ctx.commit).not.toHaveBeenCalled()
    const multi = mountToolbar({ kind: 'multi-component', componentIndexes: [0, 1] }, true, true)
    for (const l of ['Group', 'Duplicate', 'Delete']) expect(label(multi.wrapper, l).attributes('disabled')).toBeDefined()
    expect(label(single.wrapper, 'Deselect').attributes('disabled')).toBeUndefined()
  })

  it('the toolbar keeps the inline editor open when it takes focus', () => {
    const { wrapper } = mountToolbar({ kind: 'component', componentIndex: 0 })
    expect(wrapper.get('[role="toolbar"][aria-label="Selection tools"]').attributes('data-inline-edit-ignore')).toBe('true')
  })

  it('Deselect clears the selection and restores the slide tools', async () => {
    const { wrapper, ctx, selection } = mountToolbar({ kind: 'component', componentIndex: 0 })
    await label(wrapper, 'Deselect').trigger('click')
    expect(ctx.select).toHaveBeenCalledWith(null)
    expect(selection.value).toBeNull()
    expect(label(wrapper, 'Undo').exists()).toBe(true)
  })
})
