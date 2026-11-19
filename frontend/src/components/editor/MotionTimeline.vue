<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue'
import { useEventListener, useMediaQuery } from '@vueuse/core'
import { Pause, Play, Plus, RotateCcw, Sparkles } from 'lucide-vue-next'
import type { Slide } from '@/api/types'
import { useDeckAnimationRun } from '@/composables/useDeckAnimationRun'
import { useSlideAnimation } from '@/composables/useSlideAnimation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MOTION_WINDOW, effects } from '@/motion/effects'
import { targetNames } from '@/motion/names'
import { tweenEffect } from '@/motion/plan'
import { useEditorStore } from '@/stores/editor'

/**
 * Footer → Motion: one track per animatable element on a 0–2.5 s ruler. Clips drag (or take ←/→) to move
 * their start; the transport drives `editor.motionTime`, which the canvas turns into a preview.
 */
const props = defineProps<{ presentationId: string; slide: Slide | null }>()
const editor = useEditorStore()

const NO_SLIDE = { id: null, index: -1 } as unknown as Slide
const slide = computed(() => props.slide ?? NO_SLIDE)
const { animation, draft, busy, stale, patchTween, setEffect, generate } = useSlideAnimation(toRef(props, 'presentationId'), slide)
// The deck run would overwrite an edit made meanwhile; a stale plan names elements the slide no longer has.
const deckRunning = useDeckAnimationRun(toRef(props, 'presentationId')).running
const locked = computed(() => deckRunning.value || stale.value)
const lockReason = computed(() => (deckRunning.value ? 'Unavailable while motion is planned for every slide' : undefined))

const targets = computed(() => (animation.value?.status === 'unsupported' ? [] : (animation.value?.targets ?? [])))
const names = computed(() => targetNames(targets.value))
const tweenFor = (id: string) => draft.value.find((t) => t.target === id)
const canPlay = computed(() => draft.value.length > 0 && !stale.value)
const TICKS = Array.from({ length: MOTION_WINDOW * 2 + 1 }, (_, i) => i / 2)
const round1 = (n: number) => Math.round(n * 10) / 10
const pct = (s: number) => `${(s / MOTION_WINDOW) * 100}%`

// Below 1050px the inspector is a drawer that would cover this footer: only switch its tab there.
const inspectorDrawer = useMediaQuery('(max-width: 1050px)')
function choose(id: string) {
  editor.motionTarget = id
  editor.inspectorTab = 'motion'
  if (!inspectorDrawer.value) editor.inspectorOpen = true
}
function add(id: string) {
  if (locked.value) return
  setEffect(id, 'fade')
  choose(id)
}
function clipName(id: string) {
  const effect = tweenEffect(tweenFor(id))
  return effect === 'custom' ? 'Custom' : (effects.find((e) => e.id === effect)?.name ?? '')
}

// Transport: a frame loop advances the store's time; the canvas only seeks to it.
const playing = ref(false)
const looping = ref(false)
let frame = 0
let last = 0
function pause() {
  playing.value = false
  cancelAnimationFrame(frame)
}
function tick(now: number) {
  if (!playing.value) return
  if (editor.motionTime === null) return pause()
  let t = editor.motionTime + (now - last) / 1000
  last = now
  if (t >= MOTION_WINDOW) {
    if (!looping.value) {
      editor.motionTime = MOTION_WINDOW
      return pause()
    }
    t %= MOTION_WINDOW
  }
  editor.motionTime = t
  frame = requestAnimationFrame(tick)
}
function play() {
  if (playing.value) return pause()
  const t = editor.motionTime ?? 0
  editor.motionTime = t >= MOTION_WINDOW ? 0 : t
  playing.value = true
  last = performance.now()
  frame = requestAnimationFrame(tick)
}
function stop() {
  pause()
  editor.motionTime = null
}
function scrub(value: number) {
  pause()
  editor.motionTime = value
}
// A stop from anywhere (slide change, leaving Motion) ends the loop; a collapsed footer ends the preview.
watch(
  () => editor.motionTime,
  (t) => {
    if (t === null) pause()
  },
)
watch(
  () => editor.footerOpen,
  (open) => {
    if (!open) stop()
  },
)
useEventListener(document, 'visibilitychange', () => {
  if (document.hidden) pause()
})
onBeforeUnmount(stop)

