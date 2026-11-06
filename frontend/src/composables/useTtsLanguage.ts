import { computed, reactive, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { listTtsLanguages, type TtsLanguage } from '@/api/tts'
import type { Presentation } from '@/api/types'

/** Last language chosen on any deck. */
export const TTS_LANG_KEY = 'presenton.tts.lang'
export const ttsLangKey = (deckId: string) => `${TTS_LANG_KEY}.${deckId}`

/**
 * Module-level so every component on the page sees a change at once, keyed by deck. Storage is the
 * source of truth; this map is what makes a change reactive (and keeps it when storage is unavailable).
 */
const chosen = reactive<Record<string, string>>({})
let storageFailed = false

const read = (key: string): string => {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function matchDeckLanguage(list: TtsLanguage[], deckLanguage: string | null | undefined): string {
  const wanted = deckLanguage?.trim().toLowerCase()
  if (!wanted) return ''
  const hit =
    list.find((l) => l.code.toLowerCase() === wanted || l.name.toLowerCase() === wanted) ??
    list.find((l) => l.code.toLowerCase().split('-')[0] === wanted)
  return hit?.code ?? ''
}

/**
 * The one narration language of a deck, shared by the Narration tab, the video tab, the MP4 export,
 * the slide status dots and the narrated preview.
 *
 * Order: the language chosen for this deck; else the deck's own `language` matched against the TTS
 * list (by code or name); else the last language chosen anywhere; else English. The first list entry
 * is never used blindly (it is Italian). While the list is still loading and nothing is stored the
 * language is '' (callers treat that as "not ready").
 */
export function useTtsLanguage(deckId: Ref<string>, deck: Ref<Presentation | undefined>) {
  const { data: languages, isError } = useQuery({ queryKey: ['tts-languages'], queryFn: listTtsLanguages, staleTime: Infinity })

  const language = computed(() => {
    const id = deckId.value
    const inMemory = chosen[id] // read first: this is the dependency that a change in another component triggers
    const stored = read(ttsLangKey(id)) || (storageFailed ? inMemory : '')
    if (stored) return stored
    const list = languages.value
    if (!list && !isError.value) return ''
    const fromDeck = matchDeckLanguage(list ?? [], deck.value?.language)
    if (fromDeck) return fromDeck
    const last = read(TTS_LANG_KEY)
    if (last) return last
    return (list ?? []).find((l) => l.code.toLowerCase() === 'en')?.code ?? (list ?? []).find((l) => l.code.toLowerCase().startsWith('en'))?.code ?? 'en'
  })

  function setLanguage(code: string) {
    if (!code) return
    chosen[deckId.value] = code
    try {
      localStorage.setItem(ttsLangKey(deckId.value), code)
      localStorage.setItem(TTS_LANG_KEY, code)
    } catch {
      storageFailed = true // private mode: the choice lives for this page
    }
  }

  return { language, setLanguage }
}
