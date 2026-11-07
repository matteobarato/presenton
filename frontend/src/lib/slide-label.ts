import type { Slide } from '@/api/types'

type Node = Record<string, unknown>

const clean = (text: string) => text.replace(/\s+/g, ' ').trim()

function runsText(node: Node): string {
  const runs = node.runs
  if (Array.isArray(runs)) return clean(runs.map((r) => (r && typeof r === 'object' ? String((r as Node).text ?? '') : '')).join(''))
  return typeof node.text === 'string' ? clean(node.text) : ''
}

/** The largest non-decorative text on a template-v2 slide: its heading. */
function largestText(ui: unknown): string {
  let best = { size: -1, text: '' }
  const walk = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(walk)
    if (!value || typeof value !== 'object') return
    const node = value as Node
    if (node.type === 'text' && node.decorative !== true) {
      const text = runsText(node)
      const size = Number((node.font as Node | undefined)?.size ?? 0)
      if (text && size > best.size) best = { size, text }
    }
    Object.values(node).forEach(walk)
  }
  walk(ui)
  return best.text
}

function htmlHeading(html: string): string {
  const match = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(html)
  return match ? clean(match[1]!.replace(/<[^>]+>/g, ' ')) : ''
}

function layoutName(layout: string | null | undefined): string {
  const tail = String(layout ?? '').split(':').pop() ?? ''
  const words = tail.replace(/[-_]+/g, ' ').trim()
  return words ? words[0]!.toUpperCase() + words.slice(1) : ''
}

/** A short human name for a slide, for the storyboard caption and canvas status row. */
export function slideLabel(slide: Slide | null | undefined): string {
  if (!slide) return ''
  const content = slide.content as Node | null | undefined
  const fromContent = content && typeof content.title === 'string' ? clean(content.title) : ''
  return (
    fromContent ||
    largestText(slide.ui) ||
    (slide.html_content ? htmlHeading(slide.html_content) : '') ||
    layoutName(slide.layout) ||
    'Untitled slide'
  )
}
