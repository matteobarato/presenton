<script setup lang="ts">
defineProps<{ modelValue: boolean; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <div>
    <div class="flex items-center justify-between text-[10px] font-medium text-[#d0d7dc]">
      <span>{{ label }}</span>
      <button
        type="button"
        role="switch"
        :aria-checked="modelValue"
        :aria-label="label"
        class="relative h-4 w-7 rounded-full border border-white/[0.07] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        :class="modelValue ? 'bg-accent/70' : 'bg-field'"
        @click="emit('update:modelValue', !modelValue)"
      >
        <span
          class="absolute left-0.5 top-0.5 size-3 rounded-full bg-[#dce3e7] transition-transform"
          :class="modelValue && 'translate-x-3'"
        />
      </button>
    </div>
    <div v-if="modelValue" class="mt-3"><slot /></div>
  </div>
</template>
