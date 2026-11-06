<script setup lang="ts">
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { CreateBody } from '@/api/generation'
import { LANGUAGES } from '@/lib/languages'
import { clampSlideCount, MAX_SLIDES, type CreateOptions } from './options'

const TONES: { value: CreateBody['tone']; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'casual', label: 'Casual' },
  { value: 'professional', label: 'Professional' },
  { value: 'funny', label: 'Funny' },
  { value: 'educational', label: 'Educational' },
  { value: 'sales_pitch', label: 'Sales pitch' },
]
const VERBOSITIES: { value: CreateBody['verbosity']; label: string }[] = [
  { value: 'concise', label: 'Concise' },
  { value: 'standard', label: 'Standard' },
  { value: 'text-heavy', label: 'Text-heavy' },
]

defineProps<{ disabled?: boolean }>()
const model = defineModel<CreateOptions>({ required: true })

function patch(change: Partial<CreateOptions>) {
  model.value = { ...model.value, ...change }
}
const selectClass =
  'h-9 w-full rounded-button border border-transparent bg-field px-3 text-[11px] text-[#dce6ec] hover:border-white/15 focus-visible:border-accent disabled:opacity-40'
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="flex flex-col gap-1.5">
      <Label for="opt-slides" class="text-[11px] text-muted">Slides (1 to {{ MAX_SLIDES }}, blank for auto)</Label>
      <Input
        id="opt-slides"
        inputmode="numeric"
        :model-value="model.slides"
        :disabled="disabled"
        placeholder="Auto"
        @update:model-value="patch({ slides: clampSlideCount(String($event)) })"
      />
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="opt-language" class="text-[11px] text-muted">Language</Label>
      <select id="opt-language" :class="selectClass" :value="model.language" :disabled="disabled" @change="patch({ language: ($event.target as HTMLSelectElement).value })">
        <option v-for="l in LANGUAGES" :key="l" :value="l">{{ l }}</option>
      </select>
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="opt-tone" class="text-[11px] text-muted">Tone</Label>
      <select id="opt-tone" :class="selectClass" :value="model.tone" :disabled="disabled" @change="patch({ tone: ($event.target as HTMLSelectElement).value as CreateBody['tone'] })">
        <option v-for="t in TONES" :key="t.value" :value="t.value">{{ t.label }}</option>
      </select>
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="opt-verbosity" class="text-[11px] text-muted">Verbosity</Label>
      <select id="opt-verbosity" :class="selectClass" :value="model.verbosity" :disabled="disabled" @change="patch({ verbosity: ($event.target as HTMLSelectElement).value as CreateBody['verbosity'] })">
        <option v-for="v in VERBOSITIES" :key="v.value" :value="v.value">{{ v.label }}</option>
      </select>
    </div>
    <div class="flex flex-col gap-1.5 sm:col-span-2">
      <Label for="opt-instructions" class="text-[11px] text-muted">Extra instructions</Label>
      <Textarea id="opt-instructions" class="min-h-16" :model-value="model.instructions" :disabled="disabled" @update:model-value="patch({ instructions: String($event) })" />
    </div>
    <div class="flex flex-wrap gap-x-6 gap-y-3 sm:col-span-2">
      <div class="flex items-center gap-2">
        <Checkbox id="opt-title" :model-value="model.includeTitleSlide" :disabled="disabled" @update:model-value="patch({ includeTitleSlide: $event === true })" />
        <Label for="opt-title" class="text-[12px]">Title slide</Label>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox id="opt-toc" :model-value="model.includeTableOfContents" :disabled="disabled" @update:model-value="patch({ includeTableOfContents: $event === true })" />
        <Label for="opt-toc" class="text-[12px]">Table of contents</Label>
      </div>
      <div class="flex items-center gap-2">
        <Switch id="opt-web" :model-value="model.webSearch" :disabled="disabled" @update:model-value="patch({ webSearch: $event === true })" />
        <Label for="opt-web" class="text-[12px]">Web search</Label>
      </div>
    </div>
  </div>
</template>
