<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { ApiError, extractApiErrorMessage } from '@/api/errors'
import { listTemplates, templatesKey, type TemplateKind } from '@/api/templates'
import { importTasksKey, listImportTasks } from '@/api/templateImport'
import { FileUp, Search } from 'lucide-vue-next'
import PageHeader from '@/components/shell/PageHeader.vue'
import ImportTaskCard from '@/components/templates/ImportTaskCard.vue'
import ImportTemplateDialog from '@/components/templates/import/ImportTemplateDialog.vue'
import TemplateCard from '@/components/templates/TemplateCard.vue'
import TemplatesToolbar from '@/components/templates/TemplatesToolbar.vue'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const query = useQuery({ queryKey: templatesKey, queryFn: listTemplates })
const queryClient = useQueryClient()

// PowerPoint imports running (or failed) on the server: always refetched on visit, polled while any is
// running, and when one stops running the template list is refetched so the new template takes its place.
const imports = useQuery({
  queryKey: importTasksKey,
  queryFn: () => listImportTasks(),
  staleTime: 0,
  refetchInterval: (q) => (q.state.data?.some((task) => task.status === 'pending') ? 5000 : false),
})
const runningCount = computed(() => imports.data.value?.filter((task) => task.status === 'pending').length ?? 0)
watch(runningCount, (now, before) => {
  if (now < before) void queryClient.invalidateQueries({ queryKey: templatesKey })
})

// The PowerPoint import dialog lives in the URL so a card (or an old /templates/import link) can open it:
// `?import=new` starts or resumes this tab's import, `?import=<task id>` adopts that server task.
const importParam = computed(() => (typeof route.query.import === 'string' && route.query.import ? route.query.import : null))
const importOpen = computed({
  get: () => importParam.value !== null,
  set: (open) => setImport(open ? 'new' : undefined),
})
const importTaskId = computed(() => (importParam.value && importParam.value !== 'new' ? importParam.value : null))
function setImport(value: string | undefined) {
  void router.replace({ query: { ...route.query, import: value } })
}

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
  // Built-in first, then custom; each group keeps API order.
  const ordered = [...all.filter((t) => t.kind === 'builtin'), ...all.filter((t) => t.kind !== 'builtin')]
  return ordered.filter(
    (t) => (kind.value === 'all' || t.kind === kind.value) && (!needle || t.name.toLowerCase().includes(needle)),
  )
})

const runningImports = computed(() =>
  (kind.value === 'all' || kind.value === 'custom') && !search.value.trim() ? (imports.data.value ?? []) : [],
)

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
  <PageHeader :title="t('views.templates.title')" />

  <section class="workspace-card">
    <div class="anim-rise-in mb-[33px]">
      <h1 class="text-[34px] leading-[1.22] font-medium tracking-[-0.04em] text-tx-e4ecf0 max-[1050px]:text-[30px] max-[760px]:text-[27px] max-[450px]:text-[25px]">
        {{ t('views.templates.heading') }}
      </h1>
      <p class="mt-[13px] text-[12px] text-tx-9aabb4 max-[760px]:text-[11px] max-[760px]:leading-[1.7]">
        {{ t('views.templates.intro') }}
      </p>
    </div>

    <div class="mb-[22px] flex items-center justify-between gap-5 max-[760px]:flex-col max-[760px]:items-start">
      <h2 class="flex items-center text-[16px] font-medium max-[760px]:text-[14px]">
        {{ t('views.templates.title') }}
        <span v-if="query.data.value" class="ml-2 rounded-[6px] bg-sx-303d45 px-[7px] py-[3px] text-[10px] text-tx-9db3c0 tabular-nums">{{ query.data.value.length }}</span>
      </h2>
      <div class="flex items-center gap-3 max-[760px]:w-full max-[760px]:flex-col max-[760px]:items-stretch">
        <Button class="max-[760px]:h-11" @click="setImport('new')">
          <FileUp class="size-4" aria-hidden="true" />{{ t('views.templates.import') }}
        </Button>
        <TemplatesToolbar v-model:search="search" v-model:kind="kind" />
      </div>
    </div>

    <div v-if="query.isPending.value" class="grid grid-cols-3 gap-6 max-[1050px]:grid-cols-2 max-[760px]:grid-cols-1" aria-busy="true">
      <Skeleton v-for="n in 6" :key="n" class="aspect-video rounded-card" />
    </div>
    <Alert v-else-if="query.isError.value && !query.data.value" variant="destructive" class="flex items-center justify-between gap-4 py-2 text-[12px]">
      <span>{{ errorMessage(query.error.value, t('views.templates.loadFailed')) }}</span>
      <Button variant="secondary" size="sm" @click="query.refetch()">{{ t('views.templates.retry') }}</Button>
    </Alert>
    <div v-else-if="!visible.length && !runningImports.length" class="flex flex-col items-center px-6 py-[55px] text-center text-tx-acc3d2">
      <Search class="size-7" aria-hidden="true" />
      <template v-if="search.trim() || (kind === 'builtin' && (query.data.value?.length ?? 0) > 0)">
        <h2 class="mt-[17px] mb-[7px] text-[20px] font-medium">{{ search.trim() ? t('views.templates.noMatch', { query: search.trim() }) : t('views.templates.noBuiltIn') }}</h2>
        <p class="mb-5 text-[12px] text-tx-97aebc">{{ t('views.templates.tryDifferent') }}</p>
        <Button variant="secondary" @click="clearFilters">{{ t('views.templates.clear') }}</Button>
      </template>
      <template v-else-if="kind === 'custom'">
        <h2 class="mt-[17px] mb-[7px] text-[20px] font-medium">{{ t('views.templates.noCustom') }}</h2>
        <p class="mb-5 text-[12px] text-tx-97aebc">{{ t('views.templates.customHint') }}</p>
        <Button variant="secondary" @click="setImport('new')">
          <FileUp class="size-4" aria-hidden="true" />{{ t('views.templates.import') }}
        </Button>
      </template>
      <template v-else>
        <h2 class="mt-[17px] mb-[7px] text-[20px] font-medium">{{ t('views.templates.none') }}</h2>
        <p class="text-[12px] text-tx-97aebc">{{ t('views.templates.noneHint') }}</p>
      </template>
    </div>
    <div v-else class="grid grid-cols-3 gap-6 max-[1050px]:grid-cols-2 max-[760px]:grid-cols-1 max-[760px]:gap-[25px] min-[1800px]:grid-cols-4">
      <ImportTaskCard v-for="task in runningImports" :key="task.id" :task="task" />
      <TemplateCard v-for="t in visible" :key="t.id" :template="t" :from="kind === 'all' ? undefined : kind" />
    </div>
  </section>

  <ImportTemplateDialog v-model:open="importOpen" :task-id="importTaskId" @restart="setImport('new')" />
</template>
