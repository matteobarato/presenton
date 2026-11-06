import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createMemoryHistory, createRouter } from 'vue-router'
import AskOverlay from '@/components/editor/AskOverlay.vue'
import EditorCanvas from '@/components/editor/EditorCanvas.vue'
import FloatingToolbar from '@/components/editor/FloatingToolbar.vue'
import { presentationKeys } from '@/api/presentations'
import { useEditorStore } from '@/stores/editor'

const mocks = vi.hoisted(() => ({
  streamMessage: vi.fn(),
  listConversations: vi.fn(),
  getHistory: vi.fn(),
  deleteConversation: vi.fn(),
}))
vi.mock('@/api/chat', () => mocks)
const done = (response: string, tool_calls: string[] = ['updateSlide']) =>
  async function* () {
    yield { type: 'complete', chat: { conversation_id: 'c1', response, tool_calls } }
  }

const template = { id: 's1', index: 0, presentation: 'p1', layout: 'template-v2:a', layout_group: 'template-v2-x', ui: { components: [] } }
const smart = { id: 's2', index: 1, presentation: 'p1', layout: 'x', html_content: '<div>hi</div>' }
const deck = () => ({ id: 'p1', slides: [template, smart] })

let qc: QueryClient
beforeEach(() => {
  setActivePinia(createPinia())
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(presentationKeys.one('p1'), deck())
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.listConversations.mockResolvedValue([])
})

function mountOverlay(slide: object = template, open = true) {
  return mount(AskOverlay, {
    props: { open, slide: slide as never },
    global: { plugins: [[VueQueryPlugin, { queryClient: qc }]] },
    attachTo: document.body,
  })
}

describe('AskOverlay', () => {
  it('renders inside the canvas, absolutely positioned, leaving the canvas box alone', async () => {
    const canvas = mount(EditorCanvas, {
      props: { presentationId: 'p1', slide: template as never },
      global: { plugins: [createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<i/>' } }] }), [VueQueryPlugin, { queryClient: qc }]], stubs: { SlideView: true, FloatingToolbar: true } },
      attachTo: document.body,
    })
    const section = canvas.find('section[aria-label="Slide canvas"]')
    expect(canvas.find('[role=dialog]').exists()).toBe(false)
    useEditorStore().askOpen = true
    await flushPromises()
    const dialog = canvas.find('[role=dialog]')
    expect(section.element.contains(dialog.element)).toBe(true)
    expect(dialog.classes()).toContain('absolute')
    expect(dialog.classes()).not.toContain('fixed')
    expect(document.activeElement).toBe(dialog.find('textarea').element)
    expect(section.element.firstElementChild!.className).toContain('absolute')
    canvas.unmount()
  })

  it('focuses the input when open', async () => {
    const w = mountOverlay()
    await flushPromises()
    expect(document.activeElement).toBe(w.find('textarea').element)
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

  it('sends the prompt through chat with the slide context, shows the sanitized reply and emits edited', async () => {
    mocks.streamMessage.mockImplementation(done('Made it **shorter** <img src=x onerror=alert(1)>'))
    const w = mountOverlay()
    await w.find('textarea').setValue('Shorter')
    await w.find('form').trigger('submit')
    await flushPromises()
    const req = mocks.streamMessage.mock.calls[0]![0]
    expect(req.presentation_id).toBe('p1')
    expect(req.message).toContain('zero-based index 0')
    expect(req.message).toContain('Shorter')
    expect(w.find('[data-testid=ask-reply] strong').text()).toBe('shorter')
    expect(w.find('[data-testid=ask-reply] img').exists()).toBe(false)
    expect(w.emitted('edited')).toHaveLength(1)
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('')
    w.unmount()
  })

  it('keeps the reply when the slide is re-ided at the same position, and clears it on navigation', async () => {
    mocks.streamMessage.mockImplementation(done('Shortened it'))
    const w = mountOverlay()
    await w.find('textarea').setValue('Shorter')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.find('[data-testid=ask-reply]').exists()).toBe(true)
    await w.setProps({ slide: { ...template, id: 's1-new' } as never })
    expect(w.find('[data-testid=ask-reply]').text()).toContain('Shortened it')
    await w.setProps({ slide: { ...template, id: 's9', index: 3 } as never })
    expect(w.find('[data-testid=ask-reply]').exists()).toBe(false)
    w.unmount()
  })

  it('shows one thinking indicator and the status line, with a readonly input, while pending', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    mocks.streamMessage.mockImplementation(async function* () {
      yield { type: 'status', status: 'Rewriting the slide' }
      await gate
      yield { type: 'complete', chat: { conversation_id: 'c1', response: 'ok', tool_calls: [] } }
    })
    const w = mountOverlay()
    await w.find('textarea').setValue('Go')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.findAll('[data-testid=thinking]')).toHaveLength(1)
    expect(w.find('[data-testid=ask-status]').text()).toBe('Rewriting the slide')
    expect(w.find('textarea').attributes('readonly')).toBeDefined()
    expect(w.find('textarea').attributes('disabled')).toBeUndefined()
    expect(w.find('button[type=submit]').attributes('disabled')).toBeDefined()
    release()
    await flushPromises()
    expect(w.findAll('[data-testid=thinking]')).toHaveLength(0)
    w.unmount()
  })

  it('keeps the prompt, shows the error inline and refocuses the input on failure', async () => {
    mocks.streamMessage.mockImplementation(async function* () {
      yield { type: 'error', detail: 'Model unavailable' }
    })
    const w = mountOverlay()
    await w.find('textarea').setValue('Shorter')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('Shorter')
    expect(w.find('[role=alert]').text()).toBe('Model unavailable')
    expect(w.emitted('edited')).toBeUndefined()
    expect(document.activeElement).toBe(w.find('textarea').element)
    w.unmount()
  })

  it('allows blank slides', async () => {
    mocks.streamMessage.mockImplementation(done('ok', []))
    const w = mountOverlay({ id: 's3', index: 2, presentation: 'p1', layout: 'blank' })
    await w.find('textarea').setValue('Add a title')
    expect(w.find('button[type=submit]').attributes('disabled')).toBeUndefined()
    w.unmount()
  })

  it('never calls the endpoint for a smart slide', async () => {
    const w = mountOverlay(smart)
    await w.find('textarea').setValue('Shorter')
    expect(w.find('button[type=submit]').attributes('disabled')).toBeDefined()
    await w.find('form').trigger('submit')
    expect(mocks.streamMessage).not.toHaveBeenCalled()
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
