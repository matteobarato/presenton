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

/** Opens the avatar dropdown (portalled to body) and returns its Settings item. */
async function openSettingsItem(wrapper: Awaited<ReturnType<typeof mountShell>>) {
  await wrapper.get('button[aria-label="Account menu"]').trigger('keydown', { key: 'Enter' })
  await flushPromises()
  return [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent?.trim() === 'Settings')!
}

async function mountShell(path = '/') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'library', component: view },
      { path: '/new', name: 'new', component: view },
      { path: '/p/:id', name: 'editor', component: view },
      { path: '/templates', name: 'templates', component: view },
      { path: '/templates/:id', name: 'template', component: view },
      { path: '/settings/:section', name: 'settings', component: view },
      { path: '/login', name: 'login', component: view },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(AppShell, { slots: { default: '<p>page</p>' }, global: { plugins: [router] }, attachTo: document.body })
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  useSessionStore().user = { username: 'ada', role: 'admin' }
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
    expect(text).toContain("Can't reach the Slideshows backend")
    expect(text).toContain('/api proxy')
    expect(text).toContain('http://backend.test:5001')
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

  it('renders the rail with Library, New and the user menu, without a Settings button', async () => {
    const wrapper = await mountShell()
    const nav = wrapper.get('nav[aria-label="Main"]')
    expect(nav.get('a[href="/"]:not([aria-label])').text()).toBe('Library')
    expect(nav.get('a[href="/new"]').text()).toBe('New')
    expect(nav.find('a[href^="/settings"]').exists()).toBe(false)
    expect(nav.find('button[aria-label="Account menu"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('page')
  })

  it('links to Templates and marks it current on template routes', async () => {
    const wrapper = await mountShell('/templates/abc')
    const link = wrapper.get('nav[aria-label="Main"] a[href="/templates"]')
    expect(link.text()).toBe('Templates')
    expect(link.attributes('aria-current')).toBe('page')
    expect(wrapper.get('nav[aria-label="Main"] a[href="/new"]').attributes('aria-current')).toBeUndefined()
  })

  it('links a non-admin straight to their account settings from the user menu', async () => {
    useSessionStore().user = { username: 'bob', role: 'user' }
    const wrapper = await mountShell('/')
    expect((await openSettingsItem(wrapper)).getAttribute('href')).toBe('/settings/account')
  })

  it('links Settings inside the app and marks it current on settings routes', async () => {
    const wrapper = await mountShell('/settings/images')
    const settings = await openSettingsItem(wrapper)
    expect(settings.getAttribute('href')).toBe('/settings/text')
    expect(settings.getAttribute('target')).toBeNull()
    expect(settings.getAttribute('aria-current')).toBe('page')
  })
})
