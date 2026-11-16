import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, defineComponent, h, nextTick, provide, ref, shallowRef } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { getElementAtSelection, type ElementSelection, type RawUi, type Selection } from '@/slide-editor/model'
import { SLIDE_EDITING_KEY, type SlideEditing } from '@/slide-editor/useSlideEditing'
import { DEFAULT_TEMPLATE_THEME } from '@/render/legacy/lib/template-theme'
import InfographicSection from '@/components/editor/inspector/element/InfographicSection.vue'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>
vi.mock('@/composables/useSlideMutations', () => ({ useSlideMutations: () => ({ editSlideUi: vi.fn().mockResolvedValue(true) }) }))

const presentation = { slides: [], theme: { ...DEFAULT_TEMPLATE_THEME } } as never
const sel: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }
let wrapper: VueWrapper | null = null

const infographic = (data: Rec, extra: Rec = {}) => ({
  type: 'infographic',
  position: { left: 0, top: 0 },
  size: { width: 300, height: 200 },
  colors: ['#112233', '#445566'],
  data,
  ...extra,
})
const uiOf = (element: Rec): RawUi =>
  ({ components: [{ position: { x: 0, y: 0 }, size: { width: 400, height: 300 }, elements: [element] }], elements: [] }) as unknown as RawUi
const gauge = (data: Rec = {}) => uiOf(infographic({ type: 'gauge', value: 40, min_value: 0, max_value: 100, ...data }))
const items = (n: number) => Array.from({ length: n }, (_, i) => ({ heading: `H${i}`, description: `D${i}`, value: String(100 - i * 10) }))

