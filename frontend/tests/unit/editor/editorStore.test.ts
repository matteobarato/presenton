import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useEditorStore } from '@/stores/editor'

describe('editor store footer', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('starts closed on the notes tab at the default height', () => {
    const editor = useEditorStore()
    expect(editor.footerOpen).toBe(false)
    expect(editor.footerTab).toBe('notes')
    expect(editor.footerHeight).toBe(200)
  })

  it('openFooter selects the tab and opens the footer', () => {
    const editor = useEditorStore()
    editor.openFooter('voice')
    expect(editor.footerOpen).toBe(true)
    expect(editor.footerTab).toBe('voice')
  })

  it('openFooter keeps an open footer open', () => {
    const editor = useEditorStore()
    editor.openFooter('voice')
    editor.openFooter('notes')
    expect(editor.footerOpen).toBe(true)
    expect(editor.footerTab).toBe('notes')
  })
})
