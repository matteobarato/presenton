import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, defineComponent, h, nextTick, provide, ref, shallowRef } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { getElementAtSelection, type ElementSelection, type RawUi, type Selection } from '@/slide-editor/model'
import { SLIDE_EDITING_KEY, type SlideEditing } from '@/slide-editor/useSlideEditing'
import { DEFAULT_TEMPLATE_THEME } from '@/render/legacy/lib/template-theme'
import TableSection from '@/components/editor/inspector/element/TableSection.vue'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>
vi.mock('@/composables/useSlideMutations', () => ({ useSlideMutations: () => ({ editSlideUi: vi.fn().mockResolvedValue(true) }) }))

const presentation = { slides: [], theme: { ...DEFAULT_TEMPLATE_THEME } } as never
const sel: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }
let wrapper: VueWrapper | null = null

const cell = (text: string) => ({ runs: [{ text }] })
function uiWithTable(rowCount = 3, cols = 2): RawUi {
  const row = (r: number) => Array.from({ length: cols }, (_, c) => cell(`r${r}c${c}`))
  return {
    background: { color: 'FFFFFF' },
    components: [
      {
        id: 'c-table',
        description: 'Table',
        position: { x: 0, y: 0 },
        elements: [{ type: 'table', position: { x: 0, y: 0 }, size: { width: 400, height: 200 }, columns: row(0), rows: Array.from({ length: rowCount - 1 }, (_, r) => row(r + 1)) }],
      },
    ],
  } as RawUi
}

function mountSection(ui: RawUi, cellRef: { row: number; col: number } | null) {
  const state = ref<RawUi>(ui)
  const ctx = {
    enabled: computed(() => true),
    ui: computed(() => state.value),
    selection: ref<Selection>(sel),
    inlineEdit: shallowRef(null),
    inlineEditor: shallowRef(null),
    tableCell: ref(cellRef ? { root: sel, ...cellRef } : null),
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
        return () => h(TableSection, { presentation })
      },
    }),
    { attachTo: document.body },
  )
  return { ctx }
}
const committed = (ctx: SlideEditing, n = 0) => (ctx.commit as ReturnType<typeof vi.fn>).mock.calls[n]![0] as RawUi
const label = (ctx: SlideEditing, n = 0) => (ctx.commit as ReturnType<typeof vi.fn>).mock.calls[n]![1] as string
const el = (ui: RawUi) => getElementAtSelection(ui, sel) as Rec
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

describe('TableSection', () => {
  it('disables Add row at 8 rows, with the limit as its title', () => {
    mountSection(uiWithTable(8), { row: 1, col: 0 })
    expect(btn('Add row').attributes('disabled')).toBeDefined()
    expect(btn('Add row').attributes('title')).toBe('Tables have at most 8 rows')
  })

  it('disables Delete row on the header row', () => {
    mountSection(uiWithTable(4), { row: 0, col: 0 })
    expect(btn('Delete row').attributes('disabled')).toBeDefined()
    expect(btn('Delete row').attributes('title')).toBe("The header row can't be deleted")
  })

  it('shows no Cell group without a selected cell', () => {
    mountSection(uiWithTable(), null)
    expect(wrapper!.find('button[aria-label="Cell background"]').exists()).toBe(false)
    expect(wrapper!.find('[aria-label="Cell alignment"]').exists()).toBe(false)
    expect(btn('Add row').attributes('disabled')).toBeUndefined()
    expect(btn('Delete row').attributes('disabled')).toBeDefined()
  })

  it('Add row with cell (1,0) commits one UI with a new empty row 2', async () => {
    const { ctx } = mountSection(uiWithTable(3), { row: 1, col: 0 })
    await btn('Add row').trigger('click')
    await flushPromises()
    expect(ctx.commit).toHaveBeenCalledTimes(1)
    expect(label(ctx)).toBe('Add row')
    const t = el(committed(ctx))
    expect(t.rows).toHaveLength(3)
    expect(t.rows[1][0].runs).toEqual([{ text: '' }])
    expect(t.rows[2][0].runs[0].text).toBe('r2c0')
  })

  it('Delete row and Move column commit with their labels', async () => {
    const { ctx } = mountSection(uiWithTable(4), { row: 2, col: 0 })
    await btn('Delete row').trigger('click')
    await flushPromises()
    expect(label(ctx)).toBe('Delete row')
    expect(el(committed(ctx)).rows).toHaveLength(2)
    await btn('Move column right').trigger('click')
    await flushPromises()
    expect(label(ctx, 1)).toBe('Move column')
    expect(el(committed(ctx, 1)).columns[1].runs[0].text).toBe('r0c0')
  })

  it('Move column follows the moved column, so a second move keeps going', async () => {
    const { ctx } = mountSection(uiWithTable(3, 3), { row: 1, col: 0 })
    await btn('Move column right').trigger('click')
    await flushPromises()
    expect(ctx.tableCell.value).toEqual({ root: sel, row: 1, col: 1 })
    await btn('Move column right').trigger('click')
    await flushPromises()
    const t = el(committed(ctx, 1))
    expect(t.columns.map((c: Rec) => c.runs[0].text)).toEqual(['r0c1', 'r0c2', 'r0c0'])
    expect(ctx.tableCell.value).toEqual({ root: sel, row: 1, col: 2 })
    await btn('Move column left').trigger('click')
    await flushPromises()
    expect(ctx.tableCell.value).toEqual({ root: sel, row: 1, col: 1 })
  })

  it('the Cell background palette swatch sets color on that cell only', async () => {
    const { ctx } = mountSection(uiWithTable(3), { row: 1, col: 1 })
    await btn('Cell background').trigger('click')
    await nextTick()
    await nextTick()
    const swatch = document.body.querySelector('button[aria-label^="#"]') as HTMLElement
    const colour = swatch.getAttribute('aria-label')
    swatch.click()
    await flushPromises()
    expect(ctx.commit).toHaveBeenCalledTimes(1)
    expect(label(ctx)).toBe('Cell background')
    const t = el(committed(ctx))
    expect(t.rows[0][1].color.color).toBe(colour)
    expect(t.rows[0][0].color).toBeUndefined()
    expect(t.columns[1].color).toBeUndefined()
  })

  it('Cell alignment commits on the selected cell', async () => {
    const { ctx } = mountSection(uiWithTable(3), { row: 0, col: 1 })
    await btn('Cell align right').trigger('click')
    await flushPromises()
    expect(label(ctx)).toBe('Cell alignment')
    expect(el(committed(ctx)).columns[1].alignment).toBe('right')
  })
})
