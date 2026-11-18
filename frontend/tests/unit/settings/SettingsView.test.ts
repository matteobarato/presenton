import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import { ApiError } from '@/api/errors'
import type { ProviderConfig } from '@/settings/types'
import { useSessionStore } from '@/stores/session'
import SettingsView from '@/views/SettingsView.vue'
import ImagesSection from '@/components/settings/ImagesSection.vue'
import WebSearchSection from '@/components/settings/WebSearchSection.vue'
import TextSection from '@/components/settings/TextSection.vue'

const getProviderSettings = vi.hoisted(() => vi.fn<() => Promise<ProviderConfig>>())
const saveProviderSettings = vi.hoisted(() => vi.fn<(c: ProviderConfig) => Promise<ProviderConfig>>())
const logout = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/api/providerSettings', () => ({
  getProviderSettings,
  saveProviderSettings,
  getCodexAuthStatus: vi.fn(),
  getPresentonLinkStatus: vi.fn(),
}))
vi.mock('@/api/providerModels', () => ({ checkStockImageKey: vi.fn().mockResolvedValue(undefined), listOllamaModels: vi.fn() }))
vi.mock('@/api/auth', () => ({ getAuthStatus: vi.fn(), logout }))
vi.mock('@/api/next-routes', () => ({ getRuntimeConfig: vi.fn().mockResolvedValue({ configured: true, config: {}, generationMode: 'both' }) }))
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }))

const SIDEBAR_ITEMS = 'nav[aria-label="Settings sections"] button'
const stub = { template: '<div />' }
const FAKE_KEY = 'sk-test-fake'
const ADMIN_CONFIG: ProviderConfig = {
  LLM: 'openai',
  OPENAI_API_KEY: FAKE_KEY,
  OPENAI_MODEL: 'gpt-4.1',
  IMAGE_PROVIDER: 'pexels',
  PEXELS_API_KEY: 'pexels-test-fake',
}

let router: Router
let wrapper: VueWrapper | null = null

