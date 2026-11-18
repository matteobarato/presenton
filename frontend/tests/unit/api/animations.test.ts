import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteAnimation,
  generateAnimations,
  generateAnimationsAsync,
  getAnimations,
  putAnimation,
} from '@/api/animations'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const fetchMock = vi.fn()
async function lastCall() {
  const [a, b] = fetchMock.mock.calls.at(-1)!
  if (a instanceof Request) {
    const text = await a.clone().text()
    return { url: new URL(a.url), method: a.method, body: text ? JSON.parse(text) : undefined }
  }
  return {
    url: new URL(a, 'http://localhost:3000'),
    method: (b?.method ?? 'GET') as string,
    body: b?.body ? JSON.parse(b.body) : undefined,
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('animations api', () => {
  it('getAnimations GETs the collection', async () => {
    fetchMock.mockImplementation(async () => json({ slides: [] }))
    expect(await getAnimations('p1')).toEqual({ slides: [] })
    const c = await lastCall()
    expect(c.method).toBe('GET')
    expect(c.url.pathname).toBe('/api/v1/ppt/presentation/p1/animations')
  })

  it('generateAnimations POSTs the body (default empty)', async () => {
    fetchMock.mockImplementation(async () => json({ slides: [] }))
    await generateAnimations('p1', { slide_indexes: [0, 2], force: true })
    let c = await lastCall()
    expect(c.method).toBe('POST')
    expect(c.url.pathname).toBe('/api/v1/ppt/presentation/p1/animations')
    expect(c.body).toEqual({ slide_indexes: [0, 2], force: true })
    await generateAnimations('p1')
    c = await lastCall()
    expect(c.body).toEqual({})
  })

  it('generateAnimationsAsync POSTs to async and returns the task', async () => {
    fetchMock.mockImplementation(async () => json({ id: 't1', status: 'pending' }))
    const t = await generateAnimationsAsync('p1', { force: true })
    const c = await lastCall()
    expect(c.method).toBe('POST')
    expect(c.url.pathname).toBe('/api/v1/ppt/presentation/p1/animations/async')
    expect(c.body).toEqual({ force: true })
    expect(t).toMatchObject({ id: 't1' })
  })

  it('putAnimation PUTs {tweens} to the slide path', async () => {
    fetchMock.mockImplementation(async () => json({ slide_id: 's', index: 3 }))
    const tweens = [{ target: 'title', from_values: { opacity: 0 }, duration: 0.5, delay: 0, ease: 'power2.out' }]
    await putAnimation('p1', 3, tweens)
    const c = await lastCall()
    expect(c.method).toBe('PUT')
    expect(c.url.pathname).toBe('/api/v1/ppt/presentation/p1/animations/3')
    expect(c.body).toEqual({ tweens })
  })

  it('deleteAnimation DELETEs the slide path', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }))
    await deleteAnimation('p1', 3)
    const c = await lastCall()
    expect(c.method).toBe('DELETE')
    expect(c.url.pathname).toBe('/api/v1/ppt/presentation/p1/animations/3')
  })
})
