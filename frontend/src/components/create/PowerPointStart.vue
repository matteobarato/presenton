<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Presentation, RefreshCw, TriangleAlert } from 'lucide-vue-next'
import type { PowerPointStart as Start } from '@/composables/usePowerPointStart'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import AiProgress from '@/components/shell/AiProgress.vue'
import FontReplacementList from '@/components/templates/import/FontReplacementList.vue'
import ImportDropzone from '@/components/templates/import/ImportDropzone.vue'
import LanguagePicker from './LanguagePicker.vue'

/**
 * Step 1 in "From PowerPoint" mode: one .pptx, read into a slide preview (its design is kept), the fonts the server
 * lacks with a way to replace them, and the narration language. All state lives in `start` (owned by the view), so
 * switching modes and back keeps the deck.
 */
const props = defineProps<{ start: Start; disabled?: boolean; languageError?: boolean }>()
const language = defineModel<string>('language', { required: true })
const { t } = useI18n()

const root = ref<HTMLElement | null>(null)
const ready = computed(() => props.start.phase.value === 'ready' && props.start.preview.value !== null)
const busy = computed(() => props.start.phase.value === 'checking' || props.start.phase.value === 'preparing')

/** Slides that are not 16:9 are fitted onto a 16:9 stage; the first thumbnail tells. */
const firstAspect = ref<number | null>(null)
watch(
  () => props.start.preview.value,
  () => (firstAspect.value = null),
)
function onThumbLoad(index: number, event: Event) {
  if (index !== 0) return
  const img = event.target as HTMLImageElement
  if (img.naturalWidth > 0 && img.naturalHeight > 0) firstAspect.value = img.naturalWidth / img.naturalHeight
}
const needsFit = computed(() => firstAspect.value !== null && Math.abs(firstAspect.value / (16 / 9) - 1) > 0.02)

function onReplace(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) void props.start.selectFile(file)
  // Picking the same file again must still fire `change`.
  input.value = ''
}

const fontsOpen = ref(false)
const fontError = ref('')
const missingNames = computed(() => props.start.missingFonts.value.map((f) => f.name).join(', '))
function onFontReplace(name: string, file: File | null) {
  fontError.value = props.start.setReplacement(name, file) ?? ''
}
function applyFonts() {
  // `applyFonts` re-renders the preview; only offered once one exists.
  if (props.start.phase.value !== 'ready') return
  fontsOpen.value = false
  fontError.value = ''
  void props.start.applyFonts()
}

function focusLanguage() {
  document.getElementById('opt-language')?.focus()
}
function focusDeck() {
  root.value?.querySelector<HTMLElement>('[data-testid="import-file-input"], [data-testid="pptx-replace-input"]')?.focus()
}
defineExpose({ focusLanguage, focusDeck })
</script>

