<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search, ArrowDownToLine, ArrowUpFromLine, Clapperboard } from 'lucide-vue-next'
import { effects, targets, sequencePreset, constrainCue, type MotionSequence, type Target, type Phase, type Effect } from '@/lib/motion'
const props = defineProps<{ sequence?: MotionSequence; timelineOpen: boolean }>()
const emit = defineEmits<{ change: [sequence: MotionSequence]; timeline: [] }>()
const selected = defineModel<Target>('target', {required:true})
const phase = defineModel<Phase>('phase', {required:true})
const query = ref('')
const search = ref<HTMLInputElement>()
const sequence = computed(()=>props.sequence || sequencePreset())
const selectedTrack = computed(()=>sequence.value.tracks.find(t=>t.target===selected.value)!)
const cue = computed(()=>selectedTrack.value[phase.value])
const filtered = computed(()=>effects.filter(e=>`${e.name} ${e.detail}`.toLowerCase().includes(query.value.toLowerCase())))
function update(patch: Parameters<typeof constrainCue>[2]) {
 const copy=JSON.parse(JSON.stringify(sequence.value)) as MotionSequence
 const track=copy.tracks.find(t=>t.target===selected.value)!
 track[phase.value]=constrainCue(track,phase.value,patch)
 emit('change',copy)
}
function setEffect(effect:Effect) {update({effect})}
function preset(name:string) {emit('change',sequencePreset(name));query.value=''}
function focusSearch() {search.value?.focus({preventScroll:true})}
defineExpose({focusSearch})
</script>
<template>
 <section class="motion-inspector" aria-label="Element motion settings">
  <div class="inspector-intro"><h2>Motion, with intent.</h2><p>Shape how each element arrives and leaves.</p></div>
  <label class="motion-element-label" for="motion-element">Selected element</label>
  <select id="motion-element" class="motion-element-select" v-model="selected"><option v-for="target in targets" :key="target.id" :value="target.id">{{target.name}}</option></select>
   <div class="motion-palette">
    <label class="motion-search"><Search :size="13"/><input ref="search" v-model="query" placeholder="Find an effect…" aria-label="Search motion effects" @keydown.enter.prevent="filtered[0] && setEffect(filtered[0].id)"/><kbd>⌘ K</kbd></label>
    <div class="motion-phases" role="group" aria-label="Animation phase"><button :aria-pressed="phase==='enter'" @click="phase='enter'"><ArrowDownToLine :size="12"/>Entrance</button><button :aria-pressed="phase==='exit'" @click="phase='exit'"><ArrowUpFromLine :size="12"/>Exit</button></div>
    <div class="motion-effects"><button v-for="effect in filtered" :key="effect.id" :aria-pressed="cue.effect===effect.id" :title="effect.detail" @click="setEffect(effect.id)"><span class="effect-glyph" :class="`effect-${effect.id}`"><i></i></span>{{effect.name}}</button><p v-if="!filtered.length">No effects found.</p></div>
   </div>
    <div class="motion-properties"><span class="motion-selection">{{targets.find(t=>t.id===selected)?.name}} <b>{{phase==='enter'?'Entrance':'Exit'}}</b></span><label><span>Start</span><div class="motion-number-field"><input type="number" min="0" max="7.9" step="0.1" :value="cue.start.toFixed(1)" @change="update({start:Number(($event.target as HTMLInputElement).value)})"/><span>s</span></div></label><label><span>Duration</span><div class="motion-number-field"><input type="number" min="0.1" max="3" step="0.1" :value="cue.duration.toFixed(1)" @change="update({duration:Number(($event.target as HTMLInputElement).value)})"/><span>s</span></div></label><label>Ease <select :value="selectedTrack.easing" @change="emit('change',{tracks:sequence.tracks.map(t=>t.target===selected?{...t,easing:($event.target as HTMLSelectElement).value as 'smooth'|'linear'|'snappy'}:t)})"><option value="smooth">Smooth</option><option value="linear">Linear</option><option value="snappy">Snappy</option></select></label></div>
<div class="motion-preset-section"><h3>Whole-slide sequence</h3>    <div class="motion-presets"><label for="motion-preset">Sequence</label><select id="motion-preset" value="" @change="preset(($event.target as HTMLSelectElement).value);($event.target as HTMLSelectElement).value=''"><option value="" disabled>Apply a preset…</option><option value="cinematic">Cinematic reveal</option><option value="cascade">Staggered cascade</option><option value="subtle">Soft & subtle</option><option value="clear">Remove all effects</option></select></div>
</div>
  <button class="motion-inspector-timeline" :aria-expanded="timelineOpen" aria-controls="motion-studio" @click="emit('timeline')"><Clapperboard :size="15"/>{{timelineOpen?'Hide timeline':'Show timeline'}}</button>
  <p class="motion-inspector-note">Choose a track below the slide to edit its motion here. Changes are saved in this browser.</p>
 </section>
</template>
