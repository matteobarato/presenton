import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import type { StreamEvent } from '@/api/sse'
import { useOutlineStream } from '@/composables/useOutlineStream'

const mocks = vi.hoisted(() => ({
  streamEvents: vi.fn(),
  getOutline: vi.fn(),
}))
vi.mock('@/api/sse', () => ({ streamEvents: mocks.streamEvents }))
vi.mock('@/api/outlines', async (importActual) => ({
  ...(await importActual<typeof import('@/api/outlines')>()),
  getOutline: mocks.getOutline,
}))

/** An event source the test pushes into by hand. */
function controlled() {
  const queue: StreamEvent[] = []
  let wake: (() => void) | null = null
  let ended = false
  async function* gen(): AsyncGenerator<StreamEvent> {
    for (;;) {
      if (queue.length) yield queue.shift()!
      else if (ended) return
      else await new Promise<void>((r) => (wake = r))
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
  const scope = effectScope()
  return scope.run(() => useOutlineStream(ref('p1')))!
}

beforeEach(() => {
  mocks.streamEvents.mockReset()
  mocks.getOutline.mockReset().mockResolvedValue([])
})

describe('useOutlineStream', () => {
  it('grows items as chunks arrive and finishes on complete', async () => {
    const src = controlled()
    mocks.streamEvents.mockReturnValue(src.gen())
    const api = setup()
    await flushPromises()
    expect(api.streaming.value).toBe(true)

    src.push({ type: 'status', status: 'Thinking' })
    src.push({ type: 'chunk', chunk: '{"slides":[{"content":"One"},' })
    await flushPromises()
    expect(api.status.value).toBe('Thinking')
    expect(api.items.value.map((i) => i.content)).toEqual(['One'])

    src.push({ type: 'chunk', chunk: '{"content":"Two"}' })
    await flushPromises()
    expect(api.items.value.map((i) => i.content)).toEqual(['One', 'Two'])

    src.push({
      type: 'complete',
      presentation: {
        outlines: {
          slides: [{ content: 'One' }, { content: 'Two' }, { content: 'Three' }],
        },
      },
    })
    await flushPromises()
    expect(api.items.value).toHaveLength(3)
    expect(api.streaming.value).toBe(false)
    expect(api.error.value).toBeNull()
  })

  it('does not throw on a truncated chunk', async () => {
    const src = controlled()
    mocks.streamEvents.mockReturnValue(src.gen())
    const api = setup()
    src.push({ type: 'chunk', chunk: '{"sli' })
    src.push({ type: 'chunk', chunk: 'des":[{"content":"Hel' })
    await flushPromises()
    expect(api.error.value).toBeNull()
    expect(api.items.value.map((i) => i.content)).toEqual(['Hel'])
    src.end()
  })

  it('sets error and stops streaming on an error event', async () => {
    const src = controlled()
    mocks.streamEvents.mockReturnValue(src.gen())
    const api = setup()
    src.push({ type: 'error', detail: 'model exploded' })
    await flushPromises()
    expect(api.error.value).toBe('model exploded')
    expect(api.streaming.value).toBe(false)
  })

  it('uses an existing outline without streaming', async () => {
    mocks.getOutline.mockResolvedValue([{ content: 'Saved' }])
    const api = setup()
    await flushPromises()
    expect(api.items.value).toEqual([{ content: 'Saved' }])
    expect(api.streaming.value).toBe(false)
    expect(mocks.streamEvents).not.toHaveBeenCalled()
  })

  it('retries a lost connection', async () => {
    vi.useFakeTimers()
    try {
      const src = controlled()
      mocks.streamEvents
        .mockImplementationOnce(async function* () {
          throw new TypeError('lost')
        })
        .mockReturnValueOnce(src.gen())
      const api = setup()
      await vi.advanceTimersByTimeAsync(1_100)
      src.push({
        type: 'complete',
        presentation: { outlines: { slides: [{ content: 'A' }] } },
      })
      await vi.advanceTimersByTimeAsync(10)
      expect(mocks.streamEvents).toHaveBeenCalledTimes(2)
      expect(api.items.value).toEqual([{ content: 'A' }])
      expect(api.error.value).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('abort stops the stream', async () => {
    const src = controlled()
    mocks.streamEvents.mockReturnValue(src.gen())
    const api = setup()
    await flushPromises()
    api.abort()
    expect(api.streaming.value).toBe(false)
    src.end()
  })
})
