import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, defineComponent, h, nextTick, provide, ref, shallowRef } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { getElementAtSelection, type ElementSelection, type RawUi, type Selection } from '@/slide-editor/model'
import { SLIDE_EDITING_KEY, type SlideEditing } from '@/slide-editor/useSlideEditing'
import { DEFAULT_TEMPLATE_THEME } from '@/render/legacy/lib/template-theme'
import LayoutSection from '@/components/editor/inspector/element/LayoutSection.vue'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import SliderField from '@/components/editor/inspector/controls/SliderField.vue'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>
vi.mock('@/composables/useSlideMutations', () => ({ useSlideMutations: () => ({ editSlideUi: vi.fn().mockResolvedValue(true) }) }))

const presentation = { slides: [], theme: { ...DEFAULT_TEMPLATE_THEME } } as never
const sel: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }
let wrapper: VueWrapper | null = null

const text = (t: string) => ({ type: 'text', position: { left: 0, top: 0 }, size: { width: 100, height: 50 }, content: t })
const flexUi = (children: unknown[] = [text('a'), text('b')]): RawUi =>
  ({
    components: [
      {
        position: { x: 100, y: 100 },
        size: { width: 210, height: 50 },
        elements: [{ type: 'flex', direction: 'row', gap: 10, position: { left: 0, top: 0 }, size: { width: 210, height: 50 }, children }],
      },
    ],
    elements: [],
  }) as unknown as RawUi
const containerUi = (): RawUi =>
  ({
    components: [
      {
        position: { x: 100, y: 100 },
        size: { width: 200, height: 100 },
        elements: [{ type: 'container', position: { left: 0, top: 0 }, size: { width: 200, height: 100 }, children: [] }],
      },
    ],
    elements: [],
  }) as unknown as RawUi

