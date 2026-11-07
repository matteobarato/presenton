<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { Plus } from 'lucide-vue-next'
import type { Presentation, Slide } from '@/api/types'
import { ApiError, extractApiErrorMessage } from '@/api/errors'
import { presentationKeys, updatePresentation } from '@/api/presentations'
import {
  createTheme,
  deleteTheme,
  generateTheme,
  themeKeys,
  listThemes,
  updateTheme,
  type ThemeCreateBody,
  type ThemeRecord,
} from '@/api/themes'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/components/ui/sonner'
import { useEditorStore } from '@/stores/editor'
import ThemeEditorDialog from './ThemeEditorDialog.vue'
import ThemeSwatch from './ThemeSwatch.vue'

const props = defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()

const queryClient = useQueryClient()
const editor = useEditorStore()
const themes = useQuery({ queryKey: themeKeys.all, queryFn: listThemes })
// Tolerate a malformed list (non-array, null entries) instead of crashing the tab.
const themeList = computed<ThemeRecord[]>(() => {
  const data: unknown = themes.data.value
  return Array.isArray(data) ? data.filter((t): t is ThemeRecord => !!t && typeof t === 'object') : []
})

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return extractApiErrorMessage(error.body, fallback, error.status)
  return extractApiErrorMessage(error instanceof Error ? error.message : null, fallback)
}

const appliedId = computed(() => {
  const theme = props.presentation.theme as { id?: unknown } | null | undefined
  return typeof theme?.id === 'string' ? theme.id : null
})

// Built-in themes ship with the client; the backend's default list is empty.
const isCustom = (t: ThemeRecord) => t.user !== 'system'

// Only `theme` is sent: omitting `slides` leaves them untouched, while
// omitting `theme` would reset it.
const apply = useMutation({
  mutationFn: (theme: ThemeRecord | null) => updatePresentation({ id: props.presentationId, theme }),
  onMutate: async (theme) => {
    const key = presentationKeys.one(props.presentationId)
    await queryClient.cancelQueries({ queryKey: key })
    const previous = queryClient.getQueryData<Presentation>(key)?.theme ?? null
    queryClient.setQueryData<Presentation>(key, (old) => (old ? ({ ...old, theme } as Presentation) : old))
    return { previous }
  },
  onError: (error, _theme, ctx) => {
    // Restore only the theme: a snapshot of the whole deck would undo structural edits made meanwhile.
    if (ctx) {
      queryClient.setQueryData<Presentation>(presentationKeys.one(props.presentationId), (old) =>
        old ? ({ ...old, theme: ctx.previous } as Presentation) : old,
      )
    }
    toast.error(errorMessage(error, 'Could not apply the theme'))
  },
})

function refreshThemes() {
  void queryClient.invalidateQueries({ queryKey: themeKeys.all })
}

// Editor dialog (create or edit).
const editorOpen = ref(false)
const editing = ref<ThemeRecord | null>(null)
function openEditor(theme: ThemeRecord | null) {
  editing.value = theme
  editorOpen.value = true
}
const save = useMutation({
  mutationFn: (body: ThemeCreateBody) =>
    editing.value ? updateTheme(editing.value.id, body) : createTheme(body),
  onSuccess: (saved) => {
    editorOpen.value = false
    refreshThemes()
    toast.success(`Saved "${saved.name}"`)
    // Editing the applied theme must reach the slides too.
    if (appliedId.value === saved.id) apply.mutate(saved)
  },
  onError: (error) => toast.error(errorMessage(error, 'Could not save the theme')),
})

// Delete with confirmation.
const pendingDelete = ref<ThemeRecord | null>(null)
const deleteOpen = ref(false)
watch(deleteOpen, (o) => {
  if (!o) pendingDelete.value = null
})
function askDelete(theme: ThemeRecord) {
  pendingDelete.value = theme
  deleteOpen.value = true
}
const remove = useMutation({
  mutationFn: (theme: ThemeRecord) => deleteTheme(theme.id),
  onSuccess: (_v, theme) => {
    deleteOpen.value = false
    refreshThemes()
    if (appliedId.value === theme.id) apply.mutate(null)
  },
  onError: (error) => toast.error(errorMessage(error, 'Could not delete the theme')),
})

// Generate a palette from seed colours and store it as a custom theme.
const seedPrimary = ref('#4a6ebd')
const seedBackground = ref('#ffffff')
const generate = useMutation({
  mutationFn: async () => {
    const colors = await generateTheme({ primary: seedPrimary.value, background: seedBackground.value })
    return createTheme({ name: 'Generated theme', description: 'Generated from seed colours', data: { colors } })
  },
  onSuccess: (created) => {
    refreshThemes()
    toast.success(`Added "${created.name}"`)
  },
  onError: (error) => toast.error(errorMessage(error, 'Could not generate a theme')),
})
</script>

