import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { AdminUser, ApiKey } from '@/api/admin'
import { ApiError } from '@/api/errors'
import ApiKeysSection from '@/components/settings/ApiKeysSection.vue'
import UsersSection from '@/components/settings/UsersSection.vue'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '@/stores/session'

const api = vi.hoisted(() => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  resetUserPassword: vi.fn(),
  deleteUser: vi.fn(),
  listApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revealApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  listMyApiKeys: vi.fn(),
  createMyApiKey: vi.fn(),
  revealMyApiKey: vi.fn(),
  revokeMyApiKey: vi.fn(),
}))
vi.mock('@/api/admin', async (importOriginal) => ({ ...(await importOriginal<object>()), ...api }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }))
vi.mock('vue-sonner', () => ({ toast }))

const ADMIN: AdminUser = { id: 'a1', username: 'root', role: 'admin', created_at: null }
const BOB: AdminUser = { id: 'u2', username: 'bob', role: 'user', created_at: '2026-11-01T10:00:00Z' }
const FUTURE = '2099-01-01T00:00:00Z'
const KEY: ApiKey = {
  id: 'k1',
  user_id: 'u2',
  created_by_id: 'a1',
  label: 'Zapier',
  created_at: '2026-11-02T10:00:00Z',
  expires_at: FUTURE,
  last_used_at: null,
  revoked_at: null,
}

let wrapper: VueWrapper | null = null
async function mountIt(component: typeof UsersSection | typeof ApiKeysSection, props: Record<string, unknown> = {}) {
  wrapper = mount(component, { props, attachTo: document.body })
  await flushPromises()
  return wrapper
}
const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
const buttonByText = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)!

