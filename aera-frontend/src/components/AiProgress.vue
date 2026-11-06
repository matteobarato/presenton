<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Sparkles } from 'lucide-vue-next'

const props = defineProps<{ kind: 'slide' | 'deck'; startedAt: number; duration: number; motion: boolean }>()
const now = ref(performance.now())
let ticker: ReturnType<typeof setInterval>
onMounted(() => { ticker = setInterval(() => { now.value = performance.now() }, 100) })
onUnmounted(() => clearInterval(ticker))

const elapsed = computed(() => Math.max(0, now.value - props.startedAt))
const progress = computed(() => Math.min(99, Math.floor(elapsed.value / props.duration * 100)))
const remaining = computed(() => Math.ceil(Math.max(0, props.duration - elapsed.value) / 1000))
const stage = computed(() => {
  const index = progress.value < 25 ? 0 : progress.value < 80 ? 1 : 2
  const steps = props.kind === 'deck'
    ? ['Outlining your presentation', 'Building six starter slides', 'Preparing your deck']
    : ['Reading your slide', 'Drafting the change', 'Preparing the update']
  return steps[index]
})
</script>

<template>
  <div class="ai-progress" :class="{ 'ai-progress-static': !motion }">
    <div class="ai-progress-heading">
      <span class="ai-progress-mark"><Sparkles :size="14" aria-hidden="true"/></span>
      <span class="ai-progress-stage" role="status">{{ stage }}</span>
      <span class="ai-progress-percent" aria-hidden="true">{{ progress }}%</span>
    </div>
    <div class="ai-progress-track" role="progressbar" :aria-label="kind === 'deck' ? 'Deck preview progress' : 'Slide preview progress'" :aria-valuenow="progress">
      <span class="ai-progress-fill" :style="{ transform: 'scaleX(' + progress / 100 + ')' }"></span>
    </div>
    <div class="ai-progress-times">
      <span>{{ (elapsed / 1000).toFixed(1) }}s elapsed</span>
      <span>{{ remaining ? 'About ' + remaining + 's left' : 'Finishing…' }}</span>
    </div>
  </div>
</template>
