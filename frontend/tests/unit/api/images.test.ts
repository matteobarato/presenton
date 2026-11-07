import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateImage, imageKeys, listGeneratedImages, listUploadedImages, searchStockImages, uploadImage } from '@/api/images'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

async function lastRequest() {
  const [a, b] = fetchMock.mock.calls.at(-1)!
  return a instanceof Request ? a : new Request(new URL(a, 'http://localhost:3000'), b)
}

describe('images api', () => {
  it('keys', () => {
    expect(imageKeys.uploaded).toEqual(['images', 'uploaded'])
    expect(imageKeys.generated).toEqual(['images', 'generated'])
  })

  it('uploadImage sends multipart with the file field', async () => {
    fetchMock.mockImplementation(async () => json({ id: 'i1', path: '/app_data/images/a.png', file_url: 'x' }))
    const file = new File(['abc'], 'a.png', { type: 'image/png' })
    const asset = await uploadImage(file)
    expect(asset).toMatchObject({ id: 'i1', path: '/app_data/images/a.png' })
    const [url, init] = fetchMock.mock.calls.at(-1)!
    expect(url).toBe('/api/v1/ppt/images/upload')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect(((init.body as FormData).get('file') as File).name).toBe('a.png')
  })

  it('lists uploaded and generated images', async () => {
    fetchMock.mockImplementation(async () => json([{ id: 'a', path: '/p' }]))
    expect(await listUploadedImages()).toEqual([{ id: 'a', path: '/p' }])
    expect(new URL((await lastRequest()).url).pathname).toBe('/api/v1/ppt/images/uploaded')
    await listGeneratedImages()
    expect(new URL((await lastRequest()).url).pathname).toBe('/api/v1/ppt/images/generated')
  })

  it('generateImage passes the prompt and signal', async () => {
    fetchMock.mockImplementation(async () => json('/app_data/images/g.png'))
    const ctrl = new AbortController()
    expect(await generateImage('a cat', ctrl.signal)).toBe('/app_data/images/g.png')
    const req = await lastRequest()
    expect(new URL(req.url).searchParams.get('prompt')).toBe('a cat')
  })

  it('searchStockImages passes the query', async () => {
    fetchMock.mockImplementation(async () => json(['https://x/1.jpg']))
    expect(await searchStockImages('dog')).toEqual(['https://x/1.jpg'])
    const req = await lastRequest()
    expect(new URL(req.url).pathname).toBe('/api/v1/ppt/images/search')
    expect(new URL(req.url).searchParams.get('query')).toBe('dog')
  })
})
