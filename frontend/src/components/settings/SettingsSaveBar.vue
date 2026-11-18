<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

defineProps<{ dirty: boolean; saving: boolean }>()
defineEmits<{ save: []; discard: [] }>()
</script>

<template>
  <div
    v-if="dirty"
    class="sticky bottom-0 z-10 mt-8 flex items-center justify-between gap-3 rounded-[12px] border border-white/[0.06] bg-[#20272b] px-4 py-3 shadow-[0_-6px_20px_#0003]"
  >
    <p class="text-[11px] text-[#9aabb4]">You have unsaved changes.</p>
    <div class="flex items-center gap-2">
      <Button variant="ghost" :disabled="saving" @click="$emit('discard')">Discard</Button>
      <Button :disabled="saving" @click="$emit('save')">
        <Loader2 v-if="saving" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Save
      </Button>
    </div>
  </div>
</template>
