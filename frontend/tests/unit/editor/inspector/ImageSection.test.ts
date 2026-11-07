import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, defineComponent, h, provide, ref, shallowRef } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { getElementAtSelection, type ElementSelection, type RawUi, type Selection } from '@/slide-editor/model'
import { SLIDE_EDITING_KEY, type SlideEditing } from '@/slide-editor/useSlideEditing'
import ImageSection from '@/components/editor/inspector/element/ImageSection.vue'
import ImagePickerDialog from '@/components/editor/canvas/ImagePickerDialog.vue'
import { uiWithImage } from '../../slide-editor/fixtures'

vi.mock('@/composables/useSlideMutations', () => ({ useSlideMutations: () => ({ editSlideUi: vi.fn().mockResolvedValue(true) }) }))
vi.mock('@/api/images', async (orig) => ({
  ...(await orig<typeof import('@/api/images')>()),
  listUploadedImages: vi.fn().mockResolvedValue([]),
  listGeneratedImages: vi.fn().mockResolvedValue([]),
}))

const sel: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }

function mountSection(selection: Selection = { kind: 'component', componentIndex: 0 }, patch: Record<string, unknown> = {}) {
  const base = uiWithImage()
  Object.assign((base.components as Array<{ elements: Array<Record<string, unknown>> }>)[0]!.elements[0]!, patch)
  const ui = ref<RawUi>(base)
  const ctx = {
    enabled: computed(() => true),
    ui: computed(() => ui.value),
    selection: ref<Selection>(selection),
    inlineEdit: shallowRef(null),
    inlineEditor: shallowRef(null),
    commit: vi.fn(async (next: RawUi) => {
      ui.value = next
      return true
    }),
    select: vi.fn(),
  } as unknown as SlideEditing
  const client = new QueryClient()
  const wrapper = mount(
    defineComponent({
      setup() {
        provide(SLIDE_EDITING_KEY, ctx)
        return () => h(ImageSection)
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] }, attachTo: document.body },
  )
  return { wrapper, ctx }
}
const committed = (ctx: SlideEditing, n = 0) => (ctx.commit as ReturnType<typeof vi.fn>).mock.calls[n]![0] as RawUi
const el = (ui: RawUi) => getElementAtSelection(ui, sel) as Record<string, unknown>

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  setActivePinia(createPinia())
  document.body.innerHTML = ''
})

describe('ImageSection', () => {
  it('commits one history entry with the new image when a picture is picked', async () => {
    const { wrapper, ctx } = mountSection()
    await wrapper.find('button[aria-label="Replace image"]').trigger('click')
    const picker = wrapper.findComponent(ImagePickerDialog)
    expect(picker.props('open')).toBe(true)
    picker.vm.$emit('pick', '/app_data/images/new.png')
    await flushPromises()
    expect(ctx.commit).toHaveBeenCalledTimes(1)
    expect(el(committed(ctx)).data).toBe('/app_data/images/new.png')
    expect(el(committed(ctx)).focus_x).toBe(50)
    expect(el(committed(ctx)).focus_y).toBe(50)
    expect((ctx.commit as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toBe('Replace image')
  })

  it('Contain commits a contain fit and Cover a cover fit', async () => {
    const { wrapper, ctx } = mountSection()
    expect(wrapper.find('button[aria-label="Contain"]').attributes('aria-pressed')).toBe('true')
    await wrapper.find('button[aria-label="Cover"]').trigger('click')
    expect(el(committed(ctx)).fit).toBe('cover')
    await wrapper.find('button[aria-label="Contain"]').trigger('click')
    expect(ctx.commit).toHaveBeenCalledTimes(2)
    expect(el(committed(ctx, 1)).fit).toBe('contain')
  })

  it('commits a crop focus from the 3x3 grid', async () => {
    const { wrapper, ctx } = mountSection(sel)
    await wrapper.find('button[aria-label="Crop focus"]').trigger('click')
    const cell = document.body.querySelector('button[aria-label="Focus top left"]') as HTMLElement
    cell.click()
    await flushPromises()
    expect(el(committed(ctx)).focus_x).toBe(0)
    expect(el(committed(ctx)).focus_y).toBe(0)
  })

  it('a fill image shows neither Cover nor Contain pressed, and Contain commits contain', async () => {
    const { wrapper, ctx } = mountSection(sel, { fit: 'fill' })
    expect(wrapper.find('button[aria-label="Contain"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.find('button[aria-label="Cover"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.text()).toContain('Fill')
    await wrapper.find('button[aria-label="Contain"]').trigger('click')
    expect(ctx.commit).toHaveBeenCalledTimes(1)
    expect(el(committed(ctx)).fit).toBe('contain')
  })

  it('hides Replace for an icon image', () => {
    expect(mountSection(sel, { isIcon: true, color: '#ff0000' }).wrapper.find('button[aria-label="Replace image"]').exists()).toBe(false)
    expect(mountSection(sel, { is_icon: true }).wrapper.find('button[aria-label="Replace image"]').exists()).toBe(false)
    expect(mountSection(sel, { isIcon: true }).wrapper.find('button[aria-label="Contain"]').exists()).toBe(true)
  })
})
