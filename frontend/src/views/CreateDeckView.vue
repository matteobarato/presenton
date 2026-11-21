<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { usePresentation } from '@/api/presentations'
import { ApiError } from '@/api/errors'
import { Skeleton } from '@/components/ui/skeleton'
import PageHeader from '@/components/shell/PageHeader.vue'
import DeckStateProvider from '@/components/editor/DeckStateProvider.vue'
import DeckWizard from '@/components/create/wizard/DeckWizard.vue'

/** `/p/:id/create/:step?`: all six create-wizard steps of an existing deck (Topic and Presenter as summaries, Outline to Export as the working steps). */
const route = useRoute()
const id = computed(() => String(route.params.id ?? ''))
const { data: presentation, error, isError, refetch } = usePresentation(id)
const notFound = computed(() => error.value instanceof ApiError && error.value.status === 404)
</script>

<template>
  <div v-if="isError && !presentation" class="grid h-full place-items-center p-6 text-center" role="alert">
    <div class="space-y-3">
      <h1 class="font-display text-xl font-medium">{{ notFound ? 'Presentation not found' : 'Could not load this presentation' }}</h1>
      <p class="text-[13px] text-muted">{{ notFound ? 'It may have been deleted.' : (error as Error)?.message }}</p>
      <div class="flex justify-center gap-3 text-[12px] font-semibold">
        <button v-if="!notFound" type="button" class="rounded-button bg-secondary px-3 py-2 hover:bg-secondary-hover" @click="refetch()">Try again</button>
        <RouterLink :to="{ name: 'library' }" class="rounded-button bg-secondary px-3 py-2 hover:bg-secondary-hover">Back to library</RouterLink>
      </div>
    </div>
  </div>

  <template v-else-if="!presentation">
    <PageHeader title="New presentation" />
    <section class="workspace-card" aria-busy="true" aria-label="Loading presentation">
      <div class="mx-auto flex w-full max-w-[880px] flex-col gap-7">
        <Skeleton class="h-[52px] w-full rounded-card" />
        <Skeleton class="h-[320px] w-full rounded-panel" />
      </div>
    </section>
  </template>

  <DeckStateProvider v-else :key="id" :presentation-id="id" :presentation="presentation">
    <DeckWizard :presentation-id="id" :presentation="presentation" />
  </DeckStateProvider>
</template>