<template>
  <section class="flex flex-1 flex-col px-5 pb-[18px] max-[1279px]:px-4 min-[1600px]:px-[23px]" aria-label="Design">
    <div class="pt-6 pb-[22px] min-[1600px]:pt-7 min-[1600px]:pb-[26px] [@media(max-height:780px)_and_(min-width:1051px)]:pt-[17px] [@media(max-height:780px)_and_(min-width:1051px)]:pb-4">
      <h2 class="text-[19px] font-medium tracking-[-0.04em] text-[#f0f2f3] max-[1279px]:text-[18px] min-[1600px]:text-[22px]">Make it yours.</h2>
      <p class="mt-[5px] text-[10px] leading-[1.6] text-[#a0abb1]">One theme recolours every slide in the deck.</p>
    </div>

    <div class="pb-[19px]">
      <div class="mb-3 flex items-center justify-between text-[10px] font-medium text-[#d0d7dc] min-[1600px]:text-[11px]">
        <h3>Theme</h3>
        <button
          type="button"
          class="-mr-1.5 inline-flex h-6 items-center gap-1 rounded-control px-1.5 text-[9px] font-normal text-[#9aa9b0] hover:bg-white/[0.04] hover:text-white"
          @click="openEditor(null)"
        >
          <Plus class="size-3" aria-hidden="true" />New theme
        </button>
      </div>

      <p v-if="themes.isError.value" class="mb-3 text-[11px] text-muted" role="alert">Could not load themes.</p>

      <div class="grid grid-cols-2 gap-x-3 gap-y-[13px] max-[1279px]:gap-x-2.5 max-[1279px]:gap-y-[11px] min-[1600px]:gap-x-[15px] min-[1600px]:gap-y-[17px]">
        <ThemeSwatch
          name="Default"
          :theme="null"
          :selected="appliedId === null"
          :custom="false"
          :disabled="editor.generating"
          @select="apply.mutate(null)"
        />
        <ThemeSwatch
          v-for="t in themeList"
          :key="t.id"
          :name="t.name"
          :theme="t"
          :selected="appliedId === t.id"
          :custom="isCustom(t)"
          :disabled="editor.generating"
          @select="apply.mutate(t)"
          @edit="openEditor(t)"
          @remove="askDelete(t)"
        />
      </div>
    </div>

    <form class="border-t border-line py-[18px] min-[1600px]:py-[22px]" @submit.prevent="generate.mutate()">
      <div class="mb-3 flex items-center justify-between text-[10px] font-medium text-[#d0d7dc] min-[1600px]:text-[11px]">
        <h3>Generate from colours</h3>
        <span class="text-[9px] font-normal text-[#9aa9b0]">Primary · background</span>
      </div>
      <div class="flex items-center gap-2.5">
        <label class="grid size-[34px] cursor-pointer place-items-center rounded-control border border-white/[0.06] bg-field hover:bg-[#303a3f]">
          <span class="size-[22px] rounded-full border border-white/[0.12]" :style="{ background: seedPrimary }" aria-hidden="true" />
          <input v-model="seedPrimary" type="color" class="sr-only" aria-label="Seed primary colour" />
        </label>
        <label class="grid size-[34px] cursor-pointer place-items-center rounded-control border border-white/[0.06] bg-field hover:bg-[#303a3f]">
          <span class="size-[22px] rounded-full border border-white/[0.12]" :style="{ background: seedBackground }" aria-hidden="true" />
          <input v-model="seedBackground" type="color" class="sr-only" aria-label="Seed background colour" />
        </label>
        <Button type="submit" variant="secondary" class="h-[34px] flex-1 text-[11px] font-medium" :disabled="generate.isPending.value">
          {{ generate.isPending.value ? 'Generating…' : 'Generate theme' }}
        </Button>
      </div>
    </form>

    <p class="mt-auto pt-5 text-center text-[9px] text-[#99a9b2]">Good design is in the details.</p>

    <ThemeEditorDialog v-model:open="editorOpen" :theme="editing" :saving="save.isPending.value" @save="save.mutate($event)" />

    <Dialog v-model:open="deleteOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete theme?</DialogTitle>
          <DialogDescription>"{{ pendingDelete?.name }}" will be permanently deleted.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" @click="deleteOpen = false">Cancel</Button>
          <Button variant="destructive" @click="pendingDelete && remove.mutate(pendingDelete)">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
