<script setup lang="ts">
import { ref } from 'vue'
import { Paperclip, X } from 'lucide-vue-next'
import { ALLOWED_EXTENSIONS, MAX_FILES } from '@/api/files'

const props = defineProps<{ disabled?: boolean }>()
const files = defineModel<File[]>({ required: true })
const notice = ref('')
const dragging = ref(false)
const accept = ALLOWED_EXTENSIONS.join(',')

function isAllowed(file: File): boolean {
  const name = (file.name || '').toLowerCase()
  return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))
}

function add(candidates: File[]) {
  const allowed = candidates.filter(isAllowed)
  const messages: string[] = []
  if (allowed.length < candidates.length) {
    messages.push('Some files are not supported. Use Word, PowerPoint, spreadsheets, PDF, TXT or images.')
  }
  const next = [...files.value, ...allowed]
  if (next.length > MAX_FILES) messages.push(`You can attach up to ${MAX_FILES} files.`)
  notice.value = messages.join(' ')
  files.value = next.slice(0, MAX_FILES)
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  add(Array.from(input.files ?? []))
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = false
  if (!props.disabled) add(Array.from(event.dataTransfer?.files ?? []))
}

function remove(index: number) {
  files.value = files.value.filter((_, i) => i !== index)
  notice.value = ''
}
</script>

<template>
  <div
    class="flex flex-col gap-2 rounded-button border border-dashed p-3 transition-colors duration-200"
    :class="dragging ? 'border-accent bg-field' : 'border-line'"
    data-testid="dropzone"
    @dragover.prevent="dragging = !disabled"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <ul v-if="files.length" class="flex flex-wrap gap-2" aria-label="Attached files">
      <li v-for="(file, i) in files" :key="`${file.name}-${file.size}-${i}`" class="inline-flex max-w-full items-center gap-2 rounded-full bg-field px-2.5 py-1 text-[11px]">
        <span class="max-w-[200px] truncate" :title="file.name">{{ file.name }}</span>
        <button type="button" :disabled="disabled" :aria-label="`Remove ${file.name}`" class="text-muted hover:text-text" @click="remove(i)">
          <X :size="12" />
        </button>
      </li>
    </ul>
    <label class="inline-flex w-fit cursor-pointer items-center gap-2 text-[12px] text-muted hover:text-text">
      <Paperclip :size="14" />
      <span>{{ files.length ? `Attach more (${files.length}/${MAX_FILES})` : 'Attach files or drop them here' }}</span>
      <input type="file" class="sr-only" multiple :accept="accept" :disabled="disabled" data-testid="file-input" @change="onPick" />
    </label>
    <p v-if="notice" role="status" class="text-[11px] text-danger-text">{{ notice }}</p>
  </div>
</template>
