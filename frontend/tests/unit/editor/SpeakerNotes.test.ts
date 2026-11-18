import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import SpeakerNotes from '@/components/editor/SpeakerNotes.vue'
import { FOOTER_DEFAULT_HEIGHT, FOOTER_MIN_HEIGHT } from '@/components/editor/footerHeight'
import { presentationKeys } from '@/api/presentations'
import { useEditorStore } from '@/stores/editor'

const m = vi.hoisted(() => ({ updateSpeakerNotes: vi.fn(), generateSpeakerNotes: vi.fn(), voiceMounts: { count: 0 } }))
vi.mock('@/api/speakerNotes', () => ({ updateSpeakerNotes: m.updateSpeakerNotes, generateSpeakerNotes: m.generateSpeakerNotes }))
vi.mock('@/components/editor/inspector/VoiceTab.vue', () => ({
  default: {
    name: 'VoiceTabStub',
    template: '<div data-testid="voice-stub" />',
    mounted() {
      m.voiceMounts.count++
    },
  },
}))
// The card (the footer's parent) has no layout in jsdom: its height is whatever the test says.
const card = vi.hoisted(() => ({ height: { value: 0 } as { value: number } }))
vi.mock('@vueuse/core', async (orig) => {
  const { ref: vref } = await import('vue')
  const height = vref(500)
  card.height = height
  return { ...(await orig<typeof import('@vueuse/core')>()), useElementSize: () => ({ width: vref(800), height }) }
})

const slide = { id: 'a', index: 0, presentation: 'p1', speaker_note: 'one' }
const presentation = { id: 'p1', slides: [slide] }

let qc: QueryClient
let wrapper: VueWrapper
let editor: ReturnType<typeof useEditorStore>

beforeEach(() => {
  setActivePinia(createPinia())
  editor = useEditorStore()
  qc = new QueryClient()
  qc.setQueryData(presentationKeys.one('p1'), presentation)
  m.updateSpeakerNotes.mockReset().mockResolvedValue({})
  m.voiceMounts.count = 0
  card.height.value = 500
  wrapper?.unmount()
})

function mountFooter() {
  wrapper = mount(SpeakerNotes, {
    props: { presentationId: 'p1', presentation: presentation as never, slide: slide as never },
    global: { plugins: [[VueQueryPlugin, { queryClient: qc }]] },
    attachTo: document.body,
  })
  return wrapper
}
const tab = (w: VueWrapper, name: string) => w.get(`[role="tab"][id="footer-tab-${name.toLowerCase()}"]`)
const panel = (w: VueWrapper) => w.get('#footer-panel')
// jsdom has no `inert` DOM property, so Vue falls back to an attribute and writes inert="false" for a live panel.
const isInert = (w: VueWrapper) => {
  const v = panel(w).attributes('inert')
  return v !== undefined && v !== 'false'
}
const bodyHeight = (w: VueWrapper) => (w.get('.footer-body').element as HTMLElement).style.height
/** jsdom has no PointerEvent: a MouseEvent with the same coordinates drives the handlers. */
async function fire(w: { element: Element }, type: string, clientY: number) {
  w.element.dispatchEvent(new MouseEvent(type, { clientX: 0, clientY, bubbles: true }))
  await nextTick()
}
async function key(w: VueWrapper | ReturnType<VueWrapper['get']>, k: string) {
  await w.trigger('keydown', { key: k })
}

