import type { ComputedRef } from 'vue'
import type { TemplateTheme } from '@/render/legacy/lib/template-theme'
import type { TemplateBlock } from '@/slide-editor/insert/templateBlocks'
import {
  createElementInsertElements,
  createImageInsertContent,
  createTextInsertElements,
  type EditorInsertContent,
} from '@/slide-editor/insert/insert-elements'
import type { RawUi } from '@/slide-editor/model'
import { insertContent, type InsertRequest } from '@/slide-editor/ops'
import type { SlideEditing } from '@/slide-editor/useSlideEditing'

/** Where an insert goes when it was started earlier (the image picker): that slide and its ui then. */
export type InsertTarget = { slideId: string; ui: RawUi }

/** Inserts into the active slide as one undoable commit, then selects what was added. */
export function useInsert(ctx: SlideEditing, theme: ComputedRef<TemplateTheme>) {
  /**
   * Commits an open inline edit and captures the active slide with its ui, both synchronously:
   * the commit puts the edited ui in the draft before its first await, so the capture includes it.
   * The edit's save is not awaited (saves are serialized per deck), and its failure is its own to report.
   */
  function capture(): { target: InsertTarget | null } {
    if (ctx.inlineEdit.value) ctx.closeInlineEdit(true).catch(() => {})
    const slideId = ctx.slideId.value
    const ui = ctx.ui.value
    return { target: slideId && ui ? { slideId, ui } : null }
  }

  /** Inserts into the slide active now, or into `from` (captured earlier, e.g. when the image picker opened). */
  async function insert(req: InsertRequest, from?: InsertTarget | null): Promise<boolean> {
    let target = from ?? null
    // A target captured earlier on the slide still active builds on its current ui (it may have changed since).
    if (target && target.slideId === ctx.slideId.value && ctx.ui.value) target = { slideId: target.slideId, ui: ctx.ui.value }
    // Committed right away, so a second insert during the edit's save builds on this one.
    if (!target) target = capture().target
    if (!target) return false
    const next = insertContent(target.ui, req)
    if (!next) return false
    const ok = ctx.commitTo(target.slideId, next.ui, `Insert ${req.label}`)
    // Only the active slide's selection can point at the new content.
    if (target.slideId === ctx.slideId.value) ctx.select(next.selection)
    return ok
  }

  const content = (elements: EditorInsertContent['elements']): EditorInsertContent => ({ elements })

  return {
    capture,
    insert,
    text: (kind: string, label: string) => insert({ content: content(createTextInsertElements(kind, theme.value)), label }),
    shape: (kind: string, label: string) => insert({ content: content(createElementInsertElements(kind, theme.value)), label }),
    image: (kind: string, label: string, src?: string, from?: InsertTarget | null) => {
      const built = createImageInsertContent(kind, theme.value)
      const withSrc =
        src && built.elements?.[0] ? { ...built, elements: [{ ...built.elements[0], data: src }, ...built.elements.slice(1)] } : built
      return insert({ content: withSrc as EditorInsertContent, label }, from)
    },
    block: (variant: TemplateBlock, label = variant.title) => insert({ block: variant.raw, label }),
  }
}
