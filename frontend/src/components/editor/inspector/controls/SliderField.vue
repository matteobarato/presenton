<script setup lang="ts">
import { ref, watch } from 'vue'
import NumberField from './NumberField.vue'

const props = defineProps<{ modelValue: number; label: string; min: number; max: number; unit?: string }>()
const emit = defineEmits<{ commit: [value: number]; focus: [] }>()

const live = ref(props.modelValue)
watch(() => props.modelValue, (v) => (live.value = v))

function onChange(event: Event) {
  const n = Number((event.target as HTMLInputElement).value)
  if (Number.isFinite(n) && n !== props.modelValue) emit('commit', n)
}
</script>

<template>
  <div class="flex items-center gap-2.5">
    <input
      v-model.number="live"
      type="range"
      :min="min"
      :max="max"
      :aria-label="`${label} slider`"
      class="h-1 min-w-0 flex-1 cursor-pointer accent-accent"
      @pointerdown="emit('focus')"
      @change="onChange"
    />
    <NumberField class="w-[64px] flex-none" :model-value="modelValue" :label="label" :min="min" :max="max" :unit="unit" @focus="emit('focus')" @commit="emit('commit', $event)" />
  </div>
</template>
