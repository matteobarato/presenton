<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { useLocalStorage } from '@vueuse/core'
import { ApiError, extractApiErrorMessage } from '@/api/errors'
import {
  deletePresentation,
  duplicatePresentation,
  listPresentations,
  presentationKeys,
  type PresentationSummary,
} from '@/api/presentations'
import { toast } from '@/components/ui/sonner'
import { Skeleton } from '@/components/ui/skeleton'
import DeleteDeckDialog from '@/components/library/DeleteDeckDialog.vue'
import EmptyLibrary from '@/components/library/EmptyLibrary.vue'
import LibraryToolbar from '@/components/library/LibraryToolbar.vue'
import PresentationCard from '@/components/library/PresentationCard.vue'
import PresentationRow from '@/components/library/PresentationRow.vue'
import { deckTitle, type LibraryLayout } from '@/components/library/deckMeta'

const queryClient = useQueryClient()
const query = useQuery({ queryKey: presentationKeys.all, queryFn: listPresentations })

const layout = useLocalStorage<LibraryLayout>('presenton.library.view', 'grid')
const search = ref('')

const visible = computed(() => {
  const needle = search.value.trim().toLowerCase()
  return [...(query.data.value ?? [])]
    .filter((p) => !needle || deckTitle(p).toLowerCase().includes(needle))
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
})

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return extractApiErrorMessage(error.body, fallback, error.status)
  return extractApiErrorMessage(error instanceof Error ? error.message : null, fallback)
}

const duplicate = useMutation({
  mutationFn: (p: PresentationSummary) => duplicatePresentation(p.id),
  onSuccess: (_copy, p) => {
    void queryClient.invalidateQueries({ queryKey: presentationKeys.all })
    toast.success(`Duplicated "${deckTitle(p)}"`)
  },
  onError: (error) => toast.error(errorMessage(error, 'Could not duplicate the presentation')),
})

const remove = useMutation({
  mutationFn: (p: PresentationSummary) => deletePresentation(p.id),
  onMutate: async (p) => {
    await queryClient.cancelQueries({ queryKey: presentationKeys.all })
    const previous = queryClient.getQueryData<PresentationSummary[]>(presentationKeys.all)
    queryClient.setQueryData<PresentationSummary[]>(presentationKeys.all, (old) => old?.filter((d) => d.id !== p.id))
    return { previous }
  },
  onError: (error, _p, ctx) => {
    if (ctx?.previous) queryClient.setQueryData(presentationKeys.all, ctx.previous)
    toast.error(errorMessage(error, 'Could not delete the presentation'))
  },
})

const pendingDelete = ref<PresentationSummary | null>(null)
const dialogOpen = ref(false)
watch(dialogOpen, (open) => {
  if (!open) pendingDelete.value = null
})

function askDelete(p: PresentationSummary) {
  pendingDelete.value = p
  dialogOpen.value = true
}

function confirmDelete() {
  const p = pendingDelete.value
  dialogOpen.value = false
  if (p) remove.mutate(p)
}
</script>

<template>
  <section class="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-8 py-8 max-[760px]:px-4">
    <h1 class="text-[22px] font-semibold tracking-[-0.02em] text-[#f6f8f9]">Library</h1>

    <LibraryToolbar v-model:search="search" v-model:layout="layout" />

    <div v-if="query.isPending.value" class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5" aria-busy="true">
      <Skeleton v-for="n in 6" :key="n" class="aspect-video rounded-[14px]" />
    </div>
    <p v-else-if="query.isError.value" role="alert" class="text-[13px] text-[#e49a9a]">
      {{ errorMessage(query.error.value, 'Could not load your presentations') }}
    </p>
    <EmptyLibrary v-else-if="!visible.length" :searching="Boolean(search.trim())" />
    <div v-else-if="layout === 'list'" class="flex flex-col gap-2.5">
      <PresentationRow v-for="p in visible" :key="p.id" :presentation="p" @duplicate="duplicate.mutate(p)" @delete="askDelete(p)" />
    </div>
    <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
      <PresentationCard v-for="p in visible" :key="p.id" :presentation="p" @duplicate="duplicate.mutate(p)" @delete="askDelete(p)" />
    </div>

    <DeleteDeckDialog v-model:open="dialogOpen" :title="pendingDelete ? deckTitle(pendingDelete) : ''" @confirm="confirmDelete" />
  </section>
</template>
