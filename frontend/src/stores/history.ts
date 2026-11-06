import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export interface HistoryCommand {
  label: string
  do: () => Promise<void>
  undo: () => Promise<void>
}

export const HISTORY_LIMIT = 50

/**
 * Undo/redo of already-applied mutations: `push` registers a command whose
 * effect was just performed, so it does not run `do`. A command whose undo or
 * redo fails stays where it was and the error is rethrown.
 */
export const useHistoryStore = defineStore('history', () => {
  const past = ref<HistoryCommand[]>([])
  const future = ref<HistoryCommand[]>([])

  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)
  const undoLabel = computed(() => past.value.at(-1)?.label ?? null)
  const redoLabel = computed(() => future.value.at(-1)?.label ?? null)

  function push(cmd: HistoryCommand) {
    past.value.push(cmd)
    if (past.value.length > HISTORY_LIMIT) past.value.shift()
    future.value = []
  }

  async function undo() {
    const cmd = past.value.at(-1)
    if (!cmd) return
    await cmd.undo()
    past.value.pop()
    future.value.push(cmd)
  }

  async function redo() {
    const cmd = future.value.at(-1)
    if (!cmd) return
    await cmd.do()
    future.value.pop()
    past.value.push(cmd)
  }

  function clear() {
    past.value = []
    future.value = []
  }

  return { canUndo, canRedo, undoLabel, redoLabel, push, undo, redo, clear }
})
