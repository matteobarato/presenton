<script setup lang="ts">
import { computed, ref } from 'vue'
import { FileText, Paperclip, X } from 'lucide-vue-next'
import { ALLOWED_EXTENSIONS, MAX_FILES } from '@/api/files'

/** Step 1 (Topic): one prompt surface that also takes documents (click the clip or drop anywhere on it). */
const props = defineProps<{ disabled?: boolean }>()
const prompt = defineModel<string>('prompt', { required: true })
const files = defineModel<File[]>('files', { required: true })
const emit = defineEmits<{ submit: [] }>()

const STARTERS = [
  'Quarterly business review for the leadership team: results, risks and next quarter’s plan',
  'Pitch deck for a seed round: problem, product, market, traction and the ask',
  'Onboarding guide for new hires: our mission, how we work and the first 30 days',
  'Lecture on renewable energy for high school students, with simple examples',
]

const notice = ref('')
const dragging = ref(false)
const accept = ALLOWED_EXTENSIONS.join(',')
const textarea = ref<HTMLTextAreaElement | null>(null)
const modKey = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform) ? '⌘' : 'Ctrl'
const words = computed(() => (prompt.value.trim() ? prompt.value.trim().split(/\s+/).length : 0))

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
function useStarter(text: string) {
  prompt.value = text
  textarea.value?.focus()
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    emit('submit')
  }
}
defineExpose({ focus: () => textarea.value?.focus() })
</script>

<template>
  <div class="flex flex-col gap-5">
    <div
      class="glass-prompt relative flex flex-col focus-within:border-lx-bee3f366 focus-within:shadow-[0_10px_30px_#0003]"
      :class="dragging && 'border-accent! bg-sx-26313680'"
      data-testid="dropzone"
      @dragover.prevent="dragging = !disabled"
      @dragleave.self="dragging = false"
      @drop.prevent="onDrop"
    >
      <label for="create-prompt" class="sr-only">What is your presentation about?</label>
      <textarea
        id="create-prompt"
        ref="textarea"
        v-model="prompt"
        :disabled="disabled"
        rows="4"
        class="min-h-[112px] w-full resize-none bg-transparent px-5 pt-[18px] pb-2 text-[14px] leading-[1.75] text-tx-e2eef5 outline-none! placeholder:text-tx-8a9ba6 max-[760px]:min-h-[104px] max-[760px]:px-4 max-[760px]:text-[13px]"
        placeholder="Describe the topic, who it’s for and what it should achieve…"
        @keydown="onKeydown"
      />
      <ul v-if="files.length" class="flex flex-wrap gap-1.5 px-4 pb-1" aria-label="Attached files">
        <li
          v-for="(file, i) in files"
          :key="`${file.name}-${file.size}-${i}`"
          class="anim-pop-in inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/[0.06] bg-sx-1d2427 py-1 pr-1.5 pl-2.5 text-[12px] text-tx-cfdde5"
        >
          <FileText class="size-3.5 text-tx-8fb4c6" aria-hidden="true" />
          <span class="max-w-[200px] truncate" :title="file.name">{{ file.name }}</span>
          <button
            type="button"
            :disabled="disabled"
            :aria-label="`Remove ${file.name}`"
            class="grid size-5 place-items-center rounded-full text-muted hover:bg-white/[0.06] hover:text-text"
            @click="remove(i)"
          >
            <X :size="12" />
          </button>
        </li>
      </ul>
      <div class="flex items-center justify-between gap-3 px-3 pt-1 pb-3">
        <label
          class="inline-flex h-[30px] max-[559px]:h-11 cursor-pointer items-center gap-2 rounded-button px-2.5 text-[12px] text-tx-a9b8c0 transition-colors hover:bg-white/[0.05] hover:text-text has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
        >
          <Paperclip :size="14" aria-hidden="true" />
          <span>{{ files.length ? `Attach more (${files.length}/${MAX_FILES})` : 'Attach documents' }}</span>
          <input type="file" class="sr-only" multiple :accept="accept" :disabled="disabled" data-testid="file-input" @change="onPick" />
        </label>
        <span class="flex items-center gap-3 text-[12px] text-tx-9aabb4 tabular-nums">
          <span v-if="words" aria-hidden="true">{{ words }} {{ words === 1 ? 'word' : 'words' }}</span>
          <span class="flex items-center gap-1 max-[760px]:hidden"><kbd>{{ modKey }}</kbd><kbd>Enter</kbd> for next: Presenter</span>
        </span>
      </div>
      <div
        v-if="dragging"
        class="pointer-events-none absolute inset-0 grid place-items-center rounded-[inherit] bg-sx-1b2328e6 text-[12px] font-medium text-accent"
        aria-hidden="true"
      >
        Drop to attach
      </div>
    </div>
    <p v-if="notice" role="status" class="-mt-2 text-[12px] text-danger-text">{{ notice }}</p>

    <div v-if="!prompt.trim()" class="flex flex-col gap-2.5">
      <span class="text-[12px] text-tx-8e9ca4">Need a starting point?</span>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="s in STARTERS"
          :key="s"
          type="button"
          :disabled="disabled"
          class="max-w-full truncate rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1.5 max-[559px]:min-h-11 text-left text-[12px] text-tx-b9c8d0 hover:border-lx-bee3f340 hover:bg-white/[0.04] hover:text-tx-e4eef3"
          :title="s"
          @click="useStarter(s)"
        >
          {{ s.split(':')[0] }}
        </button>
      </div>
    </div>
  </div>
</template>
