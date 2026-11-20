<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePresentation } from '@/api/presentations'
import { useAnimations } from '@/composables/useSlideAnimation'
import PresentControls from '@/components/present/PresentControls.vue'
import PresentStage from '@/components/present/PresentStage.vue'
import { useNarratedPlayback } from '@/composables/useNarratedPlayback'

const IDLE_MS = 2000

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id ?? ''))
const { data: presentation, isError } = usePresentation(id)

const slides = computed(() => [...(presentation.value?.slides ?? [])].sort((a, b) => a.index - b.index))
const total = computed(() => slides.value.length)
// `?from=N` starts at slide N ("Present from current slide"); the total watcher clamps it.
const index = ref(Math.max(0, Math.floor(Number(route.query.from)) || 0))
const slide = computed(() => slides.value[index.value])

// Stored entrance plans, played as each slide appears. A plan whose elements changed since it was made
// (`stale_layout`) would animate the wrong things, so it is skipped, as are slides without a plan.
const { data: animations } = useAnimations(id)
const tweens = computed(() => {
  const entry = animations.value?.slides.find((a) => a.slide_id === slide.value?.id)
  return entry && ['fresh', 'stale_content'].includes(entry.status) ? entry.tweens : []
})

// Starts paused; Play runs the deck by itself, and audio only decides whether the narration is heard.
const running = ref(false)
const audioOn = ref(true)
const { playing, avatar, available, onAdvance } = useNarratedPlayback(id, index, { audio: audioOn, running })

const reducedMotion = ref(typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

function go(to: number) {
  index.value = Math.min(Math.max(to, 0), Math.max(total.value - 1, 0))
}
const next = () => go(index.value + 1)
const prev = () => go(index.value - 1)

// Autoplay moves on by itself; after the last slide it simply stops.
onAdvance(() => {
  if (index.value >= total.value - 1) running.value = false
  else next()
})

function exit() {
  void router.push({ name: 'editor', params: { id: id.value } })
}

function onKey(event: KeyboardEvent) {
  if (event.target instanceof HTMLElement && event.target.closest('button, a, input, select, textarea')) {
    if (event.key === ' ' || event.key === 'Enter') return
  }
  switch (event.key) {
    case 'ArrowRight':
    case ' ':
    case 'PageDown':
      event.preventDefault()
      next()
      break
    case 'ArrowLeft':
    case 'PageUp':
      event.preventDefault()
      prev()
      break
    case 'Escape':
      exit()
      break
  }
}

// Controls fade out after 2 s without pointer movement.
const controlsVisible = ref(true)
let idleTimer: ReturnType<typeof setTimeout> | undefined
function wake() {
  controlsVisible.value = true
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => (controlsVisible.value = false), IDLE_MS)
}

// Full screen when the browser allows it; the fixed overlay is the fallback. The browser eats Esc
// to leave full screen, so leaving it also leaves present mode.
const root = ref<HTMLElement | null>(null)
let enteredFullscreen = false
function onFullscreenChange() {
  if (document.fullscreenElement) enteredFullscreen = true
  else if (enteredFullscreen) exit()
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  wake()
  void Promise.resolve(root.value?.requestFullscreen?.()).catch(() => {})
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  clearTimeout(idleTimer)
  enteredFullscreen = false
  if (document.fullscreenElement) void document.exitFullscreen?.()
})

// Keep the index valid if the deck shrinks underneath us.
watch(total, (n) => {
  if (index.value > n - 1) go(n - 1)
})
</script>

<template>
  <main
    ref="root"
    data-testid="present"
    class="fixed inset-0 z-50 overflow-hidden bg-black text-white"
    :class="controlsVisible ? 'cursor-default' : 'cursor-none'"
    @mousemove="wake"
    @click="next"
  >
    <PresentStage
      v-if="slide"
      :slide="slide"
      :theme="presentation?.theme"
      :fonts="presentation?.fonts"
      :reduced-motion="reducedMotion"
      :tweens="tweens"
      :avatar="avatar"
      :playing="playing"
    />
    <p v-else-if="isError" role="alert" class="absolute inset-0 flex items-center justify-center text-white/80">
      Couldn't load this presentation.
    </p>
    <PresentControls
      :index="index"
      :total="total"
      :visible="controlsVisible"
      :narration-available="available"
      :audio-on="audioOn"
      :running="running"
      @prev="prev"
      @next="next"
      @exit="exit"
      @toggle-audio="audioOn = !audioOn"
      @toggle-play="running = !running"
    />
  </main>
</template>
