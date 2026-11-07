import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, defineComponent, h, nextTick, provide, ref, shallowRef } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { getElementAtSelection, type ElementSelection, type RawUi, type Selection } from '@/slide-editor/model'
import { SLIDE_EDITING_KEY, type SlideEditing } from '@/slide-editor/useSlideEditing'
import { DEFAULT_TEMPLATE_THEME } from '@/render/legacy/lib/template-theme'
import ShapeSection from '@/components/editor/inspector/element/ShapeSection.vue'
import { uiWithShape } from '../../slide-editor/fixtures'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>
vi.mock('@/composables/useSlideMutations', () => ({ useSlideMutations: () => ({ editSlideUi: vi.fn().mockResolvedValue(true) }) }))

const presentation = { slides: [], theme: { ...DEFAULT_TEMPLATE_THEME } } as never
const sel: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }
let wrapper: VueWrapper | null = null

function mountSection(ui: RawUi = uiWithShape(), selection: Selection = sel) {
  const state = ref<RawUi>(ui)
  const ctx = {
    enabled: computed(() => true),
    ui: computed(() => state.value),
    selection: ref<Selection>(selection),
    inlineEdit: shallowRef(null),
    inlineEditor: shallowRef(null),
    commit: vi.fn(async (next: RawUi) => {
      state.value = next
      return true
    }),
    select: vi.fn(),
  } as unknown as SlideEditing
  wrapper = mount(
    defineComponent({
      setup() {
        provide(SLIDE_EDITING_KEY, ctx)
        return () => h(ShapeSection, { presentation })
      },
    }),
    { attachTo: document.body },
  )
  return { ctx }
}
const committed = (ctx: SlideEditing, n = 0) => (ctx.commit as ReturnType<typeof vi.fn>).mock.calls[n]![0] as RawUi
const label = (ctx: SlideEditing, n = 0) => (ctx.commit as ReturnType<typeof vi.fn>).mock.calls[n]![1] as string
const el = (ui: RawUi, s: ElementSelection = sel) => getElementAtSelection(ui, s) as Rec
const ticks = async () => {
  await nextTick()
  await nextTick()
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  setActivePinia(createPinia())
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('ShapeSection', () => {
  it('turning Fill off commits fill null once, labelled Fill', async () => {
    const { ctx } = mountSection()
    await wrapper!.get('button[role="switch"][aria-label="Fill"]').trigger('click')
    await flushPromises()
    expect(ctx.commit).toHaveBeenCalledTimes(1)
    expect(label(ctx)).toBe('Fill')
    expect(el(committed(ctx)).fill).toBeNull()
  })

  it('turning Fill back on restores the last fill, else the default', async () => {
    const { ctx } = mountSection()
    const toggle = () => wrapper!.get('button[role="switch"][aria-label="Fill"]')
    await toggle().trigger('click')
    await flushPromises()
    await toggle().trigger('click')
    await flushPromises()
    expect(el(committed(ctx, 1)).fill).toMatchObject({ color: '#FF0000', opacity: 1 })
    const none = uiWithShape()
    el(none).fill = null
    wrapper!.unmount()
    const second = mountSection(none)
    await wrapper!.get('button[role="switch"][aria-label="Fill"]').trigger('click')
    await flushPromises()
    expect(el(committed(second.ctx)).fill).toMatchObject({ color: '#FFFFFF', opacity: 1 })
  })

  it('commits a palette swatch as the fill colour', async () => {
    const { ctx } = mountSection()
    await wrapper!.get('button[aria-label="Fill colour"]').trigger('click')
    await ticks()
    const swatch = document.body.querySelector('button[aria-label^="#"]') as HTMLElement
    const colour = swatch.getAttribute('aria-label')
    swatch.click()
    await flushPromises()
    expect(ctx.commit).toHaveBeenCalledTimes(1)
    expect(label(ctx)).toBe('Fill')
    expect(el(committed(ctx)).fill.color).toBe(colour)
  })

  it('Width Enter 4 with a dashed stroke commits dash [12, 8]', async () => {
    const ui = uiWithShape()
    el(ui).stroke = { color: '112233', opacity: 1, width: 2, dash: [6, 4] }
    const { ctx } = mountSection(ui)
    const input = wrapper!.get('input[aria-label="Width"]')
    await input.trigger('focus')
    await input.setValue('4')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(ctx.commit).toHaveBeenCalledTimes(1)
    expect(label(ctx)).toBe('Stroke')
    expect(el(committed(ctx)).stroke).toMatchObject({ width: 4, dash: [12, 8] })
  })

  it('Dash and Curve segments commit with their labels', async () => {
    const { ctx } = mountSection()
    await wrapper!.get('button[aria-label="Dotted"]').trigger('click')
    await flushPromises()
    expect(label(ctx)).toBe('Stroke')
    expect(el(committed(ctx)).stroke.dash).toEqual([2, 3])
    await wrapper!.get('button[aria-label="Smooth"]').trigger('click')
    await flushPromises()
    expect(label(ctx, 1)).toBe('Curve')
    expect(el(committed(ctx, 1)).curve.type).toBe('smooth')
  })

  it('shows Corner radius for a rectangle and commits it', async () => {
    const { ctx } = mountSection()
    const input = wrapper!.get('input[aria-label="Corner radius"]')
    await input.setValue('10')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(label(ctx)).toBe('Corner radius')
    expect(el(committed(ctx)).corner_radii).toEqual([10, 10, 10, 10])
  })

  it('has no Corner radius field for a 3-point polygon', () => {
    const ui = uiWithShape()
    el(ui).points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }]
    mountSection(ui)
    expect(wrapper!.find('input[aria-label="Corner radius"]').exists()).toBe(false)
  })

  it('patches the shape the colour popover opened on, even if the selection moves', async () => {
    const ui = uiWithShape()
    const comps = ui.components as Array<Rec>
    comps.push({ ...comps[0], id: 'c-other', elements: [{ ...comps[0].elements[0], stroke: { color: '445566', opacity: 1, width: 2 } }] })
    const { ctx } = mountSection(ui)
    await wrapper!.get('button[aria-label="Stroke colour"]').trigger('click')
    await ticks()
    ;(ctx.selection as { value: Selection }).value = { kind: 'element', componentIndex: 1, elementPath: [0] }
    await ticks()
    const swatch = document.body.querySelector('button[aria-label^="#"]') as HTMLElement
    const colour = swatch.getAttribute('aria-label')
    swatch.click()
    await flushPromises()
    expect(ctx.commit).toHaveBeenCalledTimes(1)
    expect(label(ctx)).toBe('Stroke')
    expect(el(committed(ctx)).stroke.color).toBe(colour)
    expect(el(committed(ctx), { kind: 'element', componentIndex: 1, elementPath: [0] }).stroke.color).toBe('445566')
  })
})
