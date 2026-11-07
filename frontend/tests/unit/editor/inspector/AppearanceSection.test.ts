import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, defineComponent, h, nextTick, provide, ref, shallowRef } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { RawUi, Selection } from '@/slide-editor/model'
import { SLIDE_EDITING_KEY, type SlideEditing } from '@/slide-editor/useSlideEditing'
import { DEFAULT_TEMPLATE_THEME } from '@/render/legacy/lib/template-theme'
import { DEFAULT_SHADOW } from '@/slide-editor/elementStyle'
import AppearanceSection from '@/components/editor/inspector/element/AppearanceSection.vue'
import { uiWithShape } from '../../slide-editor/fixtures'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>
vi.mock('@/composables/useSlideMutations', () => ({ useSlideMutations: () => ({ editSlideUi: vi.fn().mockResolvedValue(true) }) }))

const presentation = { slides: [], theme: { ...DEFAULT_TEMPLATE_THEME } } as never
const comp: Selection = { kind: 'component', componentIndex: 0 }
let wrapper: VueWrapper | null = null

function mountSection(ui: RawUi = uiWithShape(), selection: Selection = comp) {
  const state = ref<RawUi>(ui)
  const ctx = {
    enabled: computed(() => true),
    ui: computed(() => state.value),
    selection: ref<Selection>(selection),
    inlineEdit: shallowRef(null),
    commit: vi.fn(async (next: RawUi) => {
      state.value = next
      return true
    }),
    select: vi.fn(),
  } as unknown as SlideEditing
  wrapper = mount(defineComponent({ setup() { provide(SLIDE_EDITING_KEY, ctx); return () => h(AppearanceSection, { presentation }) } }), { attachTo: document.body })
  return ctx
}
const calls = (ctx: SlideEditing) => (ctx.commit as ReturnType<typeof vi.fn>).mock.calls as Array<[RawUi, string]>
const compOf = (ui: RawUi) => (ui.components as Rec[])[0]!
const elOf = (ui: RawUi) => compOf(ui).elements[0] as Rec

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  setActivePinia(createPinia())
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('AppearanceSection', () => {
  it('typing 270 and Enter commits component rotation -90, labelled Rotate', async () => {
    const ctx = mountSection()
    const input = wrapper!.get('input[aria-label="Rotation"]')
    await input.trigger('focus')
    await input.setValue('270')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(calls(ctx)).toHaveLength(1)
    expect(calls(ctx)[0]![1]).toBe('Rotate')
    expect(compOf(calls(ctx)[0]![0]).rotation).toBe(-90)
  })

  it('+90 from 135 commits -135', async () => {
    const ui = uiWithShape()
    compOf(ui).rotation = 135
    const ctx = mountSection(ui)
    await wrapper!.get('button[aria-label="Rotate +90°"]').trigger('click')
    await flushPromises()
    expect(calls(ctx)[0]![1]).toBe('Rotate')
    expect(compOf(calls(ctx)[0]![0]).rotation).toBe(-135)
  })

  it('Flip H flips the element, labelled Flip, and reflects aria-pressed', async () => {
    const ctx = mountSection()
    await wrapper!.get('button[aria-label="Flip H"]').trigger('click')
    await flushPromises()
    expect(calls(ctx)[0]![1]).toBe('Flip')
    expect(elOf(calls(ctx)[0]![0]).flip_h).toBe(true)
    expect(wrapper!.get('button[aria-label="Flip H"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper!.get('button[aria-label="Flip V"]').attributes('aria-pressed')).toBe('false')
  })

  it('Opacity commits a fraction, labelled Opacity', async () => {
    const ctx = mountSection()
    const input = wrapper!.get('input[aria-label="Opacity"]')
    await input.trigger('focus')
    await input.setValue('40')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(calls(ctx)[0]![1]).toBe('Opacity')
    expect(elOf(calls(ctx)[0]![0]).opacity).toBe(0.4)
  })

  it('Shadow on writes the default shadow; a field then edits it', async () => {
    const ctx = mountSection()
    await wrapper!.get('button[role="switch"][aria-label="Shadow"]').trigger('click')
    await flushPromises()
    expect(calls(ctx)[0]![1]).toBe('Shadow')
    expect(elOf(calls(ctx)[0]![0]).shadow).toEqual(DEFAULT_SHADOW)
    const blur = wrapper!.get('input[aria-label="Blur"]')
    await blur.trigger('focus')
    await blur.setValue('20')
    await blur.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(calls(ctx)[1]![1]).toBe('Shadow')
    expect(elOf(calls(ctx)[1]![0]).shadow).toEqual({ ...DEFAULT_SHADOW, blur: 20 })
  })

  it('a pending number edit lands on the element it was focused on, even if the selection moves', async () => {
    const ui = uiWithShape()
    const comps = ui.components as Rec[]
    comps.push({ ...comps[0], id: 'c-other', elements: [{ ...comps[0].elements[0] }] })
    const ctx = mountSection(ui)
    const input = wrapper!.get('input[aria-label="Opacity"]')
    await input.trigger('focus')
    ;(ctx.selection as { value: Selection }).value = { kind: 'component', componentIndex: 1 }
    await input.setValue('10')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    const next = calls(ctx)[0]![0]
    expect((next.components as Rec[])[0]!.elements[0].opacity).toBe(0.1)
    expect((next.components as Rec[])[1]!.elements[0].opacity).toBeUndefined()
  })

  it('a colour popover commit lands on the target it opened on, even if the selection moves', async () => {
    const ui = uiWithShape()
    const comps = ui.components as Rec[]
    comps[0].elements[0].shadow = { ...DEFAULT_SHADOW }
    comps.push({ ...comps[0], id: 'c-other', elements: [{ ...comps[0].elements[0] }] })
    const ctx = mountSection(ui)
    await wrapper!.get('button[aria-label="Shadow colour"]').trigger('click')
    await nextTick()
    await nextTick()
    ;(ctx.selection as { value: Selection }).value = { kind: 'component', componentIndex: 1 }
    await nextTick()
    const swatch = document.body.querySelector('button[aria-label^="#"]') as HTMLElement
    const colour = swatch.getAttribute('aria-label')
    swatch.click()
    await flushPromises()
    const next = calls(ctx)[0]![0]
    expect((next.components as Rec[])[0]!.elements[0].shadow.color).toBe(colour)
    expect((next.components as Rec[])[1]!.elements[0].shadow.color).toBe('#000000')
  })

  it('a keyboard-focused slider patches the new selection, not a stale anchor', async () => {
    const ui = uiWithShape()
    const comps = ui.components as Rec[]
    comps.push({ ...comps[0], id: 'c-other', elements: [{ ...comps[0].elements[0] }] })
    const ctx = mountSection(ui)
    await wrapper!.get('input[aria-label="Rotation"]').trigger('focus')
    ;(ctx.selection as { value: Selection }).value = { kind: 'component', componentIndex: 1 }
    await flushPromises()
    const range = wrapper!.get('input[type="range"][aria-label="Opacity slider"]')
    await range.trigger('focus')
    ;(range.element as HTMLInputElement).value = '30'
    await range.trigger('change')
    await flushPromises()
    const next = calls(ctx)[0]![0]
    expect((next.components as Rec[])[1]!.elements[0].opacity).toBe(0.3)
    expect((next.components as Rec[])[0]!.elements[0].opacity).toBeUndefined()
  })
})
