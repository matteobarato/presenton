import { requestJson } from './client'

export interface AuthUser {
  username: string
  role?: string
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
  role?: string | null
}

function toAuthStatus(raw: AuthStatusPayload): AuthStatus {
  const authenticated = Boolean(raw.authenticated)
  const user =
    authenticated && raw.username ? { username: raw.username, ...(raw.role ? { role: raw.role } : {}) } : null
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
