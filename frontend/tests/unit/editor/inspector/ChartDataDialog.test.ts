import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref, shallowRef } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { getElementAtSelection, type ElementSelection, type RawUi } from '@/slide-editor/model'
import { SLIDE_EDITING_KEY, type SlideEditing } from '@/slide-editor/useSlideEditing'
import ChartDataDialog from '@/components/editor/inspector/element/ChartDataDialog.vue'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>
const root: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }
let wrapper: VueWrapper | null = null

function uiWith(over: Rec = {}): RawUi {
  const el = {
    type: 'chart',
    chart_type: 'bar',
    position: { x: 0, y: 0 },
    size: { width: 400, height: 300 },
    categories: ['A', 'B'],
    series: [{ name: 'Sales', values: [10, 20] }],
    colors: ['7C51F8'],
    ...over,
  }
  return { background: { color: 'FFFFFF' }, components: [{ id: 'c1', description: 'Chart', position: { x: 0, y: 0 }, elements: [el] }] } as unknown as RawUi
}

function mountDialog(ui: RawUi = uiWith()) {
  const committedUi = shallowRef<RawUi>(ui)
  const draftUi = shallowRef<RawUi | null>(null)
  const slideId = ref('s1')
  const ctx = {
    ui: computed(() => draftUi.value ?? committedUi.value),
    committedUi: computed(() => committedUi.value),
    draftUi,
    slideId: computed(() => slideId.value),
    commit: vi.fn(async () => true),
    cancelDraft: vi.fn(() => {
      draftUi.value = null
    }),
  } as unknown as SlideEditing
  const open = ref(true)
  wrapper = mount(ChartDataDialog, {
    props: { open: true, root, 'onUpdate:open': (v: boolean) => { open.value = v; void wrapper!.setProps({ open: v }) } },
    global: { provide: { [SLIDE_EDITING_KEY as symbol]: ctx } },
    attachTo: document.body,
  })
  return { ctx, draftUi, committedUi, slideId, open }
}
const q = (sel: string) => document.body.querySelector(sel) as HTMLElement | null
const aria = (l: string) => q(`[aria-label="${l}"]`) as HTMLInputElement | null
const btn = (text: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined
const ticks = async () => {
  await nextTick()
  await nextTick()
}
async function type(l: string, v: string) {
  const el = aria(l)!
  el.value = v
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await ticks()
}
const chartOf = (ui: RawUi) => getElementAtSelection(ui, root) as Rec
const committedChart = (ctx: SlideEditing) => chartOf((ctx.commit as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RawUi)

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('ChartDataDialog', () => {
  it('previews a typed value in draftUi without committing', async () => {
    const { ctx, draftUi } = mountDialog()
    await ticks()
    await type('Value 1,1', '42')
    expect(chartOf(draftUi.value!).series[0].values[0]).toBe(42)
    expect(ctx.commit).not.toHaveBeenCalled()
  })

  it('Done commits once with the label', async () => {
    const { ctx, open } = mountDialog()
    await ticks()
    await type('Category 1', 'Alpha')
    btn('Done')!.click()
    await ticks()
    expect(ctx.commit).toHaveBeenCalledTimes(1)
    expect((ctx.commit as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toBe('Edit chart data')
    expect(committedChart(ctx).categories[0]).toBe('Alpha')
    expect(open.value).toBe(false)
  })

  it('Done with no change cancels the draft instead of committing', async () => {
    const { ctx } = mountDialog()
    await ticks()
    btn('Done')!.click()
    await ticks()
    expect(ctx.commit).not.toHaveBeenCalled()
    expect(ctx.cancelDraft).toHaveBeenCalled()
  })

  it('Cancel discards the draft', async () => {
    const { ctx, draftUi, open } = mountDialog()
    await ticks()
    await type('Value 1,1', '5')
    btn('Cancel')!.click()
    await ticks()
    expect(ctx.cancelDraft).toHaveBeenCalled()
    expect(ctx.commit).not.toHaveBeenCalled()
    expect(draftUi.value).toBeNull()
    expect(open.value).toBe(false)
  })

  it('drops an incomplete draft on Done and keeps the last complete value', async () => {
    const { ctx } = mountDialog()
    await ticks()
    await type('Value 1,1', '7')
    await type('Value 1,1', '-')
    btn('Done')!.click()
    await ticks()
    const values = committedChart(ctx).series[0].values
    expect(values[0]).toBe(7)
    expect(values.every((v: unknown) => typeof v === 'number' && !Number.isNaN(v))).toBe(true)
  })

  it('keeps the original value when an incomplete draft never had a complete one', async () => {
    const { ctx } = mountDialog()
    await ticks()
    await type('Value 1,1', '-')
    await type('Category 1', 'Z')
    btn('Done')!.click()
    await ticks()
    expect(committedChart(ctx).series[0].values[0]).toBe(10)
  })

  it('reverts an incomplete draft on blur', async () => {
    mountDialog()
    await ticks()
    await type('Value 1,1', '-')
    aria('Value 1,1')!.dispatchEvent(new Event('blur'))
    await ticks()
    expect(aria('Value 1,1')!.value).toBe('10')
  })

  it('closes and discards when the slide changes', async () => {
    const { ctx, slideId, open } = mountDialog()
    await ticks()
    await type('Value 1,1', '5')
    slideId.value = 's2'
    await ticks()
    expect(open.value).toBe(false)
    expect(ctx.cancelDraft).toHaveBeenCalled()
    expect(ctx.commit).not.toHaveBeenCalled()
  })

  it('closes and discards when the committed ui changes remotely', async () => {
    const { ctx, committedUi, open } = mountDialog()
    await ticks()
    committedUi.value = uiWith({ categories: ['X', 'Y'] })
    await ticks()
    expect(open.value).toBe(false)
    expect(ctx.cancelDraft).toHaveBeenCalled()
    expect(ctx.commit).not.toHaveBeenCalled()
  })

  it('adds and deletes rows and series, gated by caps', async () => {
    const { draftUi } = mountDialog(uiWith({ chart_type: 'bar' }))
    await ticks()
    btn('Add row')!.click()
    await ticks()
    expect(chartOf(draftUi.value!).categories).toHaveLength(3)
    btn('Add series')!.click()
    await ticks()
    expect(chartOf(draftUi.value!).series).toHaveLength(2)
    ;(q('[aria-label="Delete row 1"]') as HTMLButtonElement).click()
    await ticks()
    expect(chartOf(draftUi.value!).categories).toHaveLength(2)
  })

  it('disables Add row at the category cap', async () => {
    mountDialog(uiWith({ categories: Array.from({ length: 24 }, (_, i) => `C${i}`), series: [{ name: 'S', values: Array(24).fill(1) }] }))
    await ticks()
    expect(btn('Add row')!.disabled).toBe(true)
  })

  it('has no Add series button for a pie chart', async () => {
    mountDialog(uiWith({ chart_type: 'pie' }))
    await ticks()
    expect(btn('Add series')).toBeUndefined()
    expect(q('[aria-label="Series 1 actions"]')).toBeNull()
  })
})
