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
/** Three slides, the last one a presenter slide; `notes` = how many of them have speaker notes. */
const deck = (notes = 3) => {
  const slides = [slide(0), slide(1), slide(2, true)].map((s, i) => ({ ...s, speaker_note: i < notes ? s.speaker_note : '' }))
  return { id: 'p1', title: 'Octopus', n_slides: 3, slides } as unknown as Presentation
}

function progress(over: Partial<DeckProgress> = {}, avatarState = 'available'): DeckProgress {
  return {
    steps: {
      outline: { state: 'done', reason: null },
      preview: { state: 'done', reason: null },
      avatar: { state: avatarState, reason: null },
      export: { state: 'available', reason: null },
    },
    voiceOnly: false,
    missing: { narration: 0, presenterVideos: 0 },
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

const editSetup = vi.fn()
async function mountStep(f = fakes(), prog = progress(), path = '/p/p1/create/avatar', presentation = deck()) {
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
      return () => h(AvatarStep, { presentation, progress: prog, pipeline: f.pipeline as never, onEditSetup: editSetup })
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

const state = (w: VueWrapper, k: 'notes' | 'voice' | 'avatars') => w.get(`[data-testid="pipeline-${k}"]`).attributes('data-state')
const ring = (w: VueWrapper) => w.get('[role="progressbar"]')
const heading = (w: VueWrapper) => w.get('[data-testid="avatar-progress"] h3').text()

describe('AvatarStep is generation only', () => {
  it('has no language or portrait controls, and sends the user to the Topic step chips when something is missing', async () => {
    const f = fakes()
    f.blocker.value = 'Add a presenter photo first, under Presenter and language.'
    const { wrapper } = await mountStep(f)
    expect(wrapper.find('[data-testid="setup-language"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="setup-portrait"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="avatar-progress"]').exists()).toBe(true)
    expect(button(wrapper, /^Narrate/)!.attributes('disabled')).toBeDefined()
    expect(status(wrapper)).toContain('Add a presenter photo first, under Presenter and language.')
    await button(wrapper, /Set up presenter and language/)!.trigger('click')
    expect(editSetup).toHaveBeenCalledTimes(1)
  })
})

describe('AvatarStep reads the deck when idle', () => {
  it('a deck with nothing saved: 0%, "Ready to narrate", every row pending, scope in the button', async () => {
    const f = fakes()
    f.plan.value = { notes: true, voice: true, avatars: 1 }
    const { wrapper } = await mountStep(f, progress(), undefined, deck(0))
    expect(heading(wrapper)).toBe('Ready to narrate')
    expect(ring(wrapper).attributes('aria-valuenow')).toBe('0')
    expect(['notes', 'voice', 'avatars'].map((k) => state(wrapper, k as 'notes'))).toEqual(['pending', 'pending', 'pending'])
    expect(button(wrapper, /^Narrate/)!.text()).toBe('Narrate 3 slides + 1 presenter video')
  })

  it('a partly narrated deck shows partial progress, what is left, and names that scope', async () => {
    // 2 of 3 narrated, notes everywhere, the presenter video still to render.
    const f = fakes({ counts: { missing: 1, ready: 2 } })
    f.plan.value = { notes: false, voice: true, avatars: 1 }
    const { wrapper } = await mountStep(f)
    expect(state(wrapper, 'notes')).toBe('done')
    expect(state(wrapper, 'voice')).toBe('partial')
    expect(state(wrapper, 'avatars')).toBe('pending')
    expect(wrapper.get('[data-testid="pipeline-voice"]').text()).toContain('2 of 3 slides narrated in English')
    // (100 + 67 + 0) / 3
    expect(ring(wrapper).attributes('aria-valuenow')).toBe('56')
    expect(ring(wrapper).text()).toBe('56%')
    expect(heading(wrapper)).toBe('1 slide left to narrate')
    expect(button(wrapper, /^Narrate/)!.text()).toBe('Narrate 1 remaining slide + 1 presenter video')
  })

  it('counts stale narration as left to do, and translated as done', async () => {
    const f = fakes({ counts: { missing: 0, ready: 1, translated: 1, stale: 1 } })
    f.plan.value = { notes: false, voice: true, avatars: 0 }
    const { wrapper } = await mountStep(f, progress({ voiceOnly: true }))
    expect(wrapper.get('[data-testid="pipeline-voice"]').text()).toContain('2 of 3 slides narrated')
    expect(heading(wrapper)).toBe('1 slide left to narrate')
    expect(button(wrapper, /^Narrate/)!.text()).toBe('Narrate 1 remaining slide')
  })

  it('partial notes show their own share, and the voice follows', async () => {
    const f = fakes({ counts: { missing: 3, ready: 0 } })
    f.plan.value = { notes: true, voice: true, avatars: 0 }
    const { wrapper } = await mountStep(f, progress({ voiceOnly: true }), undefined, deck(2))
    expect(state(wrapper, 'notes')).toBe('partial')
    expect(wrapper.get('[data-testid="pipeline-notes"]').text()).toContain('2 of 3 slides with speaker notes')
    expect(heading(wrapper)).toBe('3 slides left to narrate')
    expect(button(wrapper, /^Narrate/)!.text()).toBe('Narrate 3 slides')
  })

  it('only the presenter video left', async () => {
    const f = fakes({ counts: { missing: 0, ready: 3 } })
    f.plan.value = { notes: false, voice: false, avatars: 1 }
    const { wrapper } = await mountStep(f)
    expect(state(wrapper, 'voice')).toBe('done')
    expect(state(wrapper, 'avatars')).toBe('pending')
    expect(ring(wrapper).attributes('aria-valuenow')).toBe('67')
    expect(heading(wrapper)).toBe('1 presenter video left to render')
    expect(button(wrapper, /^Render/)!.text()).toBe('Render 1 presenter video')
  })

  it('a finished deck: all done, 100%, "Your deck is narrated", continue', async () => {
    const f = fakes({ counts: { missing: 0, ready: 3 } })
    f.plan.value = { notes: false, voice: false, avatars: 0 }
    const { wrapper } = await mountStep(f, progress({}, 'done'))
    expect(['notes', 'voice', 'avatars'].map((k) => state(wrapper, k as 'notes'))).toEqual(['done', 'done', 'done'])
    expect(heading(wrapper)).toBe('Your deck is narrated')
    expect(ring(wrapper).attributes('aria-valuenow')).toBe('100')
    expect(button(wrapper, /^Narrate/)).toBeUndefined()
    expect(button(wrapper, /Continue to Export/)!.attributes('disabled')).toBeUndefined()
  })

  it('the ring is a labelled progressbar and dimmed rows keep readable detail text', async () => {
    const f = fakes()
    f.plan.value = { notes: false, voice: true, avatars: 1 }
    const { wrapper } = await mountStep(f)
    const bar = ring(wrapper)
    expect(bar.attributes('aria-label')).toBe('Narration progress')
    expect(bar.attributes('aria-valuemin')).toBe('0')
    expect(bar.attributes('aria-valuemax')).toBe('100')
    const row = wrapper.get('[data-testid="pipeline-voice"]')
    expect(row.attributes('data-state')).toBe('pending')
    // Only the icon and bar dim; the label and detail text are never inside an opacity layer.
    expect(row.classes()).not.toContain('opacity-50')
    const detail = row.findAll('span').find((e) => e.text() === 'Narration in English')!
    expect(detail.classes()).toContain('text-muted')
    expect(detail.element.closest('.opacity-50')).toBeNull()
  })

  it('voice only: no presenter video row work, and the label does not mention one', async () => {
    const f = fakes({ counts: { missing: 3, ready: 0 } })
    f.plan.value = { notes: false, voice: true, avatars: 0 }
    const { wrapper } = await mountStep(f, progress({ voiceOnly: true }))
    expect(state(wrapper, 'avatars')).toBe('skipped')
    expect(button(wrapper, /^Narrate/)!.text()).toBe('Narrate 3 slides')
  })
})

describe('AvatarStep running and failing', () => {
  it('generate starts the pipeline once', async () => {
    const f = fakes()
    const { wrapper } = await mountStep(f)
    const gen = button(wrapper, /^Narrate/)!
    await gen.trigger('click')
    await gen.trigger('click')
    expect(f.pipeline.start).toHaveBeenCalledTimes(1)
    expect(gen.attributes('disabled')).toBeDefined()
    expect(status(wrapper)).toContain("You can leave this page; we'll keep going.")
    expect(heading(wrapper)).toBe('Bringing your deck to life')
  })

  it('segments keep finished phases done during the run', async () => {
    const f = fakes()
    f.plan.value = { notes: true, voice: true, avatars: 1 }
    const { wrapper } = await mountStep(f, progress(), undefined, deck(0))
    expect(state(wrapper, 'notes')).toBe('pending')
    f.running.value = true
    f.phase.value = 'voice'
    // Notes were written: the live plan no longer asks for them.
    f.plan.value = { notes: false, voice: true, avatars: 1 }
    await flushPromises()
    expect(state(wrapper, 'notes')).toBe('done')
    expect(state(wrapper, 'voice')).toBe('running')
    expect(state(wrapper, 'avatars')).toBe('pending')
  })

  it('error makes the primary retry from the failed phase', async () => {
    const f = fakes({ counts: { missing: 0, ready: 3 } })
    f.phase.value = 'error'
    f.failedPhase.value = 'avatars'
    f.error.value = '2 presenter videos didn’t render. Retry to render them again.'
    f.plan.value = { notes: false, voice: false, avatars: 2 }
    const { wrapper } = await mountStep(f)
    expect(heading(wrapper)).toBe('Something needs another try')
    expect(wrapper.get('[data-testid="pipeline-avatars"]').text()).toContain('2 presenter videos didn’t render')
    expect(state(wrapper, 'avatars')).toBe('failed')
    expect(button(wrapper, /^Narrate/)).toBeUndefined()
    const primary = button(wrapper, /^Retry Presenter videos$/)!
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
    expect(button(wrapper, /^Retry Voice$/)!.attributes('disabled')).toBeDefined()
    expect(status(wrapper)).toContain('Choose a narration language first.')
  })

  it('an error wins over a complete deck: Retry from the phase, not Continue', async () => {
    const f = fakes({ counts: { missing: 0, ready: 3 } })
    f.phase.value = 'error'
    f.failedPhase.value = 'avatars'
    f.error.value = '1 presenter video didn’t render. Retry to render it again.'
    f.plan.value = { notes: false, voice: false, avatars: 0 }
    const { wrapper } = await mountStep(f, progress({}, 'done'))
    expect(button(wrapper, /^Retry Presenter videos$/)).toBeDefined()
    expect(button(wrapper, /Continue to Export/)).toBeUndefined()
    expect(button(wrapper, /Fine-tune in the editor/)).toBeUndefined()
    expect(button(wrapper, /^Skip to Export$/)).toBeDefined()
  })
})

describe('AvatarStep never gates Export', () => {
  it('a finished deck continues to Export with no lock', async () => {
    const f = fakes({ counts: { missing: 0, ready: 3 } })
    f.plan.value = { notes: false, voice: false, avatars: 0 }
    const { wrapper } = await mountStep(f, progress({}, 'done'))
    expect(button(wrapper, /Continue to Export/)!.attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).not.toContain('Required')
  })
})

describe('AvatarStep after a finished run', () => {
  it('done shows continue to export', async () => {
    const f = fakes({ counts: { missing: 0, ready: 3 } })
    f.phase.value = 'done'
    f.plan.value = { notes: false, voice: false, avatars: 0 }
    const { wrapper, router } = await mountStep(f, progress({}, 'done'))
    expect(button(wrapper, /^Narrate/)).toBeUndefined()
    expect(button(wrapper, /Fine-tune in the editor/)!.attributes('href')).toBe('/p/p1')
    await button(wrapper, /Continue to Export/)!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/export')
  })

  it('a run left at done does not hide Narrate when slides have no narration (after Regenerate)', async () => {
    const f = fakes({ counts: { missing: 3, ready: 0 } })
    f.phase.value = 'done'
    f.plan.value = { notes: true, voice: true, avatars: 0 }
    const { wrapper } = await mountStep(f, progress({}, 'available'), undefined, deck(0))
    expect(button(wrapper, /Continue to Export/)).toBeUndefined()
    expect(button(wrapper, /^Narrate 3 slides$/)!.attributes('disabled')).toBeUndefined()
  })

  it('a run left at done does not hide Narrate after the narration language changed', async () => {
    const f = fakes({ counts: { missing: 3, ready: 0, stale: 0, translated: 0 } })
    f.phase.value = 'done'
    f.plan.value = { notes: false, voice: true, avatars: 1 }
    const { wrapper } = await mountStep(f, progress({}, 'available'))
    expect(button(wrapper, /Continue to Export/)).toBeUndefined()
    expect(button(wrapper, /^Narrate 3 slides \+ 1 presenter video$/)).toBeDefined()
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

  it('can always be skipped: Skip to Export', async () => {
    const f = fakes()
    f.plan.value = { notes: false, voice: true, avatars: 0 }
    const { wrapper, router } = await mountStep(f, progress({}))
    await button(wrapper, /^Skip to Export$/)!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/export')
  })
})

describe('AvatarStep footer copy', () => {
  it('states the scope of the primary, that presenter videos are paid, and why Skip to Export is safe', async () => {
    const f = fakes()
    f.plan.value = { notes: false, voice: true, avatars: 1 }
    const { wrapper } = await mountStep(f)
    // The footer keeps a short scope; the full plan sentence is a line inside the card.
    expect(status(wrapper)).toBe('Includes 1 presenter video · uses credits')
    const text = wrapper.get('[data-testid="avatar-plan"]').text()
    expect(text).toMatch(/records \d+ voice clips? in/i)
    expect(text).toContain('renders 1 presenter video')
    expect(text).toContain('paid service and use credits')
    expect(text).not.toMatch(/minutes|seconds/)
    expect(wrapper.get('[data-testid="skip-reason"]').text()).toContain('narrate later from the editor')
  })
})