function mountSection(ui: RawUi, selection: Selection = sel) {
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
        return () => h(LayoutSection, { presentation })
      },
    }),
    { attachTo: document.body },
  )
  return { ctx }
}
const committed = (ctx: SlideEditing, n = 0) => (ctx.commit as ReturnType<typeof vi.fn>).mock.calls[n]![0] as RawUi
const label = (ctx: SlideEditing, n = 0) => (ctx.commit as ReturnType<typeof vi.fn>).mock.calls[n]![1] as string
const el = (ui: RawUi, s: ElementSelection = sel) => getElementAtSelection(ui, s) as Rec
const byLabel = (l: string) => wrapper!.find(`[aria-label="${l}"]`)
const button = (name: string) => wrapper!.findAll('button').find((b) => b.attributes('aria-label') === name || b.text() === name)

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  setActivePinia(createPinia())
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('LayoutSection', () => {
  it('shows gap and item controls for a flex, and no container controls', () => {
    mountSection(flexUi())
    expect(byLabel('Gap').exists()).toBe(true)
    expect(button('Add item')).toBeTruthy()
    expect(button('Remove last item')).toBeTruthy()
    expect(byLabel('Fill colour').exists()).toBe(false)
  })

  it('shows container controls for a container, and no gap', () => {
    mountSection(containerUi())
    for (const l of ['Fill colour', 'Stroke colour', 'Stroke width', 'Corner radius', 'Padding X', 'Padding Y', 'Alignment']) {
      expect(byLabel(l).exists(), l).toBe(true)
    }
    expect(byLabel('Gap').exists()).toBe(false)
    expect(button('Add item')).toBeUndefined()
  })

  it('Add item commits one op that adds a child', async () => {
    const { ctx } = mountSection(flexUi())
    await button('Add item')!.trigger('click')
    await flushPromises()
    expect(ctx.commit).toHaveBeenCalledTimes(1)
    expect(label(ctx)).toBe('Add item')
    expect(el(committed(ctx)).children).toHaveLength(3)
  })

  it('Remove last item is disabled on an empty flex', () => {
    mountSection(flexUi([]))
    expect(button('Remove last item')!.attributes('disabled')).toBeDefined()
  })

  it('Remove last item removes a child', async () => {
    const { ctx } = mountSection(flexUi())
    await button('Remove last item')!.trigger('click')
    await flushPromises()
    expect(label(ctx)).toBe('Remove item')
    expect(el(committed(ctx)).children).toHaveLength(1)
  })

  it('an alignment button writes both axes and becomes pressed', async () => {
    const { ctx } = mountSection(containerUi())
    await button('Center Middle')!.trigger('click')
    await flushPromises()
    expect(label(ctx)).toBe('Alignment')
    expect(el(committed(ctx)).alignment).toMatchObject({ horizontal: 'center', vertical: 'middle' })
    await nextTick()
    expect(button('Center Middle')!.attributes('aria-pressed')).toBe('true')
    expect(button('Left Top')!.attributes('aria-pressed')).toBe('false')
  })

  it('corner radius cannot exceed half the shorter side', async () => {
    const { ctx } = mountSection(containerUi())
    const input = byLabel('Corner radius')
    await input.setValue('80')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(label(ctx)).toBe('Corner radius')
    expect(el(committed(ctx)).border_radius.tl).toBe(50)
  })

  it('does not commit a gap that is not a number', async () => {
    const { ctx } = mountSection(flexUi())
    const input = byLabel('Gap')
    await input.setValue('')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(ctx.commit).not.toHaveBeenCalled()
  })

  it('a Gap typed for one card lands on that card when the selection moves before the blur commit', async () => {
    const card = (x: number) => ({
      position: { x, y: 100 },
      size: { width: 210, height: 50 },
      elements: [{ type: 'flex', direction: 'row', gap: 10, position: { left: 0, top: 0 }, size: { width: 210, height: 50 }, children: [text('a'), text('b')] }],
    })
    const { ctx } = mountSection({ components: [card(0), card(400)], elements: [] } as unknown as RawUi)
    const input = byLabel('Gap')
    await input.trigger('focus')
    await input.setValue('24')
    ;(ctx.selection as unknown as { value: Selection }).value = { kind: 'element', componentIndex: 1, elementPath: [0] }
    await nextTick()
    await input.trigger('blur')
    await flushPromises()
    expect(ctx.commit).toHaveBeenCalledTimes(1)
    const next = committed(ctx)
    expect([el(next).gap, el(next, { kind: 'element', componentIndex: 1, elementPath: [0] }).gap]).toEqual([24, 10])
  })

  it('a corner radius committed after the selection moved is capped by the anchored container', async () => {
    const box = (x: number, w: number, h: number) => ({
      position: { x, y: 0 },
      size: { width: w, height: h },
      elements: [{ type: 'container', position: { left: 0, top: 0 }, size: { width: w, height: h }, children: [] }],
    })
    const { ctx } = mountSection({ components: [box(0, 200, 100), box(400, 40, 20)], elements: [] } as unknown as RawUi)
    const input = byLabel('Corner radius')
    await input.trigger('focus')
    await input.setValue('30')
    ;(ctx.selection as unknown as { value: Selection }).value = { kind: 'element', componentIndex: 1, elementPath: [0] }
    await nextTick()
    await input.trigger('blur')
    await flushPromises()
    const next = committed(ctx)
    expect(el(next).border_radius.tl).toBe(30)
    expect(el(next, { kind: 'element', componentIndex: 1, elementPath: [0] }).border_radius).toBeUndefined()
  })

  it('a Fill colour commit lands on the container held when the picker opened', async () => {
    const box = (x: number) => ({
      position: { x, y: 0 },
      size: { width: 200, height: 100 },
      elements: [{ type: 'container', position: { left: 0, top: 0 }, size: { width: 200, height: 100 }, children: [] }],
    })
    const { ctx } = mountSection({ components: [box(0), box(400)], elements: [] } as unknown as RawUi)
    const fill = wrapper!.findAllComponents(ColorField).find((c) => c.props('label') === 'Fill colour')!
    fill.vm.$emit('open')
    ;(ctx.selection as unknown as { value: Selection }).value = { kind: 'element', componentIndex: 1, elementPath: [0] }
    await nextTick()
    fill.vm.$emit('commit', '#123456')
    await flushPromises()
    expect(label(ctx)).toBe('Fill')
    const next = committed(ctx)
    expect(el(next).fill).toEqual({ color: '#123456' })
    expect(el(next, { kind: 'element', componentIndex: 1, elementPath: [0] }).fill).toBeUndefined()
  })

  it('Fill opacity 50 % writes fill.opacity 0.5', async () => {
    const { ctx } = mountSection(containerUi())
    const slider = wrapper!.findAllComponents(SliderField).find((c) => c.props('label') === 'Fill opacity')!
    slider.vm.$emit('commit', 50)
    await flushPromises()
    expect(label(ctx)).toBe('Fill')
    expect(el(committed(ctx)).fill).toEqual({ opacity: 0.5 })
  })

  it('edits the layout root when a component is selected', async () => {
    const { ctx } = mountSection(flexUi(), { kind: 'component', componentIndex: 0 } as Selection)
    const input = byLabel('Gap')
    await input.setValue('24')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(label(ctx)).toBe('Gap')
    expect(el(committed(ctx), sel).gap).toBe(24)
  })
})