// Dragging a clip moves its start; the lane width maps px to seconds.
const drag = ref<{ target: string; startX: number; width: number; original: number; delay: number } | null>(null)
function maxDelay(id: string) {
  const d = tweenFor(id)?.duration ?? 0
  return Math.floor((MOTION_WINDOW - d) * 10 + 1e-6) / 10
}
function beginDrag(e: PointerEvent, id: string) {
  if (e.button !== 0 || locked.value) return
  const t = tweenFor(id)
  const lane = (e.currentTarget as HTMLElement).parentElement
  const width = lane?.getBoundingClientRect().width ?? 0
  if (!t || !width) return
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  drag.value = { target: id, startX: e.clientX, width, original: t.delay, delay: t.delay }
}
function moveDrag(e: PointerEvent) {
  const d = drag.value
  if (!d) return
  const raw = round1(d.original + ((e.clientX - d.startX) / d.width) * MOTION_WINDOW)
  d.delay = Math.min(maxDelay(d.target), Math.max(0, raw))
}
function endDrag() {
  const d = drag.value
  if (!d) return
  drag.value = null
  if (d.delay !== d.original && !locked.value) patchTween(d.target, { delay: d.delay })
}
function nudge(e: KeyboardEvent, id: string) {
  const step = e.key === 'ArrowRight' ? 0.1 : e.key === 'ArrowLeft' ? -0.1 : 0
  const t = tweenFor(id)
  if (!step || !t || locked.value) return
  e.preventDefault()
  e.stopPropagation()
  editor.motionTarget = id
  patchTween(id, { delay: Math.max(0, round1(t.delay + step)) })
}
function clipStyle(id: string) {
  const t = tweenFor(id)!
  const delay = drag.value?.target === id ? drag.value.delay : t.delay
  return { left: pct(delay), width: pct(t.duration) }
}

const time = computed(() => editor.motionTime ?? 0)
// A stale plan is not previewed.
watch(stale, (on) => {
  if (on) stop()
})

// Re-plan a stale slide; a hand-edited plan asks first, as in the Motion tab.
const replanning = ref(false)
const confirmOpen = ref(false)
async function replan() {
  confirmOpen.value = false
  replanning.value = true
  try {
    await generate({ force: true })
  } finally {
    replanning.value = false
  }
}
function askReplan() {
  if (animation.value?.source === 'user') confirmOpen.value = true
  else void replan()
}
</script>

