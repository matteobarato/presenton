import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, defineComponent, h, provide, shallowRef, type ComputedRef } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { Presentation, Slide } from '@/api/types'
import type { RawUi, Selection } from '@/slide-editor/model'
import { SLIDE_EDITING_KEY, type SlideEditing } from '@/slide-editor/useSlideEditing'
import { useEditorStore } from '@/stores/editor'
import ImagePickerDialog from '@/components/editor/canvas/ImagePickerDialog.vue'
import InsertTab from '@/components/editor/inspector/insert/InsertTab.vue'
import { uiTwoComponents } from '../../slide-editor/fixtures'

const getTemplate = vi.hoisted(() => vi.fn())
vi.mock('@/api/outlines', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/outlines')>()),
  getTemplate,
}))

const block = (id: string, name: string, description: string) => ({
  id,
  name,
  description,
  position: { x: 40, y: 40 },
  elements: [{ type: 'text', position: { x: 0, y: 0 }, size: { width: 200, height: 40 }, text: name }],
})

const TEMPLATE = {
  layouts: [],
  theme: undefined,
  fonts: undefined,
  mergedComponents: [
    { ...block('metric_cards', 'Metric Cards', 'Three numbers side by side'), variants: [{ id: 'metric_cards_1' }, { id: 'metric_cards_2', name: 'Metric Cards Wide' }] },
    block('title_banner', 'Title Banner', 'A large heading'),
  ],
}

type MountOpts = { layoutGroup?: string; activeSlide?: Slide | null; enabled?: boolean; inlineEdit?: boolean }

function mountTab(opts: MountOpts = {}) {
  const uiRef = shallowRef<RawUi>(uiTwoComponents() as RawUi)
  const slide = { id: 's1', layout_group: opts.layoutGroup ?? 'template-v2:tpl1', ui: uiRef.value } as unknown as Slide
  const activeSlide = opts.activeSlide === undefined ? slide : opts.activeSlide
  const presentation = { id: 'p1', slides: [slide] } as unknown as Presentation
  const ctx = {
    enabled: computed(() => opts.enabled ?? true),
    slideId: computed(() => 's1') as ComputedRef<string | null>,
    ui: computed(() => uiRef.value),
    selection: shallowRef<Selection>(null),
    inlineEdit: shallowRef(opts.inlineEdit ? { slideId: 's1' } : null),
    closeInlineEdit: vi.fn(async () => {
      const ui = structuredClone(uiRef.value) as { components: Array<{ elements: Array<{ text?: string }> }> }
      ui.components[0]!.elements[0]!.text = 'Edited'
      uiRef.value = ui as unknown as RawUi
      ctx.inlineEdit.value = null
      return true
    }),
    commitTo: vi.fn().mockResolvedValue(true),
    select: vi.fn(),
  }
  const wrapper = mount(
    defineComponent({
      setup() {
        provide(SLIDE_EDITING_KEY, ctx as unknown as SlideEditing)
        return () => h(InsertTab, { presentationId: 'p1', presentation, activeSlide })
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
  )
  const button = (l: string) => wrapper.get(`button[aria-label="${l}"]`)
  const click = async (l: string) => {
    await button(l).trigger('click')
    await flushPromises()
  }
  return { wrapper, ctx, button, click }
}

beforeEach(() => {
  setActivePinia(createPinia())
  getTemplate.mockReset()
  getTemplate.mockResolvedValue(TEMPLATE)
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } })
})
afterEach(() => vi.unstubAllGlobals())

