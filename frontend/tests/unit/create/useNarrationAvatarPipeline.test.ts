import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, h, nextTick, ref } from 'vue'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { ttsKeys } from '@/api/tts'
import { ApiError } from '@/api/errors'
import { useNarrationAvatarPipeline } from '@/composables/useNarrationAvatarPipeline'
import type { DeckNarration } from '@/components/editor/inspector/narration/useDeckNarration'
import type { DeckAvatars } from '@/components/editor/inspector/video/useDeckAvatars'

type Cb = { onSuccess?: (d?: unknown) => void; onError?: (e: unknown) => void }

const KEY = 'slideshows.pipeline.p1'

interface FakeSlide {
  id: string
  index: number
  speaker_note: string
  placeholder?: boolean
}

function fakes(opts: { slides?: FakeSlide[]; generationAvailable?: boolean; portrait?: boolean; language?: string } = {}) {
  const slides = ref<FakeSlide[]>(
    opts.slides ?? [
      { id: 's0', index: 0, speaker_note: '' },
      { id: 's1', index: 1, speaker_note: 'Hello', placeholder: true },
    ],
  )
  const presentation = computed(() => ({ id: 'p1', slides: slides.value }))
  /** Which slides have up-to-date audio. */
  const recorded = ref(new Set<string>())
  const narrationRunning = ref(false)
  const narrationError = ref<string | null>(null)
  const stateOf = (s: FakeSlide) => (recorded.value.has(s.id) ? 'ready' : 'missing')
  const narration = {
    language: ref(opts.language ?? 'en-US'),
    languages: ref([{ code: 'en-US', name: 'English' }]),
    running: computed(() => narrationRunning.value),
    taskError: computed(() => narrationError.value),
    stateOf,
    counts: computed(() => {
      const c = { missing: 0, ready: 0, stale: 0, translated: 0 }
      for (const s of slides.value) c[stateOf(s)]++
      return c
    }),
    canStart: computed(() => !narrationRunning.value),
    generateNotes: {
      isPending: ref(false),
      mutate: vi.fn((_v: unknown, cb?: Cb) => {
        slides.value = slides.value.map((s) => ({ ...s, speaker_note: s.speaker_note || 'Generated' }))
        cb?.onSuccess?.()
      }),
    },
    startTts: {
      isPending: ref(false),
      mutate: vi.fn((_body: unknown, cb?: Cb) => {
        narrationRunning.value = true
        cb?.onSuccess?.({ id: 't1' })
      }),
    },
  }

  const avatarsRunning = ref(false)
  const avatarsError = ref<string | null>(null)
  const videos = ref({
    generation_available: opts.generationAvailable ?? true,
    portrait: opts.portrait === false ? null : { url: '/p.png' },
    videos: [] as { slide_id: string }[],
  })
  const placeholderSlides = computed(() => slides.value.filter((s) => s.placeholder))
  const avatars = {
    videos,
    videoBySlide: computed(() => new Map(videos.value.videos.map((v) => [v.slide_id, v]))),
    planBySlide: ref(new Map<string, { state: string }>()),
    running: computed(() => avatarsRunning.value),
    taskError: computed(() => avatarsError.value),
    placeholderSlides,
    eligibleSlides: computed(() => placeholderSlides.value.filter((s) => stateOf(s) === 'ready')),
    pendingIndices: ref<number[]>([]),
    generate: {
      isPending: ref(false),
      mutate: vi.fn((_force: boolean, cb?: Cb) => {
        avatarsRunning.value = true
        cb?.onSuccess?.({ id: 'a1' })
      }),
    },
  }

  return {
    slides,
    presentation,
    recorded,
    narrationRunning,
    narrationError,
    avatarsRunning,
    avatarsError,
    videos,
    narration,
    avatars,
    /** The TTS task finishes and every slide is recorded. */
    finishTts() {
      recorded.value = new Set(slides.value.map((s) => s.id))
      narrationRunning.value = false
    },
  }
}

