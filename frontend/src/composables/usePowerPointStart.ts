import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { checkFonts, prepareImport, type FontInfo, type ImportPreview } from '@/api/templateImport'
import { fontFileError, pptxFileError, uploadErrorMessage } from '@/lib/pptxUpload'

export type PowerPointPhase = 'idle' | 'checking' | 'preparing' | 'ready'

export interface PowerPointStart {
  file: Ref<File | null>
  preview: Ref<ImportPreview | null>
  phase: Ref<PowerPointPhase>
  error: Ref<string | null>
  missingFonts: Ref<FontInfo[]>
  replacements: Ref<Record<string, File>>
  /** The replacements the current preview was rendered with (the last successful `applyFonts`). */
  appliedReplacements: Ref<Record<string, File>>
  /** `slide_image_urls.length`; 0 before a preview exists. */
  slideCount: ComputedRef<number>
  /** `original_slide_count ?? slideCount`. */
  originalSlideCount: ComputedRef<number>
  selectFile(f: File): Promise<void>
  setReplacement(name: string, f: File | null): string | null
  /** Re-runs the preview with the chosen replacement fonts. */
  applyFonts(): Promise<void>
  reset(): void
}

/**
 * Step 1 of the wizard's "From PowerPoint" mode: check the deck's fonts, render a slide preview at once,
 * and let the user re-render with replacement fonts. Only the latest call's result is kept.
 */
export function usePowerPointStart(): PowerPointStart {
  const file = ref<File | null>(null)
  const preview = ref<ImportPreview | null>(null)
  const phase = ref<PowerPointPhase>('idle')
  const error = ref<string | null>(null)
  const missingFonts = ref<FontInfo[]>([])
  const replacements = ref<Record<string, File>>({})
  const appliedReplacements = ref<Record<string, File>>({})
  let ticket = 0

  const slideCount = computed(() => preview.value?.slide_image_urls.length ?? 0)
  const originalSlideCount = computed(() => preview.value?.original_slide_count ?? slideCount.value)

  async function selectFile(f: File) {
    const invalid = pptxFileError(f)
    if (invalid) {
      error.value = invalid
      return
    }
    const mine = ++ticket
    // A failed Replace must not cost the user the deck they already had.
    const before = {
      file: file.value,
      preview: preview.value,
      missingFonts: missingFonts.value,
      replacements: replacements.value,
      appliedReplacements: appliedReplacements.value,
    }
    error.value = null
    file.value = f
    missingFonts.value = []
    replacements.value = {}
    appliedReplacements.value = {}
    phase.value = 'checking'
    try {
      const missing = (await checkFonts(f)) ?? []
      if (mine !== ticket) return
      missingFonts.value = missing
      phase.value = 'preparing'
      const prepared = await prepareImport(f, [])
      if (mine !== ticket) return
      preview.value = prepared
      phase.value = 'ready'
    } catch (e) {
      if (mine !== ticket) return
      error.value = uploadErrorMessage(e, 'prepareFailed')
      file.value = before.file
      preview.value = before.preview
      missingFonts.value = before.missingFonts
      replacements.value = before.replacements
      appliedReplacements.value = before.appliedReplacements
      phase.value = before.preview ? 'ready' : 'idle'
    }
  }

  function setReplacement(name: string, f: File | null): string | null {
    const next = { ...replacements.value }
    if (!f) {
      delete next[name]
      replacements.value = next
      return null
    }
    const invalid = fontFileError(f)
    if (invalid) return invalid
    next[name] = f
    replacements.value = next
    return null
  }

  async function applyFonts() {
    const f = file.value
    if (!f) return
    const mine = ++ticket
    error.value = null
    phase.value = 'preparing'
    const sent = { ...replacements.value }
    const fonts = Object.entries(sent).map(([name, font]) => ({ name, file: font }))
    try {
      const prepared = await prepareImport(f, fonts)
      if (mine !== ticket) return
      preview.value = prepared
      appliedReplacements.value = sent
      phase.value = 'ready'
    } catch (e) {
      if (mine !== ticket) return
      error.value = uploadErrorMessage(e, 'prepareFailed')
      // The earlier preview is still valid and stays on screen.
      phase.value = preview.value ? 'ready' : 'idle'
    }
  }

  function reset() {
    ticket++
    file.value = null
    preview.value = null
    phase.value = 'idle'
    error.value = null
    missingFonts.value = []
    replacements.value = {}
    appliedReplacements.value = {}
  }

  return { file, preview, phase, error, missingFonts, replacements, appliedReplacements, slideCount, originalSlideCount, selectFile, setReplacement, applyFonts, reset }
}
