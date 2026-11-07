import type { Ref } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { toast } from '@/components/ui/sonner'
import { getPresentation, presentationKeys, updatePresentation } from '@/api/presentations'
import type { Presentation, Slide } from '@/api/types'
import { slideKey, useEditorStore } from '@/stores/editor'
import { useHistoryStore } from '@/stores/history'
import type { RawUi } from '@/slide-editor/model'

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

/** A save waiting in its deck's queue. */
interface QueuedSave {
  label: string
  withSlides: boolean
  /** Settles once this save, or the newer save that covered it, has settled. */
  done: Promise<void>
}

/**
 * Per-deck save queue: only the network PATCH is serialized. `waiting` holds the saves queued
 * but not started, oldest first, so a save can see that a newer one will send the cache anyway.
 */
const queues = new Map<string, { tail: Promise<void>; waiting: QueuedSave[] }>()

/** How `editSlideUi` reports progress and joins history. */
export interface EditSlideUiOptions {
  /** Called once the edit is in the cache (true) or was refused (false); the save may still be pending. */
  onApplied?: (applied: boolean) => void
  /** Consecutive edits with this key fold into one history entry (see the history store's merge window). */
  mergeKey?: string
  /** Deck to edit; defaults to the current one. An edit to another deck is not recorded in history. */
  deckId?: string
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

  const keyOf = (deckId: string) => presentationKeys.one(deckId)
  const key = () => keyOf(presentationId.value)
  const current = () => queryClient.getQueryData<Presentation>(key())

  /**
   * Queue a PATCH of the deck as cached when its turn comes. A save that finds a newer save of the
   * same action (same label, so the same fields and the same failure toast) queued behind it skips
   * its own PATCH: the newer one sends the latest cache. A held arrow thus sends one PATCH per
   * round trip, not one per key repeat. A skipped save settles with the save that covered it, so a
   * failure there (toast + refetch of server truth) still applies to its edit.
   */
  function schedule(label: string, withSlides: boolean, deckId = presentationId.value): Promise<void> {
    let queue = queues.get(deckId)
    if (!queue) {
      queue = { tail: Promise.resolve(), waiting: [] }
      queues.set(deckId, queue)
    }
    const q = queue
    const entry: QueuedSave = { label, withSlides, done: Promise.resolve() }
    q.waiting.push(entry)
    let coveredBy: QueuedSave | undefined
    const job = async () => {
      q.waiting.splice(q.waiting.indexOf(entry), 1)
      // Everything still waiting is newer than this save.
      coveredBy = q.waiting.find((later) => later.label === label && later.withSlides === withSlides)
      if (coveredBy) return
      const snapshot = queryClient.getQueryData<Presentation>(keyOf(deckId))
      if (!snapshot) return
      try {
        await updatePresentation({
          id: deckId,
          ...(withSlides && { slides: reindex(snapshot.slides) }),
          title: snapshot.title || undefined,
          theme: snapshot.theme ?? undefined,
        })
      } catch (error) {
        toast.error(`Could not ${label.toLowerCase()}`, { description: error instanceof Error ? error.message : undefined })
        try {
          await queryClient.fetchQuery({ queryKey: keyOf(deckId), queryFn: () => getPresentation(deckId), staleTime: 0 })
        } catch {
          // Offline: the banner explains; the next successful save resyncs.
        }
      }
    }
    const ran = q.tail.then(job)
    q.tail = ran
    // Not chained into the tail: the covering save is queued after this one.
    entry.done = ran.then(() => coveredBy?.done)
    return entry.done
  }

