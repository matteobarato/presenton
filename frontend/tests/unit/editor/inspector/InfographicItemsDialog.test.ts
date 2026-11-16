import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref, shallowRef } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { getElementAtSelection, type ElementSelection, type RawUi } from '@/slide-editor/model'
import { SLIDE_EDITING_KEY, type SlideEditing } from '@/slide-editor/useSlideEditing'
import InfographicItemsDialog from '@/components/editor/inspector/element/InfographicItemsDialog.vue'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>
const root: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }
let wrapper: VueWrapper | null = null

const funnelItems = () => [
  { value: 90, heading: 'Lead', description: 'First', focus: true },
  { value: 60, heading: 'Prospect', description: 'Second' },
  { value: 30, heading: 'Deal', description: 'Third' },
]
const maturityItems = () => [
  { icon: { url: '/a.svg', color: '#112233' }, heading: 'One', description: 'd1', focus: true },
  { icon: { url: '/b.svg', color: '#445566' }, heading: 'Two', description: 'd2' },
]

function uiWith(data: Rec = { type: 'vertical_funnel', items: funnelItems() }, over: Rec = {}): RawUi {
  const el = { type: 'infographic', position: { x: 0, y: 0 }, size: { width: 400, height: 300 }, data, ...over }
  return { background: { color: 'FFFFFF' }, components: [{ id: 'c1', description: 'Info', position: { x: 0, y: 0 }, elements: [el] }] } as unknown as RawUi
}