<template>
  <section class="motion-timeline" aria-label="Animation timeline">
    <div class="motion-header">
      <strong class="text-[11px] font-semibold text-[#d4e7ef]">Timeline</strong>
      <div class="motion-transport">
        <button
          type="button"
          class="motion-play"
          :aria-label="playing ? 'Pause animation' : 'Play animation'"
          :disabled="!canPlay"
          @click="play"
        >
          <Pause v-if="playing" class="size-3" aria-hidden="true" /><Play v-else class="size-3" aria-hidden="true" />{{ playing ? 'Pause' : 'Play' }}
        </button>
        <button
          type="button"
          class="motion-icon"
          aria-label="Stop and restore slide"
          title="Stop and restore slide"
          :disabled="editor.motionTime === null"
          @click="stop"
        >
          <RotateCcw class="size-3.5" aria-hidden="true" />
        </button>
        <output class="motion-time">{{ time.toFixed(1) }} <span>/ {{ MOTION_WINDOW.toFixed(1) }} s</span></output>
        <label class="motion-loop"><input v-model="looping" type="checkbox" /> Loop</label>
      </div>
    </div>

    <p v-if="!targets.length" class="px-4 pb-3 text-[11px] leading-[1.6] text-muted max-[760px]:px-3">
      {{ animation?.status === 'unsupported' || !props.slide ? "This slide can't be animated." : 'Nothing to animate on this slide.' }}
    </p>
    <div v-else-if="stale" class="flex items-center justify-between gap-3 px-4 pb-3 max-[760px]:px-3" role="status">
      <p class="text-[11px] leading-[1.6] text-[#dce3e7]">
        <b class="font-semibold">Layout changed — re-plan.</b>
        <span class="text-muted"> This slide's elements changed since its motion was made.</span>
      </p>
      <Button size="sm" variant="secondary" :disabled="busy || replanning || deckRunning" :title="lockReason" @click="askReplan">
        <Sparkles class="size-3.5" aria-hidden="true" />Re-plan
      </Button>
    </div>
    <template v-else>
      <div class="motion-ruler" aria-hidden="true">
        <span>ELEMENT</span>
        <div><span v-for="s in TICKS" :key="s" :style="{ left: pct(s) }">{{ s }}s</span></div>
      </div>
      <div class="motion-tracks">
        <div
          v-for="t in targets"
          :key="t.id"
          data-motion-track
          class="motion-track"
          :class="{ 'is-selected': editor.motionTarget === t.id }"
        >
          <button type="button" class="motion-track-name" :aria-pressed="editor.motionTarget === t.id" :title="names.get(t.id)" @click="choose(t.id)">
            <span aria-hidden="true" /><b>{{ names.get(t.id) }}</b>
          </button>
          <div class="motion-lane">
            <button
              v-if="tweenFor(t.id)"
              type="button"
              class="motion-clip"
              :class="{ 'is-active': editor.motionTarget === t.id }"
              :data-motion-clip="t.id"
              :style="clipStyle(t.id)"
              :aria-label="`${names.get(t.id)} animation. ${lockReason ?? 'Drag or use arrow keys to change its start time.'}`"
              :aria-disabled="locked || undefined"
              :title="lockReason ?? `${clipName(t.id)} · ${tweenFor(t.id)!.delay.toFixed(1)}s`"
              @click="choose(t.id)"
              @pointerdown="beginDrag($event, t.id)"
              @pointermove="moveDrag"
              @pointerup="endDrag"
              @pointercancel="drag = null"
              @keydown="nudge($event, t.id)"
            >
              <span>{{ clipName(t.id) }}</span>
            </button>
            <button
              v-else
              type="button"
              class="motion-add"
              :aria-label="`Add motion to ${names.get(t.id)}`"
              :disabled="locked"
              :title="lockReason"
              @click="add(t.id)"
            >
              <Plus class="size-2.5" aria-hidden="true" />Add
            </button>
            <span v-if="editor.motionTime !== null" class="motion-playhead" :style="{ left: pct(time) }" aria-hidden="true" />
          </div>
        </div>
      </div>
      <div class="motion-scrubber">
        <span>Scrub preview</span>
        <input
          type="range"
          min="0"
          :max="MOTION_WINDOW"
          step="0.01"
          :value="time"
          :disabled="!canPlay"
          aria-label="Animation playhead in seconds"
          @input="scrub(Number(($event.target as HTMLInputElement).value))"
        />
      </div>
      <p v-if="lockReason" class="motion-help">{{ lockReason }}.</p>
      <p v-else class="motion-help">Drag clips to sequence. Arrow keys fine-tune by 0.1 s. Slide editing pauses while the preview plays.</p>
    </template>

    <Dialog v-model:open="confirmOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Replace your edits?</DialogTitle>
          <DialogDescription>You've edited this slide's motion by hand. Regenerating replaces it with a new AI plan.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" @click="confirmOpen = false">Cancel</Button>
          <Button @click="replan">Replace</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>

