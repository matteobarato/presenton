<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Italic, Palette, Type, Underline } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import { resolvePresentationTheme } from '@/render/legacy/lib/template-theme'
import { localFontOptionsFromUnknown } from '@/render/legacy/components/slide-editor/text/local-fonts'
import { rawFont } from '@/render/legacy/components/slide-editor/text/template-v2-text'
import { asRecord, getElementAtSelection, readArray, updateElementInUi, withHash, type ElementSelection, type RawElement } from '@/slide-editor/model'
import { useEditingActions } from '@/slide-editor/useEditingActions'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'

const props = defineProps<{ presentation: Presentation }>()

const LINE_HEIGHTS = [1, 1.15, 1.5, 2]
const ALIGNS = [
  { value: 'left', label: 'Align left', icon: AlignLeft },
  { value: 'center', label: 'Align center', icon: AlignCenter },
  { value: 'right', label: 'Align right', icon: AlignRight },
  { value: 'justify', label: 'Justify', icon: AlignJustify },
] as const
type Align = (typeof ALIGNS)[number]['value']
const MARKS = [
  { mark: 'bold', label: 'Bold', title: 'Bold (Ctrl+B)', icon: Bold },
  { mark: 'italic', label: 'Italic', title: 'Italic (Ctrl+I)', icon: Italic },
  { mark: 'underline', label: 'Underline', title: 'Underline (Ctrl+U)', icon: Underline },
] as const

const ctx = useSlideEditingContext()
const actions = useEditingActions(ctx)

/** The text element edited: the selected element, or the lone text element of a selected component. */
const target = computed<ElementSelection | null>(() => {
  const sel = ctx.selection.value
  if (!sel || sel.kind === 'multi-component') return null
  return sel.kind === 'element' ? sel : { kind: 'element', componentIndex: sel.componentIndex, elementPath: [0] }
})
const element = computed<RawElement | null>(() => {
  const ui = ctx.ui.value
  return ui && target.value ? getElementAtSelection(ui, target.value) : null
})

// The Tiptap editor's state is not reactive; bump a counter on every transaction.
const tick = ref(0)
const editor = computed(() => ctx.inlineEditor?.value ?? null)
let detach: (() => void) | null = null
watch(
  editor,
  (instance) => {
    detach?.()
    detach = null
    if (!instance) return
    const bump = () => (tick.value += 1)
    instance.on('transaction', bump)
    detach = () => instance.off('transaction', bump)
  },
  { immediate: true },
)
onBeforeUnmount(() => detach?.())

const font = computed(() => (element.value ? rawFont(element.value) : null))
const textStyleAttrs = computed(() => {
  void tick.value
  return (editor.value?.getAttributes('textStyle') ?? {}) as Record<string, unknown>
})
const alignment = computed<Align>(() => {
  void tick.value
  const value = editor.value?.getAttributes('paragraph').textAlign ?? asRecord(element.value?.alignment)?.horizontal
  return value === 'center' || value === 'right' || value === 'justify' ? value : 'left'
})
const family = computed(() => (textStyleAttrs.value.fontFamily as string | undefined) ?? font.value?.family ?? '')
const size = computed(() => (textStyleAttrs.value.fontSize as number | undefined) ?? font.value?.size ?? 18)
const color = computed(() => {
  const c = withHash((textStyleAttrs.value.color as string | undefined) ?? font.value?.color ?? '')
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : '#111827'
})
const lineHeight = computed(() => (textStyleAttrs.value.lineHeight as number | undefined) ?? font.value?.lineHeight ?? 1.15)
function isOn(mark: 'bold' | 'italic' | 'underline') {
  void tick.value
  return editor.value ? editor.value.isActive(mark) : !!font.value?.[mark]
}

const theme = computed(() => resolvePresentationTheme(props.presentation))
const families = computed(() => {
  const list = new Set<string>()
  if (family.value) list.add(family.value)
  for (const option of localFontOptionsFromUnknown((props.presentation as { fonts?: unknown }).fonts)) list.add(option.family)
  const themeFont = theme.value.fonts?.textFont?.name
  if (themeFont) list.add(themeFont)
  return [...list]
})
const palette = computed(() => {
  const t = theme.value as unknown as Record<string, string>
  const keys = ['primary', 'background', 'card', 'stroke', 'primary_text', 'background_text', ...Array.from({ length: 10 }, (_, i) => `graph_${i}`)]
  return [...new Set(keys.map((k) => withHash(t[k])?.toLowerCase()).filter((c): c is string => !!c))]
})
const lineHeights = computed(() => (LINE_HEIGHTS.includes(lineHeight.value) ? LINE_HEIGHTS : [lineHeight.value, ...LINE_HEIGHTS]))

type FontPatch = Partial<Record<'family' | 'size' | 'color' | 'bold' | 'italic' | 'underline' | 'line_height', string | number | boolean>>

/** No inline editor: patch the element font and every run, plus the alignment, in one commit. */
function patchElement(fontPatch: FontPatch, horizontal?: Align) {
  const ui = ctx.ui.value
  const sel = target.value
  if (!ui || !sel) return
  const next = updateElementInUi(ui, sel, (el) => {
    const runs = readArray(el.runs)
    return {
      ...el,
      font: { ...(asRecord(el.font) ?? {}), ...fontPatch },
      ...(horizontal ? { alignment: { ...(asRecord(el.alignment) ?? {}), horizontal } } : {}),
      ...(runs.length > 0
        ? { runs: runs.map((run) => ({ ...(asRecord(run) ?? {}), font: { ...(asRecord(asRecord(run)?.font) ?? {}), ...fontPatch } })) }
        : {}),
    }
  })
  void actions.run('Text style', { ui: next, selection: ctx.selection.value } as never)
}

