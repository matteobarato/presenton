<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Copy, PencilLine, Trash2 } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'

defineProps<{ title: string; editTo: string }>()
defineEmits<{ duplicate: []; delete: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex gap-0.5">
    <Button as-child variant="ghost" size="icon" class="size-8 text-tx-9caeb8">
      <RouterLink :to="editTo" :aria-label="t('library.deck.edit', { title })" :title="t('library.deck.editHint')">
        <PencilLine class="size-[15px]" aria-hidden="true" />
      </RouterLink>
    </Button>
    <Button variant="ghost" size="icon" class="size-8 text-tx-9caeb8" :aria-label="t('library.deck.duplicate', { title })" @click="$emit('duplicate')">
      <Copy class="size-[15px]" aria-hidden="true" />
    </Button>
    <Button variant="ghost" size="icon" class="size-8 text-tx-9caeb8" :aria-label="t('library.deck.delete', { title })" @click="$emit('delete')">
      <Trash2 class="size-[15px]" aria-hidden="true" />
    </Button>
  </div>
</template>
