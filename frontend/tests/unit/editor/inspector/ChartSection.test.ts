import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, nextTick, ref, shallowRef } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { getElementAtSelection, type ElementSelection, type RawUi, type Selection } from '@/slide-editor/model'
import { SLIDE_EDITING_KEY, type SlideEditing } from '@/slide-editor/useSlideEditing'
import { DEFAULT_TEMPLATE_THEME } from '@/render/legacy/lib/template-theme'
import ChartSection from '@/components/editor/inspector/element/ChartSection.vue'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>
vi.mock('@/composables/useSlideMutations', () => ({ useSlideMutations: () => ({ editSlideUi: vi.fn().mockResolvedValue(true) }) }))

const presentation = { slides: [], theme: { ...DEFAULT_TEMPLATE_THEME } } as never
let wrapper: VueWrapper | null = null

function chart(over: Rec = {}): Rec {
  const categories = over.categories ?? ['A', 'B', 'C']
  return {
    type: 'chart',
    chart_type: 'bar',
    position: { x: 0, y: 0 },
    size: { width: 400, height: 300 },
    categories,
    series: [{ name: 'Sales', values: categories.map((_: string, i: number) => i + 1) }],
    colors: ['7C51F8'],
    ...over,
  }
}
function uiWith(el: Rec, nested = false): RawUi {
  const inner = nested ? { type: 'container', position: { x: 0, y: 0 }, size: { width: 400, height: 300 }, children: [{ type: 'text', text: 'Hi' }, el] } : el
  return { background: { color: 'FFFFFF' }, components: [{ id: 'c1', description: 'Chart', position: { x: 0, y: 0 }, elements: [inner] }] } as unknown as RawUi
}

function mountSection(ui: RawUi, sel: Selection = { kind: 'element', componentIndex: 0, elementPath: [0] }) {
  const state = ref<RawUi>(ui)
  const ctx = {
    enabled: computed(() => true),
    ui: computed(() => state.value),
    selection: ref<Selection>(sel),
    inlineEdit: shallowRef(null),
    inlineEditor: shallowRef(null),
    commit: vi.fn(async (next: RawUi) => {
      state.value = next
      return true
    }),
    select: vi.fn(),
  } as unknown as SlideEditing
  wrapper = mount(ChartSection, { props: { presentation }, global: { provide: { [SLIDE_EDITING_KEY as symbol]: ctx } }, attachTo: document.body })
  return { ctx }
}
const committed = (ctx: SlideEditing, n = 0) => (ctx.commit as ReturnType<typeof vi.fn>).mock.calls[n]![0] as RawUi
const at = (ui: RawUi, path: number[] = [0]) => getElementAtSelection(ui, { kind: 'element', componentIndex: 0, elementPath: path } as ElementSelection) as Rec
const btn = (name: string) => wrapper!.get(`button[aria-label="${name}"]`)

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  setActivePinia(createPinia())
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('ChartSection', () => {
  it('has no axis controls for a pie chart', () => {
    mountSection(uiWith(chart({ chart_type: 'pie' })))
    expect(wrapper!.find('[aria-label="Show X axis"]').exists()).toBe(false)
    expect(wrapper!.text()).not.toContain('Axes')
    expect(wrapper!.find('button[aria-label="Axis colour"]').exists()).toBe(false)
  })

  it('shows Show axis for bar and Spokes for radar', () => {
    mountSection(uiWith(chart()))
    expect(wrapper!.text()).toContain('Show axis')
    expect(wrapper!.text()).not.toContain('Spokes')
    wrapper!.unmount()
    mountSection(uiWith(chart({ chart_type: 'radar' })))
    expect(wrapper!.text()).toContain('Spokes')
    expect(wrapper!.text()).toContain('Rings')
    expect(wrapper!.text()).toContain('Category labels')
    expect(wrapper!.text()).toContain('Value labels')
  })

  it('commits the chart type from the select', async () => {
    const { ctx } = mountSection(uiWith(chart()))
    await wrapper!.get('select[aria-label="Chart type"]').setValue('line')
    expect(at(committed(ctx)).chart_type).toBe('line')
  })

  it('offers Bubble Chart only for a bubble chart', () => {
    mountSection(uiWith(chart({ chart_type: 'bubble' })))
    expect(wrapper!.get('select[aria-label="Chart type"]').text()).toContain('Bubble Chart')
    wrapper!.unmount()
    mountSection(uiWith(chart()))
    expect(wrapper!.get('select[aria-label="Chart type"]').text()).not.toContain('Bubble Chart')
  })

  it('summarises large data with +N more, and empty data as No data', () => {
    mountSection(uiWith(chart({ categories: ['a', 'b', 'c', 'd', 'e', 'f'] })))
    expect(wrapper!.get('[data-chart-mini]').text()).toContain('+2 more')
    wrapper!.unmount()
    mountSection(uiWith(chart({ categories: [], series: [], data: [] })))
    expect(wrapper!.get('[data-chart-mini]').text()).toContain('No data')
  })

  it('commits data labels', async () => {
    const { ctx } = mountSection(uiWith(chart()))
    await btn('Top').trigger('click')
    expect(at(committed(ctx)).data_labels).toBe('top')
    await btn('Off').trigger('click')
    expect(at(committed(ctx, 1)).data_labels).toBe(false)
  })

  it('commits the title on blur and on Enter', async () => {
    const { ctx } = mountSection(uiWith(chart()))
    const input = wrapper!.get('input[aria-label="Chart title"]')
    await input.setValue('Revenue')
    expect(ctx.commit).not.toHaveBeenCalled()
    await input.trigger('blur')
    expect(at(committed(ctx)).title).toBe('Revenue')
    await input.setValue('Costs')
    await input.trigger('keydown', { key: 'Enter' })
    expect(at(committed(ctx, 1)).title).toBe('Costs')
  })

  it('toggles the legend from the type default', async () => {
    const { ctx } = mountSection(uiWith(chart()))
    const sw = wrapper!.get('button[role="switch"][aria-label="Show legend"]')
    expect(sw.attributes('aria-checked')).toBe('true')
    await sw.trigger('click')
    expect(at(committed(ctx)).legend).toBe(false)
  })

  it('adds, edits and removes chart colours', async () => {
    const { ctx } = mountSection(uiWith(chart()))
    await btn('Add chart colour').trigger('click')
    expect(at(committed(ctx)).colors).toHaveLength(2)
    expect(wrapper!.findAll('button[aria-label^="Chart colour "]').length).toBeGreaterThan(0)
    await nextTick()
    await btn('Remove chart colour').trigger('click')
    expect(at(committed(ctx, 1)).colors).toHaveLength(1)
  })

  it('toggles Edit data locally without committing', async () => {
    const { ctx } = mountSection(uiWith(chart()))
    await btn('Edit data').trigger('click')
    expect(ctx.commit).not.toHaveBeenCalled()
  })

  it('patches a chart nested in a wrapper, not the first child', async () => {
    const ui = uiWith(chart(), true)
    const { ctx } = mountSection(ui, { kind: 'component', componentIndex: 0 } as Selection)
    await btn('Top').trigger('click')
    const next = committed(ctx)
    expect(at(next, [0]).data_labels).toBeUndefined()
    expect(at(next, [0]).children[1].data_labels).toBe('top')
  })
})

