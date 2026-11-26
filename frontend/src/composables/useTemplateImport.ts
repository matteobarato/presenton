import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { ApiError, extractApiErrorMessage } from '@/api/errors'
import {
  FONT_EXTENSIONS,
  MAX_FONT_BYTES,
  MAX_PPTX_BYTES,
  checkFonts,
  prepareImport,
  readImportProgress,
  retryImport,
  startImport,
  type FontInfo,
  type ImportPreview,
  type ImportProgress,
} from '@/api/templateImport'
import { useAsyncTask } from '@/composables/useAsyncTask'
import { i18n } from '@/i18n'

export type ImportStep = 'upload' | 'preparing' | 'fonts' | 'review' | 'generating' | 'done' | 'error'

/** Keeps the running import's task id so a refresh or a return visit picks it up again. */
export const IMPORT_TASK_STORAGE_KEY = 'template-import-task'
/** The status endpoint does not return the slide previews, so they are kept beside the task id. */
const SLIDES_STORAGE_KEY = 'template-import-slides'

function readStoredSlides(taskId: string | null): string[] {
  if (!taskId) return []
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(SLIDES_STORAGE_KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object' || (parsed as { taskId?: unknown }).taskId !== taskId) return []
    const urls = (parsed as { urls?: unknown }).urls
    return Array.isArray(urls) ? urls.filter((u): u is string => typeof u === 'string') : []
  } catch {
    return []
  }
}
function storeSlides(taskId: string | null, urls: string[] = []) {
  try {
    if (taskId && urls.length) sessionStorage.setItem(SLIDES_STORAGE_KEY, JSON.stringify({ taskId, urls }))
    else sessionStorage.removeItem(SLIDES_STORAGE_KEY)
  } catch {
    // Storage unavailable: a resumed import just shows placeholders.
  }
}

const t = (key: string) => i18n.global.t(`templates.import.errors.${key}`)

function messageOf(e: unknown, fallbackKey: string): string {
  const fallback = t(fallbackKey)
  return e instanceof ApiError ? extractApiErrorMessage(e.body, e.message || fallback, e.status) : fallback
}

const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}
const baseName = (name: string) => {
  const dot = name.lastIndexOf('.')
  return (dot > 0 ? name.slice(0, dot) : name).trim()
}

/**
 * The PowerPoint → template flow: upload, optional missing-font replacements, preview review, then one
 * server-side task (`template.create`) polled until it finishes. The task survives leaving the page.
 */
