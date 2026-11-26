import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importPresentation } from '@/api/presentationImport'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('presentation import api', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('posts the body as JSON and resolves to the parsed deck', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'p1', source: 'pptx_import', source_name: 'deck.pptx', slides: [] }, 201))
    const deck = await importPresentation({ pptx_url: '/app_data/uploads/deck.pptx', language: 'English', source_name: 'deck.pptx' })
    expect(deck.id).toBe('p1')
    expect(deck.source_name).toBe('deck.pptx')
    const req = fetchMock.mock.calls[0][0] as Request
    expect(req.method).toBe('POST')
    expect(new URL(req.url).pathname).toBe('/api/v1/ppt/presentation/import')
    expect(await req.clone().json()).toEqual({
      pptx_url: '/app_data/uploads/deck.pptx',
      language: 'English',
      source_name: 'deck.pptx',
    })
  })
})
