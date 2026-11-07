import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { Slide } from '@/api/types'

const editSlideUi = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useSlideMutations', () => ({ useSlideMutations: () => ({ editSlideUi }) }))

import { SLIDE_EDITING_KEY, useSlideEditing, useSlideEditingContext, type SlideEditing } from '@/slide-editor/useSlideEditing'
import { useEditorStore } from '@/stores/editor'
import { uiTwoComponents, uiWithText } from './fixtures'

const tpl = (id: string, ui: unknown) => ({ id, index: 0, layout: 'template-v2-x:a', layout_group: 'template-v2-x', content: {}, ui }) as unknown as Slide

function setup(initial: Slide | null) {
  const slide = ref<Slide | null>(initial) as Ref<Slide | null>
  let api!: SlideEditing
  let injected: SlideEditing | undefined
  const Child = defineComponent({
    setup() {
      injected = useSlideEditingContext()
      return () => h('div')
    },
  })
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useSlideEditing(ref('p1'), slide)
        return () => h(Child)
      },
    }),
  )
  return { slide, api, injected: () => injected, wrapper }
}

beforeEach(() => {
  setActivePinia(createPinia())
  editSlideUi.mockReset()
  editSlideUi.mockResolvedValue(true)
})

describe('useSlideEditing', () => {
  it('provides itself to descendants and the context throws without a provider', () => {
    const { api, injected } = setup(tpl('a', uiWithText()))
    expect(injected()).toBe(api)
    expect(SLIDE_EDITING_KEY).toBeDefined()
    const Bare = defineComponent({ setup: () => (useSlideEditingContext(), () => h('div')) })
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => mount(Bare)).toThrow()
    spy.mockRestore()
  })

  it('is enabled for a template slide, not for smart or while busy', async () => {
    const { api, slide } = setup(tpl('a', uiWithText()))
    expect(api.enabled.value).toBe(true)
    useEditorStore().deckBusy = 1
    expect(api.enabled.value).toBe(false)
    useEditorStore().deckBusy = 0
    slide.value = { ...tpl('a', uiWithText()), html_content: '<div/>' } as Slide
    expect(api.enabled.value).toBe(false)
  })

  it('ui is draftUi ?? slide.ui', () => {
    const { api } = setup(tpl('a', uiWithText()))
    expect(api.ui.value).toEqual(uiWithText())
    api.draftUi.value = uiTwoComponents()
    expect(api.ui.value).toEqual(uiTwoComponents())
    api.cancelDraft()
    expect(api.ui.value).toEqual(uiWithText())
  })

  it('commit clears draftUi and calls editSlideUi', async () => {
    const { api } = setup(tpl('a', uiWithText()))
    const next = uiTwoComponents()
    api.draftUi.value = next
    expect(await api.commit(next, 'Move')).toBe(true)
    expect(api.draftUi.value).toBeNull()
    expect(editSlideUi).toHaveBeenCalledWith('a', next, 'Move')
  })

  it('drops a selection whose component no longer exists', async () => {
    const { api, slide } = setup(tpl('a', uiTwoComponents()))
    api.select({ kind: 'component', componentIndex: 1 })
    slide.value = tpl('a', uiWithText())
    await nextTick()
    expect(api.selection.value).toBeNull()
  })

  it('keeps a still-valid selection when ui changes', async () => {
    const { api, slide } = setup(tpl('a', uiTwoComponents()))
    api.select({ kind: 'component', componentIndex: 0 })
    slide.value = tpl('a', uiTwoComponents())
    await nextTick()
    expect(api.selection.value).toEqual({ kind: 'component', componentIndex: 0 })
  })

  it('external ui change drops inline edit', async () => {
    const { api, slide } = setup(tpl('a', uiWithText()))
    api.inlineEdit.value = { selection: { kind: 'element', componentIndex: 0, elementPath: [0] }, element: {} }
    slide.value = tpl('a', uiTwoComponents())
    await nextTick()
    expect(api.inlineEdit.value).toBeNull()
    expect(editSlideUi).not.toHaveBeenCalled()
  })

  it('changing slide id clears selection and draft', async () => {
    const { api, slide } = setup(tpl('a', uiWithText()))
    api.select({ kind: 'component', componentIndex: 0 })
    api.draftUi.value = uiTwoComponents()
    slide.value = tpl('b', uiWithText())
    await nextTick()
    expect(api.selection.value).toBeNull()
    expect(api.draftUi.value).toBeNull()
  })

  it('mirrors selection into editor.slideSelectionActive', async () => {
    const { api, wrapper } = setup(tpl('a', uiWithText()))
    const editor = useEditorStore()
    expect(editor.slideSelectionActive).toBe(false)
    api.select({ kind: 'component', componentIndex: 0 })
    await nextTick()
    expect(editor.slideSelectionActive).toBe(true)
    api.select(null)
    await nextTick()
    expect(editor.slideSelectionActive).toBe(false)
    api.select({ kind: 'component', componentIndex: 0 })
    await nextTick()
    wrapper.unmount()
    expect(editor.slideSelectionActive).toBe(false)
  })
})