describe('SpeakerNotes footer', () => {
  it('starts collapsed on Notes; clicking a tab opens the bar on it', async () => {
    const w = mountFooter()
    expect(editor.footerOpen).toBe(false)
    expect(editor.footerTab).toBe('notes')
    expect(w.find('[data-testid="voice-stub"]').exists()).toBe(false)
    expect(w.get('[role="tablist"]').attributes('aria-label')).toBe('Notes and voice')
    expect(tab(w, 'Voice').attributes('aria-controls')).toBe('footer-panel')

    await tab(w, 'Voice').trigger('click')
    expect(editor.footerOpen).toBe(true)
    expect(editor.footerTab).toBe('voice')
    expect(w.find('[data-testid="voice-stub"]').exists()).toBe(true)
    expect(tab(w, 'Voice').attributes('aria-selected')).toBe('true')
    expect(tab(w, 'Notes').attributes('aria-selected')).toBe('false')
    expect(panel(w).attributes('role')).toBe('tabpanel')
  })

  it('clicking the active tab, or the chevron, collapses it', async () => {
    const w = mountFooter()
    await tab(w, 'Notes').trigger('click')
    expect(editor.footerOpen).toBe(true)
    expect(isInert(w)).toBe(false)
    expect(bodyHeight(w)).toBe(`${FOOTER_DEFAULT_HEIGHT}px`)
    const chevron = w.get('button[aria-controls="footer-panel"][aria-expanded]')
    expect(chevron.attributes('aria-label')).toBe('Collapse')
    expect(chevron.attributes('aria-expanded')).toBe('true')

    await tab(w, 'Notes').trigger('click')
    expect(editor.footerOpen).toBe(false)
    expect(isInert(w)).toBe(true)
    expect(bodyHeight(w)).toBe('0px')
    expect(chevron.attributes('aria-label')).toBe('Expand')

    await chevron.trigger('click')
    expect(editor.footerOpen).toBe(true)
    await chevron.trigger('click')
    expect(editor.footerOpen).toBe(false)
    expect(bodyHeight(w)).toBe('0px')
    // The raw height survives a collapse.
    expect(editor.footerHeight).toBe(FOOTER_DEFAULT_HEIGHT)
  })

  it('Left/Right arrow keys move between tabs', async () => {
    const w = mountFooter()
    editor.openFooter('notes')
    await nextTick()
    await key(tab(w, 'Notes'), 'ArrowRight')
    expect(editor.footerTab).toBe('voice')
    expect(tab(w, 'Voice').attributes('aria-selected')).toBe('true')
    expect(tab(w, 'Voice').attributes('tabindex')).toBe('0')
    expect(tab(w, 'Notes').attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(tab(w, 'Voice').element)
    await key(tab(w, 'Voice'), 'ArrowRight') // wraps
    expect(editor.footerTab).toBe('notes')
    await key(tab(w, 'Notes'), 'ArrowLeft') // wraps back
    expect(editor.footerTab).toBe('voice')
  })

  it('keeps Voice mounted after switching to Notes', async () => {
    const w = mountFooter()
    expect(m.voiceMounts.count).toBe(0)
    await tab(w, 'Notes').trigger('click')
    expect(m.voiceMounts.count).toBe(0) // Notes alone never mounts Voice
    await tab(w, 'Voice').trigger('click')
    expect(m.voiceMounts.count).toBe(1)
    await tab(w, 'Notes').trigger('click')
    expect(w.find('[data-testid="voice-stub"]').exists()).toBe(true)
    expect((w.get('[data-testid="voice-stub"]').element as HTMLElement).closest('[data-footer-pane="voice"]')?.getAttribute('style')).toContain('display: none')
    await tab(w, 'Voice').trigger('click')
    expect(m.voiceMounts.count).toBe(1)
  })

  it('saves a pending note when switching to Voice', async () => {
    const w = mountFooter()
    await tab(w, 'Notes').trigger('click')
    await w.get('textarea').setValue('one, edited')
    expect(m.updateSpeakerNotes).not.toHaveBeenCalled() // still inside the debounce
    await tab(w, 'Voice').trigger('click')
    await flushPromises() // no timers advanced: leaving the tab unmounts NotesStrip, which flushes
    expect(w.find('textarea').exists()).toBe(false)
    expect(m.updateSpeakerNotes).toHaveBeenCalledWith('p1', [{ slide_index: 0, speaker_note: 'one, edited' }])
  })

  it('dragging the handle resizes the body, clamped to the card', async () => {
    card.height.value = 600 // max 360
    const w = mountFooter()
    await tab(w, 'Notes').trigger('click')
    const handle = w.get('[role="separator"]')
    expect(handle.attributes('aria-orientation')).toBe('horizontal')
    expect(handle.attributes('aria-label')).toBe('Resize notes and voice')
    expect(handle.attributes('tabindex')).toBe('0')
    expect(handle.attributes('style')).toContain('touch-action: none')

    await fire(handle, 'pointerdown', 400)
    await fire(handle, 'pointermove', 300)
    expect(editor.footerHeight).toBe(FOOTER_DEFAULT_HEIGHT + 100)
    expect(bodyHeight(w)).toBe('300px')
    await fire(handle, 'pointermove', -900)
    expect(editor.footerHeight).toBe(360)
    await fire(handle, 'pointermove', 5000)
    expect(editor.footerHeight).toBe(FOOTER_MIN_HEIGHT)
    await fire(handle, 'pointerup', 5000)
  })

  it('pointercancel ends the drag', async () => {
    const w = mountFooter()
    await tab(w, 'Notes').trigger('click')
    const handle = w.get('[role="separator"]')
    await fire(handle, 'pointerdown', 400)
    await fire(handle, 'pointermove', 380)
    expect(editor.footerHeight).toBe(FOOTER_DEFAULT_HEIGHT + 20)
    await fire(handle, 'pointercancel', 380)
    await fire(handle, 'pointermove', 250)
    expect(editor.footerHeight).toBe(FOOTER_DEFAULT_HEIGHT + 20)
  })

  it('the rendered height follows a shrinking card', async () => {
    const w = mountFooter()
    editor.footerHeight = 400
    card.height.value = 700 // max 420
    await tab(w, 'Notes').trigger('click')
    expect(bodyHeight(w)).toBe('400px')
    card.height.value = 300 // max 180
    await nextTick()
    expect(bodyHeight(w)).toBe('180px')
    expect(editor.footerHeight).toBe(400)
    card.height.value = 700
    await nextTick()
    expect(bodyHeight(w)).toBe('400px')
  })

  it('separator keys: Up/Down by 16, Home/End to min/max, with aria-valuenow', async () => {
    card.height.value = 600 // max 360
    const w = mountFooter()
    expect(w.find('[role="separator"]').exists()).toBe(false) // only while open
    await tab(w, 'Notes').trigger('click')
    const handle = w.get('[role="separator"]')
    expect(handle.attributes('aria-valuenow')).toBe(String(FOOTER_DEFAULT_HEIGHT))
    expect(handle.attributes('aria-valuemin')).toBe(String(FOOTER_MIN_HEIGHT))
    expect(handle.attributes('aria-valuemax')).toBe('360')

    await key(handle, 'ArrowUp')
    expect(editor.footerHeight).toBe(FOOTER_DEFAULT_HEIGHT + 16)
    expect(handle.attributes('aria-valuenow')).toBe(String(FOOTER_DEFAULT_HEIGHT + 16))
    await key(handle, 'ArrowDown')
    await key(handle, 'ArrowDown')
    expect(editor.footerHeight).toBe(FOOTER_DEFAULT_HEIGHT - 16)
    await key(handle, 'End')
    expect(editor.footerHeight).toBe(360)
    expect(handle.attributes('aria-valuenow')).toBe('360')
    await key(handle, 'ArrowUp')
    expect(editor.footerHeight).toBe(360)
    await key(handle, 'Home')
    expect(editor.footerHeight).toBe(FOOTER_MIN_HEIGHT)
    await key(handle, 'ArrowDown')
    expect(editor.footerHeight).toBe(FOOTER_MIN_HEIGHT)
  })

  it('header action: openFooter("voice") while open on Notes switches to Voice', async () => {
    const w = mountFooter()
    await tab(w, 'Notes').trigger('click')
    expect(w.find('textarea').exists()).toBe(true)
    editor.openFooter('voice')
    await nextTick()
    expect(tab(w, 'Voice').attributes('aria-selected')).toBe('true')
    expect(w.find('[data-testid="voice-stub"]').exists()).toBe(true)
    expect(w.find('textarea').exists()).toBe(false)
    expect(editor.footerOpen).toBe(true)
  })
})

