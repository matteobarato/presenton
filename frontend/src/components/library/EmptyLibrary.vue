<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { Plus, Search } from 'lucide-vue-next'
import { Button, buttonVariants } from '@/components/ui/button'

defineProps<{ searching?: boolean; query?: string }>()
defineEmits<{ clear: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col items-center px-6 py-[55px] text-center text-tx-acc3d2">
    <template v-if="searching">
      <Search class="size-7" aria-hidden="true" />
      <h2 class="mt-[17px] mb-[7px] text-[20px] font-medium">{{ t('library.empty.noMatch', { query }) }}</h2>
      <p class="mb-5 text-[12px] text-tx-97aebc">{{ t('library.empty.tryAnother') }}</p>
      <Button variant="secondary" @click="$emit('clear')">{{ t('library.empty.clearSearch') }}</Button>
    </template>
    <template v-else>
      <Plus class="size-7" aria-hidden="true" />
      <h2 class="mt-[17px] mb-[7px] text-[20px] font-medium">{{ t('library.empty.noneYet') }}</h2>
      <p class="mb-5 text-[12px] text-tx-97aebc">{{ t('library.empty.createFirst') }}</p>
      <RouterLink to="/new" :class="buttonVariants()">{{ t('library.empty.newPresentation') }}</RouterLink>
    </template>
  </div>
</template>
