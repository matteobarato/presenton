<script setup lang="ts">
import { ref } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { Plus } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { createTheme, themeKeys, type ThemeCreateBody, type ThemeRecord } from '@/api/themes'
import ThemeEditorDialog from '@/components/editor/inspector/ThemeEditorDialog.vue'
import ThemeSwatch from '@/components/editor/inspector/ThemeSwatch.vue'

defineProps<{ themes: ThemeRecord[]; disabled?: boolean }>()
const model = defineModel<string | null>({ default: null })

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)
const queryClient = useQueryClient()
const editorOpen = ref(false)
const save = useMutation({
  mutationFn: (body: ThemeCreateBody) => createTheme(body),
  onSuccess: async (saved) => {
    // Refetch first so the new id resolves in the list before it is selected.
    await queryClient.invalidateQueries({ queryKey: themeKeys.all })
    editorOpen.value = false
    model.value = saved.id
    toast.success(`Saved "${saved.name}"`)
  },
  onError: (error) => toast.error(errorMessage(error, 'Could not save the theme')),
})
</script>

<template>
  <div class="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-x-3 gap-y-[13px]" role="group" aria-label="Theme">
    <div data-testid="theme-option-none">
      <ThemeSwatch name="Template colours" :theme="null" :selected="model === null" :custom="false" :disabled="disabled" @select="model = null" />
    </div>
    <div v-for="t in themes" :key="t.id" :data-testid="`theme-option-${t.id}`">
      <ThemeSwatch :name="t.name" :theme="t" :selected="model === t.id" :custom="false" :disabled="disabled" @select="model = t.id" />
    </div>
    <button
      type="button"
      :disabled="disabled"
      data-testid="theme-new"
      class="flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-white/[0.12] text-[11px] text-[#93a6b0] transition-colors hover:border-white/25 hover:text-[#c8dbe4] focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
      @click="editorOpen = true"
    >
      <Plus class="size-4" aria-hidden="true" />
      New theme
    </button>
    <ThemeEditorDialog v-model:open="editorOpen" :theme="null" :saving="save.isPending.value" @save="save.mutate($event)" />
  </div>
</template>
