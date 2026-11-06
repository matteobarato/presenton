import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { AuthStatus } from '@/api/auth'
import { installGuards } from '@/router'
import { useSessionStore } from '@/stores/session'

const getAuthStatus = vi.hoisted(() => vi.fn<() => Promise<AuthStatus>>())
vi.mock('@/api/auth', () => ({ getAuthStatus, logout: vi.fn() }))
vi.mock('@/api/next-routes', () => ({ getRuntimeConfig: vi.fn().mockResolvedValue({ configured: true, config: {}, generationMode: 'both' }) }))

const view = { template: '<div />' }

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: view, meta: { public: true } },
      { path: '/setup', name: 'setup', component: view, meta: { public: true } },
      { path: '/', name: 'library', component: view },
      { path: '/p/:id', name: 'editor', component: view },
    ],
  })
  installGuards(router)
  return router
}

const anon: AuthStatus = { setupRequired: false, authenticated: false, user: null }
const signedIn: AuthStatus = { setupRequired: false, authenticated: true, user: { username: 'ada', role: 'admin' } }

beforeEach(() => {
  setActivePinia(createPinia())
  getAuthStatus.mockReset()
})

describe('auth guard', () => {
  it('sends a protected route to /setup when setup is required', async () => {
    getAuthStatus.mockResolvedValue({ setupRequired: true, authenticated: false, user: null })
    const router = makeRouter()
    await router.push('/p/1')
    expect(router.currentRoute.value.name).toBe('setup')
  })

  it('sends unauthenticated users to /login and preserves next', async () => {
    getAuthStatus.mockResolvedValue(anon)
    const router = makeRouter()
    await router.push('/p/1?tab=notes')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.next).toBe('/p/1?tab=notes')
  })

  it('redirects an authenticated user away from login to next', async () => {
    getAuthStatus.mockResolvedValue(signedIn)
    const router = makeRouter()
    await router.push('/login?next=/p/9')
    expect(router.currentRoute.value.fullPath).toBe('/p/9')
  })

  it('redirects an authenticated user away from setup to /', async () => {
    getAuthStatus.mockResolvedValue(signedIn)
    const router = makeRouter()
    await router.push('/setup')
    expect(router.currentRoute.value.name).toBe('library')
  })

  it('ignores an external next target', async () => {
    getAuthStatus.mockResolvedValue(signedIn)
    const router = makeRouter()
    await router.push({ name: 'login', query: { next: '//evil.example' } })
    expect(router.currentRoute.value.fullPath).toBe('/')
  })

  it('loads the session once and exposes the runtime config', async () => {
    getAuthStatus.mockResolvedValue(signedIn)
    const router = makeRouter()
    await router.push('/')
    await router.push('/p/1')
    expect(getAuthStatus).toHaveBeenCalledTimes(1)
    expect(useSessionStore().runtime?.generationMode).toBe('both')
  })

  it('lets navigation through when the backend is unreachable', async () => {
    getAuthStatus.mockRejectedValue(new Error('down'))
    const router = makeRouter()
    await router.push('/p/1')
    expect(router.currentRoute.value.name).toBe('editor')
    expect(useSessionStore().ready).toBe(false)
  })
})
