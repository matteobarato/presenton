<script setup lang="ts">
import { computed } from 'vue'
import { Check, Mic, UserRound } from 'lucide-vue-next'
import GenerationOptions from './GenerationOptions.vue'
import PresenterPicker from './PresenterPicker.vue'
import type { CreateOptions } from './options'
import { rovingKeydown, rovingTab } from '@/lib/roving'
import { presenterNote } from './setupSummary'

/**
 * Step 2 of a new deck: the digital presenter, one of the product's headline features. Either a photo that becomes a
 * talking presenter on presenter slides, or no presenter at all (the deck is narrated with a voice only). Nothing is
 * rendered here: the videos are made at the Narration step. `wants` is the choice itself: it can be "presenter" before
 * a photo exists, which the parent needs to say so (step bar, footer).
 */
const props = defineProps<{ disabled?: boolean; error?: string; photoLost?: boolean }>()
const portrait = defineModel<File | null>({ required: true })
/** Only the presenter video count is edited here. */
const options = defineModel<CreateOptions>('options', { required: true })
const emit = defineEmits<{ error: [message: string] }>()

// Choosing "digital presenter" before a photo exists must keep the picker open.
const wantsPresenter = defineModel<boolean>('wants', { default: false })
const withPresenter = computed(() => wantsPresenter.value || portrait.value !== null)
const note = computed(() => presenterNote(portrait.value !== null, options.value.videos))

function chooseVoiceOnly() {
  wantsPresenter.value = false
  portrait.value = null
  emit('error', '')
}

const card =
  'group relative flex flex-1 items-start gap-3.5 rounded-card border p-4 text-left transition-[border-color,background] duration-200 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
const on = 'border-accent bg-[#bee3f30d]'
const off = 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]'
const iconWrap = 'grid size-10 flex-none place-items-center rounded-full bg-[#bee3f31a] text-accent'
</script>

<template>
  <div class="flex flex-col gap-5" data-testid="new-presenter-step">
    <div role="radiogroup" aria-label="Presenter" class="flex gap-3 max-[640px]:flex-col" @keydown="rovingKeydown">
      <button type="button" role="radio" :tabindex="rovingTab(0, withPresenter ? 0 : 1)" :aria-checked="withPresenter" :disabled="disabled" data-testid="presenter-choice-photo" :class="[card, withPresenter ? on : off]" @click="wantsPresenter = true">
        <span :class="iconWrap" aria-hidden="true"><UserRound class="size-5" /></span>
        <span class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="text-[13px] font-semibold text-[#eef4f7]">Add a digital presenter</span>
          <span class="text-[12px] leading-[1.6] text-[#9aabb4]">Your photo becomes a talking presenter on the slides that call for one.</span>
        </span>
        <Check v-if="withPresenter" class="absolute top-3 right-3 size-[18px] rounded-full bg-accent p-[3px] text-accent-ink" aria-hidden="true" />
      </button>
      <button type="button" role="radio" :tabindex="rovingTab(1, withPresenter ? 0 : 1)" :aria-checked="!withPresenter" :disabled="disabled" data-testid="presenter-choice-voice" :class="[card, !withPresenter ? on : off]" @click="chooseVoiceOnly">
        <span :class="iconWrap" aria-hidden="true"><Mic class="size-5" /></span>
        <span class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="text-[13px] font-semibold text-[#eef4f7]">No presenter — voice only</span>
          <span class="text-[12px] leading-[1.6] text-[#9aabb4]">Slides are narrated with a voice. No slide gets a presenter video.</span>
        </span>
        <Check v-if="!withPresenter" class="absolute top-3 right-3 size-[18px] rounded-full bg-accent p-[3px] text-accent-ink" aria-hidden="true" />
      </button>
    </div>

    <template v-if="withPresenter">
      <PresenterPicker v-model="portrait" :disabled="disabled" @error="emit('error', $event)" />
      <p v-if="error" role="alert" class="text-center text-[12px] text-[#e8a2a2]">{{ error }}</p>
      <p v-if="photoLost" role="note" class="text-center text-[12px] text-[#a9c4d2]">Add your presenter photo again: photos aren’t kept after a reload.</p>
      <GenerationOptions v-model="options" :has-photo="portrait !== null" :disabled="props.disabled" :sections="['videos']" bare />
      <p v-if="note" role="note" data-testid="presenter-note" class="text-center text-[12px] text-[#a9c4d2]">{{ note }}</p>
      <p v-else role="note" data-testid="presenter-note" class="text-center text-[12px] text-[#a9c4d2]">Presenter videos are rendered at the Narration step, once you add a photo.</p>
    </template>
    <p v-else role="note" data-testid="presenter-note" class="text-[12px] text-[#a9c4d2]">
      Voice only: no presenter videos will be rendered. To add a presenter later, choose one above before you create the outline.
    </p>
  </div>
</template>
