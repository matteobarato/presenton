<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import type { Slide } from '@/api/types'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import SlideView from '@/render/SlideView.vue'

const props = defineProps<{ slides: Slide[]; theme?: unknown; fonts?: unknown; title: string }>()
const index = defineModel<number | null>('index', { required: true })
const emit = defineEmits<{ closed: [] }>()
const { t } = useI18n()

const open = computed(() => index.value !== null)
const current = computed(() => (index.value === null ? undefined : props.slides[index.value]))
const atStart = computed(() => (index.value ?? 0) <= 0)
const atEnd = computed(() => (index.value ?? 0) >= props.slides.length - 1)

function step(delta: number) {
  if (index.value === null) return
  index.value = Math.min(props.slides.length - 1, Math.max(0, index.value + delta))
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    step(1)
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    step(-1)
  }
}
function onOpenChange(v: boolean) {
  if (!v) index.value = null
}
</script>

<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent
      class="w-[min(1100px,calc(100vw-32px))] max-w-none bg-sx-0c1114ee p-4 backdrop-blur-xl"
      @close-auto-focus="emit('closed')"
    >
      <div @keydown="onKeydown">
        <DialogTitle class="sr-only">{{ t('templates.lightbox.title', { title, index: (index ?? 0) + 1 }) }}</DialogTitle>
        <DialogDescription class="sr-only">{{ t('templates.lightbox.description') }}</DialogDescription>
        <div class="overflow-hidden rounded-[9px] bg-sx-101416">
          <SlideView v-if="current" :key="current.id" :slide="current" :theme="theme as never" :fonts="fonts as never" show-placeholders fit="width" />
        </div>
        <div class="mt-3 flex items-center justify-center gap-4 text-[12px] text-tx-9eb7c7 tabular-nums">
          <button type="button" :aria-label="t('templates.lightbox.previous')":aria-disabled="atStart" class="grid size-8 place-items-center rounded-full hover:bg-sx-3b4b55 aria-disabled:cursor-default aria-disabled:opacity-40" @click="step(-1)">
            <ChevronLeft class="size-5" aria-hidden="true" />
          </button>
          <span data-testid="lightbox-counter">{{ (index ?? 0) + 1 }} / {{ slides.length }}</span>
          <button type="button" :aria-label="t('templates.lightbox.next')":aria-disabled="atEnd" class="grid size-8 place-items-center rounded-full hover:bg-sx-3b4b55 aria-disabled:cursor-default aria-disabled:opacity-40" @click="step(1)">
            <ChevronRight class="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
