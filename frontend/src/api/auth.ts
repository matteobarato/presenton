import { requestJson } from './client'

export interface AuthUser {
  username: string
  role?: string
  /**
   * True when the backend runs with `DISABLE_AUTH` (the desktop build): everyone is a synthetic
   * admin with no account, so account features (users, API keys, password) don't apply.
   */
  authDisabled?: boolean
}

export interface AuthStatus {
  setupRequired: boolean
  authenticated: boolean
  user: AuthUser | null
}

/** Shape shared by `GET /status` and `POST /login` in `servers/fastapi/api/v1/auth/router.py`. */
interface AuthStatusPayload {
  configured?: boolean
  authenticated?: boolean
  username?: string | null
  user_id?: string | null
  role?: string | null
}

function toAuthStatus(raw: AuthStatusPayload): AuthStatus {
  const authenticated = Boolean(raw.authenticated)
  // `/status` always sends `user_id` for a real account; only the DISABLE_AUTH stub sends null.
  const authDisabled = authenticated && 'user_id' in raw && raw.user_id == null
  const user =
    authenticated && raw.username
      ? { username: raw.username, ...(raw.role ? { role: raw.role } : {}), ...(authDisabled ? { authDisabled: true } : {}) }
      : null
  return { setupRequired: raw.configured === false, authenticated, user }
}

export async function getAuthStatus(): Promise<AuthStatus> {
  return toAuthStatus(await requestJson<AuthStatusPayload>('/api/v1/auth/status'))
}

const jsonPost = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

export async function login(username: string, password: string): Promise<AuthStatus> {
  return toAuthStatus(await requestJson<AuthStatusPayload>('/api/v1/auth/login', jsonPost({ username, password })))
}

/** Creates the first admin account. The backend does not sign the user in: call `login` after. */
export async function setup(username: string, password: string): Promise<void> {
  await requestJson('/api/v1/auth/setup', jsonPost({ username, password }))
}

export async function logout(): Promise<void> {
  await requestJson('/api/v1/auth/logout', { method: 'POST' })
}

/**
 * Changes the signed-in user's own password. The backend signs out their other sessions and
 * re-issues this session's cookie. A wrong current password is a 400 (never a 401).
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await requestJson('/api/v1/auth/password', jsonPost({ current_password: currentPassword, new_password: newPassword }))
}
