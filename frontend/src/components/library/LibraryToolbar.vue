<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { LayoutGrid, List, Search } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import type { LibraryLayout } from './deckMeta'

const search = defineModel<string>('search', { required: true })
const layout = defineModel<LibraryLayout>('layout', { required: true })
const { t } = useI18n()
</script>

<template>
  <div class="flex items-center gap-3 max-[760px]:w-full">
    <label class="flex h-[35px] items-center gap-[9px] rounded-[8px] bg-sx-242d32 px-[11px] text-tx-91a5b1 focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-accent max-[760px]:min-w-[100px] max-[760px]:flex-1">
      <Search class="size-[15px] flex-none" aria-hidden="true" />
      <input
        v-model="search"
        type="search"
        :aria-label="t('library.toolbar.search')"
        :placeholder="t('library.toolbar.find')"
        class="w-[170px] min-w-0 bg-transparent text-[11px] text-tx-d4e3eb placeholder:text-tx-96acb9 focus-visible:outline-none max-[760px]:w-full"
      />
    </label>
    <div class="flex gap-1" role="group" :aria-label="t('library.toolbar.layout')">
      <Button
        variant="ghost"
        size="icon"
        class="size-[35px]"
        :aria-label="t('library.toolbar.grid')"
        :aria-pressed="layout === 'grid'"
        :class="layout === 'grid' && 'bg-sx-242d32 text-tx-d4e3eb'"
        @click="layout = 'grid'"
      >
        <LayoutGrid class="size-4" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="size-[35px]"
        :aria-label="t('library.toolbar.list')"
        :aria-pressed="layout === 'list'"
        :class="layout === 'list' && 'bg-sx-242d32 text-tx-d4e3eb'"
        @click="layout = 'list'"
      >
        <List class="size-4" aria-hidden="true" />
      </Button>
    </div>
  </div>
</template>
