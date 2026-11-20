import { computed, ref, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import type { TemplateSummary } from '@/api/templates'
import type { Presentation } from '@/api/types'
import { blockTemplateId } from '@/slide-editor/insert/templateBlocks'

/** The template (and optional theme) a deck was created with, remembered per deck. */
export interface DeckLook {
  template: string
  theme?: string
}

export const deckLookKey = (presentationId: string) => `slideshows.deckLook.${presentationId}`

/** Bumped on every write, so computeds reading the record see a pick made elsewhere in the app. */
const version = ref(0)

export function readDeckLook(presentationId: string): DeckLook | null {
  void version.value
  try {
    const raw = localStorage.getItem(deckLookKey(presentationId))
    if (!raw) return null
    const v = JSON.parse(raw) as { template?: unknown; theme?: unknown }
    if (typeof v.template !== 'string' || !v.template) return null
    return { template: v.template, ...(typeof v.theme === 'string' && v.theme ? { theme: v.theme } : {}) }
  } catch {
    return null
  }
}

export function rememberDeckLook(presentationId: string, look: DeckLook) {
  try {
    localStorage.setItem(deckLookKey(presentationId), JSON.stringify(look))
  } catch {
    // Storage unavailable: the Outline step falls back to the slides' template, or asks for one.
  }
  version.value++
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

/**
 * Which template and theme generate this deck's slides: `?template=`/`?theme=`, else the deck's remembered
 * record (written when it was created), else (template only) the template its slides were built from.
 * A candidate the loaded template list doesn't know falls through to the next. `null` = still unknown: the
 * Outline step then asks for one.
 */
export function useDeckLook(
  id: Ref<string>,
  presentation: Ref<Presentation>,
  templates: Ref<TemplateSummary[] | undefined>,
) {
  const route = useRoute()

  const record = computed(() => readDeckLook(id.value))
  const queryTemplate = computed(() => str(route.query.template))
  const queryTheme = computed(() => str(route.query.theme))

  const candidates = computed(() =>
    [queryTemplate.value, record.value?.template ?? null, blockTemplateId(presentation.value.slides)].filter(
      (t): t is string => !!t,
    ),
  )
  /** Until the list loads, the first candidate; then the first one the list has. */
  const templateId = computed<string | null>(() => {
    const list = templates.value
    if (!list) return candidates.value[0] ?? null
    return candidates.value.find((t) => list.some((x) => x.id === t)) ?? null
  })
  // The query names a look as a whole: a template there without a theme means the template's own colours.
  const themeId = computed<string | null>(() =>
    queryTemplate.value ? queryTheme.value : (queryTheme.value ?? record.value?.theme ?? null),
  )

  /** Remember the resolved look in the deck's record. */
  function sync() {
    const template = templateId.value
    if (!template) return
    const theme = themeId.value ?? undefined
    const stored = record.value
    if (stored?.template !== template || stored?.theme !== theme) rememberDeckLook(id.value, { template, ...(theme && { theme }) })
  }

  /** The user picked a template for a deck that had none known. */
  function pick(template: string) {
    const theme = themeId.value ?? undefined
    rememberDeckLook(id.value, { template, ...(theme && { theme }) })
  }

  return { templateId, themeId, sync, pick }
}
