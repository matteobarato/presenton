<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

/** The wizard's Back: icon and label from 560px, a 44px icon button (label kept for screen readers) on phones. */
defineProps<{ disabled?: boolean; label?: string }>()
</script>

<template>
  <Button type="button" variant="ghost" class="max-[559px]:size-11 max-[559px]:flex-none max-[559px]:px-0" :disabled="disabled">
    <ArrowLeft class="size-4" aria-hidden="true" /><span class="max-[559px]:sr-only">{{ label ?? 'Back' }}</span>
  </Button>
</template>
