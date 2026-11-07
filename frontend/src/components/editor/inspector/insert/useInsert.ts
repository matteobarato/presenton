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
  /** Captures the active slide, for an insert that completes later. */
  function target(): InsertTarget | null {
    const slideId = ctx.slideId.value
    const ui = ctx.ui.value
    return slideId && ui ? { slideId, ui } : null
  }

  async function insert(req: InsertRequest, from?: InsertTarget | null): Promise<boolean> {
    // An open text edit is committed first, so the insert builds on the typed text.
    if (ctx.inlineEdit.value) await ctx.closeInlineEdit(true)
    const stale = !!from && from.slideId !== ctx.slideId.value
    const slideId = stale ? from!.slideId : ctx.slideId.value
    const ui = stale ? from!.ui : ctx.ui.value
    if (!slideId || !ui) return false
    const next = insertContent(ui, req)
    if (!next) return false
    const ok = ctx.commitTo(slideId, next.ui, `Insert ${req.label}`)
    // Only the active slide's selection can point at the new content.
    if (slideId === ctx.slideId.value) ctx.select(next.selection)
    return ok
  }

  const content = (elements: EditorInsertContent['elements']): EditorInsertContent => ({ elements })

  return {
    target,
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
