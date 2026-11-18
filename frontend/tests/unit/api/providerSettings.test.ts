import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getCodexAuthStatus,
  getPresentonLinkStatus,
  getProviderSettings,
  saveProviderSettings,
} from '@/api/providerSettings'
import { ApiError } from '@/api/errors'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const mockFetch = (body: unknown, status = 200) => {
  const f = vi.fn().mockImplementation(async () => json(body, status))
  vi.stubGlobal('fetch', f)
  return f
}

describe('providerSettings api', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('getProviderSettings GETs the admin endpoint', async () => {
    const f = mockFetch({ LLM: 'openai', PRESENTON_CONNECTED: false })
    expect(await getProviderSettings()).toEqual({ LLM: 'openai', PRESENTON_CONNECTED: false })
    expect(f.mock.calls[0][0]).toBe('/api/v1/admin/provider-settings')
    expect(f.mock.calls[0][1]?.method).toBeUndefined()
  })

  it('saveProviderSettings PUTs the config as JSON and returns the saved config', async () => {
    const f = mockFetch({ LLM: 'openai', OPENAI_API_KEY: '__configured__' })
    const saved = await saveProviderSettings({ LLM: 'openai', OPENAI_API_KEY: 'sk-test-fake' })
    expect(saved.OPENAI_API_KEY).toBe('__configured__')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/v1/admin/provider-settings')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ LLM: 'openai', OPENAI_API_KEY: 'sk-test-fake' })
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
    expect(String(url)).not.toContain('sk-test-fake')
  })

  it('saveProviderSettings rejects with ApiError status 403', async () => {
    mockFetch({ detail: 'You are not allowed to access this resource' }, 403)
    const err = await saveProviderSettings({ LLM: 'openai' }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(403)
  })

  it('saveProviderSettings failure message does not leak the key', async () => {
    mockFetch({ detail: 'boom' }, 500)
    const err = await saveProviderSettings({ OPENAI_API_KEY: 'sk-test-fake' }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.message).not.toContain('sk-test-fake')
  })

  it('getCodexAuthStatus returns the status string', async () => {
    const f = mockFetch({ status: 'authenticated' })
    expect(await getCodexAuthStatus()).toBe('authenticated')
    expect(f.mock.calls[0][0]).toBe('/api/v1/ppt/codex/auth/status')
  })

  it("getCodexAuthStatus returns '' on a non-2xx, a network error, or a bad payload", async () => {
    mockFetch({ detail: 'x' }, 500)
    expect(await getCodexAuthStatus()).toBe('')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
    expect(await getCodexAuthStatus()).toBe('')
    mockFetch({ status: 5 })
    expect(await getCodexAuthStatus()).toBe('')
  })

  it('getPresentonLinkStatus is true only for linked === true', async () => {
    const f = mockFetch({ linked: true })
    expect(await getPresentonLinkStatus()).toBe(true)
    expect(f.mock.calls[0][0]).toBe('/api/v1/auth/presenton/status')
    mockFetch({ linked: 'yes' })
    expect(await getPresentonLinkStatus()).toBe(false)
    mockFetch({})
    expect(await getPresentonLinkStatus()).toBe(false)
  })

  it('getPresentonLinkStatus is false on failure', async () => {
    mockFetch({ detail: 'x' }, 500)
    expect(await getPresentonLinkStatus()).toBe(false)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
    expect(await getPresentonLinkStatus()).toBe(false)
  })
})
