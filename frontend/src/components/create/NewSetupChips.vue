<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { Languages, LayoutGrid, Palette, Sparkles } from 'lucide-vue-next'
import GenerationOptions from './GenerationOptions.vue'
import LanguagePicker from './LanguagePicker.vue'
import SetupChip from './SetupChip.vue'
import type { CreateOptions } from './options'
import { extrasSummary, lengthMediaSummary, styleSummary } from './setupSummary'

/**
 * The settings of a new deck as a row of chips under the topic: language, length and media, style, extras. Each chip
 * shows its current value and opens its controls (the old Details step, plus the slide language). The presenter is
 * not a chip: it has its own step.
 */
const props = defineProps<{ disabled?: boolean; hasPhoto: boolean }>()
const options = defineModel<CreateOptions>('options', { required: true })

const languageOpen = ref(false)
/** Opens the Language chip and puts the cursor in its select (documents need a language). */
async function openLanguage() {
  languageOpen.value = true
  await nextTick()
  await nextTick()
  document.getElementById('opt-language')?.focus()
}
defineExpose({ openLanguage })
</script>

<template>
  <div class="flex flex-wrap gap-2" role="group" aria-label="Deck settings" data-testid="setup-chips">
    <SetupChip v-model:open="languageOpen" label="Language" :value="options.language" :icon="Languages" description="What language the slides are written in" :disabled="disabled" testid="chip-language">
      <LanguagePicker v-model="options.language" :disabled="props.disabled" bare />
    </SetupChip>

    <SetupChip label="Length & media" :value="lengthMediaSummary(options)" :icon="LayoutGrid" description="How long the deck is and what goes on the slides" :disabled="disabled" testid="chip-length">
      <GenerationOptions v-model="options" :has-photo="props.hasPhoto" :disabled="props.disabled" :sections="['length']" bare />
    </SetupChip>

    <SetupChip label="Style" :value="styleSummary(options.tone, options.verbosity)" :icon="Palette" description="How it sounds and how much text each slide carries" :disabled="disabled" testid="chip-style">
      <GenerationOptions v-model="options" :has-photo="props.hasPhoto" :disabled="props.disabled" :sections="['style']" bare />
    </SetupChip>

    <SetupChip label="Extras" :value="`Extras: ${extrasSummary(options)}`" :icon="Sparkles" description="Optional additions and instructions for the writer" :disabled="disabled" testid="chip-extras">
      <GenerationOptions v-model="options" :has-photo="props.hasPhoto" :disabled="props.disabled" :sections="['extras', 'instructions']" bare />
    </SetupChip>
  </div>
</template>
