<script setup lang="ts">
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'reka-ui'
withDefaults(defineProps<{ modelValue: number[]; min?: number; max?: number; step?: number; label?: string }>(), { min: 0, max: 100, step: 1, label: 'Value' })
defineEmits<{ 'update:modelValue': [value: number[]] }>()
</script>
<template><SliderRoot class="ui-slider" :model-value="modelValue" :min="min" :max="max" :step="step" @update:model-value="v => v && $emit('update:modelValue', v)"><SliderTrack class="slider-track"><SliderRange class="slider-range" /></SliderTrack><SliderThumb class="slider-thumb" :aria-label="label" /></SliderRoot></template>
