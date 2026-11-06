import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getAuthStatus, logout, type AuthStatus, type AuthUser } from '@/api/auth'
import { getRuntimeConfig, type RuntimeConfig } from '@/api/next-routes'

/** Who is signed in and how the backend is configured. No slide or presentation data. */
export const useSessionStore = defineStore('session', () => {
  const user = ref<AuthUser | null>(null)
  const setupRequired = ref(false)
  const runtime = ref<RuntimeConfig | null>(null)
  const ready = ref(false)
  let loading: Promise<void> | null = null

  async function loadRuntime(): Promise<void> {
    try {
      runtime.value = await getRuntimeConfig()
    } catch {
      // Not fatal: screens that need it handle `runtime === null`.
    }
  }

  /** Adopt a fresh status (after login, or when the backend comes back). */
  function applyStatus(status: AuthStatus): void {
    user.value = status.authenticated ? status.user : null
    setupRequired.value = status.setupRequired
    ready.value = true
    if (user.value && !runtime.value) void loadRuntime()
  }

  /** Fetches auth status and runtime config once. A failed attempt may be retried. */
  function load(): Promise<void> {
    if (ready.value) return Promise.resolve()
    loading ??= (async () => {
      try {
        const status = await getAuthStatus()
        user.value = status.authenticated ? status.user : null
        setupRequired.value = status.setupRequired
        if (user.value) await loadRuntime()
        ready.value = true
      } catch {
        // Backend unreachable or failing: backendStatus drives the banner; stay not-ready.
      } finally {
        loading = null
      }
    })()
    return loading
  }

  function clearUser(): void {
    user.value = null
    runtime.value = null
  }

  async function signOut(): Promise<void> {
    try {
      await logout()
    } finally {
      clearUser()
    }
  }

  return { user, setupRequired, runtime, ready, load, applyStatus, clearUser, signOut }
})
