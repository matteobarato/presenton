<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{ message?: string }>()
const { t } = useI18n()
</script>

<template>
  <div
    role="alert"
    class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-100 text-neutral-600"
    data-slide-error
  >
    <p class="text-[32px] font-medium">{{ t('render.error.cannotRender') }}</p>
    <p v-if="message" class="max-w-[900px] truncate text-[20px] opacity-70">{{ message }}</p>
  </div>
</template>
