<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { Portrait } from '@/api/videos'
import PortraitHero from '@/components/editor/inspector/video/PortraitHero.vue'
import { validatePortrait } from './options'

/** The optional presenter photo, held in memory until the deck exists (see NewView). */
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
    <p class="text-center text-[11px] text-[#8e9ca4]">
      Optional. Without a photo the deck has no presenter slides; you can still narrate it with a voice.
    </p>
  </section>
</template>
