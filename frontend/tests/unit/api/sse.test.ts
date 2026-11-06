import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSse, streamEvents } from '@/api/sse'
import { ApiError } from '@/api/errors'

const enc = new TextEncoder()
function stream(chunks: string[], keepOpen = false) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch))
      if (!keepOpen) c.close()
    },
  })
}
async function collect<T>(g: AsyncGenerator<T>) {
  const out: T[] = []
  for await (const v of g) out.push(v)
  return out
}

describe('readSse', () => {
  it('parses event/data frames', async () => {
    const out = await collect(readSse(stream(['event: response\ndata: {"a":1}\n\nevent: x\ndata: y\n\n'])))
    expect(out).toEqual([
      { event: 'response', data: '{"a":1}' },
      { event: 'x', data: 'y' },
    ])
  })
  it('frame split across chunks', async () => {
    const out = await collect(readSse(stream(['event: resp', 'onse\ndata: {"type":"status","status":"a"}\n\n'])))
    expect(out).toEqual([{ event: 'response', data: '{"type":"status","status":"a"}' }])
  })
  it('joins multi-line data with newline', async () => {
    const out = await collect(readSse(stream(['event: response\ndata: one\ndata: two\n\n'])))
    expect(out[0].data).toBe('one\ntwo')
  })
  it('handles CRLF', async () => {
    const out = await collect(readSse(stream(['event: response\r\ndata: z\r\n\r\n'])))
    expect(out).toEqual([{ event: 'response', data: 'z' }])
  })
})

describe('streamEvents', () => {
  afterEach(() => vi.unstubAllGlobals())
  const respond = (body: ReadableStream<Uint8Array>, status = 200) =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status })))

  it('yields only response events, parsed', async () => {
    respond(
      stream([
        'event: ping\ndata: {"type":"ignored"}\n\n',
        'event: response\ndata: {"type":"status","status":"go"}\n\n',
        'event: response\ndata: not-json\n\n',
        'event: response\ndata: {"type":"complete","presentation":{"id":"1"}}\n\n',
      ]),
    )
    const out = await collect(streamEvents('/api/stream', { method: 'POST' }))
    expect(out).toEqual([
      { type: 'status', status: 'go' },
      { type: 'complete', presentation: { id: '1' } },
    ])
  })

  it('non-ok response throws ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ detail: 'bad' }), { status: 400 })))
    await expect(collect(streamEvents('/api/stream'))).rejects.toMatchObject({ status: 400, message: 'bad' })
    await expect(collect(streamEvents('/api/stream'))).rejects.toBeInstanceOf(ApiError)
  })

  it('abort stops iteration', async () => {
    respond(stream(['event: response\ndata: {"type":"status","status":"a"}\n\n'], true))
    const ctrl = new AbortController()
    const seen: unknown[] = []
    for await (const ev of streamEvents('/api/stream', { signal: ctrl.signal })) {
      seen.push(ev)
      ctrl.abort()
    }
    expect(seen).toHaveLength(1)
  })
})
