import { afterEach, describe, expect, it, vi } from 'vitest'
import { canChangeKeys, getRuntimeConfig, getTemplatesRoute, hasRequiredKey } from '@/api/next-routes'

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
const mockFetch = (body: unknown) => {
  const f = vi.fn().mockImplementation(async () => json(body))
  vi.stubGlobal('fetch', f)
  return f
}

describe('next-routes', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    ['standard', 'template'],
    ['template', 'template'],
    ['smart', 'smart'],
    ['both', 'both'],
    [undefined, 'both'],
    ['garbage', 'both'],
  ])('maps PRESENTATION_GENERATION_MODE %s to %s', async (raw, expected) => {
    const f = mockFetch({ configured: true, config: { PRESENTATION_GENERATION_MODE: raw, LLM: 'openai' } })
    const cfg = await getRuntimeConfig()
    expect(cfg.generationMode).toBe(expected)
    expect(cfg.configured).toBe(true)
    expect(cfg.config.LLM).toBe('openai')
    expect(f.mock.calls[0][0]).toBe('/api/runtime-config')
  })

  it('defaults when the payload is empty', async () => {
    mockFetch({ configured: false, config: {} })
    expect((await getRuntimeConfig()).generationMode).toBe('both')
  })

  it('canChangeKeys / hasRequiredKey unwrap booleans', async () => {
    mockFetch({ canChange: true })
    expect(await canChangeKeys()).toBe(true)
    mockFetch({ hasKey: false })
    expect(await hasRequiredKey()).toBe(false)
  })

  it('getTemplatesRoute returns the raw payload', async () => {
    mockFetch([{ templateID: 'a' }])
    expect(await getTemplatesRoute()).toEqual([{ templateID: 'a' }])
  })
})
