import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, defineComponent, h, nextTick, provide, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import { getElementAtSelection, type ElementSelection, type RawUi, type Selection } from '@/slide-editor/model'
import { SLIDE_EDITING_KEY, type SlideEditing } from '@/slide-editor/useSlideEditing'
import { DEFAULT_TEMPLATE_THEME } from '@/render/legacy/lib/template-theme'
import TextSection from '@/components/editor/inspector/element/TextSection.vue'
import { uiWithText } from '../../slide-editor/fixtures'
import { mountEditable, stubRect, tpl } from '../canvas/harness'

vi.mock('@/composables/useSlideMutations', () => ({ useSlideMutations: () => ({ editSlideUi: vi.fn().mockResolvedValue(true) }) }))

const presentation = {
  slides: [],
  fonts: { Merriweather: { url: '/app_data/fonts/merriweather.ttf' } },
  theme: { ...DEFAULT_TEMPLATE_THEME, fonts: { textFont: { name: 'Lora', url: '/x/lora.ttf' } } },
} as never

const textSel: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }

function mountWith(ctx: SlideEditing) {
  return mount(
    defineComponent({
      setup() {
        provide(SLIDE_EDITING_KEY, ctx)
        // ElementTab's root carries this attribute in the app.
        return () => h('div', { 'data-inline-edit-ignore': 'true' }, [h(TextSection, { presentation })])
      },
    }),
    { attachTo: document.body },
  )
}
function mountPlain(sel: Selection = textSel, ui: RawUi = uiWithText()) {
  const ctx = {
    enabled: computed(() => true),
    ui: computed(() => ui),
    selection: ref<Selection>(sel),
    inlineEdit: shallowRef(null),
    inlineEditor: shallowRef(null),
    commit: vi.fn().mockResolvedValue(true),
    select: vi.fn(),
  } as unknown as SlideEditing
  return { wrapper: mountWith(ctx), ctx }
}
const committed = (ctx: SlideEditing) => (ctx.commit as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RawUi
const elOf = (ui: RawUi) => getElementAtSelection(ui, textSel) as Record<string, unknown> & { font: Record<string, unknown>; alignment: Record<string, unknown>; runs: Array<{ font: Record<string, unknown> }> }

let rect: ReturnType<typeof stubRect>
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } })
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  setActivePinia(createPinia())
  rect = stubRect()
})
afterEach(() => {
  vi.unstubAllGlobals()
  rect.mockRestore()
  document.body.innerHTML = ''
})

describe('TextSection', () => {
  it('Bold on an element selection sets bold on the font and every run', async () => {
    const ui = uiWithText()
    ;(ui.components as Array<{ elements: Array<Record<string, unknown>> }>)[0].elements[0].runs = [{ text: 'Hel' }, { text: 'lo', font: { italic: true } }]
    const { wrapper, ctx } = mountPlain(textSel, ui)
    await wrapper.get('button[aria-label="Bold"]').trigger('click')
    expect(ctx.commit).toHaveBeenCalledWith(expect.anything(), 'Text style')
    const el = elOf(committed(ctx))
    expect(el.font.bold).toBe(true)
    expect(el.runs.map((r) => r.font.bold)).toEqual([true, true])
    expect(el.runs[1].font.italic).toBe(true)
  })

  it('patches the text element of a component selection', async () => {
    const { wrapper, ctx } = mountPlain({ kind: 'component', componentIndex: 0 })
    await wrapper.get('button[aria-label="Align center"]').trigger('click')
    expect(elOf(committed(ctx)).alignment.horizontal).toBe('center')
  })

  it('font size 48 sets the element font size, clamped to 8-200', async () => {
    const { wrapper, ctx } = mountPlain()
    const input = wrapper.get('input[aria-label="Font size"]')
    await input.setValue('48')
    await input.trigger('change')
    expect(elOf(committed(ctx)).font.size).toBe(48)
    const second = mountPlain()
    const i2 = second.wrapper.get('input[aria-label="Font size"]')
    await i2.setValue('999')
    await i2.trigger('change')
    expect(elOf(committed(second.ctx)).font.size).toBe(200)
  })

  it('font list holds the current, deck and theme families', () => {
    const { wrapper } = mountPlain()
    const options = wrapper.findAll('select[aria-label="Font family"] option').map((o) => o.text())
    expect(options[0]).toBe('Arial')
    expect(options).toContain('Merriweather')
    expect(options).toContain('Lora')
  })

  it('a theme swatch sets the colour', async () => {
    const { wrapper, ctx } = mountPlain()
    await wrapper.get(`button[aria-label="Colour ${DEFAULT_TEMPLATE_THEME.primary}"]`).trigger('click')
    expect(elOf(committed(ctx)).font.color).toBe(DEFAULT_TEMPLATE_THEME.primary)
  })

  it('line height 1.5 sets line_height', async () => {
    const { wrapper, ctx } = mountPlain()
    const select = wrapper.get('select[aria-label="Line height"]')
    await select.setValue('1.5')
    expect(elOf(committed(ctx)).font.line_height).toBe(1.5)
  })

  it('buttons do not take focus', () => {
    const { wrapper } = mountPlain()
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    wrapper.get('button[aria-label="Bold"]').element.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })
})

