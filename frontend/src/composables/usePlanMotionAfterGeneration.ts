import { ref, watch, type Ref } from 'vue'
import { animateFlagKey } from '@/components/create/options'
import { toast } from '@/components/ui/sonner'
import { i18n } from '@/i18n'
import { provideDeckAnimationRun } from '@/composables/useDeckAnimationRun'
import type { StreamStatus } from '@/composables/usePresentationStream'

/**
 * A deck created with "Animate slides" gets its motion planned once, right after generation (`status` turns
 * `done`). Provides the deck-wide motion run to the caller's subtree (the editor's Motion tab and timeline
 * share it). `planning` is true from the start of that run until it ends.
 */
export function usePlanMotionAfterGeneration(id: Ref<string>, status: Ref<StreamStatus>): { planning: Ref<boolean> } {
  const deckRun = provideDeckAnimationRun(id)
  const planning = ref(false)

  watch(deckRun.running, (running, was) => {
    if (was && !running) planning.value = false
  })

  async function planMotionIfRequested(presentationId: string) {
    const key = animateFlagKey(presentationId)
    try {
      if (sessionStorage.getItem(key) !== '1') return
      // Consumed before the request, so a second "done" (or a reload) never plans twice.
      sessionStorage.removeItem(key)
    } catch {
      return
    }
    planning.value = true
    await deckRun.run()
    // Not started (an error, or the caller moved to another deck meanwhile): no progress to show.
    if (!deckRun.running.value) planning.value = false
    if (deckRun.error.value) toast.error(i18n.global.t('editor.animation.couldNotStartPlanning'), { description: deckRun.error.value })
  }

  watch(status, (s) => {
    if (s === 'done') void planMotionIfRequested(id.value)
  })

  return { planning }
}
