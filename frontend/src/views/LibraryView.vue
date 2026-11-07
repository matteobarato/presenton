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
import { RouterLink } from 'vue-router'
import { ArrowUpRight, Asterisk, Plus, Sparkles } from 'lucide-vue-next'
import PageHeader from '@/components/shell/PageHeader.vue'
import { buttonVariants } from '@/components/ui/button'
import { useSessionStore } from '@/stores/session'

const queryClient = useQueryClient()
const session = useSessionStore()
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
  <PageHeader title="Your presentations">
    <template #actions>
      <RouterLink to="/new" :class="buttonVariants()"><Plus class="size-4" aria-hidden="true" />New presentation</RouterLink>
    </template>
  </PageHeader>

  <section class="workspace-card">
    <div class="mb-[33px] flex items-center justify-between">
      <div>
        <h1 class="text-[34px] leading-[1.22] font-medium tracking-[-0.04em] text-[#e4ecf0] max-[1050px]:text-[30px] max-[760px]:text-[27px] max-[450px]:text-[25px]">
          What will you create today?
        </h1>
        <p class="mt-[13px] text-[12px] text-[#9aabb4] max-[760px]:text-[11px] max-[760px]:leading-[1.7]">
          {{ session.user?.username ? `Welcome back, ${session.user.username}.` : 'Welcome back.' }} Your next great story is waiting to happen.
        </p>
      </div>
      <Asterisk class="mr-[18px] size-[95px] rotate-[15deg] text-[#a8c6d4] max-[760px]:hidden" :stroke-width="1" aria-hidden="true" />
    </div>

    <RouterLink
      to="/new"
      class="mb-[45px] flex w-full items-center gap-[17px] rounded-panel border border-[#95bed022] bg-[linear-gradient(110deg,#344b57,#222e35)] px-7 py-6 text-left text-[#d8e7ef] transition-[border-color,transform] duration-200 hover:border-[#91c0da66] motion-safe:hover:-translate-y-0.5 max-[1050px]:p-[22px] max-[760px]:flex-wrap max-[760px]:gap-3.5 max-[760px]:p-5 max-[450px]:px-3.5 max-[450px]:py-[18px]"
    >
      <span class="grid size-[45px] flex-none place-items-center rounded-[12px] bg-[#badbef15] text-[#cbe8f5] max-[450px]:size-[35px]">
        <Sparkles class="size-[22px] max-[450px]:size-[15px]" aria-hidden="true" />
      </span>
      <span class="max-[760px]:flex-1">
        <strong class="block text-[17px] font-medium max-[760px]:text-[15px]">Start with an idea.</strong>
        <span class="mt-[5px] block text-[11px] text-[#a9bdc8] max-[760px]:max-w-[250px] max-[760px]:leading-[1.6]">
          Describe it, attach a document, and get an outline you can shape into slides.
        </span>
      </span>
      <span class="ml-auto flex items-center gap-2.5 text-[11px] text-[#cee7f5] max-[1050px]:text-[10px] max-[760px]:ml-[60px] max-[450px]:ml-[49px]">
        Create a presentation <ArrowUpRight class="size-[18px]" aria-hidden="true" />
      </span>
    </RouterLink>

    <div class="mb-[22px] flex items-center justify-between gap-5 max-[760px]:flex-col max-[760px]:items-start">
      <h2 class="flex items-center text-[16px] font-medium max-[760px]:text-[14px]">
        Your presentations
        <span v-if="query.data.value" class="ml-2 rounded-[6px] bg-[#303d45] px-[7px] py-[3px] text-[10px] text-[#9db3c0] tabular-nums">{{ query.data.value.length }}</span>
      </h2>
      <LibraryToolbar v-model:search="search" v-model:layout="layout" />
    </div>

    <div v-if="query.isPending.value" class="grid grid-cols-3 gap-6 max-[1050px]:grid-cols-2 max-[760px]:grid-cols-1" aria-busy="true">
      <Skeleton v-for="n in 6" :key="n" class="aspect-video rounded-card" />
    </div>
    <p v-else-if="query.isError.value" role="alert" class="text-[13px] text-danger-text">
      {{ errorMessage(query.error.value, 'Could not load your presentations') }}
    </p>
    <EmptyLibrary v-else-if="!visible.length" :searching="Boolean(search.trim())" :query="search.trim()" @clear="search = ''" />
    <div v-else-if="layout === 'list'" class="flex flex-col gap-2.5">
      <PresentationRow v-for="p in visible" :key="p.id" :presentation="p" @duplicate="duplicate.mutate(p)" @delete="askDelete(p)" />
    </div>
    <div v-else class="grid grid-cols-3 gap-6 max-[1050px]:grid-cols-2 max-[760px]:grid-cols-1 max-[760px]:gap-[25px] min-[1800px]:grid-cols-4">
      <PresentationCard v-for="p in visible" :key="p.id" :presentation="p" @duplicate="duplicate.mutate(p)" @delete="askDelete(p)" />
      <RouterLink
        v-if="!search.trim()"
        to="/new"
        class="flex aspect-video flex-col items-center justify-center self-start rounded-card border border-dashed border-[#829caa3d] bg-[#24303829] text-[#a2bac8] hover:border-[#b8d7e86b] hover:bg-[#2f46502e] max-[760px]:aspect-auto max-[760px]:min-h-[140px]"
      >
        <Plus class="size-[25px]" aria-hidden="true" />
        <span class="mt-3 text-[12px] text-[#c5d7e3]">A fresh canvas</span>
        <span class="mt-1.5 text-[10px] text-[#95acb9]">Make something that’s yours.</span>
      </RouterLink>
    </div>

    <DeleteDeckDialog v-model:open="dialogOpen" :title="pendingDelete ? deckTitle(pendingDelete) : ''" @confirm="confirmDelete" />
  </section>
</template>
