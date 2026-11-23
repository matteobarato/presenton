<script setup lang="ts">
import { computed } from 'vue'
import { Clapperboard, Globe, LayoutGrid, ListOrdered, MessageSquareText, Palette, Presentation, Sparkles } from 'lucide-vue-next'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { rovingKeydown, rovingTab } from '@/lib/roving'
import { clampMediaCount, clampSlideCount, IMAGE_PRESETS, MAX_SLIDES, type OptionSection, SLIDE_PRESETS, TONES, VERBOSITIES, VIDEO_PRESETS, type CreateOptions } from './options'

/**
 * `sections` picks which groups show (all by default). `bare` drops each group's card and header: the setup chips
 * put one or two groups in a popover that already has its own title.
 */
const props = withDefaults(defineProps<{ disabled?: boolean; hasPhoto: boolean; sections?: OptionSection[]; bare?: boolean }>(), {
  sections: () => ['length', 'videos', 'style', 'extras', 'instructions'],
})
const show = (s: OptionSection) => props.sections.includes(s)
const model = defineModel<CreateOptions>({ required: true })

/** Presenter slides need a photo: without one the videos count is None and can't change. */
const locked = (key: 'images' | 'videos') => key === 'videos' && !props.hasPhoto
const shown = (key: 'images' | 'videos') => (locked(key) ? '0' : model.value[key])

function patch(change: Partial<CreateOptions>) {
  model.value = { ...model.value, ...change }
}

/** Index of the checked radio in a list, for the group's single Tab stop (-1 when none, e.g. a custom count). */
const checked = <T extends { value: string }>(list: readonly T[], value: string) => list.findIndex((p) => p.value === value)

const chip =
  'h-8 max-[559px]:h-11 max-[559px]:min-w-11 rounded-full border px-3.5 max-[559px]:px-4 text-[12px] font-medium transition-[background,border-color,color] duration-150 disabled:opacity-40'
const chipOn = 'border-accent bg-accent text-accent-ink'
const chipOff = 'border-white/[0.08] bg-white/[0.02] text-tx-c3d1d8 hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-tx-eef4f7'
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
    hint: 'Shown as placeholders until rendered at the Narration step',
    group: 'Presenter video count',
    inputId: 'opt-videos',
    presets: VIDEO_PRESETS,
  },
] as const

/** Images belong to Length & media, the presenter video count to the Presenter step. */
const visibleCounts = computed(() => mediaCounts.filter((m) => (m.key === 'images' ? show('length') : show('videos'))))

const groupLabel = 'text-[12px] font-medium text-tx-dbe5ea'
const cardChrome = 'flex flex-col gap-6 rounded-card border border-white/[0.07] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-5 shadow-[inset_0_1px_0_#ffffff0a] max-[520px]:p-4'
const card = computed(() => (props.bare ? 'flex flex-col gap-6' : cardChrome))
const head = 'flex items-center gap-3'
const headIcon = 'grid size-8 flex-none place-items-center rounded-full bg-sx-bee3f31a text-accent'
const headTitle = 'text-[13px] font-semibold tracking-[-0.01em] text-tx-eef4f7'
const headSub = 'text-[12px] text-tx-8e9ca4'
const hint = 'text-[12px] text-tx-8e9ca4'
</script>

