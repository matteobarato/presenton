import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError, BackendUnreachableError } from '@/api/errors'
import type { ProviderConfig } from '@/settings/types'
import { useSessionStore } from '@/stores/session'
import { useSettingsAccess } from '@/composables/useSettingsAccess'

const getProviderSettings = vi.hoisted(() => vi.fn<() => Promise<ProviderConfig>>())
vi.mock('@/api/providerSettings', () => ({ getProviderSettings }))

function signIn(role: string | undefined) {
  useSessionStore().user = { username: 'someone', role }
}

describe('useSettingsAccess', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getProviderSettings.mockReset()
  })

  it('is managed for a non-admin and never calls the admin endpoint', async () => {
    signIn('member')
    const access = useSettingsAccess()
    await flushPromises()
    expect(access.mode.value).toBe('managed')
    expect(getProviderSettings).not.toHaveBeenCalled()
  })

  it('is managed when nobody is signed in', async () => {
    const access = useSettingsAccess()
    await flushPromises()
    expect(access.mode.value).toBe('managed')
    expect(getProviderSettings).not.toHaveBeenCalled()
  })

  it('is loading until the first fetch settles', async () => {
    signIn('admin')
    getProviderSettings.mockResolvedValue({ LLM: 'openai' })
    const access = useSettingsAccess()
    expect(access.mode.value).toBe('loading')
    await flushPromises()
    expect(access.mode.value).toBe('edit')
  })

  it('is edit with the config for an admin', async () => {
    signIn('admin')
    getProviderSettings.mockResolvedValue({ LLM: 'openai', OPENAI_API_KEY: 'sk-fake-test' })
    const access = useSettingsAccess()
    await flushPromises()
    expect(access.mode.value).toBe('edit')
    expect(access.config.value).toEqual({ LLM: 'openai', OPENAI_API_KEY: 'sk-fake-test' })
    expect(access.error.value).toBe('')
  })

  it('is locked when the admin endpoint answers 403', async () => {
    signIn('admin')
    getProviderSettings.mockRejectedValue(new ApiError('Forbidden', 403, { detail: 'Forbidden' }))
    const access = useSettingsAccess()
    await flushPromises()
    expect(access.mode.value).toBe('locked')
    expect(access.config.value).toBeNull()
  })

  it('is error with a message for a 500', async () => {
    signIn('admin')
    getProviderSettings.mockRejectedValue(new ApiError('boom', 500, { detail: 'Database offline' }))
    const access = useSettingsAccess()
    await flushPromises()
    expect(access.mode.value).toBe('error')
    expect(access.error.value).toBe('Database offline')
  })

  it('is error with a non-empty message when the backend is unreachable', async () => {
    signIn('admin')
    getProviderSettings.mockRejectedValue(new BackendUnreachableError())
    const access = useSettingsAccess()
    await flushPromises()
    expect(access.mode.value).toBe('error')
    expect(access.error.value).not.toBe('')
  })

  it('does not leak raw payloads into the error message', async () => {
    signIn('admin')
    getProviderSettings.mockRejectedValue(new ApiError('x', 500, '{"error":"key sk-fake-secret"}'))
    const access = useSettingsAccess()
    await flushPromises()
    expect(access.mode.value).toBe('error')
    expect(access.error.value).not.toContain('sk-fake-secret')
    expect(access.error.value).not.toBe('')
  })

  it('recovers to edit when reload succeeds after an error', async () => {
    signIn('admin')
    getProviderSettings.mockRejectedValueOnce(new ApiError('boom', 500, null))
    const access = useSettingsAccess()
    await flushPromises()
    expect(access.mode.value).toBe('error')

    getProviderSettings.mockResolvedValueOnce({ LLM: 'google' })
    await access.reload()
    expect(access.mode.value).toBe('edit')
    expect(access.config.value).toEqual({ LLM: 'google' })
    expect(access.error.value).toBe('')
  })

  it('lets a stale reload not overwrite a newer one', async () => {
    signIn('admin')
    let resolveFirst!: (c: ProviderConfig) => void
    getProviderSettings.mockImplementationOnce(
      () => new Promise<ProviderConfig>((r) => (resolveFirst = r)),
    )
    const access = useSettingsAccess()

    getProviderSettings.mockResolvedValueOnce({ LLM: 'newer' })
    await access.reload()
    expect(access.config.value).toEqual({ LLM: 'newer' })

    resolveFirst({ LLM: 'stale' })
    await flushPromises()
    expect(access.mode.value).toBe('edit')
    expect(access.config.value).toEqual({ LLM: 'newer' })
  })

  it('lets a stale failure not overwrite a newer success', async () => {
    signIn('admin')
    let rejectFirst!: (e: unknown) => void
    getProviderSettings.mockImplementationOnce(
      () => new Promise<ProviderConfig>((_, rej) => (rejectFirst = rej)),
    )
    const access = useSettingsAccess()

    getProviderSettings.mockResolvedValueOnce({ LLM: 'newer' })
    await access.reload()

    rejectFirst(new ApiError('Forbidden', 403, null))
    await flushPromises()
    expect(access.mode.value).toBe('edit')
  })
})
