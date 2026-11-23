<script setup lang="ts">
import type { Presentation } from '@/api/types'
import { useTextControls } from '@/components/editor/inspector/element/useTextControls'

// Bar control: the font family of the selection (the inline editor's range while editing).
const props = defineProps<{ presentation: Presentation }>()
const { family, families, setFamily } = useTextControls(props)
</script>

<template>
  <select
    aria-label="Font family"
    title="Font family"
    class="h-[31px] w-[112px] min-w-0 cursor-pointer appearance-none truncate rounded-control bg-transparent px-2 text-[11px] text-tx-c4ccd1 outline-none hover:bg-sx-30373b hover:text-tx-f1f5f8 focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent max-[760px]:w-[88px]"
    :value="family"
    data-bar-item="font-family"
    @change="setFamily(($event.target as HTMLSelectElement).value)"
  >
    <option v-for="f in families" :key="f" :value="f" class="bg-field">{{ f }}</option>
  </select>
</template>
