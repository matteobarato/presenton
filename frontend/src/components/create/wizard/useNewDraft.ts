import { ref, watch, type Ref } from 'vue'
import type { CreateOptions } from '@/components/create/options'

export const NEW_DRAFT_KEY = 'slideshows.newDraft'

interface Draft {
  prompt: string
  options: CreateOptions
  hadFiles: boolean
  hadPhoto: boolean
}

function read(): Partial<Draft> | null {
  try {
    const raw = sessionStorage.getItem(NEW_DRAFT_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as Partial<Draft>) : null
  } catch {
    return null
  }
}

/**
 * Keeps the /new form across a reload (sessionStorage). Restores synchronously on call, then mirrors
 * every change. Files can't be stored, so `hadFiles` (and `hadPhoto`, the presenter photo) tell the page to ask for them again.
 * The caller sets `hadFiles` as documents are added or removed.
 */
export function useNewDraft(prompt: Ref<string>, options: Ref<CreateOptions>) {
  const saved = read()
  if (saved) {
    if (typeof saved.prompt === 'string') prompt.value = saved.prompt
    if (saved.options && typeof saved.options === 'object') options.value = { ...options.value, ...saved.options }
  }
  const hadFiles = ref(saved?.hadFiles === true)
  const hadPhoto = ref(saved?.hadPhoto === true)
  const restored = !!saved
  let cleared = false

  watch(
    [prompt, options, hadFiles, hadPhoto],
    () => {
      if (cleared) return
      try {
        const draft: Draft = { prompt: prompt.value, options: options.value, hadFiles: hadFiles.value, hadPhoto: hadPhoto.value }
        sessionStorage.setItem(NEW_DRAFT_KEY, JSON.stringify(draft))
      } catch {
        // Storage unavailable: the draft just won't survive a reload.
      }
    },
    { deep: true },
  )

  function clear() {
    cleared = true
    try {
      sessionStorage.removeItem(NEW_DRAFT_KEY)
    } catch {
      // Nothing to clean up.
    }
  }

  return { clear, hadFiles, hadPhoto, restored }
}
