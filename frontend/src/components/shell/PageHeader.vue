<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'

/** Aera topbar for workspace pages: a quiet breadcrumb on the left, page actions on the right. */
defineProps<{ title: string; parent?: { label: string; to: RouteLocationRaw } }>()
const { t } = useI18n()
</script>

<template>
  <header
    :class="$slots.center ? 'center-grid' : ''"
    class="flex h-[83px] flex-none items-center justify-between gap-5 px-[27px] max-[1279px]:px-5 max-[760px]:h-[75px] max-[760px]:gap-3 max-[760px]:px-4 max-[450px]:px-[11px] [@media(max-height:780px)_and_(min-width:1051px)]:h-[69px]"
  >
    <nav :aria-label="t('shell.breadcrumb.label')" class="flex min-w-0 items-center gap-[13px]">
      <RouterLink to="/" class="text-[11px] whitespace-nowrap text-tx-929b9f hover:text-accent max-[760px]:hidden">{{ t('shell.breadcrumb.workspace') }}</RouterLink>
      <ChevronRight class="size-[13px] flex-none text-tx-667179 max-[760px]:hidden" aria-hidden="true" />
      <template v-if="parent">
        <RouterLink :to="parent.to" class="text-[11px] whitespace-nowrap text-tx-929b9f hover:text-accent max-[760px]:hidden">{{ parent.label }}</RouterLink>
        <ChevronRight class="size-[13px] flex-none text-tx-667179 max-[760px]:hidden" aria-hidden="true" />
      </template>
      <span class="truncate text-[12px] font-semibold text-tx-e4e8ea" aria-current="page">{{ title }}</span>
    </nav>
    <div v-if="$slots.center" class="flex min-w-0 justify-center"><slot name="center" /></div>
    <div class="flex flex-none items-center justify-end gap-[9px]" :class="$slots.center && 'min-w-0'"><slot name="actions" /></div>
  </header>
</template>

<style scoped>
/* A centered slot (the create wizard's step bar): breadcrumb | center | actions, the center never squeezed. */
.center-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
}
</style>