<template>
  <div class="flex flex-col gap-5">
    <section v-if="show('length') || show('videos')" :class="card">
      <header v-if="!bare" :class="head">
        <span :class="headIcon" aria-hidden="true"><LayoutGrid class="size-4" /></span>
        <span class="flex min-w-0 flex-col">
          <span :class="headTitle">{{ show('length') ? 'Length &amp; media' : 'Presenter videos' }}</span>
          <span :class="headSub">How long the deck is and what goes on the slides</span>
        </span>
      </header>
        <fieldset v-if="show('length')" class="flex flex-col gap-3">
          <legend class="mb-3 flex w-full items-baseline justify-between gap-3">
            <span :class="groupLabel">How many slides?</span>
            <span :class="hint">Auto lets the outline decide</span>
          </legend>
          <div class="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Slide count" @keydown="rovingKeydown">
            <button
              v-for="(p, i) in SLIDE_PRESETS"
              :key="p.value"
              type="button"
              role="radio"
              :tabindex="rovingTab(i, checked(SLIDE_PRESETS, model.slides))"
              :aria-checked="model.slides === p.value"
              :disabled="disabled"
              :class="[chip, model.slides === p.value ? chipOn : chipOff]"
              @click="patch({ slides: p.value })"
            >
              {{ p.label }}
            </button>
            <span class="ml-1 flex items-center gap-2">
              <Label for="opt-slides" class="text-[12px] text-tx-8e9ca4">or exactly</Label>
              <Input
                id="opt-slides"
                inputmode="numeric"
                class="h-8 w-[68px] text-center tabular-nums max-[559px]:h-11"
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
        <fieldset v-for="m in visibleCounts" :key="m.key" class="flex flex-col gap-3">
          <legend class="mb-3 flex w-full items-baseline justify-between gap-3">
            <span :class="groupLabel">{{ m.label }}</span>
            <span :class="hint">{{ m.key === 'videos' && !hasPhoto ? 'Add a presenter photo to choose' : m.hint }}</span>
          </legend>
          <div class="flex flex-wrap items-center gap-2" role="radiogroup" :aria-label="m.group" @keydown="rovingKeydown">
            <button
              v-for="(p, i) in m.presets"
              :key="p.value"
              type="button"
              role="radio"
              :tabindex="rovingTab(i, checked(m.presets, shown(m.key)))"
              :aria-checked="shown(m.key) === p.value"
              :disabled="disabled || locked(m.key)"
              :class="[chip, shown(m.key) === p.value ? chipOn : chipOff]"
              @click="patch({ [m.key]: p.value })"
            >
              {{ p.label }}
            </button>
            <span class="ml-1 flex items-center gap-2">
              <Label :for="m.inputId" class="text-[12px] text-tx-8e9ca4">or exactly</Label>
              <Input
                :id="m.inputId"
                inputmode="numeric"
                class="h-8 w-[68px] text-center tabular-nums max-[559px]:h-11"
                :class="shown(m.key) && !m.presets.some((p) => p.value === shown(m.key)) && 'border-accent'"
                :model-value="shown(m.key)"
                :disabled="disabled || locked(m.key)"
                :aria-label="`${m.group}, 0 to ${MAX_SLIDES}, blank for auto`"
                placeholder="—"
                @update:model-value="patch({ [m.key]: clampMediaCount(String($event)) })"
              />
            </span>
          </div>
        </fieldset>
    </section>
    <section v-if="show('style')" :class="card">
      <header v-if="!bare" :class="head">
        <span :class="headIcon" aria-hidden="true"><Palette class="size-4" /></span>
        <span class="flex min-w-0 flex-col">
          <span :class="headTitle">Style</span>
          <span :class="headSub">How it sounds and how much text each slide carries</span>
        </span>
      </header>
        <fieldset class="flex flex-col">
          <legend :class="[groupLabel, 'mb-3']">Tone</legend>
          <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Tone" @keydown="rovingKeydown">
            <button
              v-for="(t, i) in TONES"
              :key="t.value"
              type="button"
              role="radio"
              :tabindex="rovingTab(i, checked(TONES, model.tone))"
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
          <div class="grid grid-cols-3 gap-2 max-[520px]:grid-cols-1" role="radiogroup" aria-label="Text per slide" @keydown="rovingKeydown">
            <button
              v-for="(v, i) in VERBOSITIES"
              :key="v.value"
              type="button"
              role="radio"
              :tabindex="rovingTab(i, checked(VERBOSITIES, model.verbosity))"
              :aria-checked="model.verbosity === v.value"
              :disabled="disabled"
              class="flex flex-col gap-2 rounded-card border p-3 text-left transition-[background,border-color] duration-150 disabled:opacity-40"
              :class="model.verbosity === v.value ? 'border-accent bg-sx-bee3f30d' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]'"
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
                <span class="text-[12px] font-medium text-tx-e4ecf0">{{ v.label }}</span>
                <span class="text-[12px] leading-[1.5] text-tx-8e9ca4">{{ v.hint }}</span>
              </span>
            </button>
          </div>
        </fieldset>
    </section>
    <section v-if="show('extras')" :class="card">
      <header v-if="!bare" :class="head">
        <span :class="headIcon" aria-hidden="true"><Sparkles class="size-4" /></span>
        <span class="flex min-w-0 flex-col">
          <span :class="headTitle">Extras</span>
          <span :class="headSub">Optional additions to the deck</span>
        </span>
      </header>
        <fieldset class="flex flex-col">
          <legend class="sr-only">Extras</legend>
          <div class="grid gap-2" :class="bare ? 'grid-cols-1' : 'grid-cols-3 max-[640px]:grid-cols-1'">
            <label for="opt-title" class="flex cursor-pointer items-start gap-3 rounded-card border border-white/[0.07] bg-white/[0.02] p-3 hover:bg-white/[0.04] has-[[data-state=checked]]:border-lx-bee3f355">
              <Presentation class="mt-px size-4 text-tx-8fb4c6" aria-hidden="true" />
              <span class="flex flex-1 flex-col gap-0.5">
                <span class="text-[12px] font-medium text-tx-e4ecf0">Title slide</span>
                <span class="text-[12px] text-tx-8e9ca4">Open with a cover</span>
              </span>
              <Checkbox id="opt-title" :model-value="model.includeTitleSlide" :disabled="disabled" @update:model-value="patch({ includeTitleSlide: $event === true })" />
            </label>
            <label for="opt-toc" class="flex cursor-pointer items-start gap-3 rounded-card border border-white/[0.07] bg-white/[0.02] p-3 hover:bg-white/[0.04] has-[[data-state=checked]]:border-lx-bee3f355">
              <ListOrdered class="mt-px size-4 text-tx-8fb4c6" aria-hidden="true" />
              <span class="flex flex-1 flex-col gap-0.5">
                <span class="text-[12px] font-medium text-tx-e4ecf0">Table of contents</span>
                <span class="text-[12px] text-tx-8e9ca4">List the sections</span>
              </span>
              <Checkbox id="opt-toc" :model-value="model.includeTableOfContents" :disabled="disabled" @update:model-value="patch({ includeTableOfContents: $event === true })" />
            </label>
            <label for="opt-web" class="flex cursor-pointer items-start gap-3 rounded-card border border-white/[0.07] bg-white/[0.02] p-3 hover:bg-white/[0.04] has-[[data-state=checked]]:border-lx-bee3f355">
              <Globe class="mt-px size-4 text-tx-8fb4c6" aria-hidden="true" />
              <span class="flex flex-1 flex-col gap-0.5">
                <span class="text-[12px] font-medium text-tx-e4ecf0">Web search</span>
                <span class="text-[12px] text-tx-8e9ca4">Ground facts online</span>
              </span>
              <Switch id="opt-web" :model-value="model.webSearch" :disabled="disabled" @update:model-value="patch({ webSearch: $event === true })" />
            </label>
            <label for="opt-animate" class="flex cursor-pointer items-start gap-3 rounded-card border border-white/[0.07] bg-white/[0.02] p-3 hover:bg-white/[0.04] has-[[data-state=checked]]:border-lx-bee3f355">
              <Clapperboard class="mt-px size-4 text-tx-8fb4c6" aria-hidden="true" />
              <span class="flex flex-1 flex-col gap-0.5">
                <span class="text-[12px] font-medium text-tx-e4ecf0">Animate slides</span>
                <span class="text-[12px] text-tx-8e9ca4">Plan entrance motion once generated</span>
              </span>
              <Switch id="opt-animate" :model-value="model.animate" :disabled="disabled" @update:model-value="patch({ animate: $event === true })" />
            </label>
          </div>
        </fieldset>
    </section>
    <section v-if="show('instructions')" :class="card">
      <header v-if="!bare" :class="head">
        <span :class="headIcon" aria-hidden="true"><MessageSquareText class="size-4" /></span>
        <span class="flex min-w-0 flex-col">
          <span :class="headTitle">Anything else?</span>
          <span :class="headSub">Free-form instructions for the writer</span>
        </span>
      </header>
        <div class="flex flex-col gap-3">
          <Label for="opt-instructions" :class="bare ? groupLabel : 'sr-only'">Anything else?</Label>
          <Textarea
            id="opt-instructions"
            class="min-h-[76px] text-[12px]"
            placeholder="E.g. keep it under 10 minutes, avoid jargon, end with a call to action"
            :model-value="model.instructions"
            :disabled="disabled"
            @update:model-value="patch({ instructions: String($event) })"
          />
        </div>
    </section>
  </div>
</template>
