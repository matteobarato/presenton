import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { AuthStatus } from '@/api/auth'
import { ApiError } from '@/api/errors'
import LoginView from '@/views/LoginView.vue'

const login = vi.hoisted(() => vi.fn<(u: string, p: string) => Promise<AuthStatus>>())
vi.mock('@/api/auth', () => ({ login, getAuthStatus: vi.fn(), logout: vi.fn() }))
vi.mock('@/api/next-routes', () => ({ getRuntimeConfig: vi.fn().mockResolvedValue({ configured: true, config: {}, generationMode: 'both' }) }))

const view = { template: '<div />' }

async function mountAt(url: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: LoginView },
      { path: '/', component: view },
      { path: '/p/:id', component: view },
    ],
  })
  await router.push(url)
  await router.isReady()
  const wrapper = mount(LoginView, { global: { plugins: [router] } })
  return { wrapper, router }
}

async function fill(wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper']) {
  await wrapper.get('#login-username').setValue('ada')
  await wrapper.get('#login-password').setValue('secret-pass')
  await wrapper.get('form').trigger('submit')
}

beforeEach(() => {
  setActivePinia(createPinia())
  login.mockReset()
})

describe('LoginView', () => {
  it('logs in and routes to next', async () => {
    login.mockResolvedValue({ setupRequired: false, authenticated: true, user: { username: 'ada' } })
    const { wrapper, router } = await mountAt('/login?next=/p/7')
    await fill(wrapper)
    await flushPromises()
    expect(login).toHaveBeenCalledWith('ada', 'secret-pass')
    expect(router.currentRoute.value.fullPath).toBe('/p/7')
  })

  it('shows the server message inline on 401', async () => {
    login.mockRejectedValue(new ApiError('Unauthorized', 401, { detail: 'Unauthorized' }))
    const { wrapper, router } = await mountAt('/login')
    await fill(wrapper)
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Unauthorized')
    expect(router.currentRoute.value.name).toBe('login')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('disables submit while pending', async () => {
    let resolve!: (s: AuthStatus) => void
    login.mockReturnValue(new Promise((r) => (resolve = r)))
    const { wrapper } = await mountAt('/login')
    await fill(wrapper)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    resolve({ setupRequired: false, authenticated: true, user: { username: 'ada' } })
    await flushPromises()
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })
})
