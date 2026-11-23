<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { onBeforeUnmount, ref, watch } from 'vue'
import type { Portrait } from '@/api/videos'
import PortraitHero from '@/components/editor/inspector/video/PortraitHero.vue'
import { validatePortrait } from './options'
const { t } = useI18n()

/** The presenter photo, held in memory until the deck exists (see NewView). */
defineProps<{ disabled?: boolean }>()
const model = defineModel<File | null>({ required: true })
const emit = defineEmits<{ error: [message: string] }>()

const url = ref<string | null>(null)
const portrait = ref<Portrait | null>(null)
function revoke() {
  if (url.value) URL.revokeObjectURL(url.value)
}
watch(
  model,
  (file) => {
    revoke()
    url.value = file ? URL.createObjectURL(file) : null
    portrait.value = url.value ? ({ url: url.value } as Portrait) : null
  },
  { immediate: true },
)
onBeforeUnmount(revoke)

function upload(file: File) {
  const problem = validatePortrait(file)
  if (problem) emit('error', problem)
  else model.value = file
}
</script>

<template>
  <section class="flex flex-col gap-3" data-testid="presenter-picker">
    <PortraitHero class="mx-auto w-full max-w-[380px]" :portrait="portrait" :busy="!!disabled" @upload="upload" @remove="model = null" />
    <p class="text-center text-[12px] text-tx-8e9ca4" data-testid="presenter-picker-help">
      {{ model ? t('create.presenter.pickerUsed') : t('create.presenter.pickerAdd') }}
    </p>
  </section>
</template>
