<script setup lang="ts">
import { Globe, ListOrdered, Presentation } from 'lucide-vue-next'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { LANGUAGES } from '@/lib/languages'
import { clampMediaCount, clampSlideCount, IMAGE_PRESETS, MAX_SLIDES, SLIDE_PRESETS, TONES, VERBOSITIES, VIDEO_PRESETS, type CreateOptions } from './options'

defineProps<{ disabled?: boolean }>()
const model = defineModel<CreateOptions>({ required: true })

function patch(change: Partial<CreateOptions>) {
  model.value = { ...model.value, ...change }
}

const chip =
  'h-8 rounded-full border px-3.5 text-[11px] font-medium transition-[background,border-color,color] duration-150 disabled:opacity-40'
const chipOn = 'border-accent bg-accent text-accent-ink'
const chipOff = 'border-white/[0.08] bg-white/[0.02] text-[#c3d1d8] hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-[#eef4f7]'
const mediaCounts = [
  {
    key: 'images',
    label: 'How many slides with images?',
    hint: 'Auto lets the template decide',
    group: 'Image count',
    inputId: 'opt-images',
    presets: IMAGE_PRESETS,
  },
  {
    key: 'videos',
    label: 'How many slides with a presenter video?',
    hint: 'Slots show a placeholder until you generate avatars in the Avatars panel',
    group: 'Presenter video count',
    inputId: 'opt-videos',
    presets: VIDEO_PRESETS,
  },
] as const

const groupLabel = 'text-[12px] font-medium text-[#dbe5ea]'
const hint = 'text-[11px] text-[#8e9ca4]'
</script>

