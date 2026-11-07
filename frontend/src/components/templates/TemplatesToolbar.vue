<script setup lang="ts">
import { Search } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import type { TemplateKind } from '@/api/templates'

const search = defineModel<string>('search', { required: true })
const kind = defineModel<'all' | TemplateKind>('kind', { required: true })

const options: { value: 'all' | TemplateKind; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'builtin', label: 'Built-in' },
  { value: 'custom', label: 'Custom' },
]
</script>

<template>
  <div class="flex items-center gap-3 max-[760px]:w-full">
    <label class="flex h-[35px] items-center gap-[9px] rounded-[8px] bg-[#242d32] px-[11px] text-[#91a5b1] focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-accent max-[760px]:min-w-[100px] max-[760px]:flex-1">
      <Search class="size-[15px] flex-none" aria-hidden="true" />
      <input
        v-model="search"
        type="search"
        aria-label="Search templates"
        placeholder="Find a template"
        class="w-[170px] min-w-0 bg-transparent text-[11px] text-[#d4e3eb] placeholder:text-[#96acb9] focus-visible:outline-none max-[760px]:w-full"
      />
    </label>
    <div class="flex gap-1" role="group" aria-label="Template type">
      <Button
        v-for="o in options"
        :key="o.value"
        variant="ghost"
        size="sm"
        class="h-[35px]"
        :aria-pressed="kind === o.value"
        :class="kind === o.value && 'bg-[#242d32] text-[#d4e3eb]'"
        @click="kind = o.value"
      >
        {{ o.label }}
      </Button>
    </div>
  </div>
</template>