describe('InsertTab', () => {
  it('renders the header and sections', async () => {
    const { wrapper } = mountTab()
    await flushPromises()
    for (const t of ['Insert', 'Click to add to this slide.', 'Blocks', 'Text', 'Images', 'Shapes', 'Basic Shapes']) {
      expect(wrapper.text()).toContain(t)
    }
  })

  it('inserts a Title as one commit and selects it', async () => {
    const { ctx, click } = mountTab()
    await click('Insert Title')
    expect(ctx.commitTo).toHaveBeenCalledTimes(1)
    expect(ctx.commitTo).toHaveBeenCalledWith('s1', expect.anything(), 'Insert Title')
    expect(ctx.select).toHaveBeenCalledWith({ kind: 'component', componentIndex: 2 })
  })

  it('commits an open inline edit before inserting', async () => {
    const { ctx, click } = mountTab({ inlineEdit: true })
    await click('Insert Rectangle')
    expect(ctx.closeInlineEdit).toHaveBeenCalledWith(true)
    expect(JSON.stringify(ctx.commitTo.mock.calls[0]![1])).toContain('Edited')
    expect(ctx.commitTo.mock.calls[0]![2]).toBe('Insert Rectangle')
  })

  it('an insert goes to the clicked slide even if the slide changes while the inline edit saves', async () => {
    const { ctx, click } = mountTab({ inlineEdit: true })
    let finish: (ok: boolean) => void = () => {}
    const sync = ctx.closeInlineEdit.getMockImplementation()!
    ctx.closeInlineEdit.mockImplementation(() => {
      void sync() // swaps in the edited ui synchronously, as commitTo's draft does
      return new Promise<boolean>((r) => (finish = r))
    })
    await click('Insert Title')
    expect(ctx.commitTo).not.toHaveBeenCalled()
    ;(ctx as { slideId: ComputedRef<string | null> }).slideId = computed(() => 's2')
    finish(true)
    await flushPromises()
    expect(ctx.commitTo).toHaveBeenCalledTimes(1)
    expect(ctx.commitTo.mock.calls[0]![0]).toBe('s1')
    expect(JSON.stringify(ctx.commitTo.mock.calls[0]![1])).toContain('Edited')
    expect(ctx.select).not.toHaveBeenCalled()
  })

  it('image insert commits an open inline edit at click time and keeps its text on a stale pick', async () => {
    const { wrapper, ctx, click } = mountTab({ inlineEdit: true })
    await click('Insert Image')
    expect(ctx.closeInlineEdit).toHaveBeenCalledWith(true)
    ;(ctx as { slideId: ComputedRef<string | null> }).slideId = computed(() => 's2')
    wrapper.getComponent(ImagePickerDialog).vm.$emit('pick', '/app_data/images/x.png')
    await flushPromises()
    expect(ctx.commitTo.mock.calls[0]![0]).toBe('s1')
    const ui = JSON.stringify(ctx.commitTo.mock.calls[0]![1])
    expect(ui).toContain('Edited')
    expect(ui).toContain('/app_data/images/x.png')
    expect(ctx.select).not.toHaveBeenCalled()
  })

  it('lists template blocks and inserts a variant', async () => {
    const { wrapper, ctx, click } = mountTab()
    await flushPromises()
    expect(getTemplate).toHaveBeenCalledWith('tpl1')
    expect(wrapper.text()).toContain('Metric Cards')
    await click('Insert Metric Cards')
    expect(ctx.commitTo.mock.calls[0]![2]).toBe('Insert Metric Cards')
    expect(ctx.select).toHaveBeenCalledWith({ kind: 'component', componentIndex: 2 })
  })

  it('expands a group to show its variants', async () => {
    const { wrapper, ctx, click } = mountTab()
    await flushPromises()
    expect(wrapper.find('button[aria-label="Insert Metric Cards Wide"]').exists()).toBe(false)
    await click('Show variants of Metric Cards')
    await click('Insert Metric Cards Wide')
    expect(ctx.commitTo.mock.calls[0]![2]).toBe('Insert Metric Cards Wide')
  })

  it('filters blocks by search', async () => {
    const { wrapper } = mountTab()
    await flushPromises()
    await wrapper.get('input[aria-label="Search blocks"]').setValue('TITLE')
    expect(wrapper.find('button[aria-label="Insert Title Banner"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Insert Metric Cards"]').exists()).toBe(false)
    await wrapper.get('input[aria-label="Search blocks"]').setValue('side by side')
    expect(wrapper.find('button[aria-label="Insert Metric Cards"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Insert Title Banner"]').exists()).toBe(false)
  })

  it('shows the no-blocks note when the deck has no template slide', async () => {
    const { wrapper } = mountTab({ layoutGroup: 'smart-html' })
    await flushPromises()
    expect(getTemplate).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain("This deck's template has no reusable blocks.")
  })

  it('shows the no-blocks note when the template has no components', async () => {
    getTemplate.mockResolvedValue({ ...TEMPLATE, mergedComponents: [] })
    const { wrapper } = mountTab()
    await flushPromises()
    expect(wrapper.text()).toContain("This deck's template has no reusable blocks.")
  })

  it('shows skeletons while the template loads', () => {
    getTemplate.mockReturnValue(new Promise(() => {}))
    const { wrapper } = mountTab()
    expect(wrapper.findAll('[data-testid="block-skeleton"]')).toHaveLength(4)
  })

  it('shows an error with Retry when the template fails to load', async () => {
    getTemplate.mockRejectedValue(new Error('boom'))
    const { wrapper, click } = mountTab()
    await flushPromises()
    expect(wrapper.text()).toContain("Couldn't load template blocks")
    expect(wrapper.text()).toContain('Title')
    getTemplate.mockResolvedValue(TEMPLATE)
    await click('Retry')
    expect(getTemplate).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Metric Cards')
  })

  it('disables tiles while locked', async () => {
    const { button, ctx } = mountTab()
    useEditorStore().generating = true
    await flushPromises()
    expect(button('Insert Title').attributes('disabled')).toBeDefined()
    expect(button('Insert Title').attributes('title')).toBe('Insert is unavailable while the deck is busy')
    await button('Insert Title').trigger('click')
    expect(ctx.commitTo).not.toHaveBeenCalled()
  })

  it('disables tiles on a smart slide', async () => {
    const smart = { id: 's1', html_content: '<div>x</div>' } as unknown as Slide
    const { button } = mountTab({ activeSlide: smart, enabled: false })
    await flushPromises()
    expect(button('Insert Rectangle').attributes('disabled')).toBeDefined()
    expect(button('Insert Rectangle').attributes('title')).toBe('Insert is available for template slides')
  })

  it('disables tiles with no active slide', async () => {
    const { button } = mountTab({ activeSlide: null, enabled: false })
    await flushPromises()
    expect(button('Insert Image').attributes('disabled')).toBeDefined()
    expect(button('Insert Image').attributes('title')).toBe('Select a slide to insert into')
  })

  it('image insert targets the slide it was started on', async () => {
    const { wrapper, ctx, click } = mountTab()
    await click('Insert Image')
    const picker = wrapper.getComponent(ImagePickerDialog)
    expect(picker.props('open')).toBe(true)
    ctx.slideId = computed(() => 's2')
    picker.vm.$emit('pick', '/app_data/images/x.png')
    await flushPromises()
    expect(ctx.commitTo.mock.calls[0]![0]).toBe('s1')
    expect(JSON.stringify(ctx.commitTo.mock.calls[0]![1])).toContain('/app_data/images/x.png')
    expect(ctx.commitTo.mock.calls[0]![2]).toBe('Insert Image')
    expect(ctx.select).not.toHaveBeenCalled()
  })

  it('image insert on the same slide selects the new image', async () => {
    const { wrapper, ctx, click } = mountTab()
    await click('Insert Image')
    wrapper.getComponent(ImagePickerDialog).vm.$emit('pick', '/app_data/images/x.png')
    await flushPromises()
    expect(ctx.commitTo.mock.calls[0]![0]).toBe('s1')
    expect(ctx.select).toHaveBeenCalledWith({ kind: 'component', componentIndex: 2 })
  })

  it('cancelling the image picker inserts nothing', async () => {
    const { wrapper, ctx, click } = mountTab()
    await click('Insert Image')
    const picker = wrapper.getComponent(ImagePickerDialog)
    picker.vm.$emit('update:open', false)
    await flushPromises()
    expect(picker.props('open')).toBe(false)
    expect(ctx.commitTo).not.toHaveBeenCalled()
  })

  it('keeps the inline editor open when focus moves into the tab', () => {
    expect(mountTab().wrapper.find('[data-inline-edit-ignore]').exists()).toBe(true)
  })
})
