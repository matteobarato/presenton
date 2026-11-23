type Target = { id: string; kind: string; text: string }

import { i18n } from '@/i18n'

const WORDS = 4

/** "Kind – first words of text" (e.g. "Title – Quarterly results"); repeated names get a number. */
export function targetNames(targets: Target[]): Map<string, string> {
  const seen = new Map<string, number>()
  const out = new Map<string, string>()
  for (const t of targets) {
    const kind = t.kind ? t.kind.charAt(0).toUpperCase() + t.kind.slice(1).replace(/[_-]+/g, ' ') : i18n.global.t('slideEditor.motion.names.element')
    const words = (t.text ?? '').trim().split(/\s+/).filter(Boolean)
    const text = words.slice(0, WORDS).join(' ') + (words.length > WORDS ? '…' : '')
    const base = text ? `${kind} – ${text}` : kind
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    out.set(t.id, n > 1 ? `${base} ${n}` : base)
  }
  return out
}
