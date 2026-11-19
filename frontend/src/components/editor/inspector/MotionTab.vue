<script setup lang="ts">
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

/**
 * Entrance motion for the active slide (template slides only): pick an element, give it an effect, tune its
 * timing, or let AI plan the slide. Edits go through `useSlideAnimation`, which clamps and saves them.
 */
const props = defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()

const editor = useEditorStore()

// No slide → an index no slide has, so the composable finds no plan and every edit is a no-op.
const NO_SLIDE = { id: null, index: -1 } as unknown as Slide
const slide = computed(() => props.activeSlide ?? NO_SLIDE)
const { animation, draft, error, busy, setEffect, patchTween, applyPreset, generate, generateAll, clear } =
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
  current.value === 'custom' ? 'Custom' : (effects.find((e) => e.id === current.value)?.name ?? 'None'),
)

// Effect palette
const query = ref('')
const search = ref<HTMLInputElement>()
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return effects.filter((e) => `${e.name} ${e.detail}`.toLowerCase().includes(q))
})
function pick(id: (typeof effects)[number]['id']) {
  if (selected.value) setEffect(selected.value, id)
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
  if (selected.value) patchTween(selected.value, p)
}
type FromKey = keyof AnimationTween['from_values']
// Bounds mirror the backend's ANIMATION_PROPERTIES (generate_slide_animations.py), which clamps to them.
const FROM_FIELDS: { key: FromKey; label: string; neutral: number; min: number; max: number; step: number; unit?: string }[] = [
  { key: 'opacity', label: 'Opacity', neutral: 1, min: 0, max: 1, step: 0.1 },
  { key: 'x', label: 'x', neutral: 0, min: -400, max: 400, step: 1, unit: 'px' },
  { key: 'y', label: 'y', neutral: 0, min: -300, max: 300, step: 1, unit: 'px' },
  { key: 'scale', label: 'Scale', neutral: 1, min: 0.3, max: 1.5, step: 0.05 },
  { key: 'rotation', label: 'Rotation', neutral: 0, min: -30, max: 30, step: 1, unit: '°' },
  { key: 'blur', label: 'Blur', neutral: 0, min: 0, max: 20, step: 1, unit: 'px' },
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
  if (el.value) applyPreset(el.value as PresetId)
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
const fieldLabel = 'mb-2 block text-[10px] text-[#b8cad4]'
const select = 'h-full w-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-[10px] text-[#dce3e7] outline-none'
</script>

<template>
  <section class="flex flex-1 flex-col px-5 pb-[18px] max-[1279px]:px-4 min-[1600px]:px-[23px]" aria-label="Motion">
    <div class="pt-6 pb-[22px] min-[1600px]:pt-7 min-[1600px]:pb-[26px] [@media(max-height:780px)_and_(min-width:1051px)]:pt-[17px] [@media(max-height:780px)_and_(min-width:1051px)]:pb-4">
      <h2 class="text-[19px] font-medium tracking-[-0.04em] text-[#f0f2f3] max-[1279px]:text-[18px] min-[1600px]:text-[22px]">Motion, with intent.</h2>
      <p class="mt-[5px] text-[10px] leading-[1.6] text-[#a0abb1]">Shape how each element arrives on the slide.</p>
    </div>

    <p v-if="!activeSlide" class="text-[11px] text-muted">Select a slide to edit its motion.</p>
    <div v-else-if="!animation && deck.isPending.value" class="flex flex-col gap-2" aria-hidden="true">
      <div class="skeleton-shimmer h-[34px] rounded-control" />
      <div class="skeleton-shimmer h-[120px] rounded-control" />
    </div>
    <p v-else-if="!animation && deck.isError.value" class="text-[11px] text-danger-text" role="alert">Could not load this deck's motion.</p>
    <p v-else-if="!animation" class="text-[11px] leading-[1.6] text-muted">Motion for this slide isn't ready yet.</p>
    <p v-else-if="animation.status === 'unsupported'" class="text-[11px] leading-[1.6] text-muted">
      This slide can't be animated. Motion works on slides built from a template.
    </p>
    <p v-else-if="!targets.length" class="text-[11px] leading-[1.6] text-muted">Nothing to animate on this slide.</p>

    <template v-else>
      <div
        v-if="showReset"
        class="mb-4 flex items-start gap-2 rounded-control border border-white/[0.06] bg-field px-2.5 py-2 text-[10px] leading-[1.5] text-[#dce3e7]"
        role="status"
      >
        <span class="flex-1">Your edits were reset because the layout changed.</span>
        <button
          type="button"
          class="-m-0.5 grid size-5 shrink-0 place-items-center rounded-control text-[#9aa9b0] hover:bg-white/[0.04] hover:text-white"
          aria-label="Dismiss"
          @click="dismissedFor = animation.slide_id"
        >
          <X class="size-3" aria-hidden="true" />
        </button>
      </div>

      <AiProgress v-if="planning" class="mb-4" stage="Planning this slide's motion…" label="Motion planning" :expected-ms="15_000" />
      <AiProgress v-if="deckRunning" class="mb-4" stage="Planning motion for every slide…" label="Deck motion planning" :expected-ms="60_000" />
      <p v-if="alert" class="mb-4 text-[11px] text-danger-text" role="alert">{{ alert }}</p>

      <div v-if="animation.status === 'missing' && !planning" class="flex flex-col items-start gap-3 pb-[18px]">
        <div>
          <h3 class="text-[12px] font-semibold text-[#f6f8f9]">No motion yet</h3>
          <p class="mt-1 text-[10px] leading-[1.6] text-[#a0abb1]">Let AI plan how this slide's elements arrive, or start from a sequence below.</p>
        </div>
        <Button size="sm" :disabled="busy || deckRunning" @click="runGenerate(false)">
          <Sparkles class="size-3.5" aria-hidden="true" />Generate with AI
        </Button>
      </div>

      <template v-else-if="animation.status !== 'missing'">
        <label class="mb-2 block text-[10px] text-[#c0cfd6]" for="motion-element">Selected element</label>
        <div :class="field">
          <select id="motion-element" :class="select" :value="selected ?? ''" @change="editor.motionTarget = ($event.target as HTMLSelectElement).value">
            <option v-for="t in targets" :key="t.id" :value="t.id">{{ names.get(t.id) }}</option>
          </select>
          <ChevronDown class="size-3 shrink-0 text-[#a0aeb5]" aria-hidden="true" />
        </div>

        <div class="flex flex-col gap-[13px] pt-[19px] pb-[18px]">
          <label :class="[field, 'cursor-text']">
            <Search class="size-3.5 shrink-0 text-[#aebfc8]" aria-hidden="true" />
            <input
              ref="search"
              v-model="query"
              class="h-full w-full min-w-0 bg-transparent text-[11px] text-[#e5edf1] outline-none placeholder:text-[#9aa9b0]"
              placeholder="Find an effect…"
              aria-label="Search motion effects"
              @keydown.enter.prevent="filtered[0] && pick(filtered[0].id)"
            />
            <kbd class="whitespace-nowrap text-[9px] text-[#b1c3cd]">{{ isMac ? '⌘ K' : 'Ctrl K' }}</kbd>
          </label>
          <div class="motion-effects grid grid-cols-3 gap-[5px]">
            <button
              v-for="e in filtered"
              :key="e.id"
              type="button"
              :aria-pressed="current === e.id"
              :title="e.detail"
              class="flex flex-col items-center justify-center gap-2 rounded-control border border-transparent px-1 py-[11px] text-[10px] text-[#b9c9d1] hover:bg-[#2d383d] aria-pressed:border-[#829eac] aria-pressed:bg-[#30414b] aria-pressed:text-[#e5f4fc]"
              @click="pick(e.id)"
            >
              <span class="effect-glyph" :class="`effect-${e.id}`" aria-hidden="true"><i /></span>{{ e.name }}
            </button>
            <p v-if="!filtered.length" class="col-span-full py-[15px] text-[11px] text-[#afbdc5]">No effects found.</p>
          </div>
        </div>

        <div class="border-y border-line py-[17px]">
          <div class="mb-3 flex justify-between gap-2 text-[11px] text-[#cfdee6]">
            <span class="truncate">{{ selected ? names.get(selected) : '' }}</span>
            <b class="shrink-0 text-[10px] font-medium text-[#bee3f3]">{{ currentName }}</b>
          </div>
          <p v-if="!tween" class="text-[10px] leading-[1.6] text-muted">This element stays still. Pick an effect to animate it.</p>
          <template v-else>
            <div class="grid grid-cols-2 gap-x-2.5 gap-y-3.5">
              <div>
                <span :class="fieldLabel">Start</span>
                <NumberField :model-value="tween.delay" label="Start" :min="0" :max="MOTION_WINDOW - MIN_DURATION" :step="0.1" unit="s" @commit="patch({ delay: $event })" />
              </div>
              <div>
                <span :class="fieldLabel">Duration</span>
                <NumberField :model-value="tween.duration" label="Duration" :min="0" :step="0.1" unit="s" @commit="patch({ duration: $event })" />
              </div>
              <div class="col-span-2">
                <span :class="fieldLabel">Ease</span>
                <div :class="field">
                  <select aria-label="Ease" :class="select" :value="tween.ease" @change="patch({ ease: ($event.target as HTMLSelectElement).value })">
                    <option v-for="ease in EASES" :key="ease.id" :value="ease.id">{{ ease.label }}</option>
                  </select>
                  <ChevronDown class="size-3 shrink-0 text-[#a0aeb5]" aria-hidden="true" />
                </div>
              </div>
            </div>

            <button
              type="button"
              class="mt-3.5 flex w-full items-center justify-between text-[10px] font-medium text-[#d0d7dc] hover:text-white"
              :aria-expanded="customOpen"
              aria-controls="motion-custom"
              @click="customOpen = !customOpen"
            >
              Custom values
              <ChevronDown class="size-3 text-[#a0aeb5] transition-transform" :class="customOpen && 'rotate-180'" aria-hidden="true" />
            </button>
            <div v-show="customOpen" id="motion-custom" class="mt-3 grid grid-cols-2 gap-x-2.5 gap-y-3">
              <div v-for="f in FROM_FIELDS" :key="f.key">
                <span :class="fieldLabel">From {{ f.label }}</span>
                <NumberField
                  :model-value="tween.from_values[f.key] ?? f.neutral"
                  :label="`From ${f.key}`"
                  :min="f.min"
                  :max="f.max"
                  :step="f.step"
                  :unit="f.unit"
                  @commit="setFrom(f.key, f.neutral, $event)"
                />
              </div>
            </div>
          </template>
        </div>
      </template>

      <div :class="[section, animation.status === 'missing' && 'border-t-0']">
        <h3 :class="sectionLabel">Whole-slide sequence</h3>
        <div :class="field">
          <select id="motion-preset" aria-label="Sequence preset" :class="select" value="" @change="onPreset">
            <option value="" disabled>Apply a preset…</option>
            <option value="cinematic">Cinematic reveal</option>
            <option value="cascade">Staggered cascade</option>
            <option value="subtle">Soft &amp; subtle</option>
            <option value="clear">Remove all effects</option>
          </select>
          <ChevronDown class="size-3 shrink-0 text-[#a0aeb5]" aria-hidden="true" />
        </div>
      </div>

      <div class="mt-auto flex flex-col gap-2 pt-5">
        <Button v-if="animation.status !== 'missing'" variant="secondary" size="sm" :disabled="busy || planning || deckRunning" @click="regenerate">
          <Sparkles class="size-3.5" aria-hidden="true" />Regenerate
        </Button>
        <Button variant="outline" size="sm" :disabled="busy || planning || deckRunning" @click="runGenerateAll">Generate for all slides</Button>
        <Button v-if="animation.status !== 'missing'" variant="ghost" size="sm" :disabled="busy || planning || deckRunning" @click="clear()">Clear plan</Button>
      </div>
    </template>

    <Dialog v-model:open="confirmOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Replace your edits?</DialogTitle>
          <DialogDescription>You've edited this slide's motion by hand. Regenerating replaces it with a new AI plan.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" @click="confirmOpen = false">Cancel</Button>
          <Button @click="confirmRegenerate">Replace</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>

<style scoped>
/* Effect glyphs, from the Aera mockup (motion.css). */
.effect-glyph { position: relative; display: grid; width: 20px; height: 16px; place-items: center; }
.effect-glyph i { width: 11px; height: 11px; border-radius: 2px; background: #bee3f3; }
.effect-none i { border: 1px dashed #9db0ba; background: none; }
.effect-fade i { opacity: 0.55; }
.effect-rise i { border-bottom: 3px solid #5f7f90; translate: 0 -2px; }
.effect-slide i { border-left: 3px solid #5f7f90; translate: 3px 0; }
.effect-zoom i { border: 2px solid #7896a5; scale: 1.25; }
.effect-turn i { rotate: -22deg; }
.effect-blur i { filter: blur(1.5px); }
</style>
