import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, defineComponent, h, nextTick, provide, ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { RawUi, Selection } from '@/slide-editor/model'
import { SLIDE_EDITING_KEY, type SlideEditing } from '@/slide-editor/useSlideEditing'
import SelectionAnnouncer from '@/components/editor/canvas/SelectionAnnouncer.vue'
import { uiTwoComponents } from '../../slide-editor/fixtures'

function setup() {
  const selection = ref<Selection>(null)
  const ctx = { ui: computed(() => uiTwoComponents() as RawUi), selection } as unknown as SlideEditing
  const wrapper = mount(
    defineComponent({
      setup() {
        provide(SLIDE_EDITING_KEY, ctx)
        return () => h(SelectionAnnouncer)
      },
    }),
  )
  return { selection, region: () => wrapper.get('[aria-live="polite"]') }
}

beforeEach(() => setActivePinia(createPinia()))

describe('SelectionAnnouncer', () => {
  it('announces selections politely and says when the selection is cleared', async () => {
    const { selection, region } = setup()
    expect(region().text()).toBe('')
    expect(region().attributes('role')).toBe('status')
    selection.value = { kind: 'component', componentIndex: 0 }
    await nextTick()
    expect(region().text()).toBe('Selected: Text')
    selection.value = { kind: 'component', componentIndex: 1 }
    await nextTick()
    expect(region().text()).toBe('Selected: Image')
    selection.value = { kind: 'multi-component', componentIndexes: [0, 1] }
    await nextTick()
    expect(region().text()).toBe('2 items selected')
    selection.value = null
    await nextTick()
    expect(region().text()).toBe('Selection cleared')
  })
})
