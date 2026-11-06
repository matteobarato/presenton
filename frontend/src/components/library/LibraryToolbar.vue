<script setup lang="ts">
import { LayoutGrid, List, Search } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { LibraryLayout } from './deckMeta'

const search = defineModel<string>('search', { required: true })
const layout = defineModel<LibraryLayout>('layout', { required: true })
</script>

<template>
  <div class="flex items-center gap-3">
    <div class="relative max-w-sm flex-1">
      <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#9aa3a8]" aria-hidden="true" />
      <Input v-model="search" type="search" aria-label="Search presentations" placeholder="Search presentations" class="pl-9" />
    </div>
    <div class="flex gap-1" role="group" aria-label="Layout">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Grid view"
        :aria-pressed="layout === 'grid'"
        :class="layout === 'grid' && 'bg-white/[0.06] text-[#f6f8f9]'"
        @click="layout = 'grid'"
      >
        <LayoutGrid class="size-4" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="List view"
        :aria-pressed="layout === 'list'"
        :class="layout === 'list' && 'bg-white/[0.06] text-[#f6f8f9]'"
        @click="layout = 'list'"
      >
        <List class="size-4" aria-hidden="true" />
      </Button>
    </div>
  </div>
</template>
