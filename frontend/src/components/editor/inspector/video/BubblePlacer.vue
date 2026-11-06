<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { Slide } from '@/api/types'
import { getPlayback, playbackKeys, updateBubble, type BubbleBox } from '@/api/playback'
import { toast } from '@/components/ui/sonner'

/**
 * Overlay for the voice bubble, laid over a rendered slide. Everything is kept in
 * slide units (1280x720); pointer deltas are divided by the overlay's on-screen scale.
 * `slide` is the slide shown underneath (the bubble itself is deck-wide).
 */
const props = defineProps<{ presentationId: string; slide: Slide }>()

const STAGE_W = 1280
const STAGE_H = 720
const MIN = 80
const STEP = 8
const SAVE_DELAY = 500

const qc = useQueryClient()
const idRef = computed(() => props.presentationId)
const { data: playback } = useQuery({
  queryKey: () => playbackKeys.one(idRef.value),
  queryFn: () => getPlayback(idRef.value),
  enabled: () => Boolean(idRef.value),
  retry: false,
})

let dirty = false
let timer: ReturnType<typeof setTimeout> | undefined
const box = ref<BubbleBox | null>(null)
watch(
  playback,
  (p) => {
    if (p && !dirty) box.value = { x: p.bubble.position.x, y: p.bubble.position.y, width: p.bubble.size.width, height: p.bubble.size.height }
  },
  { immediate: true },
)

const root = ref<HTMLElement | null>(null)
const scale = () => {
  const w = root.value?.getBoundingClientRect().width ?? 0
  return w > 0 ? w / STAGE_W : 1
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))
function fit(b: BubbleBox): BubbleBox {
  const width = clamp(Math.round(b.width), MIN, STAGE_W)
  const height = clamp(Math.round(b.height), MIN, STAGE_H)
  return { width, height, x: clamp(Math.round(b.x), 0, STAGE_W - width), y: clamp(Math.round(b.y), 0, STAGE_H - height) }
}

// Debounced save
const save = useMutation({
  mutationFn: (b: BubbleBox) => updateBubble(props.presentationId, b),
  onSuccess: () => qc.invalidateQueries({ queryKey: playbackKeys.one(props.presentationId) }),
  onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save the voice bubble position"),
  onSettled: () => {
    if (!timer) dirty = false
  },
})
function flush() {
  if (timer) clearTimeout(timer)
  timer = undefined
  if (dirty && box.value) save.mutate({ ...box.value })
}
function change(next: BubbleBox) {
  box.value = fit(next)
  dirty = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(flush, SAVE_DELAY)
}
onBeforeUnmount(flush)

// Pointer interaction
type Gesture = { mode: 'move' | 'resize'; startX: number; startY: number; origin: BubbleBox }
let gesture: Gesture | null = null

function down(e: PointerEvent, mode: Gesture['mode']) {
  if (!box.value) return
  e.stopPropagation()
  gesture = { mode, startX: e.clientX, startY: e.clientY, origin: { ...box.value } }
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
}
function move(e: PointerEvent) {
  if (!gesture) return
  const s = scale()
  const dx = (e.clientX - gesture.startX) / s
  const dy = (e.clientY - gesture.startY) / s
  const o = gesture.origin
  if (gesture.mode === 'move') change({ ...o, x: o.x + dx, y: o.y + dy })
  else change({ ...o, width: Math.min(o.width + dx, STAGE_W - o.x), height: Math.min(o.height + dy, STAGE_H - o.y) })
}
function up() {
  gesture = null
}

function key(e: KeyboardEvent) {
  if (!box.value) return
  const step = STEP * (e.shiftKey ? 5 : 1)
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
  if (!d) return
  e.preventDefault()
  change({ ...box.value, x: box.value.x + d[0], y: box.value.y + d[1] })
}

const style = computed(() => {
  const b = box.value
  if (!b) return {}
  return {
    left: `${(b.x / STAGE_W) * 100}%`,
    top: `${(b.y / STAGE_H) * 100}%`,
    width: `${(b.width / STAGE_W) * 100}%`,
    height: `${(b.height / STAGE_H) * 100}%`,
  }
})
</script>

<template>
  <div ref="root" class="absolute inset-0" data-testid="bubble-overlay">
    <div
      v-if="box"
      class="absolute cursor-move touch-none rounded-full border-2 border-accent bg-accent/25 outline-offset-2 focus-visible:outline-2 focus-visible:outline-white"
      :style="style"
      tabindex="0"
      role="group"
      aria-label="Voice bubble"
      aria-describedby="bubble-hint"
      data-testid="bubble"
      @pointerdown="down($event, 'move')"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
      @keydown="key"
    >
      <span id="bubble-hint" class="sr-only">Drag, or use the arrow keys to move. Hold Shift to move faster.</span>
      <span
        class="absolute right-0 bottom-0 size-3 translate-x-1/3 translate-y-1/3 cursor-nwse-resize touch-none rounded-sm bg-accent"
        data-testid="bubble-resize"
        aria-hidden="true"
        @pointerdown="down($event, 'resize')"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="up"
      />
    </div>
  </div>
</template>
