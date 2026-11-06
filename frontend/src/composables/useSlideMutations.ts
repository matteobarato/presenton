import type { Ref } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { toast } from '@/components/ui/sonner'
import { getPresentation, presentationKeys, updatePresentation } from '@/api/presentations'
import type { Presentation, Slide } from '@/api/types'
import { slideKey, useEditorStore } from '@/stores/editor'
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

export const DELETE_NOTICE =
  'Undo restores the slide content but not its narration audio or avatar video.'

/** Per-deck tail of the save queue: only the network PATCH is serialized. */
const queues = new Map<string, Promise<void>>()

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
 * Structural slide edits. Each edit lands in the `['presentation', id]` cache
 * the moment it is called (computed from the cache as it is then), a history
 * command is recorded, and only the PATCH is queued per deck. A queued save
 * sends the cache as it is when its turn comes. When a save fails the deck is
 * refetched inside the queue, so server truth replaces the failed change.
 *
 * Edits are id-based and idempotent: a repeated delete, or an undo that finds
 * the slide already back, does nothing. `theme` is always resent: the endpoint
 * resets it to null when omitted.
 */
export function useSlideMutations(presentationId: Ref<string>) {
  const queryClient = useQueryClient()
  const history = useHistoryStore()
  const editor = useEditorStore()

  const key = () => presentationKeys.one(presentationId.value)
  const current = () => queryClient.getQueryData<Presentation>(key())

  function schedule(label: string): Promise<void> {
    const deckId = presentationId.value
    const job = async () => {
      const snapshot = queryClient.getQueryData<Presentation>(presentationKeys.one(deckId))
      if (!snapshot) return
      try {
        await updatePresentation({
          id: deckId,
          slides: reindex(snapshot.slides),
          title: snapshot.title || undefined,
          theme: snapshot.theme ?? undefined,
        })
      } catch (error) {
        toast.error(`Could not ${label.toLowerCase()}`, { description: error instanceof Error ? error.message : undefined })
        try {
          await queryClient.fetchQuery({ queryKey: presentationKeys.one(deckId), queryFn: () => getPresentation(deckId), staleTime: 0 })
        } catch {
          // Offline: the banner explains; the next successful save resyncs.
        }
      }
    }
    const next = (queues.get(deckId) ?? Promise.resolve()).then(job)
    queues.set(deckId, next)
    return next
  }

  /** Apply `edit` to the current cache now (null = nothing to do) and queue the save. */
  async function applyEdit(label: string, edit: (p: Presentation) => Presentation | null) {
    // An in-flight refetch must not land on top of the optimistic write.
    await queryClient.cancelQueries({ queryKey: key() })
    const before = current()
    const after = before && edit(before)
    if (!after) return { applied: false, saved: Promise.resolve() }
    queryClient.setQueryData<Presentation>(key(), { ...after, slides: reindex(after.slides) })
    return { applied: true, saved: schedule(label) }
  }

  const onSlides =
    (fn: (slides: Slide[]) => Slide[] | null) =>
    (p: Presentation): Presentation | null => {
      const next = fn(p.slides)
      return next && { ...p, slides: next }
    }

  /** A history body: apply, then wait for the save so undo/redo stay one at a time. */
  const body = (label: string, edit: (p: Presentation) => Presentation | null) => async () => {
    const r = await applyEdit(label, edit)
    await r.saved
  }

  /** Apply the primary edit; on success record it and wait for the save. */
  async function commit(
    label: string,
    edit: (p: Presentation) => Presentation | null,
    undo: () => Promise<void>,
    after?: () => void,
  ): Promise<boolean> {
    if (editor.generating) return false
    const r = await applyEdit(label, edit)
    if (!r.applied) return false
    after?.()
    history.push({ label, do: body(label, edit), undo })
    await r.saved
    return true
  }

  const indexOfId = (list: Slide[], id: string | undefined) => (id ? list.findIndex((s) => s.id === id) : -1)

  async function reorder(from: number, to: number) {
    // Resolve the slide by id now; later moves of other slides cannot misdirect this one.
    const id = current()?.slides[from]?.id
    if (!id || from === to) return
    let origin = from
    await commit(
      'Reorder slides',
      onSlides((l) => {
        const i = indexOfId(l, id)
        if (i < 0 || to < 0 || to >= l.length) return null
        origin = i
        return i === to ? null : move(l, i, to)
      }),
      body(
        'Reorder slides',
        onSlides((l) => {
          const i = indexOfId(l, id)
          return i < 0 || i === origin ? null : move(l, i, Math.min(origin, l.length - 1))
        }),
      ),
    )
  }

  async function removeSlide(id: string) {
    let removed: Slide | undefined
    let index = 0
    let neighbour: Slide | undefined
    const ok = await commit(
      'Delete slide',
      onSlides((l) => {
        const i = indexOfId(l, id)
        if (i < 0 || l.length <= 1) return null
        removed = l[i]
        index = i
        neighbour = l[i + 1] ?? l[i - 1]
        return l.filter((s) => s.id !== id)
      }),
      body(
        'Delete slide',
        onSlides((l) => {
          if (!removed || indexOfId(l, id) >= 0) return null
          const at = Math.min(index, l.length)
          return [...l.slice(0, at), removed, ...l.slice(at)]
        }),
      ),
      // Move the selection off the doomed slide before the save, so a second Delete hits the neighbour.
      () => {
        if (editor.activeSlideId === id) editor.select(neighbour ? slideKey(neighbour) : null)
      },
    )
    if (ok) toast.info('Slide deleted', { description: DELETE_NOTICE })
  }

  /** Insert `make()` at `at` (clamped); `make` runs on first apply, so redo reinserts the same slide. */
  async function insert(label: string, at: () => number, make: (l: Slide[]) => Slide | null) {
    let created: Slide | null = null
    await commit(
      label,
      onSlides((l) => {
        if (created && indexOfId(l, created.id) >= 0) return null
        if (l.length >= MAX_SLIDES) {
          toast.warning('Slide limit reached', { description: `You can have up to ${MAX_SLIDES} slides.` })
          return null
        }
        created ??= make(l)
        if (!created) return null
        const i = Math.min(Math.max(at(), 0), l.length)
        return [...l.slice(0, i), created, ...l.slice(i)]
      }),
      body(
        label,
        onSlides((l) => (created && indexOfId(l, created.id) >= 0 ? l.filter((s) => s.id !== created!.id) : null)),
      ),
      () => created && editor.select(slideKey(created)),
    )
  }

  async function duplicateSlide(id: string) {
    let index = -1
    await insert(
      'Duplicate slide',
      () => index + 1,
      (l) => {
        index = indexOfId(l, id)
        if (index < 0) return null
        return { ...JSON.parse(JSON.stringify(l[index])), id: crypto.randomUUID() }
      },
    )
  }

  /** Insert a slide after `afterIndex` (-1 for the very start). `null` adds a blank slide. */
  async function addSlide(afterIndex: number, layout: NewSlideLayout | null) {
    await insert(
      'Add slide',
      () => afterIndex + 1,
      (l) => ({
        id: crypto.randomUUID(),
        presentation: presentationId.value,
        index: 0,
        content: {},
        ui: JSON.parse(JSON.stringify(layout?.ui ?? BLANK_LAYOUT)) as Record<string, unknown>,
        layout_group: layout?.group ?? deckTemplateId(l),
        layout: layout?.id ?? BLANK_SLIDE_LAYOUT_ID,
        properties: null,
      }),
    )
  }

  async function rename(title: string) {
    const next = title.trim()
    const previous = current()?.title ?? ''
    if (!next) return
    const setTitle = (value: string) => (p: Presentation) => (p.title === value ? null : { ...p, title: value })
    await commit(
      'Rename presentation',
      setTitle(next),
      // The endpoint ignores empty titles, so an untitled deck keeps the new name.
      previous ? body('Rename presentation', setTitle(previous)) : async () => {},
    )
  }

  return { reorder, removeSlide, duplicateSlide, addSlide, rename }
}
