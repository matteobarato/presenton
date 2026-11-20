import { useQuery } from '@tanstack/vue-query'
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { getPlayback, playbackKeys, type Playback } from '@/api/playback'
import { usePresentation } from '@/api/presentations'
import { audioSrc } from '@/api/tts'
import { useTtsLanguage } from '@/composables/useTtsLanguage'

/** How long a slide without narration stays up before the preview moves on. */
export const SILENT_SLIDE_MS = 1500
/** Slide time under autoplay when nothing sets it (a deck with no narration, or narration muted without a known length). */
export const AUTOPLAY_SLIDE_MS = 5000

type PlaybackSlide = Playback['slides'][number]
export interface AvatarRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Narrated preview: plays each slide's TTS audio and exposes the lip-synced avatar to draw.
 * TTS is the only soundtrack (the avatar video stays muted). Two independent switches:
 * - `running`: autoplay. While on, the deck moves on by itself, when the narration ends or, if it isn't
 *   being played, after a timer. While off (the default) nothing plays or advances.
 * - `audio`: whether the narration is heard while running (off = muted, avatars included).
 * Moving to the next slide is the caller's job: register a handler with `onAdvance`. The avatar is exposed
 * whether or not the deck is running, so a slide that has one always shows it.
 */
export function useNarratedPlayback(
  presentationId: Ref<string>,
  index: Ref<number>,
  { audio: audioOn, running }: { audio: Ref<boolean>; running: Ref<boolean> },
) {
  const { data: presentation } = usePresentation(presentationId)
  // The endpoint 409s on multi-language decks without a language, so always send one.
  const { language } = useTtsLanguage(presentationId, presentation)
  const { data: playback, isError } = useQuery({
    queryKey: () => playbackKeys.one(presentationId.value, language.value),
    queryFn: () => getPlayback(presentationId.value, language.value || undefined),
    enabled: () => Boolean(presentationId.value && presentation.value && language.value),
    retry: false,
  })

  const player = new Audio()
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
    if (slide?.actor !== 'video' || !slide.video?.url || !slide.placeholder) return null
    const { position, size } = slide.placeholder
    return { src: audioSrc({ url: slide.video.url }), rect: { x: position.x, y: position.y, width: size.width, height: size.height } }
  })

  /** Playback data is in, or will never come (the deck then plays on timers alone). */
  const ready = computed(() => Boolean(playback.value) || isError.value)

  function advance() {
    if (running.value) advanceHandler?.()
  }
  /** Without audio playing, a slide stays up as long as its narration lasts (when known), else a default. */
  function scheduleTimer() {
    clearTimeout(silentTimer)
    const spoken = (current.value?.duration_seconds ?? 0) * 1000
    const ms = currentAudioUrl.value ? spoken || AUTOPLAY_SLIDE_MS : available.value ? SILENT_SLIDE_MS : AUTOPLAY_SLIDE_MS
    silentTimer = setTimeout(advance, ms)
  }
  function pause() {
    clearTimeout(silentTimer)
    player.pause()
    playing.value = false
  }
  function play() {
    clearTimeout(silentTimer)
    const url = currentAudioUrl.value
    playing.value = true
    if (!url || !audioOn.value) {
      scheduleTimer()
      return
    }
    if (url !== loadedUrl) {
      loadedUrl = url
      player.src = audioSrc({ url })
    }
    const mine = ++playToken
    void Promise.resolve(player.play()).catch((error: unknown) => {
      // A newer play() or a pause() aborts this one; only a current, real failure (autoplay block) counts.
      if (mine !== playToken || (error instanceof Error && error.name === 'AbortError')) return
      playing.value = false
    })
  }
  function onEnded() {
    playing.value = false
    advance()
  }
  player.addEventListener('ended', onEnded)

  // A new slide, or a change to the sound or the data, starts the slide over (when running).
  watch(
    [audioOn, index, currentAudioUrl, ready],
    () => {
      pause()
      loadedUrl = ''
      if (running.value && ready.value) play()
    },
    { immediate: true },
  )
  // Pause keeps the narration's position; Play carries on from it.
  watch(running, (on) => {
    if (on && ready.value) play()
    else pause()
  })

  function onVisibility() {
    if (document.visibilityState === 'hidden') {
      resumeOnVisible = playing.value
      if (playing.value) pause()
    } else if (resumeOnVisible) {
      resumeOnVisible = false
      if (running.value) play()
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    pause()
    player.removeEventListener('ended', onEnded)
    player.removeAttribute?.('src')
    player.load?.()
    advanceHandler = null
  })

  return {
    playing,
    audio: player,
    avatar,
    available,
    onAdvance(fn: () => void) {
      advanceHandler = fn
    },
  }
}
