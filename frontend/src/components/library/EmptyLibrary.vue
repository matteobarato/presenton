<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { buttonVariants } from '@/components/ui/button/index'

defineProps<{ searching?: boolean }>()
</script>

<template>
  <div class="grid place-items-center gap-4 rounded-[16px] border border-dashed border-white/[0.1] px-6 py-20 text-center">
    <p v-if="searching" class="text-[14px] font-semibold text-[#f6f8f9]">No presentations match your search</p>
    <template v-else>
      <div>
        <p class="text-[14px] font-semibold text-[#f6f8f9]">No presentations yet</p>
        <p class="mt-1 text-[12px] text-[#9aa3a8]">Create your first deck from a prompt or a document.</p>
      </div>
      <RouterLink to="/new" :class="buttonVariants()">New presentation</RouterLink>
    </template>
  </div>
</template>
