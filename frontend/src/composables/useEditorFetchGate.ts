import { useEditorStore } from '@/stores/editor'
import type { UsePresentationOptions } from '@/api/presentations'

/**
 * Options for every `usePresentation` observer in the editor: no focus or
 * reconnect refetch while a generation streams into the cache (any observer
 * allowing it would be enough to overwrite the streamed slides).
 */
export function useEditorFetchGate(): UsePresentationOptions {
  const editor = useEditorStore()
  return { refetchOnWindowFocus: () => !editor.generating, refetchOnReconnect: () => !editor.generating }
}
