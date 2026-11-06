import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, backendStatus, requestJson, setUnauthorizedHandler, unwrap } from '@/api/client'
import { ApiError, BackendUnreachableError } from '@/api/errors'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('api client', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    backendStatus.value = 'ok'
    setUnauthorizedHandler(() => {})
  })
  afterEach(() => vi.unstubAllGlobals())

  it('401 calls handler', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    fetchMock.mockResolvedValue(json({ detail: 'Unauthorized' }, 401))
    const err = await unwrap(api.GET('/api/v1/ppt/presentation/all')).catch((e) => e)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(err.message).toBe('Unauthorized')
  })

  it('401 on requestJson also calls the handler once', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    fetchMock.mockResolvedValue(json({ detail: 'no' }, 401))
    await expect(requestJson('/api/other')).rejects.toMatchObject({ status: 401 })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('network failure flips backendStatus', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(unwrap(api.GET('/api/v1/ppt/presentation/all'))).rejects.toBeInstanceOf(BackendUnreachableError)
    expect(backendStatus.value).toBe('unreachable')
    fetchMock.mockResolvedValueOnce(json([]))
    await unwrap(api.GET('/api/v1/ppt/presentation/all'))
    expect(backendStatus.value).toBe('ok')
  })

  it('502 flips backendStatus to unreachable and a 200 restores it', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }))
    await expect(unwrap(api.GET('/api/v1/ppt/presentation/all'))).rejects.toMatchObject({ status: 502 })
    expect(backendStatus.value).toBe('unreachable')
    fetchMock.mockResolvedValueOnce(json([]))
    await unwrap(api.GET('/api/v1/ppt/presentation/all'))
    expect(backendStatus.value).toBe('ok')
  })

  it('unwrap returns data', async () => {
    fetchMock.mockResolvedValue(json([{ id: 'a' }]))
    const data = await unwrap(api.GET('/api/v1/ppt/presentation/all'))
    expect(data).toEqual([{ id: 'a' }])
  })

  it('unwrap throws ApiError with the server message on 4xx', async () => {
    fetchMock.mockResolvedValue(json({ detail: 'Presentation not found' }, 404))
    await expect(unwrap(api.GET('/api/v1/ppt/presentation/{id}', { params: { path: { id: 'x' } } }))).rejects.toMatchObject({
      status: 404,
      message: 'Presentation not found',
    })
  })

  it('requestJson parses json, sends credentials and handles 204', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: 1 }))
    expect(await requestJson('/api/x')).toEqual({ ok: 1 })
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include' })
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    expect(await requestJson('/api/x')).toBeUndefined()
  })
})
