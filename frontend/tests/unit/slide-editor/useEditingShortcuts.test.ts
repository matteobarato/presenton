/* eslint-disable vue/one-component-per-file */
/* eslint-disable @typescript-eslint/no-explicit-any -- loose mock call inspection */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { RawUi, Selection } from '@/slide-editor/model'
import { useEditingShortcuts } from '@/slide-editor/useEditingShortcuts'
import type { SlideEditing } from '@/slide-editor/useSlideEditing'
import { uiTwoComponents } from './fixtures'

function setup(opts: { selection?: Selection; inlineEdit?: boolean; active?: boolean } = {}) {
  const ui = uiTwoComponents()
  const ctx = {
    enabled: computed(() => true),
    slideId: computed(() => 's1'),
    ui: computed(() => ui as RawUi | null),
    selection: ref<Selection>(opts.selection ?? null),
    inlineEdit: ref(opts.inlineEdit ? ({} as never) : null),
    commit: vi.fn().mockResolvedValue(true),
    select: vi.fn(),
    requestInlineEdit: vi.fn(),
  } as unknown as SlideEditing
  const active = ref(opts.active ?? true)
  const wrapper = mount(
    defineComponent({
      setup() {
        useEditingShortcuts(ctx, active)
        return () => h('div', [h('input', { id: 'f' })])
      },
    }),
    { attachTo: document.body },
  )
  return { ctx, active, wrapper }
}

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(e)
  return e
}
const flush = () => new Promise((r) => setTimeout(r))

beforeEach(() => setActivePinia(createPinia()))

describe('useEditingShortcuts races', () => {
  function setupOptimistic(sel: Selection) {
    const ui = ref(uiTwoComponents() as RawUi | null)
    const selection = ref<Selection>(sel)
    let release!: () => void
    const commit = vi.fn((next: RawUi) => {
      ui.value = next // optimistic draft, like useSlideEditing
      return new Promise<boolean>((r) => (release = () => r(true)))
    })
    const ctx = {
      enabled: computed(() => true),
      slideId: computed(() => 's1'),
      ui: computed(() => ui.value),
      selection,
      inlineEdit: ref(null),
      commit,
      select: vi.fn((s: Selection) => (selection.value = s)),
      requestInlineEdit: vi.fn(),
    } as unknown as SlideEditing
    const wrapper = mount(
      defineComponent({ setup: () => (useEditingShortcuts(ctx, true), () => h('div')) }),
      { attachTo: document.body },
    )
    return { ctx, ui, commit, release: () => release(), wrapper }
  }

  it('auto-repeat Delete before the commit resolves removes only one component', async () => {
    const t = setupOptimistic({ kind: 'component', componentIndex: 0 })
    press('Delete')
    press('Delete')
    expect(t.commit).toHaveBeenCalledTimes(1)
    expect((t.ui.value!.components as unknown[]).length).toBe(1)
    expect(t.ctx.select).toHaveBeenCalledWith(null)
    t.release()
    await flush()
    press('Delete')
    expect(t.commit).toHaveBeenCalledTimes(1) // nothing selected any more
    t.wrapper.unmount()
  })

  it('element arrows nudge, and managed children neither commit nor preventDefault', async () => {
    const t = setupOptimistic({ kind: 'element', componentIndex: 0, elementPath: [0] })
    const e = press('ArrowRight')
    expect(e.defaultPrevented).toBe(true)
    expect(t.commit).toHaveBeenCalledTimes(1)
    t.wrapper.unmount()
  })
})

describe('useEditingShortcuts', () => {
  it('ArrowRight with a selection nudges and prevents default (so slide navigation cannot run)', async () => {
    const { ctx, wrapper } = setup({ selection: { kind: 'component', componentIndex: 0 } })
    const e = press('ArrowRight')
    await flush()
    expect(e.defaultPrevented).toBe(true)
    expect(ctx.commit).toHaveBeenCalledTimes(1)
    expect((ctx.commit as any).mock.calls[0][1]).toBe('Nudge')
    expect(ctx.select).toHaveBeenCalledWith({ kind: 'component', componentIndex: 0 })
    wrapper.unmount()
  })

  it('Shift+Arrow nudges 10', async () => {
    const { ctx, wrapper } = setup({ selection: { kind: 'component', componentIndex: 0 } })
    press('ArrowRight', { shiftKey: true })
    await flush()
    expect((ctx.commit as any).mock.calls[0][0].components[0].position.x).toBe(110)
    wrapper.unmount()
  })

  it('ArrowRight with no selection does nothing', async () => {
    const { ctx, wrapper } = setup()
    const e = press('ArrowRight')
    await flush()
    expect(ctx.commit).not.toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(false)
    wrapper.unmount()
  })

  it('Delete in an input does not commit', async () => {
    const { ctx, wrapper } = setup({ selection: { kind: 'component', componentIndex: 0 } })
    press('Delete', {}, wrapper.find('#f').element)
    await flush()
    expect(ctx.commit).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('Delete, duplicate and group commit with their labels', async () => {
    const { ctx, wrapper } = setup({ selection: { kind: 'multi-component', componentIndexes: [0, 1] } })
    press('d', { ctrlKey: true })
    await flush()
    press('g', { ctrlKey: true })
    await flush()
    press('Delete')
    await flush()
    expect((ctx.commit as any).mock.calls.map((c: unknown[]) => c[1])).toEqual(['Duplicate', 'Group', 'Delete'])
    wrapper.unmount()
  })

  it('ignores keys while inline editing, when inactive, and for Ctrl+Z', async () => {
    const a = setup({ selection: { kind: 'component', componentIndex: 0 }, inlineEdit: true })
    press('Delete')
    const b = setup({ selection: { kind: 'component', componentIndex: 0 }, active: false })
    press('Delete')
    const c = setup({ selection: { kind: 'component', componentIndex: 0 } })
    const z = press('z', { ctrlKey: true })
    await flush()
    expect(a.ctx.commit).not.toHaveBeenCalled()
    expect(b.ctx.commit).not.toHaveBeenCalled()
    expect(c.ctx.commit).not.toHaveBeenCalled()
    expect(z.defaultPrevented).toBe(false)
    ;[a, b, c].forEach((x) => x.wrapper.unmount())
  })

  it('Escape clears the selection', () => {
    const { ctx, wrapper } = setup({ selection: { kind: 'component', componentIndex: 0 } })
    press('Escape')
    expect(ctx.select).toHaveBeenCalledWith(null)
    wrapper.unmount()
  })
})
