<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import {
  AudioLines,
  ChevronRight,
  Copy,
  Download,
  Ellipsis,
  Loader2,
  NotebookPen,
  PanelLeft,
  PanelRight,
  PencilLine,
  Play,
  Redo2,
  Trash2,
  Undo2,
} from 'lucide-vue-next'
import { toast } from '@/components/ui/sonner'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import DeleteDeckDialog from '@/components/library/DeleteDeckDialog.vue'
import { deletePresentation, duplicatePresentation, presentationKeys } from '@/api/presentations'
import type { Presentation } from '@/api/types'
import { useSlideMutations } from '@/composables/useSlideMutations'
import { useUndoRedo } from '@/composables/useUndoRedo'
import { cn } from '@/lib/utils'
import { useEditorStore, type InspectorTabId } from '@/stores/editor'

const props = defineProps<{ presentation: Presentation }>()

const router = useRouter() 
const queryClient = useQueryClient()
const editor = useEditorStore()
const { history, undo, redo } = useUndoRedo()
const id = computed(() => props.presentation.id)
const { rename } = useSlideMutations(id)

const titleInput = ref<HTMLInputElement | null>(null)
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

// The menu hands focus back to its trigger on close; wait for that before focusing the title.
async function focusTitle() {
  await nextTick()
  setTimeout(() => titleInput.value?.select(), 0)
}

function openInspector(tab: InspectorTabId) {
  editor.inspectorTab = tab
  editor.inspectorOpen = true
}

const duplicating = ref(false)
async function duplicateDeck() {
  duplicating.value = true
  try {
    const copy = await duplicatePresentation(id.value)
    void queryClient.invalidateQueries({ queryKey: presentationKeys.all })
    await router.push({ name: 'editor', params: { id: copy.id } })
  } catch (error) {
    toast.error('Could not duplicate the presentation', { description: error instanceof Error ? error.message : undefined })
  } finally {
    duplicating.value = false
  }
}

const deleteOpen = ref(false)
async function deleteDeck() {
  deleteOpen.value = false
  try {
    await deletePresentation(id.value)
    queryClient.removeQueries({ queryKey: presentationKeys.one(id.value) })
    void queryClient.invalidateQueries({ queryKey: presentationKeys.all })
    await router.push({ name: 'library' })
  } catch (error) {
    toast.error('Could not delete the presentation', { description: error instanceof Error ? error.message : undefined })
  }
}

const iconBtn =
  'inline-flex size-8 items-center justify-center rounded-control text-muted transition-colors duration-200 hover:bg-white/[0.06] hover:text-white disabled:opacity-35 disabled:hover:bg-transparent data-[state=open]:bg-white/[0.08] data-[state=open]:text-white'
</script>

<template>
  <header class="flex h-[60px] flex-none items-center gap-3 px-4 max-[760px]:h-14 max-[760px]:gap-1.5 max-[760px]:px-2.5">
    <button
      type="button"
      :class="cn(iconBtn, 'hidden max-[760px]:inline-flex')"
      aria-label="Show slides"
      @click="editor.navigatorOpen = true"
    >
      <PanelLeft class="size-4" aria-hidden="true" />
    </button>

    <nav aria-label="Breadcrumb" class="flex min-w-0 flex-1 items-center gap-2 text-[12px] text-muted">
      <RouterLink :to="{ name: 'library' }" class="max-[760px]:hidden hover:text-white">Library</RouterLink>
      <ChevronRight class="size-3 flex-none max-[760px]:hidden" aria-hidden="true" />
      <input
        ref="titleInput"
        v-model="draft"
        type="text"
        aria-label="Presentation title"
        :disabled="editor.locked"
        maxlength="200"
        class="h-8 w-[min(420px,100%)] min-w-0 truncate rounded-control border border-transparent bg-transparent px-2 text-[13px] font-semibold text-text hover:border-line focus:border-accent focus:bg-field"
        @blur="commitTitle"
        @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        @keydown.esc.prevent="((draft = presentation.title ?? ''), ($event.target as HTMLInputElement).blur())"
      />
    </nav>

    <div class="flex flex-none items-center gap-1">
      <div class="flex items-center gap-0.5" role="group" aria-label="History">
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
      </div>

      <span class="mx-1.5 h-4 w-px bg-line max-[760px]:hidden" aria-hidden="true" />

      <DropdownMenu>
        <DropdownMenuTrigger :class="iconBtn" aria-label="More actions" title="More actions">
          <Loader2 v-if="duplicating" class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <Ellipsis v-else class="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="min-w-52">
          <DropdownMenuItem :disabled="editor.locked" @select="focusTitle">
            <PencilLine class="size-3.5" aria-hidden="true" />Rename
          </DropdownMenuItem>
          <DropdownMenuItem :disabled="duplicating" @select="duplicateDeck">
            <Copy class="size-3.5" aria-hidden="true" />Duplicate presentation
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            :model-value="editor.notesOpen"
            class="pr-7 pl-2.5 [&>span:first-child]:right-2 [&>span:first-child]:left-auto"
            @update:model-value="editor.notesOpen = Boolean($event)">
            <NotebookPen class="size-3.5" aria-hidden="true" />Notes under the slide
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem @select="openInspector('narration')">
            <AudioLines class="size-3.5" aria-hidden="true" />Narration and avatars
          </DropdownMenuItem>
          <DropdownMenuItem @select="openInspector('export')">
            <Download class="size-3.5" aria-hidden="true" />Export…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            :disabled="editor.locked"
            class="text-danger-text data-[highlighted]:bg-danger data-[highlighted]:text-danger-text"
            @select="deleteOpen = true"
          >
            <Trash2 class="size-3.5" aria-hidden="true" />Delete presentation
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        :class="cn(iconBtn, editor.inspectorOpen && 'text-white')"
        :aria-pressed="editor.inspectorOpen"
        aria-label="Toggle inspector"
        title="Toggle inspector"
        @click="editor.inspectorOpen = !editor.inspectorOpen"
      >
        <PanelRight class="size-4" aria-hidden="true" />
      </button>
      <RouterLink
        :to="{ name: 'present', params: { id } }"
        class="ml-1.5 inline-flex h-[34px] items-center gap-1.5 rounded-button bg-accent px-3.5 text-[12px] font-semibold text-accent-ink transition-colors duration-200 hover:bg-accent-hover max-[760px]:px-2.5"
      >
        <Play class="size-3.5" aria-hidden="true" /><span class="max-[420px]:sr-only">Present</span>
      </RouterLink>
    </div>

    <DeleteDeckDialog v-model:open="deleteOpen" :title="presentation.title || 'Untitled presentation'" @confirm="deleteDeck" />
  </header>
</template>