function mountDialog(ui: RawUi = uiWith()) {
  const committedUi = shallowRef<RawUi>(ui)
  const draftUi = shallowRef<RawUi | null>(null)
  const slideId = ref('s1')
  const enabled = ref(true)
  const ctx = {
    enabled: computed(() => enabled.value),
    isOwnCommit: vi.fn(() => false),
    ui: computed(() => draftUi.value ?? committedUi.value),
    committedUi: computed(() => committedUi.value),
    draftUi,
    slideId: computed(() => slideId.value),
    // The real context holds the committed ui as the draft until the save lands, then drops it.
    commit: vi.fn(async () => {
      draftUi.value = null
      return true
    }),
    cancelDraft: vi.fn(() => {
      draftUi.value = null
    }),
  } as unknown as SlideEditing
  const open = ref(true)
  wrapper = mount(InfographicItemsDialog, {
    props: { open: true, root, 'onUpdate:open': (v: boolean) => { open.value = v; void wrapper!.setProps({ open: v }) } },
    global: { provide: { [SLIDE_EDITING_KEY as symbol]: ctx } },
    attachTo: document.body,
  })
  return { ctx, draftUi, committedUi, open }
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
async function click(l: string) {
  aria(l)!.click()
  await ticks()
}
const itemsOf = (ui: RawUi) => (getElementAtSelection(ui, root) as Rec).data.items as Rec[]
const committedItems = (ctx: SlideEditing) => itemsOf((ctx.commit as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RawUi)

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('InfographicItemsDialog', () => {
  it('opens with one row per item', async () => {
    mountDialog()
    await ticks()
    expect(q('[role="dialog"]')?.textContent).toContain('Edit items')
    expect(aria('Heading 3')!.value).toBe('Deal')
    expect(aria('Heading 4')).toBeNull()
    expect(aria('Value 1')!.value).toBe('90')
    expect(aria('Description 2')!.value).toBe('Second')
  })

  it('editing a heading updates draftUi and does not commit', async () => {
    const { ctx, draftUi } = mountDialog()
    await ticks()
    await type('Heading 2', 'Qualified')
    expect(itemsOf(draftUi.value!)[1]!.heading).toBe('Qualified')
    expect(ctx.commit).not.toHaveBeenCalled()
  })

  it('Done commits once with the edited items and clears draftUi', async () => {
    const { ctx, draftUi, open } = mountDialog()
    await ticks()
    await type('Heading 1', 'Top')
    await type('Value 2', '55')
    btn('Done')!.click()
    await ticks()
    expect(ctx.commit).toHaveBeenCalledTimes(1)
    expect((ctx.commit as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toBe('Edit items')
    const items = committedItems(ctx)
    expect(items[0]!.heading).toBe('Top')
    expect(items[1]!.value).toBe(55)
    expect(items[0]!.focus).toBe(true)
    expect(open.value).toBe(false)
    expect(draftUi.value).toBeNull()
  })

  it('Cancel discards: no commit, draftUi null', async () => {
    const { ctx, draftUi, open } = mountDialog()
    await ticks()
    await type('Heading 1', 'X')
    btn('Cancel')!.click()
    await ticks()
    expect(ctx.commit).not.toHaveBeenCalled()
    expect(draftUi.value).toBeNull()
    expect(open.value).toBe(false)
  })

  it('Done with no changes closes without a commit', async () => {
    const { ctx, open } = mountDialog()
    await ticks()
    btn('Done')!.click()
    await ticks()
    expect(ctx.commit).not.toHaveBeenCalled()
    expect(open.value).toBe(false)
  })

  it('a blank funnel value disables Done, marks the field invalid and keeps the last complete preview', async () => {
    const { draftUi } = mountDialog()
    await ticks()
    await type('Value 1', '70')
    await type('Value 1', '')
    expect(btn('Done')!.disabled).toBe(true)
    expect(aria('Value 1')!.getAttribute('aria-invalid')).toBe('true')
    expect(itemsOf(draftUi.value!)[0]!.value).toBe(70)
    await type('Value 1', '80')
    expect(btn('Done')!.disabled).toBe(false)
  })

  it('Add item appends "Stage N" and disables at 8; Delete disables at 1', async () => {
    const { draftUi } = mountDialog()
    await ticks()
    btn('Add item')!.click()
    await ticks()
    expect(itemsOf(draftUi.value!)[3]!.heading).toBe('Stage 4')
    for (let i = 0; i < 4; i++) btn('Add item')!.click()
    await ticks()
    expect(itemsOf(draftUi.value!)).toHaveLength(8)
    expect(btn('Add item')!.disabled).toBe(true)
    while (document.body.querySelectorAll('[aria-label^="Delete item"]').length > 1) await click('Delete item 1')
    expect((aria('Delete item 1') as unknown as HTMLButtonElement).disabled).toBe(true)
  })

  it('Move down swaps two rows and keeps unknown fields', async () => {
    const { draftUi } = mountDialog()
    await ticks()
    expect((aria('Move item 1 up') as unknown as HTMLButtonElement).disabled).toBe(true)
    expect((aria('Move item 3 down') as unknown as HTMLButtonElement).disabled).toBe(true)
    await click('Move item 1 down')
    const items = itemsOf(draftUi.value!)
    expect(items.map((i) => i.heading)).toEqual(['Prospect', 'Lead', 'Deal'])
    expect(items[1]!.focus).toBe(true)
  })

  it('maturity rows have no Value field and offer Change icon', async () => {
    mountDialog(uiWith({ type: 'maturity_model', items: maturityItems() }))
    await ticks()
    expect(aria('Value 1')).toBeNull()
    expect(aria('Change icon 1')).not.toBeNull()
    expect(aria('Description 1')!.tagName).toBe('TEXTAREA')
    expect(aria('Description 1')!.getAttribute('rows')).toBe('3')
  })

  it('picking an icon keeps the icon colour', async () => {
    const { draftUi } = mountDialog(uiWith({ type: 'maturity_model', items: maturityItems() }))
    await ticks()
    await click('Change icon 2')
    const picker = wrapper!.findComponent({ name: 'IconPickerDialog' })
    expect(picker.props('open')).toBe(true)
    picker.vm.$emit('pick', '/new.svg', 'bold')
    await ticks()
    const items = itemsOf(draftUi.value!)
    expect(items[1]!.icon).toEqual({ url: '/new.svg', color: '#445566' })
    expect(items[0]!.icon).toEqual({ url: '/a.svg', color: '#112233' })
    expect(items[0]!.focus).toBe(true)
  })

  it('opens with no rows when data.items is missing, and Add works', async () => {
    const { draftUi } = mountDialog(uiWith({ type: 'vertical_funnel' }))
    await ticks()
    expect(aria('Heading 1')).toBeNull()
    btn('Add item')!.click()
    await ticks()
    expect(itemsOf(draftUi.value!)).toHaveLength(1)
    expect(itemsOf(draftUi.value!)[0]!.heading).toBe('Stage 1')
  })

  it('closes and clears the draft when the root element disappears', async () => {
    const { ctx, committedUi, open } = mountDialog()
    await ticks()
    await type('Heading 1', 'X')
    committedUi.value = { background: { color: 'FFFFFF' }, components: [{ id: 'c1', description: 'Info', position: { x: 0, y: 0 }, elements: [] }] } as unknown as RawUi
    await ticks()
    expect(open.value).toBe(false)
    expect(ctx.cancelDraft).toHaveBeenCalled()
    expect(ctx.commit).not.toHaveBeenCalled()
  })

  it('closes and clears the draft when the selection moves to another element', async () => {
    const { ctx, open } = mountDialog()
    await ticks()
    await type('Heading 1', 'X')
    await wrapper!.setProps({ root: { kind: 'element', componentIndex: 0, elementPath: [1] } })
    await ticks()
    expect(open.value).toBe(false)
    expect(ctx.cancelDraft).toHaveBeenCalled()
  })
})
