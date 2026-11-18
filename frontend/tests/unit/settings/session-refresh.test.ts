import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '@/stores/session'

const getRuntimeConfig = vi.hoisted(() => vi.fn())
vi.mock('@/api/auth', () => ({ getAuthStatus: vi.fn(), logout: vi.fn() }))
vi.mock('@/api/next-routes', () => ({ getRuntimeConfig }))

beforeEach(() => {
  setActivePinia(createPinia())
  getRuntimeConfig.mockReset()
})

describe('session.refreshRuntime', () => {
  it('replaces the runtime with the new response', async () => {
    getRuntimeConfig.mockResolvedValueOnce({ configured: true, config: { LLM: 'openai' }, generationMode: 'both' })
    const session = useSessionStore()
    await session.refreshRuntime()
    expect(session.runtime?.config.LLM).toBe('openai')
    getRuntimeConfig.mockResolvedValueOnce({ configured: true, config: { LLM: 'anthropic' }, generationMode: 'both' })
    await session.refreshRuntime()
    expect(session.runtime?.config.LLM).toBe('anthropic')
  })

  it('keeps the previous runtime when the fetch fails', async () => {
    getRuntimeConfig.mockResolvedValueOnce({ configured: true, config: { LLM: 'openai' }, generationMode: 'both' })
    const session = useSessionStore()
    await session.refreshRuntime()
    getRuntimeConfig.mockRejectedValueOnce(new Error('down'))
    await expect(session.refreshRuntime()).resolves.toBeUndefined()
    expect(session.runtime?.config.LLM).toBe('openai')
  })
})
