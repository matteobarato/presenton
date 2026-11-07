<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useIsMutating, useQueryClient } from '@tanstack/vue-query'
import {
  AudioLines,
  ChevronDown,
  ChevronRight,
  CloudCheck,
  Copy,
  Download,
  Loader2,
  PanelLeft,
  PencilLine,
  Play,
  SkipBack,
  Trash2,
} from 'lucide-vue-next'
import { toast } from '@/components/ui/sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import DeleteDeckDialog from '@/components/library/DeleteDeckDialog.vue'
import { Button, buttonVariants } from '@/components/ui/button'
import { deletePresentation, duplicatePresentation, presentationKeys } from '@/api/presentations'
import type { Presentation } from '@/api/types'
import { useSlideMutations } from '@/composables/useSlideMutations'
import { cn } from '@/lib/utils'
import { slideKey, useEditorStore, type InspectorTabId } from '@/stores/editor'

const props = defineProps<{ presentation: Presentation }>()

const router = useRouter() 
const queryClient = useQueryClient()
const editor = useEditorStore()
// Every write to the deck goes through a vue-query mutation, so this is the honest save state.
const pendingWrites = useIsMutating()
const saving = computed(() => pendingWrites.value > 0)
const activeIndex = computed(() => Math.max(0, props.presentation.slides.findIndex((s) => slideKey(s) === editor.activeSlideId)))
function present(from: number) {
  void router.push({ name: 'present', params: { id: id.value }, query: from > 0 ? { from: String(from) } : {} })
}
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
  <header
    class="flex h-[83px] flex-none items-center justify-between gap-5 px-[27px] max-[1279px]:px-5 max-[760px]:h-[75px] max-[760px]:gap-3 max-[760px]:px-4 max-[450px]:px-[11px] [@media(max-height:780px)_and_(min-width:1051px)]:h-[69px]"
  >
    <div class="flex min-w-0 items-center gap-[13px] max-[760px]:gap-[7px]">
      <button
        type="button"
        :class="cn(iconBtn, 'hidden max-[760px]:inline-flex')"
        aria-label="Show slides"
        @click="editor.navigatorOpen = true"
      >
        <PanelLeft class="size-4" aria-hidden="true" />
      </button>

      <nav aria-label="Breadcrumb" class="flex min-w-0 items-center gap-[13px]">
        <RouterLink :to="{ name: 'library' }" class="text-[11px] whitespace-nowrap text-[#929b9f] hover:text-accent max-[760px]:hidden">Library</RouterLink>
        <ChevronRight class="size-[13px] flex-none text-[#667179] max-[760px]:hidden" aria-hidden="true" />
        <input
          ref="titleInput"
          v-model="draft"
          type="text"
          aria-label="Presentation title"
          :disabled="editor.locked"
          maxlength="200"
          :size="Math.max(8, Math.min(draft.length, 40))"
          class="h-8 max-w-[min(360px,40vw)] min-w-0 [field-sizing:content] truncate rounded-control border border-transparent bg-transparent px-1.5 text-[12px] font-semibold text-[#e4e8ea] hover:border-line focus:border-accent focus:bg-field max-[450px]:text-[11px]"
          @blur="commitTitle"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          @keydown.esc.prevent="((draft = presentation.title ?? ''), ($event.target as HTMLInputElement).blur())"
        />
      </nav>

      <DropdownMenu>
        <DropdownMenuTrigger :class="cn(iconBtn, '-ml-2.5 size-7 text-[#879298]')" aria-label="Presentation actions" title="Presentation actions">
          <Loader2 v-if="duplicating" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <ChevronDown v-else class="size-[13px]" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="min-w-52">
          <DropdownMenuItem :disabled="editor.locked" @select="focusTitle">
            <PencilLine class="size-3.5" aria-hidden="true" />Rename
          </DropdownMenuItem>
          <DropdownMenuItem :disabled="duplicating" @select="duplicateDeck">
            <Copy class="size-3.5" aria-hidden="true" />Duplicate presentation
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

      <span
        class="ml-3 flex items-center gap-[7px] text-[10px] whitespace-nowrap text-[#899397] transition-opacity duration-200 max-[1279px]:ml-[3px] max-[760px]:ml-0 max-[450px]:hidden"
        :class="saving && 'opacity-60'"
        role="status"
      >
        <Loader2 v-if="saving" class="size-[15px] animate-spin text-[#98b7a8] motion-reduce:animate-none" aria-hidden="true" />
        <CloudCheck v-else class="size-[15px] text-[#98b7a8]" aria-hidden="true" />
        <span class="max-[1279px]:sr-only">{{ saving ? 'Saving changes…' : 'All changes saved' }}</span>
      </span>
    </div>

    <div class="flex flex-none items-center gap-[9px] max-[760px]:gap-[7px] max-[450px]:gap-[5px]">
      <Button
        variant="outline"
        class="max-[760px]:w-[33px] max-[760px]:px-0"
        aria-label="Export"
        @click="editor.exportOpen = true"
      >
        <Download class="size-3.5" aria-hidden="true" /><span class="max-[760px]:hidden">Export</span>
      </Button>
      <div class="inline-flex flex-none">
        <RouterLink
          :to="{ name: 'present', params: { id }, query: activeIndex > 0 ? { from: String(activeIndex) } : {} }"
          :class="cn(buttonVariants(), 'gap-[9px] rounded-r-none max-[760px]:h-[33px] max-[760px]:px-[11px] max-[760px]:text-[10px] max-[450px]:h-[31px] max-[450px]:px-[9px]')"
        >
          <Play class="size-3.5 fill-current" aria-hidden="true" /><span class="max-[420px]:sr-only">Present</span>
        </RouterLink>
        <DropdownMenu>
          <DropdownMenuTrigger
            :class="cn(buttonVariants(), 'w-[34px] rounded-l-none border-l-[#1b333e38] px-0 data-[state=open]:bg-accent-hover max-[760px]:h-[33px] max-[760px]:w-8 max-[450px]:h-[31px] max-[450px]:w-7')"
            aria-label="Presentation and export options"
            title="Presentation and export options"
          >
            <ChevronDown class="size-3.5" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-[min(230px,calc(100vw-24px))]">
            <DropdownMenuItem @select="present(activeIndex)">
              <Play class="size-[15px] text-[#b6ceda]" aria-hidden="true" />Present from current slide
            </DropdownMenuItem>
            <DropdownMenuItem @select="present(0)">
              <SkipBack class="size-[15px] text-[#b6ceda]" aria-hidden="true" />Present from beginning
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @select="openInspector('narration')">
              <AudioLines class="size-[15px] text-[#b6ceda]" aria-hidden="true" />Narration and avatars
            </DropdownMenuItem>
            <DropdownMenuItem @select="editor.exportOpen = true">
              <Download class="size-[15px] text-[#b6ceda]" aria-hidden="true" />Export PPTX, PDF or video…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <DeleteDeckDialog v-model:open="deleteOpen" :title="presentation.title || 'Untitled presentation'" @confirm="deleteDeck" />
  </header>
</template>
