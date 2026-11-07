<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { numericInputMode, preventInvalidNumberInput, sanitizeNumericInput } from '@/slide-editor/model/numericInput'
import { field } from './styles'

const props = withDefaults(defineProps<{ modelValue: number; label: string; min?: number; max?: number; step?: number; unit?: string }>(), { step: 1 })
const emit = defineEmits<{ commit: [value: number]; focus: [] }>()

const text = ref(String(props.modelValue))
watch(() => props.modelValue, (v) => (text.value = String(v)))

const options = () => ({ min: props.min, allowDecimal: true })

function clamp(n: number) {
  let v = n
  if (props.min !== undefined) v = Math.max(props.min, v)
  if (props.max !== undefined) v = Math.min(props.max, v)
  return Math.round(v * 1000) / 1000
}

function commit(raw: number) {
  const next = clamp(raw)
  text.value = String(next)
  if (next !== props.modelValue) emit('commit', next)
  // The parent may normalise the value (or ignore it): show what it holds once it has settled.
  void nextTick(() => (text.value = String(props.modelValue)))
}

function commitText() {
  const clean = sanitizeNumericInput(text.value, options())
  const n = Number(clean)
  if (clean === '' || clean === '-' || !Number.isFinite(n)) {
    text.value = String(props.modelValue)
    return
  }
  commit(n)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    commitText()
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    const base = Number(sanitizeNumericInput(text.value, options()))
    const from = Number.isFinite(base) && text.value.trim() !== '' ? base : props.modelValue
    const delta = props.step * (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? 1 : -1)
    commit(from + delta)
  } else {
    preventInvalidNumberInput(event as KeyboardEvent & { currentTarget: HTMLInputElement }, options())
  }
}
</script>

<template>
  <label :class="field">
    <input
      v-model="text"
      type="text"
      :inputmode="numericInputMode(options())"
      :aria-label="label"
      class="h-full w-full min-w-0 bg-transparent text-[10px] text-[#dce3e7] outline-none"
      @focus="emit('focus')"
      @keydown="onKeydown"
      @blur="commitText"
    />
    <span v-if="unit" class="shrink-0 text-[9px] text-[#9aa9b0]">{{ unit }}</span>
  </label>
</template>
