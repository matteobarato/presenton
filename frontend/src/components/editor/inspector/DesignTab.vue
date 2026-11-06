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
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/sonner'
import ThemeEditorDialog from './ThemeEditorDialog.vue'
import ThemeSwatch from './ThemeSwatch.vue'

const props = defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()

const queryClient = useQueryClient()
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
    const previous = queryClient.getQueryData<Presentation>(key)
    queryClient.setQueryData<Presentation>(key, (old) => (old ? ({ ...old, theme } as Presentation) : old))
    return { previous }
  },
  onError: (error, _theme, ctx) => {
    if (ctx?.previous) queryClient.setQueryData(presentationKeys.one(props.presentationId), ctx.previous)
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
  <section class="flex flex-col gap-4 p-3" aria-label="Design">
    <div class="flex items-center justify-between">
      <h3 class="text-[12px] font-medium text-[#dce6ec]">Themes</h3>
      <Button size="sm" variant="ghost" @click="openEditor(null)"><Plus class="size-3" /> New theme</Button>
    </div>

    <p v-if="themes.isError.value" class="text-[12px] text-muted" role="alert">Could not load themes.</p>

    <div class="grid grid-cols-2 gap-2">
      <ThemeSwatch
        name="Default"
        :theme="null"
        :selected="appliedId === null"
        :custom="false"
        @select="apply.mutate(null)"
      />
      <ThemeSwatch
        v-for="t in themeList"
        :key="t.id"
        :name="t.name"
        :theme="t"
        :selected="appliedId === t.id"
        :custom="isCustom(t)"
        @select="apply.mutate(t)"
        @edit="openEditor(t)"
        @remove="askDelete(t)"
      />
    </div>

    <form class="flex flex-col gap-2 border-t border-white/10 pt-3" @submit.prevent="generate.mutate()">
      <Label>Generate from colours</Label>
      <div class="flex items-center gap-2">
        <input v-model="seedPrimary" type="color" class="size-8 cursor-pointer rounded-[6px] border border-white/10 bg-transparent" aria-label="Seed primary colour" />
        <input v-model="seedBackground" type="color" class="size-8 cursor-pointer rounded-[6px] border border-white/10 bg-transparent" aria-label="Seed background colour" />
        <Button type="submit" size="sm" :disabled="generate.isPending.value">
          {{ generate.isPending.value ? 'Generating…' : 'Generate theme' }}
        </Button>
      </div>
    </form>

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
