import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { backendStatus } from '@/api/client'
import AppShell from '@/components/shell/AppShell.vue'
import { useSessionStore } from '@/stores/session'

const getAuthStatus = vi.hoisted(() => vi.fn())
vi.mock('@/api/auth', () => ({ getAuthStatus, logout: vi.fn() }))
vi.mock('@/api/next-routes', () => ({ getRuntimeConfig: vi.fn().mockResolvedValue({ configured: true, config: {}, generationMode: 'both' }) }))

const view = { template: '<div />' }

async function mountShell() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'library', component: view },
      { path: '/new', name: 'new', component: view },
      { path: '/p/:id', name: 'editor', component: view },
      { path: '/login', name: 'login', component: view },
    ],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(AppShell, { slots: { default: '<p>page</p>' }, global: { plugins: [router] }, attachTo: document.body })
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  useSessionStore().user = { username: 'ada' }
  backendStatus.value = 'ok'
  getAuthStatus.mockReset()
})
afterEach(() => {
  backendStatus.value = 'ok'
  document.body.innerHTML = ''
})

describe('AppShell', () => {
  it('shows unreachable banner naming the backend proxy', async () => {
    const wrapper = await mountShell()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    backendStatus.value = 'unreachable'
    await flushPromises()
    const text = wrapper.get('[role="alert"]').text()
    expect(text).toContain("Can't reach the Presenton backend")
    expect(text).toContain('/api proxy')
  })

  it('retries the auth status on window focus and clears the banner', async () => {
    backendStatus.value = 'unreachable'
    getAuthStatus.mockImplementation(async () => {
      backendStatus.value = 'ok'
      return { setupRequired: false, authenticated: true, user: { username: 'ada' } }
    })
    const wrapper = await mountShell()
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(getAuthStatus).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('renders the rail with Library, New, Settings and the user menu', async () => {
    const wrapper = await mountShell()
    const nav = wrapper.get('nav[aria-label="Main"]')
    expect(nav.get('a[href="/"]:not([aria-label])').text()).toBe('Library')
    expect(nav.get('a[href="/new"]').text()).toBe('New')
    expect(nav.find('[aria-label="Settings (classic app)"]').exists()).toBe(true)
    expect(nav.find('button[aria-label="Account menu"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('page')
  })

  it('opens Settings in a new tab', async () => {
    const wrapper = await mountShell()
    const settings = wrapper.get('a[aria-label="Settings (classic app)"]')
    expect(settings.attributes('href')).toBe('/settings')
    expect(settings.attributes('target')).toBe('_blank')
  })
})
