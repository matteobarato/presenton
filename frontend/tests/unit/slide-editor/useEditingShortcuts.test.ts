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
  /** `applies`: the commit reports applied a microtask later, like editSlideUi, while its save stays pending. */
  function setupOptimistic(sel: Selection, applies = false) {
    const ui = ref(uiTwoComponents() as RawUi | null)
    const selection = ref<Selection>(sel)
    const releases: Array<() => void> = []
    const commit = vi.fn((next: RawUi, _label: string, opts?: { onApplied?: (ok: boolean) => void }) => {
      ui.value = next // optimistic draft, like useSlideEditing
      if (applies) void Promise.resolve().then(() => opts?.onApplied?.(true))
      return new Promise<boolean>((r) => releases.push(() => r(true)))
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
    return { ctx, ui, commit, release: () => releases.forEach((r) => r()), wrapper }
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

  it('double Delete still removes one component when commits report applied', async () => {
    const t = setupOptimistic({ kind: 'component', componentIndex: 0 }, true)
    press('Delete')
    press('Delete')
    await flush()
    press('Delete') // nothing selected any more
    expect(t.commit).toHaveBeenCalledTimes(1)
    expect((t.ui.value!.components as unknown[]).length).toBe(1)
    t.release()
    t.wrapper.unmount()
  })

  it('Delete and Duplicate run once the previous edit is applied, while its save is still pending', async () => {
    const t = setupOptimistic({ kind: 'component', componentIndex: 0 }, true)
    press('ArrowRight')
    await flush()
    press('d', { ctrlKey: true })
    await flush()
    press('Delete')
    await flush()
    expect(t.commit.mock.calls.map((c) => c[1])).toEqual(['Nudge', 'Duplicate', 'Delete'])
    t.release()
    t.wrapper.unmount()
  })

  it('nudges carry one merge key per slide and selection; other edits carry none', async () => {
    const t = setupOptimistic({ kind: 'component', componentIndex: 0 }, true)
    press('ArrowRight')
    press('ArrowRight')
    await flush()
    press('d', { ctrlKey: true })
    await flush()
    const keys = t.commit.mock.calls.map((c) => (c[2] as { mergeKey?: string } | undefined)?.mergeKey)
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
    expect(keys[0]).toContain('s1')
    expect(keys[2]).toBeUndefined()
    t.release()
    t.wrapper.unmount()
  })

  it('element arrows nudge, and managed children neither commit nor preventDefault', async () => {
    const t = setupOptimistic({ kind: 'element', componentIndex: 0, elementPath: [0] })
    const e = press('ArrowRight')
    expect(e.defaultPrevented).toBe(true)
    expect(t.commit).toHaveBeenCalledTimes(1)
    t.wrapper.unmount()
  })

  it('layout-managed element arrows neither commit nor preventDefault', () => {
    const t = setupOptimistic({ kind: 'element', componentIndex: 0, elementPath: [0] })
    t.ui.value = {
      components: [
        {
          id: 'c',
          position: { x: 0, y: 0 },
          elements: [
            {
              type: 'flex',
              position: { x: 0, y: 0 },
              size: { width: 300, height: 100 },
              children: [{ type: 'shape', size: { width: 50, height: 50 } }],
            },
          ],
        },
      ],
    } as unknown as RawUi
    t.ctx.selection.value = { kind: 'element', componentIndex: 0, elementPath: [0, 0] }
    const e = press('ArrowRight')
    expect(e.defaultPrevented).toBe(false)
    expect(t.commit).not.toHaveBeenCalled()
    t.wrapper.unmount()
  })

  it('held arrows keep nudging while earlier nudges are still saving', () => {
    const t = setupOptimistic({ kind: 'component', componentIndex: 0 })
    press('ArrowRight')
    press('ArrowRight')
    press('ArrowRight')
    expect(t.commit).toHaveBeenCalledTimes(3)
    expect((t.ui.value!.components as any[])[0].position.x).toBe(103)
    t.release()
    t.wrapper.unmount()
  })

  it('structural keys are swallowed while an edit is being applied, copy is not, and Delete waits for a nudge being applied', () => {
    const t = setupOptimistic({ kind: 'component', componentIndex: 0 })
    press('ArrowRight')
    const d = press('d', { ctrlKey: true })
    expect(d.defaultPrevented).toBe(true)
    const del = press('Delete')
    expect(del.defaultPrevented).toBe(true)
    const c = press('c', { ctrlKey: true })
    expect(c.defaultPrevented).toBe(true) // handled: copy ran
    expect(t.commit).toHaveBeenCalledTimes(1)
    t.release()
    t.wrapper.unmount()
  })

  it('arrows are swallowed while a structural commit is being applied', () => {
    const t = setupOptimistic({ kind: 'component', componentIndex: 0 })
    press('d', { ctrlKey: true })
    const a = press('ArrowRight')
    expect(a.defaultPrevented).toBe(true)
    expect(t.commit).toHaveBeenCalledTimes(1)
    t.release()
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
