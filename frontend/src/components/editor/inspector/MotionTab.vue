<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref, toRef } from 'vue'
import { useEventListener } from '@vueuse/core'
import { ChevronDown, Search, Sparkles, X } from 'lucide-vue-next'
import type { AnimationTween, Presentation, Slide } from '@/api/types'
import { useDeckAnimationRun } from '@/composables/useDeckAnimationRun'
import { useAnimations, useSlideAnimation } from '@/composables/useSlideAnimation'
import { EASES, MIN_DURATION, MOTION_WINDOW, effects } from '@/motion/effects'
import { targetNames } from '@/motion/names'
import { tweenEffect, type PresetId } from '@/motion/plan'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import AiProgress from '@/components/shell/AiProgress.vue'
import { useEditorStore } from '@/stores/editor'
import NumberField from './controls/NumberField.vue'
import { field, label as sectionLabel, section } from './controls/styles'

const { t } = useI18n()

/**
 * Entrance motion for the active slide (template slides only): pick an element, give it an effect, tune its
 * timing, or let AI plan the slide. Edits go through `useSlideAnimation`, which clamps and saves them.
 */
const props = defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()

const editor = useEditorStore()

// No slide → an index no slide has, so the composable finds no plan and every edit is a no-op.
const NO_SLIDE = { id: null, index: -1 } as unknown as Slide
const slide = computed(() => props.activeSlide ?? NO_SLIDE)
const { animation, draft, error, busy, stale, setEffect, patchTween, applyPreset, generate, generateAll, clear } =
  useSlideAnimation(toRef(props, 'presentationId'), slide)

// Same cache entry as the composable's read: only for its loading and error state.
const deck = useAnimations(toRef(props, 'presentationId'))

const targets = computed(() => animation.value?.targets ?? [])
const names = computed(() => targetNames(targets.value))
// The store's target when it belongs to this slide; otherwise the first element (shown, not written).
const selected = computed(() => {
  const ids = targets.value.map((t) => t.id)
  return editor.motionTarget && ids.includes(editor.motionTarget) ? editor.motionTarget : (ids[0] ?? null)
})
const tween = computed(() => draft.value.find((t) => t.target === selected.value))
const current = computed(() => tweenEffect(tween.value))
const currentName = computed(() =>
  current.value === 'custom' ? t('editorInspector.motion.custom') : (effects.find((e) => e.id === current.value)?.name ?? t('editorInspector.motion.none')),
)

// Effect palette
const query = ref('')
const search = ref<HTMLInputElement>()
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return effects.filter((e) => `${e.name} ${e.detail}`.toLowerCase().includes(q))
})
function pick(id: (typeof effects)[number]['id']) {
  if (selected.value && !locked.value) setEffect(selected.value, id)
}
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
// Capture phase: runs before the editor's global ⌘K (Ask AI), which yields to a prevented event.
useEventListener(
  window,
  'keydown',
  (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return
    if (editor.inspectorTab !== 'motion' || !editor.inspectorOpen || !search.value) return
    e.preventDefault()
    search.value.focus({ preventScroll: true })
    search.value.select()
  },
  { capture: true },
)

// Timing and raw values
function patch(p: Partial<AnimationTween>) {
  if (selected.value && !locked.value) patchTween(selected.value, p)
}
type FromKey = keyof AnimationTween['from_values']
// Bounds mirror the backend's ANIMATION_PROPERTIES (generate_slide_animations.py), which clamps to them.
const FROM_FIELDS: { key: FromKey; neutral: number; min: number; max: number; step: number; unit?: string }[] = [
  { key: 'opacity', neutral: 1, min: 0, max: 1, step: 0.1 },
  { key: 'x', neutral: 0, min: -400, max: 400, step: 1, unit: 'px' },
  { key: 'y', neutral: 0, min: -300, max: 300, step: 1, unit: 'px' },
  { key: 'scale', neutral: 1, min: 0.3, max: 1.5, step: 0.05 },
  { key: 'rotation', neutral: 0, min: -30, max: 30, step: 1, unit: '°' },
  { key: 'blur', neutral: 0, min: 0, max: 20, step: 1, unit: 'px' },
]
const customOpen = ref(false)
function setFrom(key: FromKey, neutral: number, value: number) {
  const t = tween.value
  if (!t) return
  const next = { ...t.from_values }
  // The resting value means "no change": drop it so the effect is still recognised.
  if (value === neutral) delete next[key]
  else next[key] = value
  patch({ from_values: next })
}

