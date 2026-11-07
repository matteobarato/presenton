import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import FloatingToolbar from '@/components/editor/FloatingToolbar.vue'
import { useEditorStore } from '@/stores/editor'

const mocks = vi.hoisted(() => ({ slide: { current: null as unknown } }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'p1' } }) }))
vi.mock('@/composables/useEditorFetchGate', () => ({ useEditorFetchGate: () => ({}) }))
vi.mock('@/api/presentations', () => ({
  usePresentation: () => ({ data: ref({ slides: [mocks.slide.current] }) }),
}))

const template = { id: 's1', index: 0, content: {}, layout: 'template-v2:x' }
const smart = { id: 's1', index: 0, html_content: '<div>x</div>' }

let editor: ReturnType<typeof useEditorStore>
function mountToolbar(slide: unknown) {
  mocks.slide.current = slide
  setActivePinia(createPinia())
  editor = useEditorStore()
  editor.activeSlideId = 's1'
  return mount(FloatingToolbar)
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  }))
})

describe('FloatingToolbar insert button', () => {
  it('opens the Insert tab', async () => {
    const w = mountToolbar(template)
    editor.inspectorOpen = false
    const b = w.find('button[aria-label="Insert"]')
    expect(b.attributes('title')).toBe('Insert (blocks, text, images, shapes)')
    await b.trigger('click')
    expect(editor.inspectorTab).toBe('insert')
    expect(editor.inspectorOpen).toBe(true)
  })

  it('is disabled on a smart slide', async () => {
    const w = mountToolbar(smart)
    const b = w.find('button[aria-label="Insert"]')
    expect(b.attributes('disabled')).toBeDefined()
    expect(b.attributes('title')).toBe('Insert is available for template slides')
  })

  it('is disabled with no active slide', async () => {
    const w = mountToolbar(template)
    editor.activeSlideId = null
    await w.vm.$nextTick()
    const b = w.find('button[aria-label="Insert"]')
    expect(b.attributes('disabled')).toBeDefined()
    expect(b.attributes('title')).toBe('Select a slide to insert into')
  })

  it('is disabled while locked', async () => {
    const w = mountToolbar(template)
    editor.generating = true
    await w.vm.$nextTick()
    const b = w.find('button[aria-label="Insert"]')
    expect(b.attributes('disabled')).toBeDefined()
    expect(b.attributes('title')).toBe('Insert is unavailable while the deck is busy')
  })
})
