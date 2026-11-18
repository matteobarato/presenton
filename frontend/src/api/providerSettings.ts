// Ported from servers/nextjs/app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx (getCodexAuthStatus, getPresentonLinkStatus)
import { requestJson } from './client'
import type { ProviderConfig } from '@/settings/types'

export function getProviderSettings(): Promise<ProviderConfig> {
  return requestJson<ProviderConfig>('/api/v1/admin/provider-settings')
}

export function saveProviderSettings(config: ProviderConfig): Promise<ProviderConfig> {
  return requestJson<ProviderConfig>('/api/v1/admin/provider-settings', {
    method: 'PUT',
    body: JSON.stringify(config),
  })
}

/** The ChatGPT (Codex) auth status string, or `''` when it cannot be read. */
export async function getCodexAuthStatus(): Promise<string> {
  try {
    const data = await requestJson<{ status?: unknown }>('/api/v1/ppt/codex/auth/status')
    return typeof data?.status === 'string' ? data.status : ''
  } catch {
    return ''
  }
}

/** Whether this install is linked to a Presenton Cloud account; `false` on any failure. */
export async function getPresentonLinkStatus(): Promise<boolean> {
  try {
    const data = await requestJson<{ linked?: unknown }>('/api/v1/auth/presenton/status', {
      cache: 'no-store',
    })
    return data?.linked === true
  } catch {
    return false
  }
}
