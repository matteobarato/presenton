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

describe('editor store inspector', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('openAvatar selects the Avatar tab and opens a closed inspector', () => {
    const editor = useEditorStore()
    editor.inspectorOpen = false
    editor.openAvatar()
    expect(editor.inspectorTab).toBe('avatar')
    expect(editor.inspectorOpen).toBe(true)
  })
})

describe('editor store motion', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('accepts the motion tabs', () => {
    const editor = useEditorStore()
    editor.openFooter('motion')
    editor.inspectorTab = 'motion'
    expect(editor.footerTab).toBe('motion')
    expect(editor.inspectorTab).toBe('motion')
  })

  it('resets motionTarget and motionTime when the active slide changes', () => {
    const editor = useEditorStore()
    editor.select('a')
    editor.motionTarget = 'e2'
    editor.motionTime = 1.4
    editor.select('b')
    expect(editor.motionTarget).toBeNull()
    expect(editor.motionTime).toBeNull()
  })

  it('reset clears the motion state', () => {
    const editor = useEditorStore()
    editor.motionTarget = 'e1'
    editor.motionTime = 0.5
    editor.reset()
    expect(editor.motionTarget).toBeNull()
    expect(editor.motionTime).toBeNull()
  })
})
