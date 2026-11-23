// Ported from servers/nextjs/app/(presentation-generator)/(dashboard)/admin/AdminPanel.tsx
// Endpoints: servers/fastapi/api/v1/admin/router.py
import { requestJson } from './client'

export interface AdminUser {
  id: string
  username: string
  role: 'admin' | 'user' | string
  created_at: string | null
}

export interface ApiKey {
  id: string
  user_id: string
  created_by_id: string
  label: string
  created_at: string
  expires_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export interface ApiKeyCreated extends ApiKey {
  token: string
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

export function listUsers(): Promise<AdminUser[]> {
  return requestJson<AdminUser[]>('/api/v1/admin/users', { cache: 'no-store' })
}

export function createUser(username: string, password: string): Promise<AdminUser> {
  return requestJson<AdminUser>('/api/v1/admin/users', json('POST', { username, password }))
}

export function resetUserPassword(userId: string, password: string): Promise<AdminUser> {
  return requestJson<AdminUser>(`/api/v1/admin/users/${encodeURIComponent(userId)}/password`, json('PUT', { password }))
}

export function deleteUser(userId: string): Promise<void> {
  return requestJson<void>(`/api/v1/admin/users/${encodeURIComponent(userId)}`, json('DELETE'))
}

export function listApiKeys(): Promise<ApiKey[]> {
  return requestJson<ApiKey[]>('/api/v1/admin/api-keys', { cache: 'no-store' })
}

export function createApiKey(input: { userId: string; label: string; expiryDays: number }): Promise<ApiKeyCreated> {
  return requestJson<ApiKeyCreated>(
    '/api/v1/admin/api-keys',
    json('POST', { user_id: input.userId, label: input.label, expiry_days: input.expiryDays }),
  )
}

/** The full secret of an existing key. 409 = legacy key that cannot be revealed, 410 = revoked. */
export async function revealApiKey(apiKeyId: string): Promise<string> {
  const data = await requestJson<{ id: string; token: string }>(
    `/api/v1/admin/api-keys/${encodeURIComponent(apiKeyId)}/token`,
    { cache: 'no-store' },
  )
  return data.token
}

export function revokeApiKey(apiKeyId: string): Promise<ApiKey> {
  return requestJson<ApiKey>(`/api/v1/admin/api-keys/${encodeURIComponent(apiKeyId)}/revoke`, json('POST'))
}

export type ApiKeyStatus = 'active' | 'expired' | 'revoked'

export function apiKeyStatus(key: ApiKey, now: number = Date.now()): ApiKeyStatus {
  if (key.revoked_at) return 'revoked'
  if (new Date(key.expires_at).getTime() <= now) return 'expired'
  return 'active'
}

// Self-service keys (servers/fastapi/api/v1/auth/personal_keys.py): always act as the signed-in user.

export function listMyApiKeys(): Promise<ApiKey[]> {
  return requestJson<ApiKey[]>('/api/v1/auth/api-keys', { cache: 'no-store' })
}

export function createMyApiKey(input: { label: string; expiryDays: number }): Promise<ApiKeyCreated> {
  return requestJson<ApiKeyCreated>('/api/v1/auth/api-keys', json('POST', { label: input.label, expiry_days: input.expiryDays }))
}

export async function revealMyApiKey(apiKeyId: string): Promise<string> {
  const data = await requestJson<{ id: string; token: string }>(
    `/api/v1/auth/api-keys/${encodeURIComponent(apiKeyId)}/token`,
    { cache: 'no-store' },
  )
  return data.token
}

export function revokeMyApiKey(apiKeyId: string): Promise<ApiKey> {
  return requestJson<ApiKey>(`/api/v1/auth/api-keys/${encodeURIComponent(apiKeyId)}/revoke`, json('POST'))
}
