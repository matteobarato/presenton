<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileUp } from 'lucide-vue-next'

/** Step 1: one .pptx, dropped or picked. Validation happens in the caller; this only hands the file up. */
defineProps<{ disabled?: boolean; error?: string | null }>()
const emit = defineEmits<{ select: [file: File] }>()
const { t } = useI18n()
const dragging = ref(false)

function onDrop(event: DragEvent) {
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) emit('select', file)
}
function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('select', file)
  // Picking the same file again after an error must still fire `change`.
  input.value = ''
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <label
      data-testid="import-dropzone"
      class="glass-prompt relative flex min-h-[230px] cursor-pointer flex-col items-center justify-center gap-3 rounded-card px-6 py-10 text-center transition-[border-color,box-shadow] duration-200 hover:border-lx-bee3f366 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-accent max-[760px]:min-h-[190px]"
      :class="[dragging && 'border-accent! bg-sx-26313680', disabled && 'pointer-events-none opacity-60']"
      @dragover.prevent="dragging = !disabled"
      @dragleave.self="dragging = false"
      @drop.prevent="onDrop"
    >
      <span class="grid size-12 place-items-center rounded-[12px] bg-sx-344c5a text-tx-c5eaff">
        <FileUp class="size-[22px]" aria-hidden="true" />
      </span>
      <span class="text-[14px] font-medium text-tx-dbe7ef">
        {{ dragging ? t('templates.import.dropzone.dropNow') : t('templates.import.dropzone.label') }}
        <span v-if="!dragging" class="text-accent underline-offset-4 hover:underline">{{ t('templates.import.dropzone.browse') }}</span>
      </span>
      <span class="text-[12px] text-tx-95aab7">{{ t('templates.import.dropzone.hint') }}</span>
      <input
        type="file"
        class="sr-only"
        accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        :disabled="disabled"
        data-testid="import-file-input"
        @change="onPick"
      />
    </label>
    <p v-if="error" role="alert" class="text-[12px] text-danger-text">{{ error }}</p>
  </div>
</template>
