import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkStockImageKey,
  getGenerationDefaults,
  listAnthropicModels,
  listGoogleModels,
  listOllamaLibrary,
  listOllamaModels,
  listOpenAiCompatibleModels,
  listOpenRouterProviders,
  listReachableOllamaModels,
  pullOllamaModel,
  type OllamaPullEvent,
} from '@/api/providerModels'
import { ApiError } from '@/api/errors'
import { DEFAULT_OLLAMA_URL, LOCALHOST_OLLAMA_URL } from '@/settings/providers'

const KEY = 'sk-test-fake'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const mockFetch = (body: unknown, status = 200) => {
  const f = vi.fn().mockImplementation(async () => json(body, status))
  vi.stubGlobal('fetch', f)
  return f
}
const sse = (...frames: string[]) =>
  new Response(frames.join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })

/** API keys travel in bodies or headers, never in the URL. */
function expectNoSecretInUrl(call: unknown[], secret: string): void {
  expect(String(call[0])).not.toContain(secret)
  expect(decodeURIComponent(String(call[0]))).not.toContain(secret)
}
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

describe('providerModels api', () => {
  afterEach(() => vi.unstubAllGlobals())

  describe('hosted model discovery', () => {
    it('listOpenAiCompatibleModels POSTs url and api_key in the body', async () => {
      const f = mockFetch(['gpt-4o', 42, 'o3', null])
      const models = await listOpenAiCompatibleModels({ url: 'https://api.example.com/v1', apiKey: KEY })
      expect(models).toEqual(['gpt-4o', 'o3'])
      const call = f.mock.calls[0]
      expect(call[0]).toBe('/api/v1/ppt/openai/models/available')
      expect(call[1].method).toBe('POST')
      expect(bodyOf(call)).toEqual({ url: 'https://api.example.com/v1', api_key: KEY })
      expectNoSecretInUrl(call, KEY)
    })

    it.each([
      ['google', listGoogleModels],
      ['anthropic', listAnthropicModels],
    ])('%s models POST api_key in the body', async (provider, fn) => {
      const f = mockFetch(['m1', 7, 'm2'])
      expect(await fn(KEY)).toEqual(['m1', 'm2'])
      const call = f.mock.calls[0]
      expect(call[0]).toBe(`/api/v1/ppt/${provider}/models/available`)
      expect(call[1].method).toBe('POST')
      expect(bodyOf(call)).toEqual({ api_key: KEY })
      expectNoSecretInUrl(call, KEY)
    })

    it('a non-array body gives []', async () => {
      mockFetch({ detail: 'nope' })
      expect(await listOpenAiCompatibleModels({ url: 'u', apiKey: KEY })).toEqual([])
      expect(await listGoogleModels(KEY)).toEqual([])
      expect(await listAnthropicModels(KEY)).toEqual([])
    })

    it('failure rejects with ApiError and no key in the message', async () => {
      mockFetch({ detail: 'upstream said no' }, 400)
      const err = await listGoogleModels(KEY).catch((e) => e)
      expect(err).toBeInstanceOf(ApiError)
      expect(err.status).toBe(400)
      expect(err.message).not.toContain(KEY)
    })
  })

  describe('ollama', () => {
    it('listOllamaModels GETs with the url (trailing slashes stripped) and normalises entries', async () => {
      const f = mockFetch([
        { name: 'llama3', parameters: '8B', size: 123 },
        { name: 'x', parameters: 'unknown', size: 'big' },
        { nope: true },
      ])
      const models = await listOllamaModels('http://localhost:11434//')
      expect(models).toEqual([
        { name: 'llama3', parameters: '8B', size: 123 },
        { name: 'x', parameters: null, size: null },
      ])
      const url = new URL(String(f.mock.calls[0][0]), 'http://x')
      expect(url.pathname).toBe('/api/v1/ppt/ollama/models/available')
      expect(url.searchParams.get('ollama_url')).toBe('http://localhost:11434')
      expect(f.mock.calls[0][1]?.method).toBeUndefined()
    })

    it('a non-array body throws the invalid-list error', async () => {
      mockFetch({ models: [] })
      await expect(listOllamaModels('http://o:1')).rejects.toThrow('Ollama returned an invalid model list')
    })

    it('listReachableOllamaModels uses a reachable default without falling back', async () => {
      const f = mockFetch([{ name: 'a' }])
      const r = await listReachableOllamaModels()
      expect(r).toEqual({
        models: [{ name: 'a', parameters: null, size: null }],
        resolvedUrl: DEFAULT_OLLAMA_URL,
        usedFallback: false,
      })
      expect(f).toHaveBeenCalledTimes(1)
    })

    it('listReachableOllamaModels falls back to localhost once when the default fails', async () => {
      const f = vi
        .fn()
        .mockImplementationOnce(async () => json({ detail: 'down' }, 500))
        .mockImplementationOnce(async () => json([{ name: 'b' }]))
      vi.stubGlobal('fetch', f)
      const r = await listReachableOllamaModels('')
      expect(r.resolvedUrl).toBe(LOCALHOST_OLLAMA_URL)
      expect(r.usedFallback).toBe(true)
      expect(f).toHaveBeenCalledTimes(2)
      expect(new URL(String(f.mock.calls[1][0]), 'http://x').searchParams.get('ollama_url')).toBe(
        LOCALHOST_OLLAMA_URL,
      )
    })

    it('listReachableOllamaModels rejects when the fallback fails too', async () => {
      const f = vi.fn().mockImplementation(async () => json({ detail: 'down' }, 500))
      vi.stubGlobal('fetch', f)
      await expect(listReachableOllamaModels()).rejects.toBeInstanceOf(ApiError)
      expect(f).toHaveBeenCalledTimes(2)
    })

    it('listReachableOllamaModels does not fall back for a custom url', async () => {
      const f = vi.fn().mockImplementation(async () => json({ detail: 'down' }, 500))
      vi.stubGlobal('fetch', f)
      await expect(listReachableOllamaModels('http://custom:11434/')).rejects.toBeInstanceOf(ApiError)
      expect(f).toHaveBeenCalledTimes(1)
    })

    it('listOllamaLibrary GETs and normalises the library', async () => {
      const f = mockFetch([
        { name: 'llama3', description: 'd', parameters: '8B', size: '4GB' },
        { name: 'bare' },
        { description: 'no name' },
      ])
      expect(await listOllamaLibrary()).toEqual([
        { name: 'llama3', description: 'd', parameters: '8B', size: '4GB' },
        { name: 'bare', description: '', parameters: '', size: '' },
      ])
      expect(f.mock.calls[0][0]).toBe('/api/v1/ppt/ollama/models/library')
    })

    it('pullOllamaModel POSTs and feeds ordered events, stopping at complete', async () => {
      const f = vi.fn().mockImplementation(async () =>
        sse(
          'event: response\ndata: {"type":"status","status":"pulling manifest"}\n\n',
          'event: response\ndata: {"type":"progress","status":"downloading","total":10,"completed":5,"progress":50}\n\n',
          'event: response\ndata: {"type":"complete","status":"success","model":"llama3"}\n\n',
          'event: response\ndata: {"type":"status","status":"after complete"}\n\n',
        ),
      )
      vi.stubGlobal('fetch', f)
      const events: OllamaPullEvent[] = []
      await pullOllamaModel(' llama3 ', 'http://o:11434', (e) => events.push(e))
      expect(events.map((e) => e.type)).toEqual(['status', 'progress', 'complete'])
      expect(events[1]).toMatchObject({ completed: 5, total: 10, progress: 50 })
      const url = new URL(String(f.mock.calls[0][0]), 'http://x')
      expect(url.pathname).toBe('/api/v1/ppt/ollama/models/pull')
      expect(url.searchParams.get('model_name')).toBe('llama3')
      expect(url.searchParams.get('ollama_url')).toBe('http://o:11434')
      expect(f.mock.calls[0][1].method).toBe('POST')
    })

    it('pullOllamaModel turns an error frame into an error event and stops', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async () =>
          sse(
            'event: response\ndata: {"type":"status","status":"s"}\n\n',
            'event: error\ndata: {"detail":"Pull failed hard"}\n\n',
            'event: response\ndata: {"type":"complete"}\n\n',
          ),
        ),
      )
      const events: OllamaPullEvent[] = []
      await pullOllamaModel('m', 'http://o:1', (e) => events.push(e))
      expect(events).toEqual([
        { type: 'status', status: 's' },
        { type: 'error', detail: 'Pull failed hard' },
      ])
    })

    it('pullOllamaModel reports a non-2xx as an error event', async () => {
      mockFetch({ detail: 'Ollama is not reachable' }, 400)
      const events: OllamaPullEvent[] = []
      await pullOllamaModel('m', 'http://o:1', (e) => events.push(e))
      expect(events).toEqual([{ type: 'error', detail: 'Ollama is not reachable' }])
    })
  })

  describe('openrouter and defaults', () => {
    it('listOpenRouterProviders POSTs model, api_key and base_url in the body and dedupes', async () => {
      const f = mockFetch([
        { value: 'OpenAI', label: 'OpenAI', available: true },
        { value: 'openai', label: 'Other', available: true },
        { value: 'Azure', label: 'Azure', available: false },
        { value: '  ', label: 'blank', available: true },
      ])
      const providers = await listOpenRouterProviders({
        model: 'openai/gpt-4o',
        apiKey: KEY,
        baseUrl: 'https://openrouter.ai/api/v1',
      })
      expect(providers).toEqual(['OpenAI', 'Azure'])
      const call = f.mock.calls[0]
      expect(call[0]).toBe('/api/v1/ppt/openrouter/providers/available')
      expect(call[1].method).toBe('POST')
      expect(bodyOf(call)).toEqual({
        model: 'openai/gpt-4o',
        api_key: KEY,
        base_url: 'https://openrouter.ai/api/v1',
      })
      expectNoSecretInUrl(call, KEY)
    })

    it('listOpenRouterProviders omits an empty base_url and tolerates a non-array', async () => {
      const f = mockFetch({ detail: 'x' })
      expect(await listOpenRouterProviders({ model: 'm', apiKey: KEY, baseUrl: '' })).toEqual([])
      expect('base_url' in bodyOf(f.mock.calls[0])).toBe(false)
    })

    it('listOpenRouterProviders failure has no key in the message', async () => {
      mockFetch({ detail: 'Could not load' }, 502)
      const err = await listOpenRouterProviders({ model: 'm', apiKey: KEY }).catch((e) => e)
      expect(err).toBeInstanceOf(ApiError)
      expect(err.message).not.toContain(KEY)
    })

    it('getGenerationDefaults maps default_max_output_tokens', async () => {
      const f = mockFetch({ default_max_output_tokens: 4096, model_max_output_tokens: 65536 })
      expect(await getGenerationDefaults()).toEqual({ defaultMaxOutputTokens: 4096 })
      expect(f.mock.calls[0][0]).toBe('/api/v1/ppt/generation/defaults')
      expect(f.mock.calls[0][1].method).toBe('POST')
    })

    it('getGenerationDefaults falls back to 8192 on failure or a bad payload', async () => {
      mockFetch({ detail: 'x' }, 500)
      expect(await getGenerationDefaults()).toEqual({ defaultMaxOutputTokens: 8192 })
      mockFetch({ default_max_output_tokens: 'lots' })
      expect(await getGenerationDefaults()).toEqual({ defaultMaxOutputTokens: 8192 })
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
      expect(await getGenerationDefaults()).toEqual({ defaultMaxOutputTokens: 8192 })
    })
  })

  describe('checkStockImageKey', () => {
    it('sends the key only as the X-Provider-Api-Key header', async () => {
      const f = mockFetch(['https://img/1.jpg'])
      await checkStockImageKey('pexels', KEY)
      const call = f.mock.calls[0]
      const url = new URL(String(call[0]), 'http://x')
      expect(url.pathname).toBe('/api/v1/ppt/images/search')
      expect(Object.fromEntries(url.searchParams)).toEqual({
        query: 'business',
        limit: '1',
        provider: 'pexels',
        strict_api_key: 'true',
      })
      expect(new Headers(call[1].headers).get('X-Provider-Api-Key')).toBe(KEY)
      expectNoSecretInUrl(call, KEY)
    })

    it.each(['__configured__', '', '   '])('omits the header for %j', async (value) => {
      const f = mockFetch([])
      await checkStockImageKey('pixabay', value)
      expect(new Headers(f.mock.calls[0][1].headers).has('X-Provider-Api-Key')).toBe(false)
      expect(new URL(String(f.mock.calls[0][0]), 'http://x').searchParams.get('provider')).toBe('pixabay')
    })

    it('a non-2xx throws ApiError with the server detail, without the key', async () => {
      mockFetch({ detail: 'Pexels rejected the API key' }, 400)
      const err = await checkStockImageKey('pexels', KEY).catch((e) => e)
      expect(err).toBeInstanceOf(ApiError)
      expect(err.status).toBe(400)
      expect(err.message).toBe('Pexels rejected the API key')
      expect(err.message).not.toContain(KEY)
    })

    it('a non-2xx without detail uses the generic message', async () => {
      mockFetch({}, 500)
      const err = await checkStockImageKey('pixabay', KEY).catch((e) => e)
      expect(err).toBeInstanceOf(ApiError)
      expect(err.message).toBe(
        'Unable to reach pixabay with the provided API key. Please verify your settings and try again.',
      )
      expect(err.message).not.toContain(KEY)
    })
  })
})