function setFamily(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (!value) return
  if (editor.value) editor.value.chain().focus().setMark('textStyle', { fontFamily: value }).run()
  else patchElement({ family: value })
}
function commitSize(event: Event) {
  const n = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(n) || n <= 0) return
  const fontSize = Math.min(200, Math.max(8, Math.round(n)))
  if (editor.value) editor.value.chain().focus().setMark('textStyle', { fontSize }).run()
  else patchElement({ size: fontSize })
}
function toggle(mark: 'bold' | 'italic' | 'underline') {
  const e = editor.value
  if (!e) return patchElement({ [mark]: !font.value?.[mark] })
  const chain = e.chain().focus()
  if (mark === 'bold') chain.toggleBold().run()
  else if (mark === 'italic') chain.toggleItalic().run()
  else chain.toggleUnderline().run()
}
function setColor(value: string) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return
  if (editor.value) editor.value.chain().focus().setColor(value).run()
  else patchElement({ color: value })
}
function setAlign(value: Align) {
  if (editor.value) editor.value.chain().focus().setTextAlign(value).run()
  else patchElement({}, value)
}
function setLineHeight(event: Event) {
  const n = Number((event.target as HTMLSelectElement).value)
  if (!Number.isFinite(n)) return
  if (editor.value) editor.value.chain().focus().setMark('textStyle', { lineHeight: n }).run()
  else patchElement({ line_height: n })
}

const section = 'border-t border-line py-[18px] min-[1600px]:py-[22px]'
const label = 'mb-3 flex items-center justify-between text-[10px] font-medium text-[#d0d7dc] min-[1600px]:text-[11px]'
const muted = 'truncate pl-2 text-[9px] font-normal text-[#9aa9b0]'
const field =
  'flex h-[34px] min-w-0 items-center gap-2.5 rounded-control border border-white/[0.06] bg-field px-2.5 text-[10px] text-[#dce3e7] focus-within:border-accent/60'
const segment =
  'grid h-9 flex-1 place-items-center rounded-control border border-white/[0.05] bg-field text-[#909fa7] hover:bg-[#303a3f] hover:text-[#d9e6ed]'
const segmentOn = '!border-accent/50 !bg-[#303c42] !text-[#c4e4f4]'

defineExpose({ families })
</script>

<template>
  <template v-if="element">
    <div :class="section">
      <div :class="label">
        <h3>Typography</h3>
        <span :class="muted">{{ family }}</span>
      </div>
      <label :class="field">
        <Type class="size-3.5 shrink-0 text-[#a0aeb5]" aria-hidden="true" />
        <select
          aria-label="Font family"
          class="h-full w-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-[10px] text-[#dce3e7] outline-none"
          :value="family"
          @change="setFamily"
        >
          <option v-for="f in families" :key="f" :value="f" class="bg-field">{{ f }}</option>
        </select>
      </label>
      <div class="mt-2 flex gap-2">
        <label :class="[field, 'w-[68px] flex-none']">
          <input
            type="number"
            min="8"
            max="200"
            aria-label="Font size"
            class="h-full w-full min-w-0 bg-transparent text-[10px] text-[#dce3e7] outline-none"
            :value="size"
            @change="commitSize"
          />
        </label>
        <button
          v-for="m in MARKS"
          :key="m.mark"
          type="button"
          :class="[segment, isOn(m.mark) && segmentOn]"
          :aria-label="m.label"
          :aria-pressed="isOn(m.mark)"
          :title="m.title"
          @mousedown.prevent
          @click="toggle(m.mark)"
        >
          <component :is="m.icon" class="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div :class="section">
      <div :class="label">
        <h3>Color</h3>
        <span class="text-[8px] font-normal tracking-[0.03em] text-[#9caab2]">{{ color }}</span>
      </div>
      <div class="flex flex-wrap items-center gap-2.5">
        <button
          v-for="c in palette"
          :key="c"
          type="button"
          class="size-6 rounded-full border-0 outline outline-1 outline-offset-[3px] transition-transform hover:-translate-y-0.5"
          :class="c === color ? 'outline-[#a9c2ce]' : 'outline-transparent'"
          :style="{ background: c }"
          :aria-label="`Colour ${c}`"
          :aria-pressed="c === color"
          @mousedown.prevent
          @click="setColor(c)"
        />
        <label
          class="relative ml-auto grid size-6 cursor-pointer place-items-center overflow-hidden rounded-full border border-white/[0.07] bg-[#30373b] text-[#9daab2] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
          title="Custom colour"
        >
          <Palette class="size-3" aria-hidden="true" />
          <input
            type="color"
            aria-label="Custom colour"
            class="absolute inset-0 size-full cursor-pointer opacity-0"
            :value="color"
            @change="setColor(($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
    </div>

    <div :class="section">
      <div :class="label"><h3>Alignment</h3></div>
      <div class="flex gap-2">
        <button
          v-for="a in ALIGNS"
          :key="a.value"
          type="button"
          :class="[segment, alignment === a.value && segmentOn]"
          :aria-label="a.label"
          :aria-pressed="alignment === a.value"
          :title="a.label"
          @mousedown.prevent
          @click="setAlign(a.value)"
        >
          <component :is="a.icon" class="size-4" aria-hidden="true" />
        </button>
      </div>
      <div :class="[label, 'mt-4']">
        <h3>Line height</h3>
        <span :class="muted">{{ lineHeight }}</span>
      </div>
      <label :class="field">
        <select
          aria-label="Line height"
          class="h-full w-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-[10px] text-[#dce3e7] outline-none"
          :value="String(lineHeight)"
          @change="setLineHeight"
        >
          <option v-for="h in lineHeights" :key="h" :value="String(h)" class="bg-field">{{ h }}</option>
        </select>
      </label>
    </div>
  </template>
</template>
