<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { ArrowUpRight, Asterisk } from 'lucide-vue-next'
import { elementMotion, sequencePreset, type Target } from '@/lib/motion'
import { themes, type Slide } from '@/lib/deck'
const props = withDefaults(defineProps<{ slide: Slide; index: number; total: number; editable?: boolean; compact?: boolean; motionTime?: number | null; motionTarget?: Target | null; motionEnabled?: boolean }>(), { editable: false, compact: false, motionTime: null, motionTarget: null, motionEnabled: true })
const emit = defineEmits<{ edit: [key: 'title' | 'subtitle', value: string] }>()
const reduced = ref(false)
let preference: MediaQueryList | undefined
function updatePreference() { reduced.value=Boolean(preference?.matches) }
onMounted(()=>{preference=window.matchMedia('(prefers-reduced-motion: reduce)');updatePreference();preference.addEventListener('change',updatePreference)})
onUnmounted(()=>preference?.removeEventListener('change',updatePreference))
function animationStyle(target: Target) {
 const style = elementMotion((props.slide.motion || sequencePreset()).tracks.find(t=>t.target===target), props.motionEnabled ? props.motionTime : null, reduced.value)
 if (props.motionTarget===target && props.motionTime===null) {style.outline='1px dashed #648d9e';style.outlineOffset='5px'}
 return style
}
const theme = computed(() => themes.find(t => t.id === props.slide.theme) || themes[0])
const accentInk = computed(() => {
 const channels = props.slide.accent.slice(1).match(/.{2}/g)!.map(c => parseInt(c, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
 const luminance = .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2]
 return luminance > .179 ? '#111719' : '#ffffff'
})
const style = computed(() => ({ '--slide-bg': theme.value.background, '--slide-ink': theme.value.foreground, '--slide-accent': props.slide.accent, '--accent-ink': accentInk.value, '--text-scale': props.slide.scale / 100, 'font-family': `'${props.slide.font}', sans-serif` }))
function edit(event: FocusEvent, key: 'title' | 'subtitle') { const value = (event.target as HTMLElement).innerText.trim(); if (value) emit('edit', key, value); else (event.target as HTMLElement).innerText = props.slide[key] }
</script>
<template>
 <article class="slide-art" :class="[`kind-${slide.kind}`, `layout-${slide.layout}`, { 'is-compact': compact }]" :style="style">
  <div class="slide-paper">
   <div class="slide-brand" :style="animationStyle('brand')"><Asterisk /><span>northstar</span></div>
   <div v-if="slide.kind === 'cover' || slide.kind === 'quote'" class="slide-photo" :style="animationStyle('visual')"><img :src="slide.image" alt="A dramatic mountain landscape" draggable="false" /><div class="photo-shade"></div><div v-if="slide.kind === 'cover'" class="image-label"><span>A DIFFERENT VIEW.</span><ArrowUpRight /></div></div>
   <div v-if="slide.kind === 'image' || slide.layout === 'full'" class="full-photo" :style="animationStyle('visual')"><img :src="slide.image" alt="An open landscape beneath a vast sky" draggable="false" /></div>
   <div class="slide-copy">
    <div v-if="slide.kind === 'quote'" class="quote-mark">“</div>
    <h2 :style="animationStyle('title')" :contenteditable="editable" :tabindex="editable ? 0 : undefined" :aria-label="editable ? 'Slide title, click to edit' : undefined" spellcheck="false" @blur="edit($event, 'title')" @keydown.stop>{{ slide.title }}</h2>
    <p :style="animationStyle('subtitle')" :contenteditable="editable" :tabindex="editable ? 0 : undefined" :aria-label="editable ? 'Slide subtitle, click to edit' : undefined" spellcheck="false" @blur="edit($event, 'subtitle')" @keydown.stop>{{ slide.subtitle }}</p>
    <div v-if="slide.kind === 'cover'" class="cover-line"><span></span><span>BRAND VISION · 2026</span></div>
    <div v-if="slide.kind === 'pillars'" class="pillars" :style="animationStyle('visual')"><div><span>01</span><h3>Stay curious.</h3><p>Ask better questions.<br />Find unexpected answers.</p></div><div><span>02</span><h3>Seek clarity.</h3><p>Make the complex simple.<br />Keep what matters.</p></div><div><span>03</span><h3>Be brave.</h3><p>Explore beyond the edge.<br />Create something new.</p></div></div>
    <div v-if="slide.kind === 'closing'" class="closing-arrow" :style="animationStyle('visual')"><ArrowUpRight /></div>
   </div>
   <div class="slide-bottom"><span>{{ slide.kind === 'closing' ? 'THANK YOU.' : 'A NEW PERSPECTIVE' }}</span><span>{{ String(index + 1).padStart(2, '0') }} <i>/</i> {{ String(total).padStart(2, '0') }}</span></div>
   <div v-if="slide.kind === 'statement'" class="statement-orbit" :style="animationStyle('visual')" aria-hidden="true"><div></div><div></div><div></div></div>
  </div>
 </article>
</template>
