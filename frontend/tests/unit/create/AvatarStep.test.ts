import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { computed, defineComponent, h, ref } from 'vue'
import type { Presentation } from '@/api/types'
import type { DeckProgress } from '@/components/create/wizard/progress'
import { provideDeckNarration, type DeckNarration } from '@/components/editor/inspector/narration/useDeckNarration'
import { provideDeckAvatars, type DeckAvatars } from '@/components/editor/inspector/video/useDeckAvatars'
import type { PipelinePhase } from '@/composables/useNarrationAvatarPipeline'
import AvatarStep from '@/components/create/steps/AvatarStep.vue'

const slide = (i: number, placeholder = false) => ({
  id: `s${i}`,
  index: i,
  layout: 'l1',
  speaker_note: `Note ${i}`,
  content: {},
  ui: placeholder ? { layers: [{ video_placeholder: true }] } : { layers: [] },
})
const deck = () =>
  ({ id: 'p1', title: 'Octopus', n_slides: 3, slides: [slide(0), slide(1), slide(2, true)] }) as unknown as Presentation

function progress(over: Partial<DeckProgress> = {}, avatarState = 'available', exportState = 'available'): DeckProgress {
  return {
    steps: {
      outline: { state: 'done', reason: null, badge: null },
      preview: { state: 'done', reason: null, badge: null },
      avatar: { state: avatarState, reason: null, badge: 'Required' },
      export: { state: exportState, reason: exportState === 'locked' ? '1 slide still needs its avatar' : null, badge: null },
    },
    avatarRequirement: 'required',
    voiceOnly: false,
    resume: 'avatar',
    ...over,
  } as DeckProgress
}

function fakes(opts: { counts?: Partial<Record<'missing' | 'ready' | 'stale' | 'translated', number>> } = {}) {
  const counts = ref({ missing: 3, ready: 0, stale: 0, translated: 0, ...opts.counts })
  const narration = {
    languages: ref([{ code: 'en-US', name: 'English' }]),
    language: ref('en-US'),
    setLanguage: vi.fn(),
    stateOf: () => 'missing',
    counts: computed(() => counts.value),
    running: ref(false),
    progress: ref(40),
  }
  const avatars = {
    videos: ref({ generation_available: true, portrait: null, videos: [] }),
    videoBySlide: ref(new Map()),
    placeholderSlides: computed(() => [slide(2, true)]),
    chipOf: () => 'no_audio',
    portraitMut: { isPending: ref(false), mutate: vi.fn() },
    running: ref(false),
    progress: ref(50),
  }
  const phase = ref<PipelinePhase>('idle')
  const running = ref(false)
  const plan = ref({ notes: false, voice: true, avatars: 1 })
  const blocker = ref<string | null>(null)
  const error = ref<string | null>(null)
  const failedPhase = ref<'notes' | 'voice' | 'avatars' | null>(null)
  const pipeline = {
    phase,
    failedPhase,
    error,
    running: computed(() => running.value),
    plan: computed(() => plan.value),
    blocker: computed(() => blocker.value),
    languageOk: computed(() => blocker.value !== 'Choose a narration language first.'),
    start: vi.fn(() => {
      running.value = true
      phase.value = 'voice'
    }),
    retry: vi.fn(),
  }
  return { counts, narration, avatars, phase, running, plan, blocker, error, failedPhase, pipeline }
}

