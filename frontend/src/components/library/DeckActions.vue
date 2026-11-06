<script setup lang="ts">
import { Copy, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

defineProps<{ title: string }>()
defineEmits<{ duplicate: []; delete: [] }>()
</script>

<template>
  <div class="flex gap-1">
    <Button variant="ghost" size="icon" class="size-8" :aria-label="`Duplicate ${title}`" @click="$emit('duplicate')">
      <Copy class="size-4" aria-hidden="true" />
    </Button>
    <Button variant="ghost" size="icon" class="size-8" :aria-label="`Delete ${title}`" @click="$emit('delete')">
      <Trash2 class="size-4" aria-hidden="true" />
    </Button>
  </div>
</template>