export function useTemplateImport(opts: { initialTaskId?: string | null; onDone?: (templateId: string) => void } = {}): {
  step: Ref<ImportStep>
  file: Ref<File | null>
  missingFonts: Ref<FontInfo[]>
  replacements: Ref<Record<string, File>>
  preview: Ref<ImportPreview | null>
  name: Ref<string>
  description: Ref<string>
  error: Ref<string | null>
  busy: Ref<boolean>
  progress: ComputedRef<ImportProgress>
  /** One preview image per slide: this session's preview, or the one remembered for a resumed task. */
  slideImages: ComputedRef<string[]>
  taskError: ComputedRef<string | null>
  /** What the Generating/error step shows: a failed action (e.g. retry) wins over the task's own error. */
  displayError: ComputedRef<string | null>
  selectFile(f: File): Promise<void>
  setReplacement(fontName: string, f: File | null): string | null
  continueFromFonts(): Promise<void>
  create(): Promise<void>
  retry(): Promise<void>
  reset(): void
} {
  const step = ref<ImportStep>('upload')
  const file = ref<File | null>(null)
  const missingFonts = ref<FontInfo[]>([])
  const replacements = ref<Record<string, File>>({})
  const preview = ref<ImportPreview | null>(null)
  const name = ref('')
  const description = ref('')
  const error = ref<string | null>(null)
  const busy = ref(false)

  const taskId = ref<string | null>(opts.initialTaskId || null)
  // Only a completion the user is waiting for opens the template: one adopted from a link, started here,
  // or seen running on this page. An import that finished while they were elsewhere is just forgotten.
  let watching = !!opts.initialTaskId
  const async = useAsyncTask(taskId, {
    storageKey: IMPORT_TASK_STORAGE_KEY,
    onDone: (task) => {
      const id = readImportProgress(task).templateId
      // A finished import is not resumed on the next visit.
      async.clear()
      storeSlides(null)
      if (!watching) {
        step.value = 'upload'
        return
      }
      step.value = 'done'
      if (id) opts.onDone?.(id)
    },
  })
  watch(
    () => async.task.value?.status,
    (status) => {
      if (status === 'pending') watching = true
    },
    { flush: 'sync' },
  )
  const progress = computed(() => readImportProgress(async.task.value))
  const storedSlides = ref<string[]>(readStoredSlides(taskId.value))
  const slideImages = computed(() => preview.value?.slide_image_urls ?? storedSlides.value)

  if (taskId.value) step.value = 'generating'

  watch(async.status, (status) => {
    if (status === 'error') step.value = 'error'
    else if (status === 'pending' && step.value === 'error') step.value = 'generating'
    else if (status === 'idle' && (step.value === 'generating' || step.value === 'error')) step.value = 'upload'
  })

  async function prepare(from: ImportStep) {
    if (!file.value) return
    step.value = 'preparing'
    error.value = null
    const fonts = Object.entries(replacements.value).map(([fontName, f]) => ({ name: fontName, file: f }))
    try {
      preview.value = await prepareImport(file.value, fonts)
      step.value = 'review'
    } catch (e) {
      error.value = messageOf(e, 'prepareFailed')
      step.value = from
    }
  }

  async function selectFile(f: File) {
    error.value = null
    if (extensionOf(f.name) !== '.pptx') {
      error.value = t('notPptx')
      return
    }
    if (f.size > MAX_PPTX_BYTES) {
      error.value = t('tooLarge')
      return
    }
    file.value = f
    name.value = baseName(f.name)
    missingFonts.value = []
    replacements.value = {}
    preview.value = null
    step.value = 'preparing'
    try {
      const missing = await checkFonts(f)
      if (missing?.length) {
        missingFonts.value = missing
        step.value = 'fonts'
        return
      }
    } catch (e) {
      error.value = messageOf(e, 'prepareFailed')
      step.value = 'upload'
      return
    }
    await prepare('upload')
  }

  function setReplacement(fontName: string, f: File | null): string | null {
    const next = { ...replacements.value }
    if (!f) {
      delete next[fontName]
      replacements.value = next
      return null
    }
    if (!(FONT_EXTENSIONS as readonly string[]).includes(extensionOf(f.name))) return t('fontType')
    if (f.size > MAX_FONT_BYTES) return t('fontTooLarge')
    next[fontName] = f
    replacements.value = next
    return null
  }

  async function create() {
    if (!preview.value || !name.value.trim() || busy.value) return
    busy.value = true
    error.value = null
    try {
      const task = await startImport(preview.value, { name: name.value.trim(), description: description.value.trim() })
      if (!task.id) throw new Error('Template import task has no id')
      storeSlides(task.id, preview.value.slide_image_urls)
      watching = true
      async.start(task.id)
      step.value = 'generating'
    } catch (e) {
      error.value = messageOf(e, 'startFailed')
    } finally {
      busy.value = false
    }
  }

  async function retry() {
    const id = taskId.value
    if (!id || busy.value) return
    busy.value = true
    error.value = null
    try {
      await retryImport(id)
      watching = true
      // Same id: clear first so the poller sees a change and starts over.
      async.clear()
      async.start(id)
      step.value = 'generating'
    } catch (e) {
      error.value = messageOf(e, 'retryFailed')
    } finally {
      busy.value = false
    }
  }

  function reset() {
    async.clear()
    storeSlides(null)
    storedSlides.value = []
    step.value = 'upload'
    file.value = null
    missingFonts.value = []
    replacements.value = {}
    preview.value = null
    name.value = ''
    description.value = ''
    error.value = null
    busy.value = false
  }

  return {
    step,
    file,
    missingFonts,
    replacements,
    preview,
    name,
    description,
    error,
    busy,
    progress,
    slideImages,
    taskError: async.error,
    displayError: computed(() => error.value ?? async.error.value),
    selectFile,
    setReplacement,
    continueFromFonts: () => prepare('fonts'),
    create,
    retry,
    reset,
  }
}