async function mountStep(f = fakes(), prog = progress(), path = '/p/p1/create/avatar') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/p/:id/create/:step?', name: 'create', component: { template: '<div />' } },
      { path: '/p/:id', name: 'editor', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const Host = defineComponent({
    setup() {
      provideDeckNarration(f.narration as unknown as DeckNarration)
      provideDeckAvatars(f.avatars as unknown as DeckAvatars)
      return () => h(AvatarStep, { presentation: deck(), progress: prog, pipeline: f.pipeline as never })
    },
  })
  const wrapper = mount(Host, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

const status = (w: VueWrapper) => w.get('[data-testid="wizard-footer"] [role="status"]').text()
const button = (w: VueWrapper, re: RegExp) => w.findAll('button, a').find((b) => re.test(b.text()))

beforeEach(() => sessionStorage.clear())
afterEach(() => {
  document.body.innerHTML = ''
})

describe('AvatarStep', () => {
  it('generate disabled with language reason', async () => {
    const f = fakes()
    f.narration.language.value = ''
    f.blocker.value = 'Choose a narration language first.'
    const { wrapper } = await mountStep(f)
    expect(button(wrapper, /^Generate/)!.attributes('disabled')).toBeDefined()
    expect(status(wrapper)).toBe('Choose a narration language first.')
    expect(wrapper.get('[data-testid="setup-language"]').attributes('data-ok')).toBe('false')
    // The check/cross icon is announced as an image with its state.
    const icon = wrapper.get('[data-testid="setup-language"] [aria-label="To do"]')
    expect(icon.attributes('role')).toBe('img')
    expect(wrapper.find('[data-testid="tts-language"]').exists()).toBe(true)
  })

  it('portrait required only when avatars will run', async () => {
    const f = fakes()
    f.plan.value = { notes: false, voice: true, avatars: 0 }
    const { wrapper } = await mountStep(f)
    expect(wrapper.find('[data-testid="portrait-hero"]').exists()).toBe(false)
    expect(button(wrapper, /^Generate/)!.text()).toBe('Generate voice')
    expect(status(wrapper)).toBe('Will narrate 3 slides')

    const g = fakes()
    const second = await mountStep(g)
    expect(second.wrapper.find('[data-testid="portrait-hero"]').exists()).toBe(true)
    expect(second.wrapper.get('[data-testid="setup-portrait"]').attributes('data-ok')).toBe('false')
    expect(button(second.wrapper, /^Generate/)!.text()).toBe('Generate voice & avatars')
    expect(status(second.wrapper)).toBe('Will narrate 3 slides and render 1 avatar with HeyGen')
  })

  it('voice-only warning when generation unavailable', async () => {
    const f = fakes()
    f.plan.value = { notes: false, voice: true, avatars: 0 }
    const { wrapper } = await mountStep(f, progress({ voiceOnly: true, avatarRequirement: 'optional' }))
    expect(wrapper.get('[data-testid="avatar-setup"]').text()).toContain('Placeholder slides will use the voice bubble')
  })

  it('generate starts the pipeline once', async () => {
    const f = fakes()
    const { wrapper } = await mountStep(f)
    const gen = button(wrapper, /^Generate/)!
    await gen.trigger('click')
    await gen.trigger('click')
    expect(f.pipeline.start).toHaveBeenCalledTimes(1)
    expect(gen.attributes('disabled')).toBeDefined()
    expect(status(wrapper)).toContain("You can leave this page; we'll keep going.")
    expect(status(wrapper)).toContain('Recording narration')
  })

  it('segments keep finished phases done during the run', async () => {
    const f = fakes()
    f.plan.value = { notes: true, voice: true, avatars: 1 }
    const { wrapper } = await mountStep(f)
    expect(wrapper.get('[data-testid="pipeline-notes"]').attributes('data-state')).toBe('pending')
    f.running.value = true
    f.phase.value = 'voice'
    // Notes were written: the live plan no longer asks for them.
    f.plan.value = { notes: false, voice: true, avatars: 1 }
    await flushPromises()
    expect(wrapper.get('[data-testid="pipeline-notes"]').attributes('data-state')).toBe('done')
    expect(wrapper.get('[data-testid="pipeline-voice"]').attributes('data-state')).toBe('running')
    expect(wrapper.get('[data-testid="pipeline-avatars"]').attributes('data-state')).toBe('pending')
  })

  it('error makes the primary retry from the failed phase', async () => {
    const f = fakes({ counts: { missing: 0, ready: 3 } })
    f.phase.value = 'error'
    f.failedPhase.value = 'avatars'
    f.error.value = '2 slides failed'
    f.plan.value = { notes: false, voice: false, avatars: 2 }
    const { wrapper } = await mountStep(f)
    expect(wrapper.get('[role="alert"]').text()).toContain('2 slides failed')
    expect(wrapper.get('[data-testid="pipeline-avatars"]').attributes('data-state')).toBe('failed')
    // One action only: no footer Retry, no Generate next to it.
    expect(wrapper.find('[data-testid="footer-retry"]').exists()).toBe(false)
    expect(button(wrapper, /^Generate/)).toBeUndefined()
    expect(status(wrapper)).toBe('Will render 2 avatars with HeyGen')
    const primary = button(wrapper, /^Retry from Avatars$/)!
    expect(primary.attributes('disabled')).toBeUndefined()
    await primary.trigger('click')
    expect(f.pipeline.retry).toHaveBeenCalledTimes(1)
  })

  it('error retry waits for the blocker, and says why', async () => {
    const f = fakes()
    f.phase.value = 'error'
    f.failedPhase.value = 'voice'
    f.error.value = 'Interrupted, retry to continue'
    f.blocker.value = 'Choose a narration language first.'
    const { wrapper } = await mountStep(f)
    expect(button(wrapper, /^Retry from Voice$/)!.attributes('disabled')).toBeDefined()
    expect(status(wrapper)).toBe('Choose a narration language first.')
    expect(wrapper.get('[data-testid="setup-language"]').attributes('data-ok')).toBe('false')
  })

  it('avatars-only run states only the HeyGen part', async () => {
    const f = fakes({ counts: { missing: 0, ready: 3 } })
    f.plan.value = { notes: false, voice: false, avatars: 1 }
    const { wrapper } = await mountStep(f)
    expect(status(wrapper)).toBe('Will render 1 avatar with HeyGen')
    expect(button(wrapper, /^Generate/)!.text()).toBe('Generate voice & avatars')
  })

  it('stale narration offers an update', async () => {
    const f = fakes({ counts: { missing: 0, ready: 2, stale: 1 } })
    const { wrapper } = await mountStep(f)
    expect(wrapper.text()).toContain('1 slide out of date')
    // Update starts a run (HeyGen included): the status says what it will do.
    expect(status(wrapper)).toBe('Will narrate 1 slide and render 1 avatar with HeyGen')
    await button(wrapper, /^Update$/)!.trigger('click')
    expect(f.pipeline.start).toHaveBeenCalledTimes(1)
  })

  it('done shows continue to export', async () => {
    const f = fakes({ counts: { missing: 0, ready: 3 } })
    f.phase.value = 'done'
    f.plan.value = { notes: false, voice: false, avatars: 0 }
    const { wrapper, router } = await mountStep(f, progress({}, 'done'))
    expect(button(wrapper, /^Generate/)).toBeUndefined()
    const link = button(wrapper, /Fine-tune voice and avatars in the editor/)!
    expect(link.attributes('href')).toBe('/p/p1')
    await button(wrapper, /Continue to Export/)!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/export')
  })

  it('a run left at done does not hide Generate when slides have no narration (after Regenerate)', async () => {
    const f = fakes({ counts: { missing: 3, ready: 0 } })
    f.phase.value = 'done'
    f.plan.value = { notes: true, voice: true, avatars: 0 }
    const { wrapper } = await mountStep(f, progress({}, 'available'))
    expect(button(wrapper, /Continue to Export/)).toBeUndefined()
    expect(button(wrapper, /^Generate/)!.attributes('disabled')).toBeUndefined()
  })

  it('a run left at done does not hide Generate after the narration language changed', async () => {
    const f = fakes({ counts: { missing: 0, ready: 0, translated: 0, stale: 0 } })
    // New language: nothing recorded in it yet.
    f.counts.value = { missing: 3, ready: 0, stale: 0, translated: 0 }
    f.phase.value = 'done'
    f.plan.value = { notes: false, voice: true, avatars: 1 }
    const { wrapper } = await mountStep(f, progress({}, 'available'))
    expect(button(wrapper, /Continue to Export/)).toBeUndefined()
    expect(button(wrapper, /^Generate voice & avatars$/)).toBeDefined()
  })

  it('partly narrated slides offer an update for the missing ones too', async () => {
    const f = fakes({ counts: { missing: 1, ready: 2 } })
    const { wrapper } = await mountStep(f)
    expect(wrapper.get('[data-testid="setup-stale"]').text()).toContain('1 slide without narration')
    await button(wrapper, /^Update$/)!.trigger('click')
    expect(f.pipeline.start).toHaveBeenCalledTimes(1)
  })

  it('an error wins over a complete deck: Retry from the phase, not Continue', async () => {
    const f = fakes({ counts: { missing: 0, ready: 3 } })
    f.phase.value = 'error'
    f.failedPhase.value = 'avatars'
    f.error.value = '1 slide failed'
    f.plan.value = { notes: false, voice: false, avatars: 0 }
    const { wrapper } = await mountStep(f, progress({ avatarRequirement: 'optional' }, 'done'))
    expect(button(wrapper, /^Retry from Avatars$/)).toBeDefined()
    expect(button(wrapper, /Continue to Export/)).toBeUndefined()
    expect(button(wrapper, /Fine-tune voice and avatars/)).toBeUndefined()
    expect(button(wrapper, /^Skip$/)).toBeDefined()
  })

  it('a deck already complete opens on continue, not generate', async () => {
    const f = fakes({ counts: { missing: 0, ready: 3 } })
    f.plan.value = { notes: false, voice: false, avatars: 0 }
    const { wrapper } = await mountStep(f, progress({}, 'done'))
    expect(button(wrapper, /Continue to Export/)!.attributes('disabled')).toBeUndefined()
    expect(status(wrapper)).toBe('3 slides narrated · 0 with a presenter avatar')
  })

  it('leaving keeps the deck look in the query and drops the stream flag', async () => {
    const f = fakes({ counts: { missing: 0, ready: 3 } })
    f.plan.value = { notes: false, voice: false, avatars: 0 }
    const { wrapper, router } = await mountStep(f, progress({}, 'done'), '/p/p1/create/avatar?template=modern&stream=1')
    await button(wrapper, /Continue to Export/)!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.params.step).toBe('export')
    expect(router.currentRoute.value.query).toEqual({ template: 'modern' })
  })

  it('optional shows skip', async () => {
    const f = fakes()
    f.plan.value = { notes: false, voice: true, avatars: 0 }
    const { wrapper, router } = await mountStep(f, progress({ avatarRequirement: 'optional' }))
    await button(wrapper, /^Skip$/)!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/export')
  })
})
