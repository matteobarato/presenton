import { useQuery } from '@tanstack/vue-query'
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { getPlayback, playbackKeys, type Playback } from '@/api/playback'
import { usePresentation } from '@/api/presentations'
import { audioSrc } from '@/api/tts'

const LANG_KEY = 'presenton.tts.lang'
/** How long a slide without narration stays up before the preview moves on. */
export const SILENT_SLIDE_MS = 1500

type PlaybackSlide = Playback['slides'][number]
export interface AvatarRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Narrated preview: plays each slide's TTS audio and exposes the lip-synced avatar to draw.
 * TTS is the only soundtrack (the avatar video stays muted). Moving to the next slide is the
 * caller's job: register a handler with `onAdvance`.
 */
export function useNarratedPlayback(presentationId: Ref<string>, index: Ref<number>, enabled: Ref<boolean>) {
  const { data: presentation } = usePresentation(presentationId)
  // The endpoint 409s on multi-language decks without a language, so always send one.
  const language = computed(() => localStorage.getItem(LANG_KEY) || presentation.value?.language || '')
  const { data: playback, isError } = useQuery({
    queryKey: () => playbackKeys.one(presentationId.value, language.value),
    queryFn: () => getPlayback(presentationId.value, language.value || undefined),
    enabled: () => Boolean(presentationId.value && presentation.value),
    retry: false,
  })

  const audio = new Audio()
  const playing = ref(false)
  let advanceHandler: (() => void) | null = null
  let silentTimer: ReturnType<typeof setTimeout> | undefined
  let resumeOnVisible = false
  let loadedUrl = ''
  let playToken = 0

  const current = computed<PlaybackSlide | undefined>(() => playback.value?.slides.find((s) => s.slide_index === index.value))
  const currentAudioUrl = computed(() => current.value?.audio?.url ?? '')
  /** True when at least one slide can be heard; otherwise the narration toggle has nothing to offer. */
  const available = computed(() => !isError.value && Boolean(playback.value?.slides.some((s) => s.audio?.url)))

  const avatar = computed<{ src: string; rect: AvatarRect } | null>(() => {
    const slide = current.value
    if (!enabled.value || slide?.actor !== 'video' || !slide.video?.url || !slide.placeholder) return null
    const { position, size } = slide.placeholder
    return { src: audioSrc({ url: slide.video.url }), rect: { x: position.x, y: position.y, width: size.width, height: size.height } }
  })

  function advance() {
    advanceHandler?.()
  }
  function pause() {
    clearTimeout(silentTimer)
    audio.pause()
    playing.value = false
  }
  function play() {
    clearTimeout(silentTimer)
    const url = currentAudioUrl.value
    playing.value = true
    if (!url) {
      silentTimer = setTimeout(advance, SILENT_SLIDE_MS)
      return
    }
    if (url !== loadedUrl) {
      loadedUrl = url
      audio.src = audioSrc({ url })
    }
    const mine = ++playToken
    void Promise.resolve(audio.play()).catch((error: unknown) => {
      // A newer play() or a pause() aborts this one; only a current, real failure (autoplay block) counts.
      if (mine !== playToken || (error instanceof Error && error.name === 'AbortError')) return
      playing.value = false
    })
  }
  function toggle() {
    if (playing.value) pause()
    else play()
  }

  function onEnded() {
    playing.value = false
    advance()
  }
  audio.addEventListener('ended', onEnded)

  // Start (or restart) whenever narration is on and the slide, or the data it depends on, changes.
  watch(
    [enabled, index, currentAudioUrl, () => Boolean(playback.value)],
    () => {
      pause()
      loadedUrl = ''
      if (enabled.value && playback.value) play()
    },
    { immediate: true },
  )

  function onVisibility() {
    if (document.visibilityState === 'hidden') {
      resumeOnVisible = playing.value
      if (playing.value) pause()
    } else if (resumeOnVisible) {
      resumeOnVisible = false
      if (enabled.value) play()
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    pause()
    audio.removeEventListener('ended', onEnded)
    audio.removeAttribute?.('src')
    audio.load?.()
    advanceHandler = null
  })

  return {
    playing,
    audio,
    avatar,
    available,
    toggle,
    onAdvance(fn: () => void) {
      advanceHandler = fn
    },
  }
}