beforeEach(() => {
  setActivePinia(createPinia())
  useSessionStore().user = { username: 'bob', role: 'user' }
  for (const fn of Object.values(api)) fn.mockReset()
  for (const fn of Object.values(toast)) fn.mockReset()
  api.listUsers.mockResolvedValue([BOB, ADMIN])
  api.listApiKeys.mockResolvedValue([KEY])
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('UsersSection', () => {
  it('lists accounts and protects the admin from reset and delete', async () => {
    const w = await mountIt(UsersSection)
    const rows = w.findAll('[data-testid="user-row"]')
    expect(rows.map((r) => r.text())).toEqual([expect.stringContaining('bob'), expect.stringContaining('root')])
    expect(button('Delete bob')).toBeTruthy()
    expect(button('Reset password for bob')).toBeTruthy()
    expect(document.querySelector('button[aria-label="Delete root"]')).toBeNull()
    expect(rows[1]!.text()).toContain('Managed by deployment')
  })

  it('validates before creating, then adds the new user to the list', async () => {
    const w = await mountIt(UsersSection)
    const submit = buttonByText('Add user')
    await w.get('#new-user-username').setValue('al')
    expect(w.text()).toContain('Username must be at least 3 characters.')
    expect(submit.disabled).toBe(true)
    await w.get('#new-user-username').setValue('alice')
    await w.get('#new-user-password').setValue('short')
    expect(w.text()).toContain('Password must be at least 8 characters.')
    await w.get('#new-user-password').setValue('long-enough')
    expect(submit.disabled).toBe(false)

    api.createUser.mockResolvedValue({ id: 'u3', username: 'alice', role: 'user', created_at: null })
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(api.createUser).toHaveBeenCalledWith('alice', 'long-enough')
    expect(w.findAll('[data-testid="user-row"]')[0]!.text()).toContain('alice')
    expect((w.get('#new-user-password').element as HTMLInputElement).value).toBe('')
  })

  it('surfaces the backend error when creating fails', async () => {
    const w = await mountIt(UsersSection)
    await w.get('#new-user-username').setValue('bob')
    await w.get('#new-user-password').setValue('long-enough')
    api.createUser.mockRejectedValue(new ApiError('Username already exists', 409, { detail: 'Username already exists' }))
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(toast.error).toHaveBeenCalledWith('Could not add user', { description: 'Username already exists' })
  })

  it('deletes a user after confirming', async () => {
    const w = await mountIt(UsersSection)
    button('Delete bob').click()
    await flushPromises()
    expect(document.body.textContent).toContain('Delete bob?')
    api.deleteUser.mockResolvedValue(undefined)
    buttonByText('Delete user').click()
    await flushPromises()
    expect(api.deleteUser).toHaveBeenCalledWith('u2')
    expect(w.findAll('[data-testid="user-row"]').map((r) => r.text())).toEqual([expect.stringContaining('root')])
  })

  it('resets a password from the dialog', async () => {
    await mountIt(UsersSection)
    button('Reset password for bob').click()
    await flushPromises()
    const input = document.querySelector<HTMLInputElement>('#reset-password')!
    input.value = 'new-password'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    api.resetUserPassword.mockResolvedValue(BOB)
    buttonByText('Reset password').click()
    await flushPromises()
    expect(api.resetUserPassword).toHaveBeenCalledWith('u2', 'new-password')
    expect(toast.success).toHaveBeenCalled()
  })
})

describe('ApiKeysSection', () => {
  it('lists keys with owner and status, hiding actions on revoked keys', async () => {
    api.listApiKeys.mockResolvedValue([
      KEY,
      { ...KEY, id: 'k2', label: 'Old', revoked_at: '2026-11-05T00:00:00Z' },
      { ...KEY, id: 'k3', label: 'Stale', expires_at: '2020-01-01T00:00:00Z', user_id: 'gone' },
    ])
    const w = await mountIt(ApiKeysSection)
    const rows = w.findAll('[data-testid="api-key-row"]')
    expect(rows[0]!.text()).toContain('Zapier')
    expect(rows[0]!.text()).toContain('bob')
    expect(rows[0]!.text()).toContain('Active')
    expect(rows[1]!.text()).toContain('Revoked')
    expect(rows[2]!.text()).toContain('Expired')
    expect(rows[2]!.text()).toContain('Deleted user')
    expect(button('Revoke Zapier')).toBeTruthy()
    expect(document.querySelector('button[aria-label="Revoke Old"]')).toBeNull()
  })

  it('creates a key and shows its token once', async () => {
    const w = await mountIt(ApiKeysSection)
    api.createApiKey.mockResolvedValue({ ...KEY, id: 'k9', label: 'MCP', user_id: 'a1', token: 'sk-new-secret' })
    await w.get('#api-key-label').setValue('  MCP ')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(api.createApiKey).toHaveBeenCalledWith({ userId: 'a1', label: 'MCP', expiryDays: 90 })
    expect(document.querySelector('[data-testid="created-token"]')!.textContent).toBe('sk-new-secret')
    expect(w.findAll('[data-testid="api-key-row"]')[0]!.text()).toContain('MCP')
  })

  it('reveals, hides and copies a key, fetching the secret once', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    api.revealApiKey.mockResolvedValue('sk-zapier')
    const w = await mountIt(ApiKeysSection)
    button('Show Zapier').click()
    await flushPromises()
    expect(w.get('[data-testid="api-key-token"]').text()).toBe('sk-zapier')
    button('Hide Zapier').click()
    await flushPromises()
    expect(w.find('[data-testid="api-key-token"]').exists()).toBe(false)
    button('Copy Zapier').click()
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('sk-zapier')
    expect(api.revealApiKey).toHaveBeenCalledTimes(1)
  })

  it('explains a legacy key that cannot be revealed', async () => {
    api.revealApiKey.mockRejectedValue(new ApiError('This API key cannot be revealed', 409, {}))
    await mountIt(ApiKeysSection)
    button('Show Zapier').click()
    await flushPromises()
    expect(toast.error).toHaveBeenCalledWith('Could not reveal API key', {
      description: expect.stringContaining('Create a new one'),
    })
  })

  it('revokes a key after confirming', async () => {
    const w = await mountIt(ApiKeysSection)
    button('Revoke Zapier').click()
    await flushPromises()
    api.revokeApiKey.mockResolvedValue({ ...KEY, revoked_at: '2026-11-23T00:00:00Z' })
    buttonByText('Revoke key').click()
    await flushPromises()
    expect(api.revokeApiKey).toHaveBeenCalledWith('k1')
    expect(w.get('[data-testid="api-key-row"]').text()).toContain('Revoked')
    expect(document.querySelector('button[aria-label="Revoke Zapier"]')).toBeNull()
  })
})

describe('ApiKeysSection personal scope', () => {
  beforeEach(() => {
    api.listMyApiKeys.mockResolvedValue([KEY])
  })

  it('uses only the self-service endpoints and never asks who the key acts as', async () => {
    const w = await mountIt(ApiKeysSection, { scope: 'mine' })
    expect(api.listMyApiKeys).toHaveBeenCalled()
    expect(api.listUsers).not.toHaveBeenCalled()
    expect(api.listApiKeys).not.toHaveBeenCalled()
    expect(w.find('[data-testid="api-key-user"]').exists()).toBe(false)
    expect(w.get('[data-testid="acts-as-you"]').text()).toContain('bob')
    expect(w.get('[data-testid="api-key-row"]').text()).not.toContain('Deleted user')
  })

  it('creates, reveals and revokes through the personal API', async () => {
    const w = await mountIt(ApiKeysSection, { scope: 'mine' })
    api.createMyApiKey.mockResolvedValue({ ...KEY, id: 'k5', label: 'Laptop', token: 'sk-mine' })
    await w.get('#api-key-label').setValue('Laptop')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(api.createMyApiKey).toHaveBeenCalledWith({ label: 'Laptop', expiryDays: 90 })
    expect(api.createApiKey).not.toHaveBeenCalled()

    api.revealMyApiKey.mockResolvedValue('sk-zapier')
    button('Show Zapier').click()
    await flushPromises()
    expect(api.revealMyApiKey).toHaveBeenCalledWith('k1')

    button('Revoke Zapier').click()
    await flushPromises()
    api.revokeMyApiKey.mockResolvedValue({ ...KEY, revoked_at: '2026-11-23T00:00:00Z' })
    buttonByText('Revoke key').click()
    await flushPromises()
    expect(api.revokeMyApiKey).toHaveBeenCalledWith('k1')
    expect(api.revokeApiKey).not.toHaveBeenCalled()
  })

  it('shows the backend message when the active-key limit is reached', async () => {
    const w = await mountIt(ApiKeysSection, { scope: 'mine' })
    api.createMyApiKey.mockRejectedValue(new ApiError('You can have at most 10 active API keys. Revoke one first.', 409, {}))
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(toast.error).toHaveBeenCalledWith('Could not create API key', {
      description: 'You can have at most 10 active API keys. Revoke one first.',
    })
  })
})

describe('ApiKeysSection empty state', () => {
  it('shows a friendly empty state, not an error, when the list answers 404', async () => {
    api.listMyApiKeys.mockRejectedValue(new ApiError('Not Found', 404, { detail: 'Not Found' }))
    const w = await mountIt(ApiKeysSection, { scope: 'mine' })
    expect(w.find('[data-testid="api-keys-empty"]').exists()).toBe(true)
    expect(w.text()).toContain('No API keys yet')
    expect(w.text()).not.toContain('Not Found')
    expect(w.find('[role="alert"]').exists()).toBe(false)
  })

  it('still reports real failures', async () => {
    api.listMyApiKeys.mockRejectedValue(new ApiError('Server exploded', 500, {}))
    const w = await mountIt(ApiKeysSection, { scope: 'mine' })
    expect(w.text()).toContain('Server exploded')
    expect(w.text()).toContain('Retry')
  })
})
