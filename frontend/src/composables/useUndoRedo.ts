import { toast } from '@/components/ui/sonner'
import { useHistoryStore } from '@/stores/history'

/** Undo/redo that surface a failed save as a toast; the command stays on its stack. */
export function useUndoRedo() {
  const history = useHistoryStore()

  async function run(action: 'undo' | 'redo') {
    try {
      await history[action]()
    } catch (error) {
      toast.error(`Could not ${action}`, { description: error instanceof Error ? error.message : undefined })
    }
  }

  return { history, undo: () => run('undo'), redo: () => run('redo') }
}
