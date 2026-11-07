import { computed, ref, toRaw } from 'vue'
import { defineStore } from 'pinia'

export interface HistoryCommand {
  label: string
  do: () => Promise<void>
  undo: () => Promise<void>
}

export const HISTORY_LIMIT = 50
/** Consecutive pushes with the same merge key this close together become one command. */
export const HISTORY_MERGE_WINDOW_MS = 500

export interface HistoryMerge {
  /** Commands with equal keys merge, e.g. nudges of one selection on one slide. */
  key: string
}

/**
 * Undo/redo of already-applied mutations: `push` registers a command whose
 * effect was just performed, so it does not run `do`. A command whose undo or
 * redo fails stays where it was and the error is rethrown.
 */
export const useHistoryStore = defineStore('history', () => {
  const past = ref<HistoryCommand[]>([])
  const future = ref<HistoryCommand[]>([])

  // One undo/redo at a time: a repeat while a save is in flight would re-run the command.
  const busy = ref(false)
  const canUndo = computed(() => !busy.value && past.value.length > 0)
  const canRedo = computed(() => !busy.value && future.value.length > 0)
  const undoLabel = computed(() => past.value.at(-1)?.label ?? null)
  const redoLabel = computed(() => future.value.at(-1)?.label ?? null)

  // The last mergeable push: a newer push with its key, within the window, folds into it.
  let mergeable: { key: string; at: number; cmd: HistoryCommand } | null = null

  /**
   * Registers an applied command. With `merge`, a push right after one with the same key (and
   * nothing pushed, undone or redone in between) folds into it: the first undo, the latest do.
   */
  function push(cmd: HistoryCommand, merge?: HistoryMerge) {
    const now = Date.now()
    const top = past.value.at(-1)
    if (merge && mergeable && top && toRaw(top) === mergeable.cmd && mergeable.key === merge.key && now - mergeable.at <= HISTORY_MERGE_WINDOW_MS) {
      const merged: HistoryCommand = { label: cmd.label, do: cmd.do, undo: top.undo }
      past.value[past.value.length - 1] = merged
      future.value = []
      mergeable = { key: merge.key, at: now, cmd: merged }
      return
    }
    past.value.push(cmd)
    if (past.value.length > HISTORY_LIMIT) past.value.shift()
    future.value = []
    mergeable = merge ? { key: merge.key, at: now, cmd } : null
  }

  async function undo() {
    const cmd = past.value.at(-1)
    if (!cmd || busy.value) return
    busy.value = true
    mergeable = null
    try {
      await cmd.undo()
      past.value.pop()
      future.value.push(cmd)
    } finally {
      busy.value = false
    }
  }

  async function redo() {
    const cmd = future.value.at(-1)
    if (!cmd || busy.value) return
    busy.value = true
    mergeable = null
    try {
      await cmd.do()
      future.value.pop()
      past.value.push(cmd)
    } finally {
      busy.value = false
    }
  }

  function clear() {
    mergeable = null
    past.value = []
    future.value = []
  }

  return { busy, canUndo, canRedo, undoLabel, redoLabel, push, undo, redo, clear }
})