<template>
  <div ref="root" class="flex flex-col gap-5" data-testid="pptx-start">
    <AiProgress
      v-if="busy"
      :stage="start.phase.value === 'checking' ? t('create.start.checkingFonts') : t('create.start.readingSlides')"
      :label="t('create.start.progressLabel')"
      :expected-ms="15_000"
    />

    <section v-else-if="ready" class="flex flex-col gap-4 rounded-card border border-ov/[0.07] bg-gradient-to-b from-ov/[0.03] to-ov/[0.01] p-4 shadow-[inset_0_1px_0_#ffffff0a]" data-testid="pptx-result">
      <div class="flex items-center gap-3 max-[460px]:flex-wrap">
        <span class="grid size-10 flex-none place-items-center rounded-full bg-sx-bee3f31a text-accent" aria-hidden="true"><Presentation class="size-5" /></span>
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-[13px] font-semibold text-tx-eef4f7">{{ start.file.value?.name }}</span>
          <span class="text-[12px] text-tx-8e9ca4">{{ t('create.start.slideCount', { count: start.slideCount.value }, start.slideCount.value) }}</span>
        </span>
        <label
          class="inline-flex h-[30px] cursor-pointer items-center gap-2 rounded-button border border-ov/[0.09] px-2.5 text-[11px] font-semibold text-tx-d4dadd transition-colors hover:border-ov/[0.16] hover:bg-ov/[0.03] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent max-[559px]:h-11"
          :class="disabled && 'pointer-events-none opacity-40'"
        >
          <RefreshCw class="size-3.5" aria-hidden="true" />
          {{ t('create.start.replace') }}
          <input
            type="file"
            class="sr-only"
            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            :disabled="disabled"
            data-testid="pptx-replace-input"
            @change="onReplace"
          />
        </label>
      </div>

      <ol class="-mx-1 flex snap-x list-none gap-2.5 overflow-x-auto px-1 pb-1.5" :aria-label="t('create.start.thumbsLabel')" data-testid="pptx-thumbs">
        <li v-for="(src, i) in start.preview.value?.slide_image_urls ?? []" :key="src" class="w-[152px] flex-none snap-start max-[559px]:w-[128px]">
          <img
            :src="src"
            :alt="t('create.start.slideAlt', { n: i + 1 })"
            loading="lazy"
            class="aspect-video w-full rounded-[8px] border border-ov/[0.07] bg-sx-101416 object-contain"
            @load="onThumbLoad(i, $event)"
          />
        </li>
      </ol>

      <p v-if="start.originalSlideCount.value > start.slideCount.value" role="note" data-testid="pptx-limit-note" class="text-[12px] text-tx-a9c4d2">
        {{ t('create.start.limitNote', { count: start.slideCount.value, total: start.originalSlideCount.value }) }}
      </p>
      <p v-if="needsFit" role="note" data-testid="pptx-fit-note" class="text-[12px] text-tx-a9c4d2">{{ t('create.start.fitNote') }}</p>
      <p v-if="start.missingFonts.value.length" role="note" data-testid="pptx-fonts-note" class="flex items-start gap-2 rounded-control border border-ov/[0.07] bg-sx-1a2125 px-3 py-2.5 text-[12px] text-tx-a9c4d2 max-[559px]:flex-wrap">
        <TriangleAlert class="mt-px size-4 flex-none text-accent" aria-hidden="true" />
        <span class="min-w-0 flex-1">{{ t('create.start.fontsNote', { fonts: missingNames }) }}</span>
        <button
          type="button"
          data-testid="pptx-fonts-fix"
          class="font-semibold text-accent underline decoration-tx-bee3f366 underline-offset-[3px] disabled:opacity-40 max-[559px]:inline-flex max-[559px]:min-h-11 max-[559px]:items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          :disabled="disabled || !ready"
          @click="fontsOpen = true"
        >
          {{ t('create.start.fix') }}
        </button>
      </p>
      <p v-if="start.error.value" role="alert" class="text-[12px] text-danger-text">{{ start.error.value }}</p>
    </section>

    <ImportDropzone v-else :disabled="disabled" :error="start.error.value" @select="(f) => start.selectFile(f)" />

    <div :class="languageError && 'rounded-card ring-2 ring-danger-text/70'">
      <LanguagePicker v-model="language" :disabled="disabled" />
    </div>
    <p v-if="languageError" role="alert" data-testid="pptx-language-error" class="-mt-3 text-[12px] text-danger-text">{{ t('create.start.languageError') }}</p>

    <Dialog v-model:open="fontsOpen">
      <DialogContent class="w-[min(560px,calc(100vw-32px))]">
        <DialogHeader>
          <DialogTitle>{{ t('templates.import.fonts.heading') }}</DialogTitle>
          <DialogDescription>{{ t('templates.import.fonts.text') }}</DialogDescription>
        </DialogHeader>
        <div class="mt-5 flex flex-col gap-3">
          <FontReplacementList :fonts="start.missingFonts.value" :replacements="start.replacements.value" :busy="!ready" @replace="onFontReplace" />
          <p v-if="fontError" role="alert" class="text-[12px] text-danger-text">{{ fontError }}</p>
        </div>
        <DialogFooter class="mt-6">
          <Button type="button" variant="ghost" @click="fontsOpen = false">{{ t('common.actions.cancel') }}</Button>
          <Button type="button" data-testid="pptx-fonts-apply" :disabled="!ready" @click="applyFonts">{{ t('create.start.apply') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
