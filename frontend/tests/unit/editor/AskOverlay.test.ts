import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createMemoryHistory, createRouter } from 'vue-router'
import AskOverlay from '@/components/editor/AskOverlay.vue'
import FloatingToolbar from '@/components/editor/FloatingToolbar.vue'
import { presentationKeys } from '@/api/presentations'
import { useEditorStore } from '@/stores/editor'

const mocks = vi.hoisted(() => ({ editSlide: vi.fn() }))
vi.mock('@/api/slides', () => ({ editSlide: mocks.editSlide }))

const template = { id: 's1', index: 0, presentation: 'p1', layout: 'template-v2:a', layout_group: 'template-v2-x', ui: { components: [] } }
const smart = { id: 's2', index: 1, presentation: 'p1', layout: 'x', html_content: '<div>hi</div>' }
const deck = () => ({ id: 'p1', slides: [template, smart] })

let qc: QueryClient
beforeEach(() => {
  setActivePinia(createPinia())
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(presentationKeys.one('p1'), deck())
  mocks.editSlide.mockReset()
})

function mountOverlay(slide: object = template, open = true) {
  return mount(AskOverlay, {
    props: { open, slide: slide as never },
    global: { plugins: [[VueQueryPlugin, { queryClient: qc }]] },
    attachTo: document.body,
  })
}

describe('AskOverlay', () => {
  it('focuses the input when open and is out of flow (fixed) so the slide box is untouched', async () => {
    const w = mountOverlay()
    await flushPromises()
    expect(document.activeElement).toBe(w.find('textarea').element)
    expect(w.find('section').classes()).toContain('fixed')
    w.unmount()
  })

  it('Escape closes and returns focus to the Ask button', async () => {
    const button = document.createElement('button')
    button.setAttribute('data-ask-button', '')
    document.body.append(button)
    const w = mountOverlay()
    await w.find('section').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(w.emitted('update:open')![0]).toEqual([false])
    expect(document.activeElement).toBe(button)
    button.remove()
    w.unmount()
  })

  it('suggestion chips fill the input', async () => {
    const w = mountOverlay()
    const chips = w.findAll('button[type=button]')
    expect(chips).toHaveLength(3)
    await chips[1]!.trigger('click')
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe(chips[1]!.text())
    w.unmount()
  })

  it('edits a template slide, swaps the returned slide into the cache and emits edited', async () => {
    const edited = { ...template, id: 's1b', ui: { components: [1] } }
    mocks.editSlide.mockResolvedValue(edited)
    const editor = useEditorStore()
    editor.select('s1')
    const w = mountOverlay()
    await w.find('textarea').setValue('Shorter')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(mocks.editSlide).toHaveBeenCalledWith('s1', 'Shorter')
    const cached = qc.getQueryData<{ slides: { id: string }[] }>(presentationKeys.one('p1'))!
    expect(cached.slides.map((s) => s.id)).toEqual(['s1b', 's2'])
    expect(editor.activeSlideId).toBe('s1b')
    expect(w.emitted('edited')).toHaveLength(1)
    w.unmount()
  })

  it('shows one thinking indicator and disables submit while pending', async () => {
    let resolve!: (v: unknown) => void
    mocks.editSlide.mockReturnValue(new Promise((r) => (resolve = r)))
    const w = mountOverlay()
    await w.find('textarea').setValue('Go')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.findAll('[data-testid=thinking]')).toHaveLength(1)
    expect(w.find('button[type=submit]').attributes('disabled')).toBeDefined()
    resolve(template)
    await flushPromises()
    expect(w.findAll('[data-testid=thinking]')).toHaveLength(0)
    w.unmount()
  })

  it('keeps the prompt and shows the error inline on failure', async () => {
    mocks.editSlide.mockRejectedValue(new Error('Model unavailable'))
    const w = mountOverlay()
    await w.find('textarea').setValue('Shorter')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('Shorter')
    expect(w.find('[role=alert]').text()).toBe('Model unavailable')
    expect(w.emitted('edited')).toBeUndefined()
    w.unmount()
  })

  it('never calls the endpoint for a smart slide', async () => {
    const w = mountOverlay(smart)
    await w.find('textarea').setValue('Shorter')
    expect(w.find('button[type=submit]').attributes('disabled')).toBeDefined()
    await w.find('form').trigger('submit')
    expect(mocks.editSlide).not.toHaveBeenCalled()
    w.unmount()
  })

  it('does not submit while the deck is generating', async () => {
    const editor = useEditorStore()
    editor.generating = true
    const w = mountOverlay()
    await w.find('textarea').setValue('Shorter')
    expect(w.find('button[type=submit]').attributes('disabled')).toBeDefined()
    w.unmount()
  })
})

describe('FloatingToolbar Ask button', () => {
  async function mountToolbar(activeId: string) {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/p/:id', name: 'present', component: { template: '<i/>' } }] })
    await router.push('/p/p1')
    useEditorStore().select(activeId)
    return mount(FloatingToolbar, { global: { plugins: [router, [VueQueryPlugin, { queryClient: qc }]] } })
  }

  it('is disabled with a tooltip on a smart slide', async () => {
    const w = await mountToolbar('s2')
    const ask = w.find('[data-ask-button]')
    expect(ask.attributes('disabled')).toBeDefined()
    expect(ask.attributes('title')).toBe('AI edit is available for template slides')
  })

  it('is enabled on a template slide and disabled while generating', async () => {
    const w = await mountToolbar('s1')
    expect(w.find('[data-ask-button]').attributes('disabled')).toBeUndefined()
    useEditorStore().generating = true
    await flushPromises()
    expect(w.find('[data-ask-button]').attributes('disabled')).toBeDefined()
  })
})
