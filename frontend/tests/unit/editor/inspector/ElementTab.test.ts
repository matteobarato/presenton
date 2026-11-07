import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, defineComponent, h, provide, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import type { RawUi, Selection } from '@/slide-editor/model'
import { SLIDE_EDITING_KEY, type SlideEditing } from '@/slide-editor/useSlideEditing'
import ElementTab from '@/components/editor/inspector/element/ElementTab.vue'
import { uiTwoComponents } from '../../slide-editor/fixtures'

function mountTab(sel: Selection, opts: { inlineEditing?: boolean; enabled?: boolean } = {}) {
  const ui = uiTwoComponents() as RawUi
  const selection = ref<Selection>(sel)
  const ctx = {
    enabled: computed(() => opts.enabled ?? true),
    ui: computed(() => ui),
    selection,
    inlineEdit: shallowRef(opts.inlineEditing ? { selection: sel } : null),
    commit: vi.fn().mockResolvedValue(true),
    select: vi.fn((s: Selection) => {
      selection.value = s
    }),
  } as unknown as SlideEditing
  const wrapper = mount(
    defineComponent({
      setup() {
        provide(SLIDE_EDITING_KEY, ctx)
        return () => h(ElementTab, { presentationId: 'p1', presentation: {} as never, activeSlide: null })
      },
    }),
  )
  return { wrapper, ctx, selection }
}

const label = (w: ReturnType<typeof mountTab>['wrapper'], l: string) => w.find(`button[aria-label="${l}"]`)

beforeEach(() => setActivePinia(createPinia()))

describe('ElementTab', () => {
  it('shows the empty state without a selection', () => {
    const { wrapper } = mountTab(null)
    expect(wrapper.text()).toContain('Select something on the slide to edit it.')
    expect(wrapper.text()).toContain('Double-click text to type.')
    expect(label(wrapper, 'Delete').exists()).toBe(false)
  })

  it('shows the smart-slide empty state when editing is disabled', () => {
    const { wrapper } = mountTab({ kind: 'component', componentIndex: 0 }, { enabled: false })
    expect(wrapper.text()).toContain("This slide can't be edited on the canvas.")
    expect(label(wrapper, 'Delete').exists()).toBe(false)
  })

  it('shows Duplicate, Copy and Delete for a component selection', () => {
    const { wrapper } = mountTab({ kind: 'component', componentIndex: 0 })
    for (const l of ['Deselect', 'Delete', 'Duplicate', 'Copy']) expect(label(wrapper, l).exists()).toBe(true)
    expect(label(wrapper, 'Group').exists()).toBe(false)
    expect(label(wrapper, 'Ungroup').exists()).toBe(false)
  })

  it('shows Group and an item count for a multi selection', () => {
    const { wrapper } = mountTab({ kind: 'multi-component', componentIndexes: [0, 1] })
    expect(label(wrapper, 'Group').exists()).toBe(true)
    expect(wrapper.text()).toContain('2 items')
  })

  it('Delete commits with the Delete label', async () => {
    const { wrapper, ctx } = mountTab({ kind: 'component', componentIndex: 0 })
    await label(wrapper, 'Delete').trigger('click')
    expect(ctx.commit).toHaveBeenCalledWith(expect.anything(), 'Delete')
    expect(ctx.select).toHaveBeenCalled()
  })

  it('Duplicate commits with the Duplicate label', async () => {
    const { wrapper, ctx } = mountTab({ kind: 'component', componentIndex: 0 })
    await label(wrapper, 'Duplicate').trigger('click')
    expect(ctx.commit).toHaveBeenCalledWith(expect.anything(), 'Duplicate')
  })

  it('ignores a second structural click while a commit is pending', async () => {
    const { wrapper, ctx } = mountTab({ kind: 'component', componentIndex: 0 })
    ;(ctx.commit as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}))
    await label(wrapper, 'Duplicate').trigger('click')
    await label(wrapper, 'Duplicate').trigger('click')
    expect(ctx.commit).toHaveBeenCalledTimes(1)
  })

  it('buttons do not take focus on mousedown', () => {
    const { wrapper } = mountTab({ kind: 'component', componentIndex: 0 })
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    label(wrapper, 'Delete').element.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })

  it('Arrange buttons are disabled while the inline text editor is open', async () => {
    const single = mountTab({ kind: 'component', componentIndex: 0 }, { inlineEditing: true })
    for (const l of ['Delete', 'Duplicate', 'Copy']) expect(label(single.wrapper, l).attributes('disabled')).toBeDefined()
    await label(single.wrapper, 'Delete').trigger('click')
    expect(single.ctx.commit).not.toHaveBeenCalled()
    const multi = mountTab({ kind: 'multi-component', componentIndexes: [0, 1] }, { inlineEditing: true })
    for (const l of ['Group', 'Duplicate', 'Delete']) expect(label(multi.wrapper, l).attributes('disabled')).toBeDefined()
    expect(label(single.wrapper, 'Deselect').attributes('disabled')).toBeUndefined()
  })

  it('the root keeps the inline editor open when it takes focus', () => {
    expect(mountTab({ kind: 'component', componentIndex: 0 }).wrapper.find('[data-inline-edit-ignore]').exists()).toBe(true)
    expect(mountTab(null).wrapper.find('[data-inline-edit-ignore]').exists()).toBe(true)
  })

  it('Deselect clears the selection', async () => {
    const { wrapper, ctx, selection } = mountTab({ kind: 'component', componentIndex: 0 })
    await label(wrapper, 'Deselect').trigger('click')
    expect(ctx.select).toHaveBeenCalledWith(null)
    expect(selection.value).toBeNull()
  })
})