function onPreset(event: Event) {
  const el = event.target as HTMLSelectElement
  if (el.value && !locked.value) applyPreset(el.value as PresetId)
  el.value = ''
}

// Generation
const planning = ref(false)
async function runGenerate(force: boolean) {
  planning.value = true
  try {
    await generate({ force })
  } finally {
    planning.value = false
  }
}
const confirmOpen = ref(false)
function regenerate() {
  if (animation.value?.source === 'user') confirmOpen.value = true
  else void runGenerate(true)
}
function confirmRegenerate() {
  confirmOpen.value = false
  void runGenerate(true)
}

// The deck-wide run is the editor's (shared with the post-generation run), so it outlives this tab.
const deckRun = useDeckAnimationRun(toRef(props, 'presentationId'))
const deckRunning = deckRun.running
// While the deck run plans every slide it would overwrite an edit made meanwhile: nothing edits until it ends.
const locked = computed(() => deckRunning.value)
const lockReason = computed(() => (deckRunning.value ? t('editorInspector.motion.lockReason') : undefined))
function runGenerateAll() {
  // `generateAll` saves this slide's pending draft before the deck is planned.
  return deckRun.run(generateAll)
}

// The "edits were reset" banner: dismissed per slide, in this view only.
const dismissedFor = ref<string | null>(null)
const showReset = computed(() => {
  const a = animation.value
  return Boolean(a?.reset_from_user && dismissedFor.value !== a.slide_id)
})

const alert = computed(() => error.value ?? deckRun.error.value)
const fieldLabel = 'mb-2 block text-[10px] text-tx-b8cad4'
const select = 'h-full w-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-[10px] text-tx-dce3e7 outline-none'
</script>

