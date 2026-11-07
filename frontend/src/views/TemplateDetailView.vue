<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-vue-next'
import { ApiError, extractApiErrorMessage } from '@/api/errors'
import { listTemplates, templatesKey } from '@/api/templates'
import PageHeader from '@/components/shell/PageHeader.vue'
import { layoutToSlide } from '@/components/templates/layoutSlide'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useTemplateLayouts } from '@/composables/useTemplateLayouts'
import SlideView from '@/render/SlideView.vue'

const route = useRoute()
const router = useRouter()
const list = useQuery({ queryKey: templatesKey, queryFn: listTemplates })

const template = computed(() => list.data.value?.find((t) => t.id === route.params.id))
const { layouts, theme, fonts, pending, failed, retry } = useTemplateLayouts(template)

const from = computed(() => (route.query.from === 'builtin' || route.query.from === 'custom' ? route.query.from : undefined))
const parent = computed(() => ({
  label: 'Templates',
  to: from.value ? `/templates?kind=${from.value}` : '/templates',
}))

const count = computed(() => template.value?.layouts.length ?? 0)
const isCustom = computed(() => template.value?.kind === 'custom')

// Task 5 binds the rename/delete dialogs to these.
const renameOpen = ref(false)
const deleteOpen = ref(false)
function openRename() {
  renameOpen.value = true
}
function openDelete() {
  deleteOpen.value = true
}

function useTemplate() {
  if (template.value) void router.push({ name: 'new', query: { template: template.value.id } })
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return extractApiErrorMessage(error.body, fallback, error.status)
  return fallback
}
</script>

<template>
  <PageHeader :title="template?.name ?? 'Template'" :parent="parent">
    <template v-if="template" #actions>
      <DropdownMenu v-if="isCustom">
        <DropdownMenuTrigger
          data-testid="template-actions"
          :class="buttonVariants({ variant: 'secondary', size: 'icon' })"
          aria-label="Template actions"
        >
          <MoreHorizontal class="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="min-w-40">
          <DropdownMenuItem @select="openRename"><Pencil class="size-3.5" aria-hidden="true" />Rename</DropdownMenuItem>
          <DropdownMenuItem @select="openDelete"><Trash2 class="size-3.5" aria-hidden="true" />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button :disabled="!count" @click="useTemplate">Use this template</Button>
    </template>
  </PageHeader>

  <section class="workspace-card">
    <div v-if="list.isPending.value" aria-busy="true">
      <Skeleton class="h-[34px] w-64" />
      <Skeleton class="mt-[13px] h-3 w-80" />
      <div class="mt-8 grid grid-cols-3 gap-x-[25px] gap-y-[30px] max-[1050px]:grid-cols-2 max-[760px]:grid-cols-1">
        <Skeleton v-for="n in 6" :key="n" class="aspect-video rounded-[9px]" />
      </div>
    </div>
    <Alert v-else-if="list.isError.value" variant="destructive" class="flex items-center justify-between gap-4 py-2 text-[12px]">
      <span>{{ errorMessage(list.error.value, 'Could not load templates') }}</span>
      <Button variant="secondary" size="sm" @click="list.refetch()">Retry</Button>
    </Alert>
    <div v-else-if="!template" class="flex flex-col items-center px-6 py-[55px] text-center text-[#acc3d2]">
      <h2 class="mb-[7px] text-[20px] font-medium">Template not found</h2>
      <p class="mb-5 text-[12px] text-[#97aebc]">It may have been deleted or renamed.</p>
      <RouterLink to="/templates" :class="buttonVariants({ variant: 'secondary' })">Back to templates</RouterLink>
    </div>
    <template v-else>
      <div>
        <div class="flex flex-wrap items-center gap-3">
          <h1 class="text-[34px] leading-[1.22] font-medium tracking-[-0.04em] text-[#e4ecf0] max-[1050px]:text-[30px] max-[760px]:text-[27px] max-[450px]:text-[25px]">{{ template.name }}</h1>
          <Badge :variant="isCustom ? 'default' : 'secondary'">{{ isCustom ? 'Custom' : 'Built-in' }}</Badge>
        </div>
        <p class="mt-[13px] text-[12px] text-[#9aabb4] max-[760px]:text-[11px]">{{ count }} {{ count === 1 ? 'layout' : 'layouts' }}</p>
        <p v-if="template.description" class="mt-2 max-w-[640px] text-[12px] leading-[1.7] text-[#9aabb4] max-[760px]:text-[11px]">{{ template.description }}</p>
      </div>

      <div v-if="pending" class="mt-8 grid grid-cols-3 gap-x-[25px] gap-y-[30px] max-[1050px]:grid-cols-2 max-[760px]:grid-cols-1" aria-busy="true">
        <Skeleton v-for="n in Math.max(count, 1)" :key="n" class="aspect-video rounded-[9px]" />
      </div>
      <Alert v-else-if="failed" variant="destructive" class="mt-8 flex items-center justify-between gap-4 py-2 text-[12px]">
        <span>Could not load this template’s layouts</span>
        <Button variant="secondary" size="sm" @click="retry">Retry</Button>
      </Alert>
      <p v-else-if="!layouts.length" class="mt-8 text-[12px] text-[#97aebc]">This template has no layouts yet.</p>
      <div v-else class="mt-8 grid grid-cols-3 gap-x-[25px] gap-y-[30px] max-[1050px]:grid-cols-2 max-[760px]:grid-cols-1">
        <button
          v-for="(layout, i) in layouts"
          :key="i"
          type="button"
          data-testid="layout-card"
          class="group block min-w-0 rounded-[9px] p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent"
        >
          <div class="aspect-video overflow-hidden rounded-[9px] bg-[#101416] shadow-[0_6px_15px_#0002] transition-transform duration-[180ms] motion-safe:group-hover:-translate-y-[3px]">
            <SlideView :slide="layoutToSlide(template.id, layout, i)" :theme="theme" :fonts="fonts" fit="width" lazy />
          </div>
          <span class="mt-[11px] block text-[10px] text-[#9eb7c7] tabular-nums">{{ String(i + 1).padStart(2, '0') }}</span>
        </button>
      </div>
    </template>
  </section>
</template>
