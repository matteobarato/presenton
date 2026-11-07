import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, defineComponent, h, nextTick, provide, ref, shallowRef } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { getElementAtSelection, type ElementSelection, type RawUi, type Selection } from '@/slide-editor/model'
import { SLIDE_EDITING_KEY, type SlideEditing } from '@/slide-editor/useSlideEditing'
import { DEFAULT_TEMPLATE_THEME } from '@/render/legacy/lib/template-theme'
import LineSection from '@/components/editor/inspector/element/LineSection.vue'
import { uiWithLine } from '../../slide-editor/fixtures'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>
vi.mock('@/composables/useSlideMutations', () => ({ useSlideMutations: () => ({ editSlideUi: vi.fn().mockResolvedValue(true) }) }))

const presentation = { slides: [], theme: { ...DEFAULT_TEMPLATE_THEME } } as never
const sel: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }
let wrapper: VueWrapper | null = null

function mountSection(ui: RawUi = uiWithLine()) {
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
  wrapper = mount(
    defineComponent({
      setup() {
        provide(SLIDE_EDITING_KEY, ctx)
        return () => h(LineSection, { presentation })
      },
    }),
    { attachTo: document.body },
  )
  return { ctx }
}
const committed = (ctx: SlideEditing, n = 0) => (ctx.commit as ReturnType<typeof vi.fn>).mock.calls[n]![0] as RawUi
const label = (ctx: SlideEditing, n = 0) => (ctx.commit as ReturnType<typeof vi.fn>).mock.calls[n]![1] as string
const el = (ui: RawUi) => getElementAtSelection(ui, sel) as Rec

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  setActivePinia(createPinia())
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('LineSection', () => {
  it('choosing End = Filled arrow commits end_marker triangle', async () => {
    const { ctx } = mountSection()
    await wrapper!.get('button[aria-label="End"]').trigger('click')
    await nextTick()
    await nextTick()
    const options = [...document.body.querySelectorAll('[role="listbox"] [role="option"]')] as HTMLElement[]
    options.find((o) => o.textContent?.includes('Filled arrow'))!.click()
    await flushPromises()
    expect(ctx.commit).toHaveBeenCalledTimes(1)
    expect(label(ctx)).toBe('Line ends')
    expect(el(committed(ctx)).end_marker).toBe('triangle')
    expect(el(committed(ctx)).start_marker).toBe('none')
  })

  it('Swap ends commits swapped markers', async () => {
    const { ctx } = mountSection()
    await wrapper!.get('button[aria-label="Swap ends"]').trigger('click')
    await flushPromises()
    expect(ctx.commit).toHaveBeenCalledTimes(1)
    expect(label(ctx)).toBe('Line ends')
    expect(el(committed(ctx))).toMatchObject({ start_marker: 'arrow', end_marker: 'none' })
  })

  it('Width and Dash commit as Stroke', async () => {
    const { ctx } = mountSection()
    const input = wrapper!.get('input[aria-label="Width"]')
    await input.trigger('focus')
    await input.setValue('5')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(label(ctx)).toBe('Stroke')
    expect(el(committed(ctx)).stroke.width).toBe(5)
    await wrapper!.get('button[aria-label="Dashed"]').trigger('click')
    await flushPromises()
    expect(el(committed(ctx, 1)).stroke.dash).toEqual([15, 10])
  })
})
