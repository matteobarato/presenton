// Browser glue ported from servers/nextjs/components/slide-editor/clipboard/useClipboard.ts. Changes: Vue-free
// async copy/readPayload functions instead of a React effect; the shortcut wiring lives in useEditingShortcuts.
import { clipboardPayloadForSelection } from '@/slide-editor/ops'
import type { RawUi, Selection, TemplateV2ClipboardPayload } from '@/slide-editor/model'

export type ClipboardPayload = TemplateV2ClipboardPayload

export const CLIPBOARD_MIME = 'application/x-presenton-template-v2'
export const CLIPBOARD_PREFIX = 'PRESENTON_TEMPLATE_V2:'
export const CLIPBOARD_STORAGE_KEY = 'presenton-template-v2-clipboard'
const PASTE_OFFSET = 16

let pasteSequence = 0

/** Offset for the next paste of the current clipboard content; grows so repeated pastes cascade. */
export function nextPasteOffset(): number {
  pasteSequence += 1
  return PASTE_OFFSET * pasteSequence
}

function isValidBox(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const b = value as Record<string, unknown>
  return (
    ['x', 'y', 'width', 'height'].every((k) => typeof b[k] === 'number' && Number.isFinite(b[k])) &&
    (b.width as number) > 0 &&
    (b.height as number) > 0
  )
}

function parsePayload(serialized: string): ClipboardPayload | null {
  try {
    const parsed = JSON.parse(serialized) as Partial<ClipboardPayload>
    if (parsed.format !== 'presenton/template-v2' || parsed.version !== 1 || !isValidBox(parsed.absoluteBox)) return null
    const legacy =
      parsed.kind === 'component' && parsed.data && typeof parsed.data === 'object'
    const multi =
      (parsed.kind === 'component' || parsed.kind === 'components') &&
      Array.isArray(parsed.components) &&
      parsed.components.length > 0 &&
      parsed.components.every((i) => i && typeof i.data === 'object' && i.data && isValidBox(i.absoluteBox))
    return legacy || multi ? (parsed as ClipboardPayload) : null
  } catch {
    return null
  }
}

function fromPlainText(text: string): ClipboardPayload | null {
  return text.startsWith(CLIPBOARD_PREFIX) ? parsePayload(text.slice(CLIPBOARD_PREFIX.length)) : null
}

function fromStorage(): ClipboardPayload | null {
  try {
    const stored = window.localStorage.getItem(CLIPBOARD_STORAGE_KEY)
    return stored ? parsePayload(stored) : null
  } catch {
    return null
  }
}

async function copy(ui: RawUi, sel: Selection): Promise<void> {
  const payload = clipboardPayloadForSelection(ui, sel)
  if (!payload) return
  const serialized = JSON.stringify(payload)
  const text = `${CLIPBOARD_PREFIX}${serialized}`
  pasteSequence = 0
  try {
    window.localStorage.setItem(CLIPBOARD_STORAGE_KEY, serialized)
  } catch {
    // Storage unavailable; the system clipboard still carries the payload.
  }
  try {
    const clip = navigator.clipboard
    if (clip?.write && typeof ClipboardItem !== 'undefined') {
      try {
        await clip.write([
          new ClipboardItem({
            [CLIPBOARD_MIME]: new Blob([serialized], { type: CLIPBOARD_MIME }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ])
        return
      } catch {
        // Custom MIME types are rejected by some browsers; fall back to text.
      }
    }
    await clip?.writeText?.(text)
  } catch {
    // Permissions denied: the localStorage copy still supports in-app paste.
  }
}

async function readPayload(e?: ClipboardEvent): Promise<ClipboardPayload | null> {
  const data = e?.clipboardData
  if (data) {
    try {
      const direct = data.getData(CLIPBOARD_MIME)
      if (direct) {
        const parsed = parsePayload(direct)
        if (parsed) return parsed
      }
      const parsed = fromPlainText(data.getData('text/plain'))
      if (parsed) return parsed
    } catch {
      // fall through to storage
    }
    // Foreign clipboard content (e.g. text copied elsewhere) is not ours to paste.
    if (data.types && data.types.length > 0) return null
  } else {
    try {
      const text = await navigator.clipboard?.readText?.()
      const parsed = text ? fromPlainText(text) : null
      if (parsed) return parsed
    } catch {
      // permission denied
    }
  }
  return fromStorage()
}

export function useClipboard() {
  return { copy, readPayload }
}