async function mountAt(path: string): Promise<VueWrapper> {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'library', component: stub },
      { path: '/login', name: 'login', component: stub },
      { path: '/settings/:section', name: 'settings', component: SettingsView },
    ],
  })
  await router.push(path)
  await router.isReady()
  wrapper = mount({ components: { RouterView }, template: '<RouterView />' }, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

function setField(field: string, value: unknown) {
  const editor = [TextSection, ImagesSection, WebSearchSection].map((c) => wrapper!.findComponent(c)).find((c) => c.exists())
  editor!.vm.$emit('set', field, value)
}

function signIn(role: string | undefined, runtimeConfig: Record<string, unknown> = {}) {
  const session = useSessionStore()
  session.user = { username: 'ada', role }
  session.runtime = { configured: true, config: runtimeConfig, generationMode: 'both' }
}

beforeEach(() => {
  setActivePinia(createPinia())
  getProviderSettings.mockReset()
  saveProviderSettings.mockReset()
  logout.mockClear()
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('SettingsView', () => {
  it('shows the sidebar with all four sections for an admin, and no save bar until the draft changes', async () => {
    signIn('admin')
    getProviderSettings.mockResolvedValue(ADMIN_CONFIG)
    const w = await mountAt('/settings/text')

    const tabs = w.findAll(SIDEBAR_ITEMS)
    expect(tabs.map((t) => t.text())).toEqual([
      expect.stringContaining('Text'),
      expect.stringContaining('Images'),
      expect.stringContaining('Web search'),
      expect.stringContaining('Account'),
    ])
    expect(w.text()).toContain('OpenAI (gpt-4.1)')
    expect(w.text()).toContain('Pexels')
    expect(w.text()).toContain('Web search disabled')
    expect(w.findComponent(TextSection).exists()).toBe(true)
    expect(w.find('button[type="button"]').exists()).toBe(true)
    expect(w.text()).not.toContain('Discard')

    setField('OPENAI_MODEL', 'gpt-4.1-mini')
    await flushPromises()
    expect(w.text()).toContain('Save')
    expect(w.text()).toContain('Discard')
    expect(w.text()).toContain('OpenAI (gpt-4.1-mini)')
  })

  it('navigates between sections and keeps the draft', async () => {
    signIn('admin')
    getProviderSettings.mockResolvedValue(ADMIN_CONFIG)
    const w = await mountAt('/settings/text')
    setField('OPENAI_MODEL', 'gpt-4.1-mini')
    await w.findAll(SIDEBAR_ITEMS)[1]!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.params.section).toBe('images')
    expect(w.findAll(SIDEBAR_ITEMS)[1]!.attributes('aria-current')).toBe('page')
    expect(w.text()).toContain('Discard')
    expect(w.text()).toContain('OpenAI (gpt-4.1-mini)')
  })

  it('discards the draft', async () => {
    signIn('admin')
    getProviderSettings.mockResolvedValue(ADMIN_CONFIG)
    const w = await mountAt('/settings/text')
    setField('OPENAI_MODEL', 'gpt-4.1-mini')
    await flushPromises()
    const discard = w.findAll('button').find((b) => b.text() === 'Discard')!
    await discard.trigger('click')
    expect(w.text()).not.toContain('Discard')
    expect(w.text()).toContain('OpenAI (gpt-4.1)')
  })

  it('saves from the save bar without reloading the settings', async () => {
    signIn('admin')
    getProviderSettings.mockResolvedValue(ADMIN_CONFIG)
    saveProviderSettings.mockResolvedValue({ ...ADMIN_CONFIG, OPENAI_MODEL: 'gpt-4.1-mini' })
    const w = await mountAt('/settings/text')
    setField('OPENAI_MODEL', 'gpt-4.1-mini')
    await flushPromises()
    await w.findAll('button').find((b) => b.text() === 'Save')!.trigger('click')
    await flushPromises()
    expect(saveProviderSettings).toHaveBeenCalledTimes(1)
    expect(getProviderSettings).toHaveBeenCalledTimes(1)
    expect(w.text()).not.toContain('Discard')
  })

  it('disables every section control while saving', async () => {
    signIn('admin')
    getProviderSettings.mockResolvedValue(ADMIN_CONFIG)
    let finish!: (c: ProviderConfig) => void
    saveProviderSettings.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const w = await mountAt('/settings/text')
    setField('OPENAI_MODEL', 'gpt-4.1-mini')
    await flushPromises()
    await w.findAll('button').find((b) => b.text() === 'Save')!.trigger('click')
    await flushPromises()
    expect(w.get('fieldset').attributes('disabled')).toBeDefined()
    const save = w.findAll('button').find((b) => b.text() === 'Save')!
    expect(save.attributes('disabled')).toBeDefined()
    finish({ ...ADMIN_CONFIG, OPENAI_MODEL: 'gpt-4.1-mini' })
    await flushPromises()
    expect(w.get('fieldset').attributes('disabled')).toBeUndefined()
  })

  it('jumps to the section that owns a validation failure', async () => {
    signIn('admin')
    getProviderSettings.mockResolvedValue({ LLM: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-test-fake', ANTHROPIC_MODEL: 'm', DISABLE_IMAGE_GENERATION: true })
    const w = await mountAt('/settings/images')
    setField('LLM', 'openai')
    await flushPromises()
    await w.findAll('button').find((b) => b.text() === 'Save')!.trigger('click')
    await flushPromises()
    expect(saveProviderSettings).not.toHaveBeenCalled()
    expect(router.currentRoute.value.params.section).toBe('text')
  })

  it('shows the managed message and no inputs for a non-admin', async () => {
    signIn('member', { LLM: 'openai', OPENAI_MODEL: 'gpt-4.1' })
    const w = await mountAt('/settings/text')
    expect(w.text()).toContain('An administrator manages these settings.')
    expect(w.text()).toContain('OpenAI (gpt-4.1)')
    expect(w.find('input').exists()).toBe(false)
    expect(getProviderSettings).not.toHaveBeenCalled()
  })

  it('renders the web search editor and marks the draft dirty on a toggle', async () => {
    signIn('admin')
    getProviderSettings.mockResolvedValue(ADMIN_CONFIG)
    const w = await mountAt('/settings/web-search')
    expect(w.findComponent(WebSearchSection).exists()).toBe(true)
    expect(w.text()).not.toContain('Discard')
    await w.get('[role="switch"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Discard')
  })

  it('shows the locked message when the admin endpoint answers 403', async () => {
    signIn('admin', { LLM: 'openai', OPENAI_MODEL: 'gpt-4.1' })
    getProviderSettings.mockRejectedValue(new ApiError('Forbidden', 403, { detail: 'Forbidden' }))
    const w = await mountAt('/settings/images')
    expect(w.text()).toContain('Provider settings are locked by this deployment.')
    expect(w.find('input').exists()).toBe(false)
  })

  it('shows a destructive alert with Retry on a load error, and Retry calls the API again', async () => {
    signIn('admin')
    getProviderSettings.mockRejectedValueOnce(new ApiError('boom', 500, { detail: 'Server exploded' }))
    getProviderSettings.mockResolvedValueOnce(ADMIN_CONFIG)
    const w = await mountAt('/settings/text')
    expect(w.get('[role="alert"]').text()).toContain('Server exploded')
    expect(w.find('nav[aria-label="Settings sections"]').exists()).toBe(false)
    await w.findAll('button').find((b) => b.text() === 'Retry')!.trigger('click')
    await flushPromises()
    expect(getProviderSettings).toHaveBeenCalledTimes(2)
    expect(w.find('nav[aria-label="Settings sections"]').exists()).toBe(true)
    expect(w.text()).toContain('OpenAI (gpt-4.1)')
  })

  it('never renders a secret from the runtime config in the read-only summary', async () => {
    signIn('member', {
      LLM: 'openai',
      OPENAI_MODEL: 'gpt-4.1',
      OPENAI_API_KEY: '__configured__',
      ANTHROPIC_API_KEY: FAKE_KEY,
      PEXELS_API_KEY: 'pexels-test-fake',
    })
    const w = await mountAt('/settings/text')
    for (const path of ['/settings/text', '/settings/images', '/settings/web-search']) {
      await router.push(path)
      await flushPromises()
      const html = w.html()
      expect(html).not.toContain(FAKE_KEY)
      expect(html).not.toContain('pexels-test-fake')
      expect(html).not.toContain('__configured__')
    }
  })

  it('signs out from the account section and goes to login', async () => {
    signIn('admin')
    getProviderSettings.mockResolvedValue(ADMIN_CONFIG)
    const w = await mountAt('/settings/account')
    expect(w.text()).toContain('ada')
    expect(w.text()).toContain('admin')
    await w.findAll('button').find((b) => b.text() === 'Sign out')!.trigger('click')
    await flushPromises()
    expect(logout).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('shows the account section in every mode', async () => {
    signIn('member')
    const w = await mountAt('/settings/account')
    expect(w.text()).toContain('Sign out')
  })

  it('keeps the route when leaving with unsaved changes and confirm is declined', async () => {
    signIn('admin')
    getProviderSettings.mockResolvedValue(ADMIN_CONFIG)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await mountAt('/settings/text')
    setField('OPENAI_MODEL', 'gpt-4.1-mini')
    await flushPromises()
    await router.push('/')
    expect(confirm).toHaveBeenCalledWith('You have unsaved changes. Leave without saving?')
    expect(router.currentRoute.value.name).toBe('settings')
    confirm.mockReturnValue(true)
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('library')
  })

  it('leaves without asking when nothing changed', async () => {
    signIn('admin')
    getProviderSettings.mockResolvedValue(ADMIN_CONFIG)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await mountAt('/settings/text')
    await router.push('/')
    expect(confirm).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('library')
  })

  it('warns on page unload only while dirty and removes the listener on unmount', async () => {
    signIn('admin')
    getProviderSettings.mockResolvedValue(ADMIN_CONFIG)
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const w = await mountAt('/settings/text')
    const added = () => add.mock.calls.filter(([type]) => type === 'beforeunload')
    expect(added()).toHaveLength(0)
    setField('OPENAI_MODEL', 'gpt-4.1-mini')
    await flushPromises()
    expect(added()).toHaveLength(1)
    const handler = added()[0]![1] as EventListener
    const event = new Event('beforeunload', { cancelable: true })
    handler(event)
    expect(event.defaultPrevented).toBe(true)
    w.unmount()
    wrapper = null
    expect(remove.mock.calls.some(([type, fn]) => type === 'beforeunload' && fn === handler)).toBe(true)
  })
})
