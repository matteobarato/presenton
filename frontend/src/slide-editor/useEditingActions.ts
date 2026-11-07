import type { OpResult } from '@/slide-editor/ops'
import type { SlideEditing } from '@/slide-editor/useSlideEditing'

export interface EditingActions {
  /** Runs an op result: selects synchronously, then commits. Skipped when it conflicts with an in-flight commit. */
  run: (label: string, result: OpResult) => Promise<void>
  /** True while any commit is being applied (its save may outlive this). */
  busy: () => boolean
  /** True while a structural (non-nudge) commit is being applied. */
  structuralBusy: () => boolean
}

const runners = new WeakMap<SlideEditing, EditingActions>()

function createActions(ctx: SlideEditing): EditingActions {
  // commit() publishes its ui optimistically, so the selection must follow synchronously, and a
  // structural op (auto-repeat) must not run against the ui before the commit has applied it.
  // The counters cover the apply step only (the cache write), not the network save: the next
  // action builds on the optimistic ui, so Bold then Italic, or Delete after a nudge, both run.
  // Nudges are the exception even while applying: each builds on the optimistic ui and keeps the
  // selection, so a held arrow keeps moving. Consecutive nudges of one selection on one slide
  // share a merge key, so a held arrow is one history entry.
  let inflight = 0
  let structuralInflight = 0
  async function run(label: string, result: OpResult) {
    const structural = label !== 'Nudge'
    if (!result || (structural ? inflight > 0 : structuralInflight > 0)) return
    inflight += 1
    if (structural) structuralInflight += 1
    let released = false
    const release = () => {
      if (released) return
      released = true
      inflight -= 1
      if (structural) structuralInflight -= 1
    }
    try {
      ctx.select(result.selection)
      const mergeKey = structural ? undefined : `nudge:${ctx.slideId.value}:${JSON.stringify(result.selection)}`
      await ctx.commit(result.ui, label, { onApplied: release, ...(mergeKey && { mergeKey }) })
    } finally {
      release()
    }
  }
  return { run, busy: () => inflight > 0, structuralBusy: () => structuralInflight > 0 }
}

/** One runner per editing context, so the toolbar and the keyboard share the in-flight counters. */
export function useEditingActions(ctx: SlideEditing): EditingActions {
  let actions = runners.get(ctx)
  if (!actions) {
    actions = createActions(ctx)
    runners.set(ctx, actions)
  }
  return actions
}
