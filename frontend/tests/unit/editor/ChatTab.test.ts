import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { StreamEvent } from '@/api/sse'
import ChatTab from '@/components/editor/inspector/ChatTab.vue'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  streamMessage: vi.fn(),
  listConversations: vi.fn(),
  getHistory: vi.fn(),
  deleteConversation: vi.fn(),
}))
vi.mock('@/api/chat', () => mocks)

const props = { presentationId: 'p1', presentation: {} as never, activeSlide: null }
const existing = [{ conversation_id: 'c1', updated_at: '2026-01-01T00:00:00Z' }]

async function mountTab() {
  const w = mount(ChatTab, { props, attachTo: document.body })
  await flushPromises()
  return w
}

beforeEach(() => {
  setActivePinia(createPinia())
  document.body.innerHTML = ''
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.listConversations.mockResolvedValue([])
  mocks.streamMessage.mockImplementation(async function* () {
    yield { type: 'complete', chat: { conversation_id: 'c9', response: '**ok**', tool_calls: [] } } as StreamEvent
  })
})

describe('ChatTab', () => {
  it('loads history on mount and renders assistant markdown', async () => {
    mocks.listConversations.mockResolvedValue(existing)
    mocks.getHistory.mockResolvedValue({
      messages: [
        { role: 'user', content: 'earlier' },
        { role: 'assistant', content: 'reply **b**' },
      ],
    })
    const w = await mountTab()
    expect(w.text()).toContain('earlier')
    expect(w.find('strong').text()).toBe('b')
    w.unmount()
  })

  it('Enter sends and Shift+Enter does not', async () => {
    const w = await mountTab()
    const ta = w.find('textarea')
    await ta.setValue('hello')
    await ta.trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(mocks.streamMessage).not.toHaveBeenCalled()
    await ta.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(mocks.streamMessage).toHaveBeenCalledTimes(1)
    expect(mocks.streamMessage.mock.calls[0][0]).toMatchObject({ presentation_id: 'p1', message: 'hello' })
    expect(w.text()).toContain('ok')
    expect((ta.element as HTMLTextAreaElement).value).toBe('')
    w.unmount()
  })

  it('starts a new conversation from the menu', async () => {
    mocks.listConversations.mockResolvedValue(existing)
    mocks.getHistory.mockResolvedValue({ messages: [{ role: 'user', content: 'earlier' }] })
    const w = await mountTab()
    const trigger = w.find('button[aria-label="Conversations"]').element
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await flushPromises()
    const item = document.body.querySelector('[data-testid="new-conversation"]') as HTMLElement
    expect(item).toBeTruthy()
    item.click()
    await flushPromises()
    expect(w.text()).not.toContain('earlier')
    w.unmount()
  })

  it('deletes the conversation only after confirmation', async () => {
    mocks.listConversations.mockResolvedValue(existing)
    mocks.getHistory.mockResolvedValue({ messages: [{ role: 'user', content: 'earlier' }] })
    mocks.deleteConversation.mockResolvedValue(undefined)
    const w = await mountTab()
    await w.find('[data-testid="delete-conversation"]').trigger('click')
    await flushPromises()
    expect(mocks.deleteConversation).not.toHaveBeenCalled()
    ;(document.body.querySelector('[data-testid="confirm-delete"]') as HTMLElement).click()
    await flushPromises()
    expect(mocks.deleteConversation).toHaveBeenCalledWith('p1', 'c1')
    expect(w.text()).not.toContain('earlier')
    w.unmount()
  })

  it('sends the active slide index as context', async () => {
    const presentation = { slides: [{ id: 'a' }, { id: 'b' }] } as never
    const w = mount(ChatTab, { props: { ...props, presentation, activeSlide: { id: 'b' } as never }, attachTo: document.body })
    await flushPromises()
    await w.find('textarea').setValue('go')
    await w.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(mocks.streamMessage.mock.calls[0][0].message).toBe(
      'UI context: the currently selected slide is slide 2 (zero-based index 1).\n\ngo',
    )
    w.unmount()
  })
})