function setup(f = fakes()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const refetch = vi.spyOn(queryClient, 'refetchQueries').mockResolvedValue()
  let pipeline!: ReturnType<typeof useNarrationAvatarPipeline>
  mount(
    defineComponent({
      setup() {
        pipeline = useNarrationAvatarPipeline(
          ref('p1'),
          f.presentation as never,
          f.narration as unknown as DeckNarration,
          f.avatars as unknown as DeckAvatars,
        )
        return () => h('div')
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  )
  return { ...f, pipeline, refetch }
}

const stored = () => {
  const raw = sessionStorage.getItem(KEY)
  return raw ? (JSON.parse(raw) as { phase: string; startedAt: number }) : null
}

beforeEach(() => {
  sessionStorage.clear()
})

describe('useNarrationAvatarPipeline', () => {
  it('runs notes, voice, then avatars in order', async () => {
    const t = setup()
    expect(t.pipeline.plan.value).toEqual({ notes: true, voice: true, avatars: 1 })
    t.pipeline.start()
    await flushPromises()
    expect(t.narration.generateNotes.mutate).toHaveBeenCalledTimes(1)
    expect(t.narration.startTts.mutate).toHaveBeenCalledWith({}, expect.anything())
    expect(t.pipeline.phase.value).toBe('voice')
    expect(stored()?.phase).toBe('voice')
    expect(t.avatars.generate.mutate).not.toHaveBeenCalled()

    t.finishTts()
    await flushPromises()
    expect(t.refetch).toHaveBeenCalledWith({ queryKey: ttsKeys.status('p1', 'en-US') })
    expect(t.pipeline.phase.value).toBe('avatars')
    expect(t.avatars.pendingIndices.value).toEqual([1])
    expect(t.avatars.generate.mutate).toHaveBeenCalledWith(false, expect.anything())
    expect(stored()?.phase).toBe('avatars')

    t.avatarsRunning.value = false
    await flushPromises()
    expect(t.pipeline.phase.value).toBe('done')
    expect(t.pipeline.running.value).toBe(false)
    expect(stored()).toBeNull()
  })

  it('skips notes when every slide has notes', async () => {
    const t = setup(
      fakes({
        slides: [
          { id: 's0', index: 0, speaker_note: 'One' },
          { id: 's1', index: 1, speaker_note: 'Two', placeholder: true },
        ],
      }),
    )
    expect(t.pipeline.plan.value.notes).toBe(false)
    t.pipeline.start()
    await flushPromises()
    expect(t.narration.generateNotes.mutate).not.toHaveBeenCalled()
    expect(t.narration.startTts.mutate).toHaveBeenCalledTimes(1)
    expect(t.pipeline.phase.value).toBe('voice')
  })

  it('skips avatars when generation unavailable', async () => {
    const t = setup(fakes({ generationAvailable: false }))
    expect(t.pipeline.plan.value.avatars).toBe(0)
    t.pipeline.start()
    await flushPromises()
    t.finishTts()
    await flushPromises()
    expect(t.avatars.generate.mutate).not.toHaveBeenCalled()
    expect(t.pipeline.phase.value).toBe('done')
  })

  it('goes straight to done when there is nothing to do', async () => {
    const f = fakes({ slides: [{ id: 's0', index: 0, speaker_note: 'One' }] })
    f.recorded.value = new Set(['s0'])
    const t = setup(f)
    expect(t.pipeline.plan.value).toEqual({ notes: false, voice: false, avatars: 0 })
    t.pipeline.start()
    await flushPromises()
    expect(t.narration.startTts.mutate).not.toHaveBeenCalled()
    expect(t.pipeline.phase.value).toBe('done')
  })

  it('stops and reports failed phase on tts error', async () => {
    const t = setup()
    t.pipeline.start()
    await flushPromises()
    t.narrationError.value = 'TTS quota exceeded'
    t.narrationRunning.value = false
    await flushPromises()
    expect(t.pipeline.phase.value).toBe('error')
    expect(t.pipeline.failedPhase.value).toBe('voice')
    expect(t.pipeline.error.value).toBe('TTS quota exceeded')
    expect(t.avatars.generate.mutate).not.toHaveBeenCalled()
    expect(stored()).toBeNull()
  })

  it('reports a rejected mutation as a failed phase', async () => {
    const t = setup()
    t.narration.generateNotes.mutate.mockImplementationOnce((_v: unknown, cb?: Cb) => cb?.onError?.(new Error('LLM down')))
    t.pipeline.start()
    await flushPromises()
    expect(t.pipeline.phase.value).toBe('error')
    expect(t.pipeline.failedPhase.value).toBe('notes')
    expect(t.pipeline.error.value).toBe('LLM down')
  })

  it('retry restarts from failed phase', async () => {
    const t = setup()
    t.pipeline.start()
    await flushPromises()
    t.narrationError.value = 'TTS quota exceeded'
    t.narrationRunning.value = false
    await flushPromises()
    t.narrationError.value = null

    t.pipeline.retry()
    await flushPromises()
    expect(t.narration.generateNotes.mutate).toHaveBeenCalledTimes(1)
    expect(t.narration.startTts.mutate).toHaveBeenCalledTimes(2)
    expect(t.pipeline.phase.value).toBe('voice')
    expect(t.pipeline.failedPhase.value).toBeNull()
    expect(t.pipeline.error.value).toBeNull()

    t.finishTts()
    await flushPromises()
    expect(t.avatars.generate.mutate).toHaveBeenCalledTimes(1)
  })

  it('start is a no-op while running', async () => {
    const t = setup()
    t.pipeline.start()
    t.pipeline.start()
    await flushPromises()
    t.finishTts()
    await flushPromises()
    t.pipeline.start()
    await flushPromises()
    expect(t.narration.generateNotes.mutate).toHaveBeenCalledTimes(1)
    expect(t.narration.startTts.mutate).toHaveBeenCalledTimes(1)
    expect(t.avatars.generate.mutate).toHaveBeenCalledTimes(1)
  })

  it('resumes after reload and starts avatars once', async () => {
    sessionStorage.setItem(KEY, JSON.stringify({ phase: 'voice', startedAt: 1 }))
    const f = fakes({ slides: [{ id: 's1', index: 1, speaker_note: 'Hello', placeholder: true }] })
    f.narrationRunning.value = true
    const t = setup(f)
    expect(t.pipeline.phase.value).toBe('voice')
    expect(t.pipeline.running.value).toBe(true)
    await flushPromises()
    expect(t.avatars.generate.mutate).not.toHaveBeenCalled()

    t.finishTts()
    await flushPromises()
    // Watchers firing again must not start a second run.
    t.narrationRunning.value = true
    t.narrationRunning.value = false
    await flushPromises()
    t.pipeline.start()
    await flushPromises()
    expect(t.avatars.generate.mutate).toHaveBeenCalledTimes(1)
    expect(t.narration.startTts.mutate).not.toHaveBeenCalled()
    expect(stored()?.startedAt).toBe(1)
  })

  it('follows an avatar run already going when the voice phase ends, without starting one', async () => {
    const t = setup()
    t.pipeline.start()
    await flushPromises()
    t.avatarsRunning.value = true // started from the editor meanwhile
    t.finishTts()
    await flushPromises()
    expect(t.pipeline.phase.value).toBe('avatars')
    expect(t.avatars.generate.mutate).not.toHaveBeenCalled()
    t.avatarsRunning.value = false
    await flushPromises()
    expect(t.pipeline.phase.value).toBe('done')
  })

  it('a running flicker while the voice phase settles starts avatars once', async () => {
    const t = setup()
    let release!: () => void
    t.refetch.mockImplementation(() => new Promise<void>((r) => (release = r)))
    t.pipeline.start()
    await flushPromises()
    t.finishTts()
    await nextTick()
    t.narrationRunning.value = true
    await nextTick()
    t.narrationRunning.value = false
    await nextTick()
    expect(t.refetch).toHaveBeenCalledTimes(1)
    release()
    await flushPromises()
    expect(t.avatars.generate.mutate).toHaveBeenCalledTimes(1)
  })

  it('follows an avatar run that is already going on resume, without starting one', async () => {
    sessionStorage.setItem(KEY, JSON.stringify({ phase: 'avatars', startedAt: 1 }))
    const f = fakes()
    f.avatarsRunning.value = true
    const t = setup(f)
    expect(t.pipeline.phase.value).toBe('avatars')
    t.avatarsRunning.value = false
    await flushPromises()
    expect(t.avatars.generate.mutate).not.toHaveBeenCalled()
    expect(t.pipeline.phase.value).toBe('done')
  })

  it('follows an existing run when generation answers 409', async () => {
    const f = fakes({ slides: [{ id: 's1', index: 1, speaker_note: 'Hello', placeholder: true }] })
    f.recorded.value = new Set(['s1'])
    f.videos.value = { ...f.videos.value }
    f.avatars.generate.mutate.mockImplementationOnce((_force: boolean, cb?: Cb) => {
      f.avatarsRunning.value = true // useDeckAvatars starts following the task in its own onError
      cb?.onError?.(new ApiError('Conflict', 409, { detail: { task_id: 'a0' } }))
    })
    const t = setup(f)
    t.pipeline.start()
    await flushPromises()
    expect(t.pipeline.phase.value).toBe('avatars')
    t.avatarsRunning.value = false
    await flushPromises()
    expect(t.pipeline.phase.value).toBe('done')
  })

  it('reports an avatar task error', async () => {
    const t = setup()
    t.pipeline.start()
    await flushPromises()
    t.finishTts()
    await flushPromises()
    t.avatarsError.value = 'HeyGen refused'
    t.avatarsRunning.value = false
    await flushPromises()
    expect(t.pipeline.phase.value).toBe('error')
    expect(t.pipeline.failedPhase.value).toBe('avatars')
    expect(t.pipeline.error.value).toBe('HeyGen refused')
  })

  it('is running without chaining when a server task runs and no key is stored', async () => {
    const f = fakes()
    f.narrationRunning.value = true
    const t = setup(f)
    expect(t.pipeline.running.value).toBe(true)
    expect(t.pipeline.phase.value).toBe('idle')
    t.finishTts()
    await flushPromises()
    expect(t.pipeline.phase.value).toBe('idle')
    expect(t.avatars.generate.mutate).not.toHaveBeenCalled()
  })

  it('blocker asks for portrait only when avatars would run', async () => {
    const noPortrait = setup(fakes({ portrait: false }))
    expect(noPortrait.pipeline.blocker.value).toBe('Upload a presenter portrait first.')
    noPortrait.pipeline.start()
    await flushPromises()
    expect(noPortrait.narration.generateNotes.mutate).not.toHaveBeenCalled()

    const noPlaceholder = setup(fakes({ portrait: false, slides: [{ id: 's0', index: 0, speaker_note: '' }] }))
    expect(noPlaceholder.pipeline.blocker.value).toBeNull()

    const noHeygen = setup(fakes({ portrait: false, generationAvailable: false }))
    expect(noHeygen.pipeline.blocker.value).toBeNull()

    const noLanguage = setup(fakes({ portrait: false, language: '' }))
    expect(noLanguage.pipeline.blocker.value).toBe('Choose a narration language first.')
  })

  it('counts failed and missing avatar slides for retry', () => {
    const f = fakes({
      slides: [
        { id: 's0', index: 0, speaker_note: 'A', placeholder: true },
        { id: 's1', index: 1, speaker_note: 'B', placeholder: true },
        { id: 's2', index: 2, speaker_note: 'C', placeholder: true },
      ],
    })
    f.videos.value = { ...f.videos.value, videos: [{ slide_id: 's0' }, { slide_id: 's1' }] }
    f.avatars.planBySlide.value = new Map([['s1', { state: 'failed' }]])
    const t = setup(f)
    expect(t.pipeline.plan.value.avatars).toBe(2)
  })
})
