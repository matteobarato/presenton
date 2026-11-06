<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { Clapperboard, Play, Pause, RotateCcw, X } from 'lucide-vue-next'
import { effects, targets, sequencePreset, constrainCue, TIMELINE_LENGTH, type MotionSequence, type Target, type Phase } from '@/lib/motion'
const props = defineProps<{ sequence?: MotionSequence; slideId: string; enabled: boolean }>()
const emit = defineEmits<{ change: [sequence: MotionSequence]; preview: [time: number | null]; inspect: [target: Target, phase: Phase]; close: [] }>()
const sequence = computed(() => props.sequence || sequencePreset())
const selected = defineModel<Target>('target', {required:true})
const phase = defineModel<Phase>('phase', {required:true})
const time = ref(0)
const playing = ref(false)
const looping = ref(false)
const previewing = ref(false)
const drag = ref<{target:Target;phase:Phase;startX:number;width:number;original:number;start:number} | null>(null)
let frame = 0
let lastTime = 0
function choose(target:Target) { selected.value=target }
function inspect(target:Target, cuePhase = phase.value) { choose(target);phase.value=cuePhase;emit('inspect',target,cuePhase) }
function update(patch: Parameters<typeof constrainCue>[2], target = selected.value, cuePhase = phase.value) {
 pause()
 const copy=JSON.parse(JSON.stringify(sequence.value)) as MotionSequence
 const track=copy.tracks.find(t=>t.target===target)!
 track[cuePhase]=constrainCue(track,cuePhase,patch)
 emit('change',copy)
}
function pause() {playing.value=false; cancelAnimationFrame(frame)}
function scrub(value:number) {pause();time.value=value;previewing.value=true;emit('preview',value)}
function stop() {pause(); time.value=0;previewing.value=false;emit('preview',null)}
function tick(now:number) {
 if (!playing.value) return
 time.value=Math.min(TIMELINE_LENGTH,time.value+(now-lastTime)/1000);lastTime=now
 emit('preview',time.value)
 if(time.value>=TIMELINE_LENGTH) {if(looping.value) time.value=0;else {pause();return}}
 frame=requestAnimationFrame(tick)
}
function play() {
 if(playing.value) {pause();return}
 if(time.value>=TIMELINE_LENGTH) time.value=0
 previewing.value=true;playing.value=true;lastTime=performance.now();emit('preview',time.value);frame=requestAnimationFrame(tick)
}
function beginDrag(event:PointerEvent,target:Target,cuePhase:Phase) {
 if(event.button!==0)return
 pause();choose(target);phase.value=cuePhase
 const el=event.currentTarget as HTMLElement
 el.setPointerCapture(event.pointerId)
 const width=el.parentElement!.getBoundingClientRect().width
 const start=sequence.value.tracks.find(t=>t.target===target)![cuePhase].start
 drag.value={target,phase:cuePhase,startX:event.clientX,width,original:start,start}
}
function moveDrag(event:PointerEvent) {
 if(!drag.value)return
 const d=drag.value
 const track=sequence.value.tracks.find(t=>t.target===d.target)!
 d.start=constrainCue(track,d.phase,{start:Math.round((d.original+(event.clientX-d.startX)/d.width*TIMELINE_LENGTH)*10)/10}).start
}
function endDrag() { if(!drag.value)return; const {start,target,phase:cuePhase}=drag.value; drag.value=null;update({start},target,cuePhase) }
function clipStyle(target:Target,cuePhase:Phase) {
 const clip=sequence.value.tracks.find(t=>t.target===target)![cuePhase]
 const start=drag.value?.target===target && drag.value.phase===cuePhase ? drag.value.start : clip.start
 return {left:`${start/TIMELINE_LENGTH*100}%`,width:`${clip.duration/TIMELINE_LENGTH*100}%`}
}
function shiftClip(event:KeyboardEvent,target:Target,cuePhase:Phase) {
 if(!['ArrowLeft','ArrowRight'].includes(event.key))return
 event.preventDefault();event.stopPropagation();choose(target);phase.value=cuePhase
 update({start:sequence.value.tracks.find(t=>t.target===target)![cuePhase].start+(event.key==='ArrowRight'?.1:-.1)},target,cuePhase)
}
function visibility() {if(document.hidden)pause()}
watch(()=>props.slideId,()=>{stop();choose('title')})
watch(()=>props.enabled,stop)
onMounted(()=>{document.addEventListener('visibilitychange',visibility)})
onUnmounted(()=>{pause();emit('preview',null);document.removeEventListener('visibilitychange',visibility)})
defineExpose({stop})
</script>
<template>
 <section id="motion-studio" class="motion-studio" aria-label="Animation timeline">
  <header class="motion-header"><div class="motion-title"><Clapperboard :size="16"/><strong>Timeline</strong><span>Local preview</span></div><div class="motion-transport"><button class="motion-play" :aria-label="playing?'Pause animation':'Play animation'" :disabled="!enabled" @click="play"><Pause v-if="playing" :size="13"/><Play v-else :size="13"/>{{playing?'Pause':'Play'}}</button><button class="icon-button" aria-label="Stop and restore slide" title="Stop and restore slide" @click="stop"><RotateCcw :size="14"/></button><output class="motion-time">{{time.toFixed(1)}} <span>/ 8.0 s</span></output><label class="motion-loop"><input type="checkbox" v-model="looping"/> Loop</label><button class="icon-button" aria-label="Close motion studio" @click="emit('close')"><X :size="16"/></button></div></header>
  <div class="motion-body">
   <div class="motion-timeline">
    <div class="motion-ruler"><span>ELEMENT</span><div><span v-for="tick in 9" :key="tick" :style="{left:`${(tick-1)/8*100}%`}">{{tick-1}}s</span></div></div>
    <div class="motion-tracks">
     <div v-for="target in targets" :key="target.id" class="motion-track" :class="{'is-selected':selected===target.id}"><button class="motion-track-name" :aria-pressed="selected===target.id" @click="inspect(target.id)"><span></span>{{target.name}}</button><div class="motion-lane">
      <template v-for="cuePhase in (['enter','exit'] as const)" :key="cuePhase"><button v-if="sequence.tracks.find(t=>t.target===target.id)![cuePhase].effect!=='none'" class="motion-clip" :class="[cuePhase,{'is-active':selected===target.id && phase===cuePhase}]" :style="clipStyle(target.id,cuePhase)" :aria-label="`${target.name} ${cuePhase} animation. Drag or use arrow keys to change start time.`" :title="`${cuePhase==='enter'?'Entrance':'Exit'} · ${sequence.tracks.find(t=>t.target===target.id)![cuePhase].start.toFixed(1)}s`" @click="inspect(target.id,cuePhase)" @pointerdown="beginDrag($event,target.id,cuePhase)" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="drag=null" @keydown="shiftClip($event,target.id,cuePhase)"><span>{{effects.find(e=>e.id===sequence.tracks.find(t=>t.target===target.id)![cuePhase].effect)?.name}}</span></button></template>
      <span v-if="previewing" class="motion-playhead" :style="{left:`${time/8*100}%`}"></span>
     </div></div>
    </div>
    <div class="motion-scrubber"><span>Scrub preview</span><input type="range" min="0" max="8" step="0.01" :value="time" :disabled="!enabled" aria-label="Animation playhead in seconds" @input="scrub(Number(($event.target as HTMLInputElement).value))"/></div>
    <p class="motion-help">{{enabled?'Drag clips to sequence. Arrow keys fine-tune by 0.1s. Entrance and exit stay in order.':'Enable motion in Design to play this sequence.'}}</p>
   </div>
  </div>
 </section>
</template>
