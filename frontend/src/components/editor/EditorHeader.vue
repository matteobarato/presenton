<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ChevronRight, Copy, Loader2, PanelLeft, PanelRight, Play, Redo2, Undo2 } from 'lucide-vue-next'
import { toast } from '@/components/ui/sonner'
import { duplicatePresentation } from '@/api/presentations'
import type { Presentation } from '@/api/types'
import { useSlideMutations } from '@/composables/useSlideMutations'
import { useUndoRedo } from '@/composables/useUndoRedo'
import { useEditorStore } from '@/stores/editor'

const props = defineProps<{ presentation: Presentation }>()

const router = useRouter()
const editor = useEditorStore()
const { history, undo, redo } = useUndoRedo()
const id = computed(() => props.presentation.id)
const { rename } = useSlideMutations(id)

const draft = ref(props.presentation.title ?? '')
watch(
  () => props.presentation.title,
  (title) => (draft.value = title ?? ''),
)

function commitTitle() {
  const next = draft.value.trim()
  if (!next) draft.value = props.presentation.title ?? ''
  else if (next !== props.presentation.title) void rename(next)
}

const duplicating = ref(false)
async function duplicateDeck() {
  duplicating.value = true
  try {
    const copy = await duplicatePresentation(id.value)
    await router.push({ name: 'editor', params: { id: copy.id } })
  } catch (error) {
    toast.error('Could not duplicate the presentation', { description: error instanceof Error ? error.message : undefined })
  } finally {
    duplicating.value = false
  }
}

const iconBtn =
  'grid size-8 place-items-center rounded-control text-muted transition-colors duration-200 hover:bg-white/[0.06] hover:text-white disabled:opacity-35 disabled:hover:bg-transparent'
</script>

<template>
  <header class="flex h-[60px] flex-none items-center gap-3 px-4 max-[760px]:h-14 max-[760px]:px-2.5">
    <button
      type="button"
      :class="[iconBtn, 'hidden max-[760px]:grid']"
      aria-label="Show slides"
      @click="editor.navigatorOpen = true"
    >
      <PanelLeft class="size-4" aria-hidden="true" />
    </button>

    <nav aria-label="Breadcrumb" class="flex min-w-0 items-center gap-2 text-[12px] text-muted">
      <RouterLink :to="{ name: 'library' }" class="max-[760px]:hidden hover:text-white">Library</RouterLink>
      <ChevronRight class="size-3 max-[760px]:hidden" aria-hidden="true" />
      <input
        v-model="draft"
        type="text"
        aria-label="Presentation title"
        :disabled="editor.locked"
        maxlength="200"
        class="h-8 w-[min(320px,40vw)] min-w-0 truncate rounded-control border border-transparent bg-transparent px-2 text-[13px] font-semibold text-text hover:border-line focus:border-accent focus:bg-field"
        @blur="commitTitle"
        @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        @keydown.esc.prevent="((draft = presentation.title ?? ''), ($event.target as HTMLInputElement).blur())"
      />
    </nav>

    <div class="ml-auto flex items-center gap-1">
      <button
        type="button"
        :class="iconBtn"
        :disabled="!history.canUndo || editor.locked"
        :aria-label="history.undoLabel ? `Undo ${history.undoLabel.toLowerCase()}` : 'Undo'"
        title="Undo (Ctrl+Z)"
        @click="undo"
      >
        <Undo2 class="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        :class="iconBtn"
        :disabled="!history.canRedo || editor.locked"
        :aria-label="history.redoLabel ? `Redo ${history.redoLabel.toLowerCase()}` : 'Redo'"
        title="Redo (Shift+Ctrl+Z)"
        @click="redo"
      >
        <Redo2 class="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        :class="[iconBtn, 'w-auto gap-1.5 px-2.5 text-[11px] font-semibold']"
        :disabled="duplicating"
        @click="duplicateDeck"
      >
        <Loader2 v-if="duplicating" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <Copy v-else class="size-3.5" aria-hidden="true" />
        <span class="max-[760px]:hidden">Duplicate</span>
      </button>
      <button
        type="button"
        :class="iconBtn"
        :aria-pressed="editor.inspectorOpen"
        aria-label="Toggle inspector"
        title="Toggle inspector"
        @click="editor.inspectorOpen = !editor.inspectorOpen"
      >
        <PanelRight class="size-4" aria-hidden="true" />
      </button>
      <RouterLink
        :to="{ name: 'present', params: { id } }"
        class="ml-1 inline-flex h-[34px] items-center gap-1.5 rounded-button bg-accent px-3.5 text-[12px] font-semibold text-accent-ink transition-colors duration-200 hover:bg-accent-hover"
      >
        <Play class="size-3.5" aria-hidden="true" />Present
      </RouterLink>
    </div>
  </header>
</template>
