import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, defineComponent, h, provide, ref, shallowRef } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { RawUi, Selection } from '@/slide-editor/model'
import { SLIDE_EDITING_KEY, type SlideEditing } from '@/slide-editor/useSlideEditing'
import ListSection from '@/components/editor/inspector/element/ListSection.vue'
import { uiWithText } from '../../slide-editor/fixtures'

vi.mock('@/composables/useSlideMutations', () => ({ useSlideMutations: () => ({ editSlideUi: vi.fn().mockResolvedValue(true) }) }))
let wrapper: VueWrapper | null = null
beforeEach(() => setActivePinia(createPinia()))
afterEach(() => wrapper?.unmount())

describe('ListSection', () => {
  it('Number commits marker number, labelled List marker', async () => {
    const ui = uiWithText()
    ;(ui.components as Array<{ elements: Array<Record<string, unknown>> }>)[0]!.elements[0]!.type = 'text-list'
    const ctx = {
      enabled: computed(() => true),
      ui: computed(() => ui),
      selection: ref<Selection>({ kind: 'component', componentIndex: 0 }),
      inlineEdit: shallowRef(null),
      commit: vi.fn().mockResolvedValue(true),
      select: vi.fn(),
    } as unknown as SlideEditing
    wrapper = mount(defineComponent({ setup() { provide(SLIDE_EDITING_KEY, ctx); return () => h(ListSection) } }))
    expect(wrapper.get('button[aria-label="Bullet"]').attributes('aria-pressed')).toBe('true')
    await wrapper.get('button[aria-label="Number"]').trigger('click')
    await flushPromises()
    const [next, label] = (ctx.commit as ReturnType<typeof vi.fn>).mock.calls[0]! as [RawUi, string]
    expect(label).toBe('List marker')
    expect((next.components as Array<{ elements: Array<{ marker: string }> }>)[0]!.elements[0]!.marker).toBe('number')
  })
})