<template>
  <div class="flex flex-col gap-8">
    <fieldset class="flex flex-col gap-3">
      <legend class="mb-3 flex w-full items-baseline justify-between gap-3">
        <span :class="groupLabel">How many slides?</span>
        <span :class="hint">Auto lets the outline decide</span>
      </legend>
      <div class="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Slide count">
        <button
          v-for="p in SLIDE_PRESETS"
          :key="p.value"
          type="button"
          role="radio"
          :aria-checked="model.slides === p.value"
          :disabled="disabled"
          :class="[chip, model.slides === p.value ? chipOn : chipOff]"
          @click="patch({ slides: p.value })"
        >
          {{ p.label }}
        </button>
        <span class="ml-1 flex items-center gap-2">
          <Label for="opt-slides" class="text-[11px] text-[#8e9ca4]">or exactly</Label>
          <Input
            id="opt-slides"
            inputmode="numeric"
            class="h-8 w-[68px] text-center tabular-nums"
            :class="model.slides && !SLIDE_PRESETS.some((p) => p.value === model.slides) && 'border-accent'"
            :model-value="model.slides"
            :disabled="disabled"
            :aria-label="`Slides, 1 to ${MAX_SLIDES}, blank for auto`"
            placeholder="—"
            @update:model-value="patch({ slides: clampSlideCount(String($event)) })"
          />
        </span>
      </div>
    </fieldset>

    <fieldset v-for="m in mediaCounts" :key="m.key" class="flex flex-col gap-3">
      <legend class="mb-3 flex w-full items-baseline justify-between gap-3">
        <span :class="groupLabel">{{ m.label }}</span>
        <span :class="hint">{{ m.hint }}</span>
      </legend>
      <div class="flex flex-wrap items-center gap-2" role="radiogroup" :aria-label="m.group">
        <button
          v-for="p in m.presets"
          :key="p.value"
          type="button"
          role="radio"
          :aria-checked="model[m.key] === p.value"
          :disabled="disabled"
          :class="[chip, model[m.key] === p.value ? chipOn : chipOff]"
          @click="patch({ [m.key]: p.value })"
        >
          {{ p.label }}
        </button>
        <span class="ml-1 flex items-center gap-2">
          <Label :for="m.inputId" class="text-[11px] text-[#8e9ca4]">or exactly</Label>
          <Input
            :id="m.inputId"
            inputmode="numeric"
            class="h-8 w-[68px] text-center tabular-nums"
            :class="model[m.key] && !m.presets.some((p) => p.value === model[m.key]) && 'border-accent'"
            :model-value="model[m.key]"
            :disabled="disabled"
            :aria-label="`${m.group}, 0 to ${MAX_SLIDES}, blank for auto`"
            placeholder="—"
            @update:model-value="patch({ [m.key]: clampMediaCount(String($event)) })"
          />
        </span>
      </div>
    </fieldset>

    <fieldset class="flex flex-col">
      <legend :class="[groupLabel, 'mb-3']">Tone</legend>
      <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Tone">
        <button
          v-for="t in TONES"
          :key="t.value"
          type="button"
          role="radio"
          :aria-checked="model.tone === t.value"
          :disabled="disabled"
          :class="[chip, model.tone === t.value ? chipOn : chipOff]"
          @click="patch({ tone: t.value })"
        >
          {{ t.label }}
        </button>
      </div>
    </fieldset>

    <fieldset class="flex flex-col">
      <legend :class="[groupLabel, 'mb-3']">Text per slide</legend>
      <div class="grid grid-cols-3 gap-2 max-[520px]:grid-cols-1" role="radiogroup" aria-label="Text per slide">
        <button
          v-for="v in VERBOSITIES"
          :key="v.value"
          type="button"
          role="radio"
          :aria-checked="model.verbosity === v.value"
          :disabled="disabled"
          class="flex flex-col gap-2 rounded-card border p-3 text-left transition-[background,border-color] duration-150 disabled:opacity-40"
          :class="model.verbosity === v.value ? 'border-accent bg-[#bee3f30d]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]'"
          @click="patch({ verbosity: v.value })"
        >
          <span class="flex h-[22px] flex-col justify-center gap-[3px]" aria-hidden="true">
            <span
              v-for="n in v.lines"
              :key="n"
              class="h-[3px] rounded-full"
              :class="model.verbosity === v.value ? 'bg-accent/70' : 'bg-white/[0.14]'"
              :style="{ width: n === v.lines ? '55%' : '100%' }"
            />
          </span>
          <span class="flex flex-col gap-0.5">
            <span class="text-[12px] font-medium text-[#e4ecf0]">{{ v.label }}</span>
            <span class="text-[10px] leading-[1.5] text-[#8e9ca4]">{{ v.hint }}</span>
          </span>
        </button>
      </div>
    </fieldset>

    <div class="flex flex-col gap-3">
      <Label for="opt-language" :class="groupLabel">Language</Label>
      <select
        id="opt-language"
        class="h-9 w-full max-w-[320px] rounded-button border border-transparent bg-field px-3 text-[12px] text-[#dce6ec] hover:border-white/15 focus-visible:border-accent disabled:opacity-40"
        :value="model.language"
        :disabled="disabled"
        @change="patch({ language: ($event.target as HTMLSelectElement).value })"
      >
        <option v-for="l in LANGUAGES" :key="l" :value="l">{{ l }}</option>
      </select>
    </div>

    <fieldset class="flex flex-col">
      <legend :class="[groupLabel, 'mb-3']">Extras</legend>
      <div class="grid grid-cols-3 gap-2 max-[640px]:grid-cols-1">
        <label for="opt-title" class="flex cursor-pointer items-start gap-3 rounded-card border border-white/[0.07] bg-white/[0.02] p-3 hover:bg-white/[0.04] has-[[data-state=checked]]:border-[#bee3f355]">
          <Presentation class="mt-px size-4 text-[#8fb4c6]" aria-hidden="true" />
          <span class="flex flex-1 flex-col gap-0.5">
            <span class="text-[12px] font-medium text-[#e4ecf0]">Title slide</span>
            <span class="text-[10px] text-[#8e9ca4]">Open with a cover</span>
          </span>
          <Checkbox id="opt-title" :model-value="model.includeTitleSlide" :disabled="disabled" @update:model-value="patch({ includeTitleSlide: $event === true })" />
        </label>
        <label for="opt-toc" class="flex cursor-pointer items-start gap-3 rounded-card border border-white/[0.07] bg-white/[0.02] p-3 hover:bg-white/[0.04] has-[[data-state=checked]]:border-[#bee3f355]">
          <ListOrdered class="mt-px size-4 text-[#8fb4c6]" aria-hidden="true" />
          <span class="flex flex-1 flex-col gap-0.5">
            <span class="text-[12px] font-medium text-[#e4ecf0]">Table of contents</span>
            <span class="text-[10px] text-[#8e9ca4]">List the sections</span>
          </span>
          <Checkbox id="opt-toc" :model-value="model.includeTableOfContents" :disabled="disabled" @update:model-value="patch({ includeTableOfContents: $event === true })" />
        </label>
        <label for="opt-web" class="flex cursor-pointer items-start gap-3 rounded-card border border-white/[0.07] bg-white/[0.02] p-3 hover:bg-white/[0.04] has-[[data-state=checked]]:border-[#bee3f355]">
          <Globe class="mt-px size-4 text-[#8fb4c6]" aria-hidden="true" />
          <span class="flex flex-1 flex-col gap-0.5">
            <span class="text-[12px] font-medium text-[#e4ecf0]">Web search</span>
            <span class="text-[10px] text-[#8e9ca4]">Ground facts online</span>
          </span>
          <Switch id="opt-web" :model-value="model.webSearch" :disabled="disabled" @update:model-value="patch({ webSearch: $event === true })" />
        </label>
      </div>
    </fieldset>

    <div class="flex flex-col gap-3">
      <Label for="opt-instructions" :class="groupLabel">Anything else?</Label>
      <Textarea
        id="opt-instructions"
        class="min-h-[76px] text-[12px]"
        placeholder="E.g. keep it under 10 minutes, avoid jargon, end with a call to action"
        :model-value="model.instructions"
        :disabled="disabled"
        @update:model-value="patch({ instructions: String($event) })"
      />
    </div>
  </div>
</template>