<style scoped>
/* Timeline look from the Aera mockup (aera-frontend/src/motion.css). */
.motion-timeline { padding: 6px 16px 8px; }
.motion-header { display: flex; align-items: center; justify-content: space-between; gap: 9px; padding-bottom: 8px; }
.motion-transport { display: flex; align-items: center; gap: 9px; white-space: nowrap; }
.motion-play { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 9px; border-radius: 6px; background: #30414b; color: #d1e8f3; font-size: 10px; }
.motion-play:hover:not(:disabled) { background: #3a505d; }
.motion-icon { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 6px; color: #a4b5bd; }
.motion-icon:hover:not(:disabled) { color: #fff; background: #ffffff0a; }
.motion-play:disabled, .motion-icon:disabled, .motion-scrubber input:disabled { opacity: 0.45; cursor: default; }
.motion-time { min-width: 62px; color: #d4e7ef; font-size: 11px; font-variant-numeric: tabular-nums; }
.motion-time span { color: #a4b5bd; font-size: 9px; }
.motion-loop { display: flex; align-items: center; gap: 4px; color: #a8bbc5; font-size: 9px; }
.motion-loop input { accent-color: #f1cc96; }
.motion-ruler, .motion-track, .motion-scrubber { display: grid; grid-template-columns: 108px minmax(0, 1fr); }
.motion-ruler { height: 23px; font-size: 8px; letter-spacing: 0.04em; color: #a2b5c0; }
.motion-ruler > span { padding-top: 1px; }
.motion-ruler > div { position: relative; margin-right: 4px; }
.motion-ruler > div > span { position: absolute; translate: -50% 0; font-variant-numeric: tabular-nums; }
.motion-ruler > div > span:first-child { translate: 0; }
.motion-ruler > div > span:last-child { translate: -100% 0; }
.motion-track { height: 28px; border-radius: 4px; }
.motion-track.is-selected { background: #bee3f30a; }
.motion-track-name { display: flex; min-width: 0; align-items: center; gap: 7px; padding: 0 5px; text-align: left; font-size: 10px; color: #b7c8d1; white-space: nowrap; }
.motion-track-name b { overflow: hidden; text-overflow: ellipsis; font-weight: 400; }
.motion-track-name > span { width: 5px; height: 5px; flex-shrink: 0; border-radius: 2px; background: #708590; }
.is-selected > .motion-track-name { color: #e1f2fa; }
.is-selected > .motion-track-name > span { background: #bee3f3; }
.motion-lane { position: relative; margin-right: 4px; border-bottom: 1px solid #ffffff07; background: repeating-linear-gradient(90deg, #ffffff08 0px, #ffffff08 1px, transparent 1px, transparent 20%); }
.motion-clip { position: absolute; top: 5px; height: 18px; min-width: 4px; overflow: hidden; padding: 0; border: 1px solid #91b9cd; border-radius: 4px; background: #436b7e; color: #e6f5fd; font-size: 8px; text-align: left; touch-action: none; cursor: grab; transition: background 150ms; }
.motion-clip span { padding: 0 4px; white-space: nowrap; }
.motion-clip:active { cursor: grabbing; }
.motion-clip.is-active { outline: 1px solid #eff8fc; outline-offset: 2px; }
.motion-add { position: absolute; top: 5px; left: 0; display: inline-flex; height: 18px; align-items: center; gap: 3px; padding: 0 6px; border: 1px dashed #ffffff21; border-radius: 4px; color: #a2b5c0; font-size: 8px; }
.motion-add:hover:not(:disabled) { border-color: #829eac; color: #e5f4fc; }
.motion-add:disabled { opacity: 0.45; cursor: default; }
.motion-clip[aria-disabled] { cursor: default; }
.motion-playhead { position: absolute; top: 0; bottom: 0; z-index: 2; width: 1px; background: #f1cc96; pointer-events: none; }
.motion-scrubber { align-items: center; margin: 7px 0 6px; color: #a2b5c0; font-size: 9px; }
.motion-scrubber input { width: 100%; height: 12px; margin: 0; accent-color: #f1cc96; cursor: ew-resize; }
.motion-help { margin-top: 4px; color: #a6bac5; font-size: 9px; line-height: 1.5; }
@media (max-width: 1279px) {
  .motion-ruler, .motion-track, .motion-scrubber { grid-template-columns: 91px minmax(0, 1fr); }
  .motion-track-name { font-size: 9px; }
  .motion-loop { display: none; }
}
@media (max-width: 760px) {
  .motion-timeline { padding: 6px 12px 8px; }
  .motion-transport { gap: 3px; }
  .motion-clip { min-width: 7px; }
}
</style>