function listUi(): RawUi {
  const ui = uiWithText()
  Object.assign((ui.components as Array<{ elements: Array<Record<string, unknown>> }>)[0]!.elements[0]!, {
    type: 'text-list',
    items: ['One', [{ text: 'Two' }, { text: '!', font: { italic: true } }], { runs: [{ text: 'Three' }] }],
  })
  return ui
}

describe('TextSection for a text-list', () => {
  it('renders for a selected list', () => {
    expect(mountPlain(textSel, listUi()).wrapper.find('button[aria-label="Bold"]').exists()).toBe(true)
  })
  it('Bold makes every item run bold', async () => {
    const { wrapper, ctx } = mountPlain(textSel, listUi())
    await wrapper.get('button[aria-label="Bold"]').trigger('click')
    const el = elOf(committed(ctx)) as unknown as { font: { bold: boolean }; items: unknown[] }
    expect(el.font.bold).toBe(true)
    const runs = el.items.flatMap((i) => (Array.isArray(i) ? i : (i as { runs: unknown[] }).runs)) as Array<{ font: { bold: boolean; italic?: boolean } }>
    expect(runs).toHaveLength(4)
    expect(runs.every((r) => r.font.bold === true)).toBe(true)
    expect(runs[2]!.font.italic).toBe(true)
  })
  it('size applies to the element font', async () => {
    const { wrapper, ctx } = mountPlain(textSel, listUi())
    const input = wrapper.get('input[aria-label="Font size"]')
    await input.setValue('30')
    await input.trigger('change')
    expect(elOf(committed(ctx)).font.size).toBe(30)
  })
  it('resets the size input after an empty entry', async () => {
    const { wrapper, ctx } = mountPlain(textSel, listUi())
    const input = wrapper.get('input[aria-label="Font size"]')
    ;(input.element as HTMLInputElement).value = 'abc'
    await input.trigger('change')
    expect(ctx.commit).not.toHaveBeenCalled()
    expect((input.element as HTMLInputElement).value).toBe('24')
  })
})

describe('TextSection with the inline editor open', () => {
  let current: ReturnType<typeof mountEditable>
  let section: ReturnType<typeof mount>

  async function openEditor() {
    current = mountEditable(tpl('a', uiWithText()))
    const overlay = current.wrapper.get('[data-testid="selection-overlay"]').element
    overlay.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 75, clientY: 50 }))
    await nextTick()
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(current.api().inlineEditor.value).not.toBeNull()
    section = mountWith(current.api())
  }

  it('Bold runs the editor command and does not commit', async () => {
    await openEditor()
    const editor = current.api().inlineEditor.value!
    editor.commands.selectAll()
    await section.get('button[aria-label="Bold"]').trigger('click')
    expect(editor.isActive('bold')).toBe(true)
    expect(current.api().inlineEdit.value).not.toBeNull()
  })

  it('changing the colour keeps the editor open and applies it through Tiptap', async () => {
    await openEditor()
    const editor = current.api().inlineEditor.value!
    editor.commands.selectAll()
    const input = section.get('input[type="color"]')
    input.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 1 }))
    ;(input.element as HTMLInputElement).value = '#ff0000'
    await input.trigger('change')
    expect(editor.getAttributes('textStyle').color).toBe('#ff0000')
    expect(current.api().inlineEdit.value).not.toBeNull()
    expect(current.api().inlineEditor.value).not.toBeNull()
  })

  it('font size applies as a textStyle mark', async () => {
    await openEditor()
    const editor = current.api().inlineEditor.value!
    editor.commands.selectAll()
    const input = section.get('input[aria-label="Font size"]')
    await input.setValue('40')
    await input.trigger('change')
    expect(editor.getAttributes('textStyle').fontSize).toBe(40)
  })
})
