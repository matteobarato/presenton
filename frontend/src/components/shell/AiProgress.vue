<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Sparkles } from 'lucide-vue-next'

/**
 * Aera's AI progress card (aera-frontend AiProgress): a stage line, a filling track with a light
 * sweep and an elapsed-time row. Real jobs have no known duration, so the fill eases towards 95%
 * over `expectedMs` and the caller supplies the honest detail (e.g. "3 slides drafted"). When the job does
 * report real progress, pass it as `value` (0-100) and the fill follows it instead.
 */
const props = withDefaults(defineProps<{ stage: string; detail?: string; label?: string; expectedMs?: number; value?: number }>(), {
  detail: '',
  expectedMs: 30_000,
})
const { t } = useI18n()

const startedAt = performance.now()
const now = ref(startedAt)
let ticker: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  ticker = setInterval(() => (now.value = performance.now()), 100)
})
onUnmounted(() => clearInterval(ticker))

const elapsed = computed(() => Math.max(0, now.value - startedAt))
const progress = computed(() =>
  props.value !== undefined
    ? Math.min(100, Math.max(0, Math.round(props.value)))
    : Math.min(95, Math.round(95 * (1 - Math.exp(-elapsed.value / (props.expectedMs / 2))))),
)
</script>

<template>
  <div class="ai-progress">
    <div class="ai-progress-heading">
      <span class="ai-progress-mark"><Sparkles :size="14" aria-hidden="true" /></span>
      <span class="ai-progress-stage" role="status" aria-live="polite">{{ stage }}</span>
      <span class="ai-progress-percent" aria-hidden="true">{{ progress }}%</span>
    </div>
    <div class="ai-progress-track" role="progressbar" :aria-label="label || t('shell.aiProgress.label')":aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100">
      <span class="ai-progress-fill" :style="{ transform: `scaleX(${progress / 100})` }" />
    </div>
    <div class="ai-progress-times">
      <span>{{ t('shell.aiProgress.elapsed', { seconds: (elapsed / 1000).toFixed(1) }) }}</span>
      <span>{{ detail }}</span>
    </div>
  </div>
</template>

<style scoped>
.ai-progress { display: grid; gap: 9px; padding: 11px; border: 1px solid var(--color-lx-8ebfd329); border-radius: 10px; background: var(--color-sx-203039); }
.ai-progress-heading, .ai-progress-times { display: flex; align-items: center; gap: 7px; }
.ai-progress-mark { display: grid; width: 22px; height: 22px; flex: 0 0 22px; place-items: center; border-radius: 6px; background: var(--color-sx-344c5a); color: var(--color-tx-c5eaff); }
.ai-progress-stage { flex: 1; color: var(--color-tx-e5f1f7); font-size: 11px; font-weight: 650; }
.ai-progress-percent { color: var(--color-tx-c5eaff); font-size: 11px; font-variant-numeric: tabular-nums; }
.ai-progress-track { height: 5px; overflow: hidden; border-radius: 5px; background: var(--color-sx-141d23); }
.ai-progress-fill { position: relative; display: block; width: 100%; height: 100%; transform-origin: left; background: var(--color-sx-9bd5ee); transition: transform 130ms linear; }
.ai-progress-fill::after { position: absolute; inset: 0; background: linear-gradient(100deg, transparent 25%, var(--color-sx-e8f9ffad) 50%, transparent 75%); content: ''; animation: ai-progress-sweep 1.5s linear infinite; }
@keyframes ai-progress-sweep { from { transform: translateX(-100%) } to { transform: translateX(100%) } }
.ai-progress-times { justify-content: space-between; color: var(--color-tx-b8ccd7); font-size: 10px; font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) {
  .ai-progress-fill { transition: none; }
  .ai-progress-fill::after { animation: none; }
}
</style>
