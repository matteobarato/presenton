<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { ApiError, extractApiErrorMessage } from '@/api/errors'
import { listTemplates, templatesKey, type TemplateKind } from '@/api/templates'
import { Search } from 'lucide-vue-next'
import PageHeader from '@/components/shell/PageHeader.vue'
import TemplateCard from '@/components/templates/TemplateCard.vue'
import TemplatesToolbar from '@/components/templates/TemplatesToolbar.vue'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const route = useRoute()
const router = useRouter()
const query = useQuery({ queryKey: templatesKey, queryFn: listTemplates })

const search = ref('')
const kind = computed<'all' | TemplateKind>({
  get: () => (route.query.kind === 'builtin' || route.query.kind === 'custom' ? route.query.kind : 'all'),
  set: (v) => {
    void router.replace({ query: { ...route.query, kind: v === 'all' ? undefined : v } })
  },
})

const visible = computed(() => {
  const needle = search.value.trim().toLowerCase()
  const all = query.data.value ?? []
  // Built-in first; Array.prototype.sort is stable so each group keeps its API order.
  const ordered = [...all.filter((t) => t.kind === 'builtin'), ...all.filter((t) => t.kind !== 'builtin')]
  return ordered.filter(
    (t) => (kind.value === 'all' || t.kind === kind.value) && (!needle || t.name.toLowerCase().includes(needle)),
  )
})

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return extractApiErrorMessage(error.body, fallback, error.status)
  return fallback
}

function clearFilters() {
  search.value = ''
  kind.value = 'all'
}
</script>

<template>
  <PageHeader title="Templates" />

  <section class="workspace-card">
    <div class="mb-[33px]">
      <h1 class="text-[34px] leading-[1.22] font-medium tracking-[-0.04em] text-[#e4ecf0] max-[1050px]:text-[30px] max-[760px]:text-[27px] max-[450px]:text-[25px]">
        A head start on something great.
      </h1>
      <p class="mt-[13px] text-[12px] text-[#9aabb4] max-[760px]:text-[11px] max-[760px]:leading-[1.7]">
        Every layout your next deck can be built from.
      </p>
    </div>

    <div class="mb-[22px] flex items-center justify-between gap-5 max-[760px]:flex-col max-[760px]:items-start">
      <h2 class="flex items-center text-[16px] font-medium max-[760px]:text-[14px]">
        Templates
        <span v-if="query.data.value" class="ml-2 rounded-[6px] bg-[#303d45] px-[7px] py-[3px] text-[10px] text-[#9db3c0] tabular-nums">{{ query.data.value.length }}</span>
      </h2>
      <TemplatesToolbar v-model:search="search" v-model:kind="kind" />
    </div>

    <div v-if="query.isPending.value" class="grid grid-cols-3 gap-6 max-[1050px]:grid-cols-2 max-[760px]:grid-cols-1" aria-busy="true">
      <Skeleton v-for="n in 6" :key="n" class="aspect-video rounded-card" />
    </div>
    <Alert v-else-if="query.isError.value" variant="destructive" class="flex items-center justify-between gap-4 py-2 text-[12px]">
      <span>{{ errorMessage(query.error.value, 'Could not load templates') }}</span>
      <Button variant="secondary" size="sm" @click="query.refetch()">Retry</Button>
    </Alert>
    <div v-else-if="!visible.length" class="flex flex-col items-center px-6 py-[55px] text-center text-[#acc3d2]">
      <Search class="size-7" aria-hidden="true" />
      <template v-if="search.trim()">
        <h2 class="mt-[17px] mb-[7px] text-[20px] font-medium">No templates match “{{ search.trim() }}”</h2>
        <p class="mb-5 text-[12px] text-[#97aebc]">Try a different name or type.</p>
        <Button variant="secondary" @click="clearFilters">Clear</Button>
      </template>
      <template v-else-if="kind === 'custom'">
        <h2 class="mt-[17px] mb-[7px] text-[20px] font-medium">No custom templates</h2>
        <p class="text-[12px] text-[#97aebc]">Custom templates will appear here once they’re created.</p>
      </template>
      <template v-else>
        <h2 class="mt-[17px] mb-[7px] text-[20px] font-medium">No templates</h2>
        <p class="text-[12px] text-[#97aebc]">There are no templates to show yet.</p>
      </template>
    </div>
    <div v-else class="grid grid-cols-3 gap-6 max-[1050px]:grid-cols-2 max-[760px]:grid-cols-1 max-[760px]:gap-[25px] min-[1800px]:grid-cols-4">
      <TemplateCard v-for="t in visible" :key="t.id" :template="t" />
    </div>
  </section>
</template>
