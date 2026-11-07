import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

const undo = vi.hoisted(() => vi.fn())
const redo = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'p1' } }) }))
vi.mock('@/composables/useUndoRedo', () => ({ useUndoRedo: () => ({ undo, redo }) }))

import { useEditorShortcuts } from '@/composables/useEditorShortcuts'

let wrapper: VueWrapper | null = null

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
}

beforeEach(() => {
  setActivePinia(createPinia())
  undo.mockReset()
  redo.mockReset()
  wrapper = mount(defineComponent({ setup: () => (useEditorShortcuts(), () => h('div')) }), { attachTo: document.body })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('useEditorShortcuts undo', () => {
  it('Ctrl+Z undoes from the page', () => {
    press(document.body, 'z', { ctrlKey: true })
    expect(undo).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+Z inside a contenteditable stays with the editor', () => {
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    const span = document.createElement('span')
    editable.append(span)
    document.body.append(editable)
    press(editable, 'z', { ctrlKey: true })
    press(span, 'z', { ctrlKey: true, shiftKey: true })
    expect(undo).not.toHaveBeenCalled()
    expect(redo).not.toHaveBeenCalled()
  })
})
