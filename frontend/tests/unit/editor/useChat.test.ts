import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import type { StreamEvent } from '@/api/sse'
import { queryClient } from '@/api/query'
import { useChat } from '@/composables/useChat'

const mocks = vi.hoisted(() => ({
  streamMessage: vi.fn(),
  listConversations: vi.fn(),
  getHistory: vi.fn(),
  deleteConversation: vi.fn(),
}))
vi.mock('@/api/chat', () => mocks)

function controlled() {
  const queue: StreamEvent[] = []
  let wake: (() => void) | null = null
  let ended = false
  async function* gen(signal?: AbortSignal): AsyncGenerator<StreamEvent> {
    for (;;) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
      if (queue.length) yield queue.shift()!
      else if (ended) return
      else {
        await new Promise<void>((r) => {
          wake = r
          signal?.addEventListener('abort', () => r(), { once: true })
        })
      }
    }
  }
  return {
    gen,
    push(e: StreamEvent) {
      queue.push(e)
      wake?.()
    },
    end() {
      ended = true
      wake?.()
    },
  }
}

function setup() {
  return effectScope().run(() => useChat(ref('p1')))!
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.listConversations.mockResolvedValue([])
})

describe('useChat', () => {
  it('builds one assistant message from streamed chunks, status and trace', async () => {
    const src = controlled()
    mocks.streamMessage.mockImplementation((_b, signal) => src.gen(signal))
    const chat = setup()
    const sent = chat.send('hi')
    await flushPromises()
    expect(chat.sending.value).toBe(true)
    src.push({ type: 'status', status: 'Thinking' })
    src.push({ type: 'trace', trace: { tool: 'updateSlide', status: 'start', round: 1 } })
    src.push({ type: 'trace', trace: { tool: 'updateSlide', status: 'success', round: 1 } })
    src.push({ type: 'chunk', chunk: 'Hel' })
    src.push({ type: 'chunk', chunk: 'lo' })
    await flushPromises()
    expect(chat.status.value).toBe('Thinking')
    expect(chat.activity.value).toHaveLength(1)
    expect(chat.activity.value[0].state).toBe('success')
    expect(chat.messages.value.filter((m) => m.role === 'assistant')).toHaveLength(1)
    expect(chat.messages.value.at(-1)!.content).toBe('Hello')
    src.push({ type: 'complete', chat: { conversation_id: 'c1', response: 'Hello', tool_calls: [] } })
    src.end()
    await sent
    expect(chat.messages.value.map((m) => [m.role, m.content])).toEqual([
      ['user', 'hi'],
      ['assistant', 'Hello'],
    ])
    expect(chat.conversationId.value).toBe('c1')
    expect(chat.sending.value).toBe(false)
  })

  it('stop() aborts and keeps the partial text marked stopped', async () => {
    const src = controlled()
    mocks.streamMessage.mockImplementation((_b, signal) => src.gen(signal))
    const chat = setup()
    const sent = chat.send('hi')
    await flushPromises()
    src.push({ type: 'chunk', chunk: 'Par' })
    await flushPromises()
    chat.stop()
    await sent
    expect(chat.messages.value.at(-1)).toMatchObject({ role: 'assistant', content: 'Par', stopped: true })
    expect(chat.sending.value).toBe(false)
  })

  it('shows an error event detail and re-enables input', async () => {
    mocks.streamMessage.mockImplementation(async function* () {
      yield { type: 'error', detail: 'Model unavailable' } as StreamEvent
    })
    const chat = setup()
    await chat.send('hi')
    expect(chat.messages.value.at(-1)).toMatchObject({ role: 'error', content: 'Model unavailable' })
    expect(chat.sending.value).toBe(false)
  })

  it('invalidates the presentation query only when the turn changed slides', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
    mocks.streamMessage.mockImplementation(async function* () {
      yield { type: 'complete', chat: { conversation_id: 'c1', response: 'Done', tool_calls: ['updateSlide'] } } as StreamEvent
    })
    const chat = setup()
    await chat.send('edit')
    expect(spy).toHaveBeenCalledWith({ queryKey: ['presentation', 'p1'] })
    spy.mockClear()
    mocks.streamMessage.mockImplementation(async function* () {
      yield { type: 'complete', chat: { conversation_id: 'c1', response: 'Seen', tool_calls: ['getSlideAtIndex'] } } as StreamEvent
    })
    await chat.send('look')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('loads the most recent conversation history', async () => {
    mocks.listConversations.mockResolvedValue([
      { conversation_id: 'old', updated_at: '2026-01-01T00:00:00Z' },
      { conversation_id: 'new', updated_at: '2026-02-01T00:00:00Z' },
    ])
    mocks.getHistory.mockResolvedValue({ messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }] })
    const chat = setup()
    await chat.loadHistory()
    expect(mocks.getHistory).toHaveBeenCalledWith('p1', 'new')
    expect(chat.messages.value.map((m) => m.content)).toEqual(['q', 'a'])
    expect(chat.conversationId.value).toBe('new')
  })

  it('prefixes the request with slide context but shows only the typed text', async () => {
    mocks.streamMessage.mockImplementation(async function* () {})
    const chat = setup()
    await chat.send('make it shorter', { slideIndex: 2 })
    const body = mocks.streamMessage.mock.calls[0][0]
    expect(body.message).toBe(
      'UI context: the currently selected slide is slide 3 (zero-based index 2).\n\nmake it shorter',
    )
    expect(chat.messages.value[0]).toMatchObject({ role: 'user', content: 'make it shorter' })
  })

  it('trims user text, not the context, to the 8000 character cap', async () => {
    mocks.streamMessage.mockImplementation(async function* () {})
    const chat = setup()
    await chat.send('x'.repeat(9000), { slideIndex: 0 })
    const msg = mocks.streamMessage.mock.calls[0][0].message as string
    expect(msg.length).toBe(8000)
    expect(msg.startsWith('UI context: the currently selected slide is slide 1')).toBe(true)
  })

  it('strips the context prefix from loaded history', async () => {
    mocks.listConversations.mockResolvedValue([{ conversation_id: 'c', updated_at: '2026-01-01T00:00:00Z' }])
    mocks.getHistory.mockResolvedValue({
      messages: [{ role: 'user', content: 'UI context: the currently selected slide is slide 1 (zero-based index 0).\n\nhi' }],
    })
    const chat = setup()
    await chat.loadHistory()
    expect(chat.messages.value[0].content).toBe('hi')
  })

  it('invalidates after an error when a mutating tool already succeeded', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
    mocks.streamMessage.mockImplementation(async function* () {
      yield { type: 'trace', trace: { tool: 'updateSlide', status: 'success' } } as StreamEvent
      yield { type: 'error', detail: 'boom' } as StreamEvent
    })
    const chat = setup()
    await chat.send('edit')
    expect(spy).toHaveBeenCalledWith({ queryKey: ['presentation', 'p1'] })
    spy.mockRestore()
  })

  it('leaves typed text that merely starts with "UI context:" unchanged in history', async () => {
    mocks.listConversations.mockResolvedValue([{ conversation_id: 'c', updated_at: '2026-01-01T00:00:00Z' }])
    mocks.getHistory.mockResolvedValue({
      messages: [{ role: 'user', content: 'UI context: my notes\n\nplease shorten' }],
    })
    const chat = setup()
    await chat.loadHistory()
    expect(chat.messages.value[0].content).toBe('UI context: my notes\n\nplease shorten')
  })
})