describe('ChartSection swatches', () => {
  it('commits a swatch colour to the chart that was selected when the picker opened', async () => {
    const other = chart({ colors: ['111111'] })
    const ui = {
      background: { color: 'FFFFFF' },
      components: [
        { id: 'c1', position: { x: 0, y: 0 }, elements: [chart()] },
        { id: 'c2', position: { x: 0, y: 0 }, elements: [other] },
      ],
    } as unknown as RawUi
    const { ctx } = mountSection(ui)
    await btn('Chart colour 1').trigger('click')
    ;(ctx.selection as { value: Selection }).value = { kind: 'element', componentIndex: 1, elementPath: [0] }
    await nextTick()
    const pick = document.body.querySelector('button[aria-label="#ef4444"]') as HTMLButtonElement
    pick.click()
    await nextTick()
    const next = committed(ctx)
    const el = (i: number) => getElementAtSelection(next, { kind: 'element', componentIndex: i, elementPath: [0] } as ElementSelection) as Rec
    expect(el(0).colors[0]).toBe('EF4444')
    expect(el(1)).toEqual(other)
  })

  it('does not keep a stale anchor after a picker closes unchanged', async () => {
    const ui = {
      background: { color: 'FFFFFF' },
      components: [
        { id: 'c1', position: { x: 0, y: 0 }, elements: [chart()] },
        { id: 'c2', position: { x: 0, y: 0 }, elements: [chart({ colors: ['111111'] })] },
      ],
    } as unknown as RawUi
    const { ctx } = mountSection(ui)
    await btn('Chart colour 1').trigger('click')
    await nextTick()
    await btn('Chart colour 1').trigger('click')
    await nextTick()
    ;(ctx.selection as { value: Selection }).value = { kind: 'element', componentIndex: 1, elementPath: [0] }
    await nextTick()
    await btn('Add chart colour').trigger('click')
    const next = committed(ctx)
    const el = (i: number) => getElementAtSelection(next, { kind: 'element', componentIndex: i, elementPath: [0] } as ElementSelection) as Rec
    expect(el(1).colors).toHaveLength(2)
    expect(el(0).colors).toEqual(['7C51F8'])
  })

  it('shows per-series swatches for a multi-series polar area chart', () => {
    mountSection(
      uiWith(
        chart({
          chart_type: 'polar_area',
          colors: ['7C51F8', '22C55E'],
          series: [
            { name: 'North', values: [1, 2, 3] },
            { name: 'South', values: [3, 2, 1] },
          ],
        }),
      ),
    )
    expect(wrapper!.findAll('button[aria-label^="Chart colour "]')).toHaveLength(2)
    expect(wrapper!.text()).toContain('North')
    expect(wrapper!.text()).toContain('South')
  })
})