  /** Apply `edit` to the deck's cache now (null = nothing to do) and queue the save. */
  async function applyEdit(label: string, edit: (p: Presentation) => Presentation | null, withSlides = true, deckId = presentationId.value) {
    const deckKey = keyOf(deckId)
    // A fetch in flight (or an invalidated entry) may carry server-side changes, e.g. an AI edit that
    // re-ids a slide. Edit on top of it rather than cancelling it, or the PATCH would write the old slide back.
    const state = queryClient.getQueryState(deckKey)
    if (state?.fetchStatus === 'fetching' || state?.isInvalidated) {
      try {
        await queryClient.fetchQuery({ queryKey: deckKey, queryFn: () => getPresentation(deckId), staleTime: 0 })
      } catch {
        // Offline: edit the cache as it is.
      }
    } else {
      // Nothing in flight: make sure nothing lands on top of the optimistic write.
      await queryClient.cancelQueries({ queryKey: deckKey })
    }
    const before = queryClient.getQueryData<Presentation>(deckKey)
    const after = before && edit(before)
    if (!after) return { applied: false, saved: Promise.resolve() }
    queryClient.setQueryData<Presentation>(deckKey, { ...after, slides: reindex(after.slides) })
    return { applied: true, saved: schedule(label, withSlides, deckId) }
  }

  const onSlides =
    (fn: (slides: Slide[]) => Slide[] | null) =>
    (p: Presentation): Presentation | null => {
      const next = fn(p.slides)
      return next && { ...p, slides: next }
    }

  /** A history body: apply, then wait for the save so undo/redo stay one at a time. */
  const body = (label: string, edit: (p: Presentation) => Presentation | null, withSlides = true, deckId?: string) => async () => {
    if (editor.locked) throw new Error('The deck is busy.')
    const r = await applyEdit(label, edit, withSlides, deckId)
    await r.saved
  }

  /**
   * Apply the primary edit; on success record it and wait for the save. `onApplied` hears as soon
   * as the edit is in the cache (or refused), before the save settles.
   */
  async function commit(
    label: string,
    edit: (p: Presentation) => Presentation | null,
    undo: () => Promise<void>,
    after?: () => void,
    withSlides = true,
    opts: EditSlideUiOptions = {},
  ): Promise<boolean> {
    const deckId = opts.deckId ?? presentationId.value
    if (editor.locked) {
      opts.onApplied?.(false)
      return false
    }
    const r = await applyEdit(label, edit, withSlides, deckId)
    if (!r.applied) {
      opts.onApplied?.(false)
      return false
    }
    after?.()
    // History belongs to the deck now open (it is cleared on a deck switch).
    if (deckId === presentationId.value) {
      history.push({ label, do: body(label, edit, withSlides, deckId), undo }, opts.mergeKey ? { key: opts.mergeKey } : undefined)
    }
    opts.onApplied?.(true)
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
      previous ? body('Rename presentation', setTitle(previous), false) : async () => {},
      undefined,
      false, // title and theme only: `slides` would replace the whole set
    )
  }

  /**
   * Replace the `ui` of the slide with this id. One history entry (or one merged run of entries
   * with `mergeKey`); undo writes back the `ui` captured at first apply.
   */
  async function editSlideUi(slideId: string, next: RawUi, label: string, opts: EditSlideUiOptions = {}): Promise<boolean> {
    const deckId = opts.deckId ?? presentationId.value
    let previous: Slide['ui'] | undefined
    const setUi = (ui: Slide['ui'], capture: boolean) =>
      onSlides((l) => {
        const i = indexOfId(l, slideId)
        if (i < 0) return null
        const slide = l[i]!
        if (JSON.stringify(slide.ui) === JSON.stringify(ui)) return null
        if (capture) previous = slide.ui
        return l.map((s, n) => (n === i ? { ...s, ui } : s))
      })
    const nextUi = next as Slide['ui']
    return commit(
      label,
      setUi(nextUi, true),
      async () => {
        if (editor.locked) throw new Error('The deck is busy.')
        if (previous === undefined) return
        const r = await applyEdit(label, setUi(previous, false), true, deckId)
        await r.saved
      },
      undefined,
      true,
      { ...opts, deckId },
    )
  }

  return { reorder, removeSlide, duplicateSlide, addSlide, rename, editSlideUi }
}
