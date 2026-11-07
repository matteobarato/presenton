import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, defineComponent, h, provide, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import type { RawUi, Selection } from '@/slide-editor/model'
import { SLIDE_EDITING_KEY, type SlideEditing } from '@/slide-editor/useSlideEditing'
import FloatingToolbar from '@/components/editor/FloatingToolbar.vue'
import { uiTwoComponents } from '../../slide-editor/fixtures'

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'p1' } }) }))
vi.mock('@/api/presentations', () => ({ usePresentation: () => ({ data: ref({ slides: [] }) }) }))
vi.mock('@/composables/useEditorFetchGate', () => ({ useEditorFetchGate: () => ref(true) }))
vi.mock('@/composables/useUndoRedo', () => ({
  useUndoRedo: () => ({
    history: { canUndo: true, canRedo: false, undoLabel: '', redoLabel: '' },
    undo: vi.fn(),
    redo: vi.fn(),
  }),
}))

beforeEach(() => setActivePinia(createPinia()))

describe('FloatingToolbar', () => {
  it('always shows the slide tools, even with a selection', () => {
    const ctx = {
      enabled: computed(() => true),
      ui: computed(() => uiTwoComponents() as RawUi),
      selection: ref<Selection>({ kind: 'component', componentIndex: 0 }),
      inlineEdit: shallowRef(null),
    } as unknown as SlideEditing
    const w = mount(
      defineComponent({
        setup() {
          provide(SLIDE_EDITING_KEY, ctx)
          return () => h(FloatingToolbar)
        },
      }),
    )
    expect(w.find('button[aria-label="Undo"]').exists()).toBe(true)
    expect(w.find('[aria-label="Selection tools"]').exists()).toBe(false)
  })
})
