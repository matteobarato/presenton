import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAuthStatus, login } from '@/api/auth'

function respond(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })))
}
afterEach(() => vi.unstubAllGlobals())

describe('auth status', () => {
  it('marks the DISABLE_AUTH stub (no user_id) as auth-disabled', async () => {
    respond({ configured: true, authenticated: true, username: 'electron', user_id: null, role: 'admin' })
    expect((await getAuthStatus()).user).toEqual({ username: 'electron', role: 'admin', authDisabled: true })
  })

  it('treats a real account as a normal user', async () => {
    respond({ configured: true, authenticated: true, username: 'bob', user_id: 'u2', role: 'user' })
    expect((await getAuthStatus()).user).toEqual({ username: 'bob', role: 'user' })
  })

  it('does not flag a login response, which carries `id` instead of `user_id`', async () => {
    respond({ configured: true, authenticated: true, id: 'u2', username: 'bob', role: 'user' })
    expect((await login('bob', 'pw')).user).toEqual({ username: 'bob', role: 'user' })
  })
})
