import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Presentation } from '@/api/types'
import type { DeckProgress } from '@/components/create/wizard/progress'

const wizard = vi.hoisted(() => ({ calls: [] as unknown[][], progress: null as unknown, ready: null as unknown }))
vi.mock('@/composables/useDeckWizard', () => ({
  useDeckWizard: (...args: unknown[]) => {
    wizard.calls.push(args)
    return { progress: wizard.progress, ready: wizard.ready, items: computed(() => []) }
  },
}))

import EditorHeader from '@/components/editor/EditorHeader.vue'

const st = (state: string, reason: string | null = null) => ({ state, reason, badge: null })
function setProgress(resume: string, over: Partial<Record<string, ReturnType<typeof st>>> = {}, ready = true) {
  wizard.progress = ref({
    steps: { outline: st('done'), preview: st('done'), avatar: st('available'), export: st('available'), ...over },
    avatarRequirement: 'optional',
    voiceOnly: false,
    resume,
  } as unknown as DeckProgress)
  wizard.ready = ref(ready)
}

const presentation = { id: 'p1', title: 'Deck', slides: [{ id: 'a', index: 0 }] } as unknown as Presentation

async function mountHeader(props: Record<string, unknown> = {}) {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'library', component: { template: '<div />' } },
      { path: '/p/:id', name: 'editor', component: { template: '<div />' } },
      { path: '/p/:id/present', name: 'present', component: { template: '<div />' } },
      { path: '/p/:id/create/:step?', name: 'create', component: { template: '<div />' } },
    ],
  })
  await router.push('/p/p1')
  const w = mount(EditorHeader, {
    props: { presentation, ...props },
    attachTo: document.body,
    global: {
      plugins: [router, [VueQueryPlugin, { queryClient: new QueryClient() }]],
      stubs: { FloatingToolbar: true },
    },
  })
  await flushPromises()
  return { w, router }
}

beforeEach(() => {
  wizard.calls = []
  document.body.innerHTML = ''
})

describe('EditorHeader continue setup', () => {
  it('continue button points at the resume step', async () => {
    setProgress('avatar')
    const { w, router } = await mountHeader()
    const btn = w.get('[data-testid="continue-setup"]')
    expect(btn.text()).toBe('Continue: Avatar')
    await btn.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('create')
    expect(router.currentRoute.value.params).toMatchObject({ id: 'p1', step: 'avatar' })
  })

  it('is hidden until progress is ready', async () => {
    setProgress('avatar', {}, false)
    const { w } = await mountHeader()
    expect(w.find('[data-testid="continue-setup"]').exists()).toBe(false)
  })

  it('stays available as "Setup" when the deck is complete', async () => {
    setProgress('export', { avatar: st('done'), export: st('done') })
    const { w, router } = await mountHeader()
    const btn = w.get('[data-testid="continue-setup"]')
    expect(btn.text()).toBe('Setup')
    expect(btn.attributes('aria-label')).toBe('Open the setup wizard')
    await btn.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('create')
    expect(router.currentRoute.value.params).toMatchObject({ id: 'p1', step: 'export' })
  })

  it('still shows on export when the avatar is not done', async () => {
    setProgress('export', { avatar: st('available') })
    const { w } = await mountHeader()
    expect(w.get('[data-testid="continue-setup"]').text()).toBe('Continue: Export')
  })

  it('feeds the editor stream status to the wizard and never marks outline or pipeline running', async () => {
    setProgress('preview')
    await mountHeader({ slidesStreaming: true })
    const opts = wizard.calls[0]![2] as Record<string, { value: boolean }>
    expect(opts.slidesStreaming!.value).toBe(true)
    expect(opts.outlineStreaming!.value).toBe(false)
    expect(opts.pipelineRunning!.value).toBe(false)
  })

  it('Setup menu lists the deck steps and disables locked ones with their reason', async () => {
    setProgress('avatar', { export: st('locked', 'Narrate the deck first') })
    const { w, router } = await mountHeader()
    w.get('button[aria-label="Presentation actions"]').element.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }),
    )
    await flushPromises()
    const items = [...document.querySelectorAll<HTMLElement>('[data-testid^="setup-item-"]')]
    expect(items.map((i) => i.dataset.testid)).toEqual([
      'setup-item-outline',
      'setup-item-preview',
      'setup-item-avatar',
      'setup-item-export',
    ])
    expect(document.body.textContent).toContain('Setup')
    const exportItem = items[3]!
    expect(exportItem.hasAttribute('data-disabled')).toBe(true)
    expect(exportItem.textContent).toContain('Narrate the deck first')
    items[1]!.click()
    await flushPromises()
    expect(router.currentRoute.value.params).toMatchObject({ id: 'p1', step: 'preview' })
  })
})
