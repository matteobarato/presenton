<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref } from 'vue'
import { FileText, Paperclip, X } from 'lucide-vue-next'
import { ALLOWED_EXTENSIONS, MAX_FILES } from '@/api/files'
const { t } = useI18n()

/** Step 1 (Topic): one prompt surface that also takes documents (click the clip or drop anywhere on it). */
const props = defineProps<{ disabled?: boolean }>()
const prompt = defineModel<string>('prompt', { required: true })
const files = defineModel<File[]>('files', { required: true })
const emit = defineEmits<{ submit: [] }>()

const STARTER_KEYS = ['qbr', 'pitch', 'onboarding', 'lecture'] as const
const starters = computed(() => STARTER_KEYS.map((key) => t(`create.topic.starters.${key}`)))

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
    messages.push(t('create.topic.unsupported'))
  }
  const next = [...files.value, ...allowed]
  if (next.length > MAX_FILES) messages.push(t('create.topic.tooMany', { max: MAX_FILES }))
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
      class="glass-prompt relative flex flex-col focus-within:border-lx-bee3f366 focus-within:shadow-[0_10px_30px_var(--shade-33)]"
      :class="dragging && 'border-accent! bg-sx-26313680'"
      data-testid="dropzone"
      @dragover.prevent="dragging = !disabled"
      @dragleave.self="dragging = false"
      @drop.prevent="onDrop"
    >
      <label for="create-prompt" class="sr-only">{{ t('create.topic.promptLabel') }}</label>
      <textarea
        id="create-prompt"
        ref="textarea"
        v-model="prompt"
        :disabled="disabled"
        rows="4"
        class="min-h-[112px] w-full resize-none bg-transparent px-5 pt-[18px] pb-2 text-[14px] leading-[1.75] text-tx-e2eef5 outline-none! placeholder:text-tx-8a9ba6 max-[760px]:min-h-[104px] max-[760px]:px-4 max-[760px]:text-[13px]"
        :placeholder="t('create.topic.placeholder')"
        @keydown="onKeydown"
      />
      <ul v-if="files.length" class="flex flex-wrap gap-1.5 px-4 pb-1" :aria-label="t('create.topic.attachedFiles')">
        <li
          v-for="(file, i) in files"
          :key="`${file.name}-${file.size}-${i}`"
          class="anim-pop-in inline-flex max-w-full items-center gap-1.5 rounded-full border border-ov/[0.06] bg-sx-1d2427 py-1 pr-1.5 pl-2.5 text-[12px] text-tx-cfdde5"
        >
          <FileText class="size-3.5 text-tx-8fb4c6" aria-hidden="true" />
          <span class="max-w-[200px] truncate" :title="file.name">{{ file.name }}</span>
          <button
            type="button"
            :disabled="disabled"
            :aria-label="t('create.topic.removeFile', { name: file.name })"
            class="grid size-5 place-items-center rounded-full text-muted hover:bg-ov/[0.06] hover:text-text"
            @click="remove(i)"
          >
            <X :size="12" />
          </button>
        </li>
      </ul>
      <div class="flex items-center justify-between gap-3 px-3 pt-1 pb-3">
        <label
          class="inline-flex h-[30px] max-[559px]:h-11 cursor-pointer items-center gap-2 rounded-button px-2.5 text-[12px] text-tx-a9b8c0 transition-colors hover:bg-ov/[0.05] hover:text-text has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
        >
          <Paperclip :size="14" aria-hidden="true" />
          <span>{{ files.length ? t('create.topic.attachMore', { count: files.length, max: MAX_FILES }) : t('create.topic.attachDocs') }}</span>
          <input type="file" class="sr-only" multiple :accept="accept" :disabled="disabled" data-testid="file-input" @change="onPick" />
        </label>
        <span class="flex items-center gap-3 text-[12px] text-tx-9aabb4 tabular-nums">
          <span v-if="words" aria-hidden="true">{{ t('create.topic.words', { count: words }, words) }}</span>
          <span class="flex items-center gap-1 max-[760px]:hidden"><kbd>{{ modKey }}</kbd><kbd>Enter</kbd> {{ t('create.topic.forNext') }}</span>
        </span>
      </div>
      <div
        v-if="dragging"
        class="pointer-events-none absolute inset-0 grid place-items-center rounded-[inherit] bg-sx-1b2328e6 text-[12px] font-medium text-accent"
        aria-hidden="true"
      >
        {{ t('create.topic.dropToAttach') }}
      </div>
    </div>
    <p v-if="notice" role="status" class="-mt-2 text-[12px] text-danger-text">{{ notice }}</p>

    <div v-if="!prompt.trim()" class="flex flex-col gap-2.5">
      <span class="text-[12px] text-tx-8e9ca4">{{ t('create.topic.startingPoint') }}</span>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="s in starters"
          :key="s"
          type="button"
          :disabled="disabled"
          class="max-w-full truncate rounded-full border border-ov/[0.07] bg-ov/[0.02] px-3 py-1.5 max-[559px]:min-h-11 text-left text-[12px] text-tx-b9c8d0 hover:border-lx-bee3f340 hover:bg-ov/[0.04] hover:text-tx-e4eef3"
          :title="s"
          @click="useStarter(s)"
        >
          {{ s.split(':')[0] }}
        </button>
      </div>
    </div>
  </div>
</template>
