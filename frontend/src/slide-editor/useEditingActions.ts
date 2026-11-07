import type { OpResult } from '@/slide-editor/ops'
import type { SlideEditing } from '@/slide-editor/useSlideEditing'

export interface EditingActions {
  /** Runs an op result: selects synchronously, then commits. Skipped when it conflicts with an in-flight commit. */
  run: (label: string, result: OpResult) => Promise<void>
  /** True while any commit is pending. */
  busy: () => boolean
  /** True while a structural (non-nudge) commit is pending. */
  structuralBusy: () => boolean
}

const runners = new WeakMap<SlideEditing, EditingActions>()

function createActions(ctx: SlideEditing): EditingActions {
  // commit() publishes its ui optimistically, so the selection must follow synchronously, and a
  // structural op (auto-repeat) must not run against the new ui before the commit settles.
  // Nudges are the exception: each builds on the optimistic ui and keeps the selection, so a held
  // arrow keeps moving while earlier nudges are still saving.
  let inflight = 0
  let structuralInflight = 0
  async function run(label: string, result: OpResult) {
    const structural = label !== 'Nudge'
    if (!result || (structural ? inflight > 0 : structuralInflight > 0)) return
    inflight += 1
    if (structural) structuralInflight += 1
    try {
      ctx.select(result.selection)
      await ctx.commit(result.ui, label)
    } finally {
      inflight -= 1
      if (structural) structuralInflight -= 1
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
