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

  // One undo/redo at a time: a repeat while a save is in flight would re-run the command.
  const busy = ref(false)
  const canUndo = computed(() => !busy.value && past.value.length > 0)
  const canRedo = computed(() => !busy.value && future.value.length > 0)
  const undoLabel = computed(() => past.value.at(-1)?.label ?? null)
  const redoLabel = computed(() => future.value.at(-1)?.label ?? null)

  function push(cmd: HistoryCommand) {
    past.value.push(cmd)
    if (past.value.length > HISTORY_LIMIT) past.value.shift()
    future.value = []
  }

  async function undo() {
    const cmd = past.value.at(-1)
    if (!cmd || busy.value) return
    busy.value = true
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
    try {
      await cmd.do()
      future.value.pop()
      past.value.push(cmd)
    } finally {
      busy.value = false
    }
  }

  function clear() {
    past.value = []
    future.value = []
  }

  return { busy, canUndo, canRedo, undoLabel, redoLabel, push, undo, redo, clear }
})