function mountSection(ui: RawUi, selection: Selection = sel) {
  const state = ref<RawUi>(ui)
  const ctx = {
    enabled: computed(() => true),
    ui: computed(() => state.value),
    selection: ref<Selection>(selection),
    slideId: computed(() => 's1'),
    committedUi: computed(() => state.value),
    isOwnCommit: () => false,
    draftUi: shallowRef(null),
    cancelDraft: vi.fn(),
    inlineEdit: shallowRef(null),
    inlineEditor: shallowRef(null),
    commit: vi.fn(async (next: RawUi) => {
      state.value = next
      return true
    }),
    select: vi.fn(),
  } as unknown as SlideEditing
  let section: { itemsOpen: boolean } | null = null
  wrapper = mount(
    defineComponent({
      setup() {
        provide(SLIDE_EDITING_KEY, ctx)
        return () => h(InfographicSection, { presentation, ref: (r: unknown) => (section = r as { itemsOpen: boolean }) })
      },
    }),
    { attachTo: document.body },
  )
  return { ctx, section: () => section! }
}
const committed = (ctx: SlideEditing, n = 0) => (ctx.commit as ReturnType<typeof vi.fn>).mock.calls[n]![0] as RawUi
const label = (ctx: SlideEditing, n = 0) => (ctx.commit as ReturnType<typeof vi.fn>).mock.calls[n]![1] as string
const el = (ui: RawUi, s: ElementSelection = sel) => getElementAtSelection(ui, s) as Rec
const byLabel = (l: string) => wrapper!.find(`[aria-label="${l}"]`)
const button = (name: string) => wrapper!.findAll('button').find((b) => b.attributes('aria-label') === name || b.text() === name)
async function type(l: string, value: string) {
  const input = byLabel(l)
  await input.setValue(value)
  await input.trigger('keydown', { key: 'Enter' })
  await flushPromises()
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

describe('InfographicSection', () => {
  it('gauge: shows Value, Min, Max and colours; no item controls', () => {
    mountSection(gauge())
    for (const l of ['Value', 'Min', 'Max', 'Colour 1', 'Colour 2', 'Text colour']) expect(byLabel(l).exists(), l).toBe(true)
    expect(button('Add item')).toBeUndefined()
    expect(button('Edit items…')).toBeUndefined()
  })

  it('typing a value above max commits the clamped value once', async () => {
    const { ctx } = mountSection(gauge())
    await type('Value', '150')
    expect(ctx.commit).toHaveBeenCalledTimes(1)
    expect(label(ctx)).toBe('Infographic value')
    expect(el(committed(ctx)).data.value).toBe(100)
  })

  it('a Min above Max commits nothing and the field shows the stored Min', async () => {
    const { ctx } = mountSection(gauge())
    await type('Min', '500')
    await nextTick()
    expect(ctx.commit).not.toHaveBeenCalled()
    expect((byLabel('Min').element as HTMLInputElement).value).toBe('0')
  })

  it('a valid range change commits as Infographic range', async () => {
    const { ctx } = mountSection(gauge())
    await type('Max', '200')
    expect(label(ctx)).toBe('Infographic range')
    expect(el(committed(ctx)).data.max_value).toBe(200)
  })

  it('vertical_funnel: shows the count, Add, Remove and Edit items…; no Value field', () => {
    mountSection(uiOf(infographic({ type: 'vertical_funnel', items: items(4) })))
    expect(wrapper!.text()).toContain('Items')
    expect(wrapper!.text()).toContain('4')
    expect(button('Add item')).toBeTruthy()
    expect(button('Remove last item')).toBeTruthy()
    expect(button('Edit items…')).toBeTruthy()
    expect(byLabel('Value').exists()).toBe(false)
  })

  it('Add item adds one and Remove last item removes one', async () => {
    const { ctx } = mountSection(uiOf(infographic({ type: 'vertical_funnel', items: items(4) })))
    await button('Add item')!.trigger('click')
    await flushPromises()
    expect(label(ctx)).toBe('Add item')
    expect(el(committed(ctx)).data.items).toHaveLength(5)
    await button('Remove last item')!.trigger('click')
    await flushPromises()
    expect(label(ctx, 1)).toBe('Remove item')
    expect(el(committed(ctx, 1)).data.items).toHaveLength(4)
  })

  it('Add item is disabled at 8 funnel items and at 7 maturity items', () => {
    mountSection(uiOf(infographic({ type: 'vertical_funnel', items: items(8) })))
    expect(button('Add item')!.attributes('disabled')).toBeDefined()
    wrapper!.unmount()
    mountSection(uiOf(infographic({ type: 'maturity_model', items: items(7) })))
    expect(button('Add item')!.attributes('disabled')).toBeDefined()
  })

  it('a timeline infographic shows colours only', () => {
    mountSection(uiOf(infographic({ type: 'timeline' })))
    expect(byLabel('Colour 1').exists()).toBe(true)
    expect(byLabel('Value').exists()).toBe(false)
    expect(button('Add item')).toBeUndefined()
  })

  it('edits the infographic inside a selected component', async () => {
    const ui = uiOf({ type: 'text', content: 'x' }) as Rec
    ui.components[0].elements.push(infographic({ type: 'gauge', value: 40, min_value: 0, max_value: 100 }))
    const { ctx } = mountSection(ui as RawUi, { kind: 'component', componentIndex: 0 } as Selection)
    await type('Value', '60')
    expect(el(committed(ctx), { kind: 'element', componentIndex: 0, elementPath: [1] }).data.value).toBe(60)
  })

  it('a meter Value typed for one gauge lands on that gauge when the selection moves before the blur commit', async () => {
    const ui = uiOf(infographic({ type: 'gauge', value: 84, min_value: 0, max_value: 100 })) as Rec
    ui.components.push({ position: { x: 500, y: 0 }, size: { width: 400, height: 300 }, elements: [infographic({ type: 'gauge', value: 84, min_value: 0, max_value: 100 })] })
    const { ctx } = mountSection(ui as RawUi)
    const input = byLabel('Value')
    await input.trigger('focus')
    await input.setValue('50')
    ;(ctx.selection as unknown as { value: Selection }).value = { kind: 'element', componentIndex: 1, elementPath: [0] }
    await nextTick()
    await input.trigger('blur')
    await flushPromises()
    expect(ctx.commit).toHaveBeenCalledTimes(1)
    const next = committed(ctx)
    expect([el(next).data.value, el(next, { kind: 'element', componentIndex: 1, elementPath: [0] }).data.value]).toEqual([50, 84])
  })

  it('Colour 1 writes colors[0] as Infographic colour, and Text colour writes text_color', async () => {
    const { ctx } = mountSection(gauge())
    const field = (l: string) => wrapper!.findAllComponents(ColorField).find((c) => c.props('label') === l)!
    field('Colour 1').vm.$emit('open')
    field('Colour 1').vm.$emit('commit', '#abcdef')
    await flushPromises()
    expect(label(ctx)).toBe('Infographic colour')
    expect(el(committed(ctx)).colors).toEqual(['#abcdef', '#445566'])
    field('Text colour').vm.$emit('open')
    field('Text colour').vm.$emit('commit', '#174b40')
    await flushPromises()
    expect(label(ctx, 1)).toBe('Text colour')
    expect(el(committed(ctx, 1)).text_color).toBe('#174b40')
  })

  it('Edit items… sets itemsOpen', async () => {
    const { section } = mountSection(uiOf(infographic({ type: 'maturity_model', items: items(3) })))
    expect(section().itemsOpen).toBe(false)
    await button('Edit items…')!.trigger('click')
    expect(section().itemsOpen).toBe(true)
  })
})