<template>
  <section class="flex flex-1 flex-col px-5 pb-[18px] max-[1279px]:px-4 min-[1600px]:px-[23px]" :aria-label="t('editorInspector.motion.ariaLabel')">
    <div class="pt-6 pb-[22px] min-[1600px]:pt-7 min-[1600px]:pb-[26px] [@media(max-height:780px)_and_(min-width:1051px)]:pt-[17px] [@media(max-height:780px)_and_(min-width:1051px)]:pb-4">
      <h2 class="text-[19px] font-medium tracking-[-0.04em] text-tx-f0f2f3 max-[1279px]:text-[18px] min-[1600px]:text-[22px]">{{ t('editorInspector.motion.title') }}</h2>
      <p class="mt-[5px] text-[10px] leading-[1.6] text-tx-a0abb1">{{ t('editorInspector.motion.intro') }}</p>
    </div>

    <p v-if="!activeSlide" class="text-[11px] text-muted">{{ t('editorInspector.motion.noSlide') }}</p>
    <div v-else-if="!animation && deck.isPending.value" class="flex flex-col gap-2" aria-hidden="true">
      <div class="skeleton-shimmer h-[34px] rounded-control" />
      <div class="skeleton-shimmer h-[120px] rounded-control" />
    </div>
    <p v-else-if="!animation && deck.isError.value" class="text-[11px] text-danger-text" role="alert">{{ t('editorInspector.motion.loadError') }}</p>
    <p v-else-if="!animation" class="text-[11px] leading-[1.6] text-muted">{{ t('editorInspector.motion.notReady') }}</p>
    <p v-else-if="animation.status === 'unsupported'" class="text-[11px] leading-[1.6] text-muted">
      {{ t('editorInspector.motion.unsupported') }}
    </p>
    <p v-else-if="!targets.length" class="text-[11px] leading-[1.6] text-muted">{{ t('editorInspector.motion.nothingToAnimate') }}</p>

    <template v-else>
      <div
        v-if="showReset"
        class="mb-4 flex items-start gap-2 rounded-control border border-ov/[0.06] bg-field px-2.5 py-2 text-[10px] leading-[1.5] text-tx-dce3e7"
        role="status"
      >
        <span class="flex-1">{{ t('editorInspector.motion.resetNotice') }}</span>
        <button
          type="button"
          class="-m-0.5 grid size-5 shrink-0 place-items-center rounded-control text-tx-9aa9b0 hover:bg-ov/[0.04] hover:text-white"
          :aria-label="t('editorInspector.motion.dismiss')"
          @click="dismissedFor = animation.slide_id"
        >
          <X class="size-3" aria-hidden="true" />
        </button>
      </div>

      <AiProgress v-if="planning" class="mb-4" :stage="t('editorInspector.motion.planningSlide')" :label="t('editorInspector.motion.planningSlideLabel')" :expected-ms="15_000" />
      <AiProgress v-if="deckRunning" class="mb-4" :stage="t('editorInspector.motion.planningDeck')" :label="t('editorInspector.motion.planningDeckLabel')" :expected-ms="60_000" />
      <p v-if="alert" class="mb-4 text-[11px] text-danger-text" role="alert">{{ alert }}</p>

      <div v-if="stale" class="flex flex-col items-start gap-3 pb-[18px]" role="status">
        <div>
          <h3 class="text-[12px] font-semibold text-tx-f6f8f9">{{ t('editorInspector.motion.stale.title') }}</h3>
          <p class="mt-1 text-[10px] leading-[1.6] text-tx-a0abb1">
            {{ t('editorInspector.motion.stale.hint') }}
          </p>
        </div>
        <Button size="sm" :disabled="busy || planning || deckRunning" :title="lockReason" @click="regenerate">
          <Sparkles class="size-3.5" aria-hidden="true" />{{ t('editorInspector.motion.stale.replan') }}
        </Button>
      </div>

      <div v-else-if="animation.status === 'missing' && !planning" class="flex flex-col items-start gap-3 pb-[18px]">
        <div>
          <h3 class="text-[12px] font-semibold text-tx-f6f8f9">{{ t('editorInspector.motion.missing.title') }}</h3>
          <p class="mt-1 text-[10px] leading-[1.6] text-tx-a0abb1">{{ t('editorInspector.motion.missing.hint') }}</p>
        </div>
        <Button size="sm" :disabled="busy || deckRunning" :title="lockReason" @click="runGenerate(false)">
          <Sparkles class="size-3.5" aria-hidden="true" />{{ t('editorInspector.motion.missing.generate') }}
        </Button>
      </div>

      <template v-else-if="animation.status !== 'missing'">
        <label class="mb-2 block text-[10px] text-tx-c0cfd6" for="motion-element">{{ t('editorInspector.motion.selectedElement') }}</label>
        <div :class="field">
          <select id="motion-element" :class="select" :value="selected ?? ''" @change="editor.motionTarget = ($event.target as HTMLSelectElement).value">
            <option v-for="t in targets" :key="t.id" :value="t.id" class="bg-dialog">{{ names.get(t.id) }}</option>
          </select>
          <ChevronDown class="size-3 shrink-0 text-tx-a0aeb5" aria-hidden="true" />
        </div>

        <div class="flex flex-col gap-[13px] pt-[19px] pb-[18px]">
          <label :class="[field, 'cursor-text']">
            <Search class="size-3.5 shrink-0 text-tx-aebfc8" aria-hidden="true" />
            <input
              ref="search"
              v-model="query"
              class="h-full w-full min-w-0 bg-transparent text-[11px] text-tx-e5edf1 outline-none placeholder:text-tx-9aa9b0"
              :placeholder="t('editorInspector.motion.findEffect')"
              :aria-label="t('editorInspector.motion.searchEffects')"
              @keydown.enter.prevent="filtered[0] && pick(filtered[0].id)"
            />
            <kbd class="whitespace-nowrap text-[9px] text-tx-b1c3cd">{{ isMac ? '⌘ K' : 'Ctrl K' }}</kbd>
          </label>
          <fieldset class="motion-effects grid min-w-0 grid-cols-3 gap-[5px]" :disabled="locked" :title="lockReason">
            <legend class="sr-only">{{ lockReason ? t('editorInspector.motion.effectsLegendLocked', { reason: lockReason.toLowerCase() }) : t('editorInspector.motion.effectsLegend') }}</legend>
            <button
              v-for="e in filtered"
              :key="e.id"
              type="button"
              :aria-pressed="current === e.id"
              :title="e.detail"
              class="flex flex-col items-center justify-center gap-2 rounded-control border border-transparent px-1 py-[11px] text-[10px] text-tx-b9c9d1 hover:bg-sx-2d383d aria-pressed:border-lx-829eac aria-pressed:bg-sx-30414b aria-pressed:text-tx-e5f4fc disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
              @click="pick(e.id)"
            >
              <span class="effect-glyph" :class="`effect-${e.id}`" aria-hidden="true"><i /></span>{{ e.name }}
            </button>
            <p v-if="!filtered.length" class="col-span-full py-[15px] text-[11px] text-tx-afbdc5">{{ t('editorInspector.motion.noEffects') }}</p>
          </fieldset>
        </div>

        <fieldset class="min-w-0 border-y border-line py-[17px]" :disabled="locked" :title="lockReason">
          <legend class="sr-only">{{ lockReason ? t('editorInspector.motion.timingLegendLocked', { reason: lockReason.toLowerCase() }) : t('editorInspector.motion.timingLegend') }}</legend>
          <div class="mb-3 flex justify-between gap-2 text-[11px] text-tx-cfdee6">
            <span class="truncate">{{ selected ? names.get(selected) : '' }}</span>
            <b class="shrink-0 text-[10px] font-medium text-accent">{{ currentName }}</b>
          </div>
          <p v-if="!tween" class="text-[10px] leading-[1.6] text-muted">{{ t('editorInspector.motion.stillElement') }}</p>
          <template v-else>
            <div class="grid grid-cols-2 gap-x-2.5 gap-y-3.5">
              <div>
                <span :class="fieldLabel">{{ t('editorInspector.motion.start') }}</span>
                <NumberField :model-value="tween.delay" :label="t('editorInspector.motion.start')" :min="0" :max="MOTION_WINDOW - MIN_DURATION" :step="0.1" unit="s" @commit="patch({ delay: $event })" />
              </div>
              <div>
                <span :class="fieldLabel">{{ t('editorInspector.motion.duration') }}</span>
                <NumberField :model-value="tween.duration" :label="t('editorInspector.motion.duration')" :min="0" :step="0.1" unit="s" @commit="patch({ duration: $event })" />
              </div>
              <div class="col-span-2">
                <span :class="fieldLabel">{{ t('editorInspector.motion.ease') }}</span>
                <div :class="field">
                  <select :aria-label="t('editorInspector.motion.ease')" :class="select" :value="tween.ease" @change="patch({ ease: ($event.target as HTMLSelectElement).value })">
                    <option v-for="ease in EASES" :key="ease.id" :value="ease.id" class="bg-dialog">{{ ease.label }}</option>
                  </select>
                  <ChevronDown class="size-3 shrink-0 text-tx-a0aeb5" aria-hidden="true" />
                </div>
              </div>
            </div>

            <button
              type="button"
              class="mt-3.5 flex w-full items-center justify-between text-[10px] font-medium text-tx-d0d7dc hover:text-white"
              :aria-expanded="customOpen"
              aria-controls="motion-custom"
              @click="customOpen = !customOpen"
            >
              {{ t('editorInspector.motion.customValues') }}
              <ChevronDown class="size-3 text-tx-a0aeb5 transition-transform" :class="customOpen && 'rotate-180'" aria-hidden="true" />
            </button>
            <div v-show="customOpen" id="motion-custom" class="mt-3 grid grid-cols-2 gap-x-2.5 gap-y-3">
              <div v-for="f in FROM_FIELDS" :key="f.key">
                <span :class="fieldLabel">{{ t('editorInspector.motion.fromField.' + f.key) }}</span>
                <NumberField
                  :model-value="tween.from_values[f.key] ?? f.neutral"
                  :label="t('editorInspector.motion.fromAria', { field: f.key })"
                  :min="f.min"
                  :max="f.max"
                  :step="f.step"
                  :unit="f.unit"
                  @commit="setFrom(f.key, f.neutral, $event)"
                />
              </div>
            </div>
          </template>
        </fieldset>
      </template>

      <div v-if="!stale" :class="[section, animation.status === 'missing' && 'border-t-0']">
        <h3 :class="sectionLabel">{{ t('editorInspector.motion.sequence.title') }}</h3>
        <div :class="field">
          <select id="motion-preset" :aria-label="t('editorInspector.motion.sequence.ariaLabel')" :class="select" value="" :disabled="locked" :title="lockReason" @change="onPreset">
            <option value="" disabled class="bg-dialog">{{ t('editorInspector.motion.sequence.apply') }}</option>
            <option value="cinematic" class="bg-dialog">{{ t('editorInspector.motion.sequence.cinematic') }}</option>
            <option value="cascade" class="bg-dialog">{{ t('editorInspector.motion.sequence.cascade') }}</option>
            <option value="subtle" class="bg-dialog">{{ t('editorInspector.motion.sequence.subtle') }}</option>
            <option value="clear" class="bg-dialog">{{ t('editorInspector.motion.sequence.clear') }}</option>
          </select>
          <ChevronDown class="size-3 shrink-0 text-tx-a0aeb5" aria-hidden="true" />
        </div>
      </div>

      <div class="mt-auto flex flex-col gap-2 pt-5">
        <Button v-if="animation.status !== 'missing' && !stale" variant="secondary" size="sm" :disabled="busy || planning || deckRunning" :title="lockReason" @click="regenerate">
          <Sparkles class="size-3.5" aria-hidden="true" />{{ t('editorInspector.motion.regenerate') }}
        </Button>
        <Button variant="outline" size="sm" :disabled="busy || planning || deckRunning" :title="lockReason" @click="runGenerateAll">{{ t('editorInspector.motion.generateAll') }}</Button>
        <Button v-if="animation.status !== 'missing'" variant="ghost" size="sm" :disabled="busy || planning || deckRunning" :title="lockReason" @click="clear()">{{ t('editorInspector.motion.clearPlan') }}</Button>
      </div>
    </template>

    <Dialog v-model:open="confirmOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('editorInspector.motion.replaceDialog.title') }}</DialogTitle>
          <DialogDescription>{{ t('editorInspector.motion.replaceDialog.description') }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" @click="confirmOpen = false">{{ t('common.actions.cancel') }}</Button>
          <Button @click="confirmRegenerate">{{ t('editorInspector.motion.replaceDialog.replace') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>

<style scoped>
/* Effect glyphs, from the Aera mockup (motion.css). */
.effect-glyph { position: relative; display: grid; width: 20px; height: 16px; place-items: center; }
.effect-glyph i { width: 11px; height: 11px; border-radius: 2px; background: var(--color-accent); }
.effect-none i { border: 1px dashed var(--color-lx-9db0ba); background: none; }
.effect-fade i { opacity: 0.55; }
.effect-rise i { border-bottom: 3px solid var(--color-lx-5f7f90); translate: 0 -2px; }
.effect-slide i { border-left: 3px solid var(--color-lx-5f7f90); translate: 3px 0; }
.effect-zoom i { border: 2px solid var(--color-lx-7896a5); scale: 1.25; }
.effect-turn i { rotate: -22deg; }
.effect-blur i { filter: blur(1.5px); }
</style>
