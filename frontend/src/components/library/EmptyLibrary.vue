<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Plus, Search } from 'lucide-vue-next'
import { Button, buttonVariants } from '@/components/ui/button'

defineProps<{ searching?: boolean; query?: string }>()
defineEmits<{ clear: [] }>()
</script>

<template>
  <div class="flex flex-col items-center px-6 py-[55px] text-center text-[#acc3d2]">
    <template v-if="searching">
      <Search class="size-7" aria-hidden="true" />
      <h2 class="mt-[17px] mb-[7px] text-[20px] font-medium">No presentations match “{{ query }}”</h2>
      <p class="mb-5 text-[12px] text-[#97aebc]">Try a different title, or start a new presentation.</p>
      <Button variant="secondary" @click="$emit('clear')">Clear search</Button>
    </template>
    <template v-else>
      <Plus class="size-7" aria-hidden="true" />
      <h2 class="mt-[17px] mb-[7px] text-[20px] font-medium">No presentations yet</h2>
      <p class="mb-5 text-[12px] text-[#97aebc]">Create your first deck from a prompt or a document.</p>
      <RouterLink to="/new" :class="buttonVariants()">New presentation</RouterLink>
    </template>
  </div>
</template>
