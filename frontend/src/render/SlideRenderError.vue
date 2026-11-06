<script setup lang="ts">
defineProps<{ message?: string }>()
</script>

<template>
  <div
    role="alert"
    class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-100 text-neutral-600"
    data-slide-error
  >
    <p class="text-[32px] font-medium">Can't render this slide</p>
    <p v-if="message" class="max-w-[900px] truncate text-[20px] opacity-70">{{ message }}</p>
  </div>
</template>
