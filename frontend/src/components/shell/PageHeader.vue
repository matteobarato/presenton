<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'

/** Aera topbar for workspace pages: a quiet breadcrumb on the left, page actions on the right. */
defineProps<{ title: string; parent?: { label: string; to: string } }>()
</script>

<template>
  <header
    class="flex h-[83px] flex-none items-center justify-between gap-5 px-[27px] max-[1279px]:px-5 max-[760px]:h-[75px] max-[760px]:gap-3 max-[760px]:px-4 max-[450px]:px-[11px] [@media(max-height:780px)_and_(min-width:1051px)]:h-[69px]"
  >
    <nav aria-label="Breadcrumb" class="flex min-w-0 items-center gap-[13px]">
      <RouterLink to="/" class="text-[11px] whitespace-nowrap text-[#929b9f] hover:text-accent max-[760px]:hidden">Workspace</RouterLink>
      <ChevronRight class="size-[13px] flex-none text-[#667179] max-[760px]:hidden" aria-hidden="true" />
      <template v-if="parent">
        <RouterLink :to="parent.to" class="text-[11px] whitespace-nowrap text-[#929b9f] hover:text-accent max-[760px]:hidden">{{ parent.label }}</RouterLink>
        <ChevronRight class="size-[13px] flex-none text-[#667179] max-[760px]:hidden" aria-hidden="true" />
      </template>
      <span class="truncate text-[12px] font-semibold text-[#e4e8ea]" aria-current="page">{{ title }}</span>
    </nav>
    <div class="flex flex-none items-center gap-[9px]"><slot name="actions" /></div>
  </header>
</template>
