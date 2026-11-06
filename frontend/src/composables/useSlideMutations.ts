import type { Ref } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { toast } from '@/components/ui/sonner'
import { presentationKeys, updatePresentation } from '@/api/presentations'
import type { Presentation, Slide } from '@/api/types'
import { useEditorStore } from '@/stores/editor'
import { useHistoryStore } from '@/stores/history'

export const MAX_SLIDES = 50
export const BLANK_SLIDE_LAYOUT_ID = '__blank_slide__'
const BLANK_LAYOUT = {
  id: BLANK_SLIDE_LAYOUT_ID,
  description: 'Empty slide.',
  background: '#FFFFFF',
  components: [],
  elements: [
    {
      type: 'vector',
      shape: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 1280, y: 0 },
        { x: 1280, y: 720 },
        { x: 0, y: 720 },
      ],
      closed: true,
      fill: { color: '#FFFFFF' },
      decorative: true,
    },
  ],
}

/** A layout chosen in the picker. `null` to `addSlide` means a blank slide. */
export interface NewSlideLayout {
  id: string
  ui: Record<string, unknown>
  /** Template id the slide belongs to; defaults to the deck's current one. */
  group?: string
}

const reindex = (slides: Slide[]): Slide[] => slides.map((s, index) => (s.index === index ? s : { ...s, index }))

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

/** Template id the deck was built from, as in NewSlide.tsx: slide `layout_group`, else the `layout` prefix. */
export function deckTemplateId(slides: Slide[]): string {
  for (const s of slides) {
    const group = s.layout_group?.trim()
    if (group && group !== 'blank' && group !== 'smart-html') return group
    const prefix = s.layout?.split(':')[0]
    if (prefix && prefix !== BLANK_SLIDE_LAYOUT_ID) return prefix
  }
  return ''
}

/**
 * Structural slide edits. Each one applies optimistically to the
 * `['presentation', id]` cache, saves the full re-indexed `slides` array
 * (PATCH /update replaces by slide id and deletes omitted ones), registers an
 * undo command and rolls back with a toast on failure.
 *
 * `theme` is always resent: the endpoint resets it to null when omitted.
 */
export function useSlideMutations(presentationId: Ref<string>) {
  const queryClient = useQueryClient()
  const history = useHistoryStore()
  const editor = useEditorStore()

  const key = () => presentationKeys.one(presentationId.value)
  const current = () => queryClient.getQueryData<Presentation>(key())

  /** Optimistically write `slides`; restore the cache and rethrow if saving fails. */
  async function persist(slides: Slide[]): Promise<void> {
    const before = current()
    if (!before) throw new Error('Presentation is not loaded')
    const next = reindex(slides)
    queryClient.setQueryData<Presentation>(key(), { ...before, slides: next })
    try {
      await updatePresentation({
        id: presentationId.value,
        slides: next,
        theme: before.theme ?? undefined,
      })
    } catch (error) {
      queryClient.setQueryData<Presentation>(key(), before)
      throw error
    }
  }

  const slides = () => current()?.slides ?? []

  /** Run `redo` once, record it with `undo`, and surface failures as a toast. */
  async function commit(label: string, redo: () => Promise<void>, undo: () => Promise<void>): Promise<boolean> {
    try {
      await redo()
    } catch (error) {
      toast.error(`Could not ${label.toLowerCase()}`, { description: error instanceof Error ? error.message : undefined })
      return false
    }
    history.push({ label, do: redo, undo })
    return true
  }

  async function reorder(from: number, to: number) {
    const list = slides()
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return
    await commit(
      'Reorder slides',
      () => persist(move(slides(), from, to)),
      () => persist(move(slides(), to, from)),
    )
  }

  async function removeSlide(id: string) {
    const list = slides()
    const index = list.findIndex((s) => s.id === id)
    if (index < 0 || list.length <= 1) return
    const removed = list[index]!
    const neighbour = list[index + 1] ?? list[index - 1]!
    const ok = await commit(
      'Delete slide',
      () => persist(slides().filter((s) => s.id !== id)),
      () => {
        const at = Math.min(index, slides().length)
        return persist([...slides().slice(0, at), removed, ...slides().slice(at)])
      },
    )
    if (ok && editor.activeSlideId === id) editor.select(neighbour.id ?? null)
  }

  async function insert(label: string, at: number, make: () => Slide) {
    if (slides().length >= MAX_SLIDES) {
      toast.warning('Slide limit reached', { description: `You can have up to ${MAX_SLIDES} slides.` })
      return
    }
    const created = make()
    const ok = await commit(
      label,
      () => persist([...slides().slice(0, at), created, ...slides().slice(at)]),
      () => persist(slides().filter((s) => s.id !== created.id)),
    )
    if (ok) editor.select(created.id ?? null)
  }

  async function duplicateSlide(id: string) {
    const index = slides().findIndex((s) => s.id === id)
    if (index < 0) return
    const source = slides()[index]!
    await insert('Duplicate slide', index + 1, () => ({
      ...JSON.parse(JSON.stringify(source)),
      id: crypto.randomUUID(),
      index: index + 1,
    }))
  }

  /** Insert a slide after `afterIndex` (-1 for the very start). `null` adds a blank slide. */
  async function addSlide(afterIndex: number, layout: NewSlideLayout | null) {
    const list = slides()
    const at = Math.min(Math.max(afterIndex + 1, 0), list.length)
    await insert('Add slide', at, () => ({
      id: crypto.randomUUID(),
      presentation: presentationId.value,
      index: at,
      content: {},
      ui: (layout?.ui ?? JSON.parse(JSON.stringify(BLANK_LAYOUT))) as Record<string, unknown>,
      layout_group: layout?.group ?? deckTemplateId(list),
      layout: layout?.id ?? BLANK_SLIDE_LAYOUT_ID,
      properties: null,
    }))
  }

  async function rename(title: string) {
    const next = title.trim()
    const before = current()
    if (!before || !next || next === before.title) return
    const previous = before.title ?? ''
    const save = async (value: string) => {
      const base = current()
      if (!base) throw new Error('Presentation is not loaded')
      queryClient.setQueryData<Presentation>(key(), { ...base, title: value })
      try {
        await updatePresentation({ id: presentationId.value, title: value, theme: base.theme ?? undefined })
      } catch (error) {
        queryClient.setQueryData<Presentation>(key(), base)
        throw error
      }
    }
    await commit(
      'Rename presentation',
      () => save(next),
      // The endpoint ignores empty titles, so an untitled deck keeps the new name.
      () => (previous ? save(previous) : Promise.resolve()),
    )
  }

  return { reorder, removeSlide, duplicateSlide, addSlide, rename }
}
