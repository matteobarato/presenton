export const effects = [
 { id: 'none', name: 'None', detail: 'Keep visible' },
 { id: 'fade', name: 'Dissolve', detail: 'Soft opacity' },
 { id: 'rise', name: 'Rise', detail: 'Vertical reveal' },
 { id: 'slide', name: 'Drift', detail: 'Horizontal travel' },
 { id: 'zoom', name: 'Scale', detail: 'Depth & focus' },
 { id: 'wipe', name: 'Wipe', detail: 'Clipped reveal' },
 { id: 'rotate', name: 'Turn', detail: 'A gentle rotation' },
] as const
export type Effect = typeof effects[number]['id']
export type Target = 'title' | 'subtitle' | 'visual' | 'brand'
export type Phase = 'enter' | 'exit'
export interface Cue { effect: Effect; start: number; duration: number }
export interface MotionTrack { target: Target; enter: Cue; exit: Cue; easing: 'smooth' | 'linear' | 'snappy' }
export interface MotionSequence { tracks: MotionTrack[] }
export const TIMELINE_LENGTH = 8
export const targets: { id: Target; name: string }[] = [{id:'title',name:'Headline'}, {id:'subtitle',name:'Supporting text'}, {id:'visual',name:'Visual elements'}, {id:'brand',name:'Brand mark'}]
export function sequencePreset(name = 'cinematic'): MotionSequence {
 return { tracks: targets.map((t, i) => ({ target:t.id, easing:'smooth',
  enter: { effect: name === 'clear' ? 'none' : name === 'subtle' ? 'fade' : (['rise','rise','wipe','fade'] as Effect[])[i], start: name === 'cascade' ? i * .45 : i * .15, duration: name === 'subtle' ? .4 : .8 },
  exit: { effect: name === 'clear' ? 'none' : name === 'cascade' ? 'slide' : 'fade', start: 5.5 + (name === 'cascade' ? i * .3 : i * .1), duration: .5 }
 })) }
}
export function validMotion(value: unknown): value is MotionSequence {
 if (!value || typeof value !== 'object') return false
 const tracks = (value as MotionSequence).tracks
 return Array.isArray(tracks) && tracks.length === 4 && new Set(tracks.map(t => t?.target)).size === 4 && tracks.every(t => t && targets.some(x=>x.id===t.target) && ['smooth','linear','snappy'].includes(t.easing) && [t.enter,t.exit].every(c=>c && effects.some(e=>e.id===c.effect) && Number.isFinite(c.start) && c.start>=0 && Number.isFinite(c.duration) && c.duration>=.1 && c.duration<=3 && c.start+c.duration<=TIMELINE_LENGTH+.001) && t.exit.start>=t.enter.start+t.enter.duration)
}
export function constrainCue(track: MotionTrack, phase: Phase, patch: Partial<Cue>): Cue {
 const cue = {...track[phase], ...patch}
 cue.duration = Math.min(3, Math.max(.1, Number.isFinite(cue.duration) ? cue.duration : .6))
 const min = phase === 'exit' ? track.enter.start+track.enter.duration : 0
 const max = phase === 'enter' ? track.exit.start : TIMELINE_LENGTH
 cue.duration = Math.min(cue.duration, max-min)
 cue.start = Math.max(min, Math.min(max-cue.duration, Number.isFinite(cue.start) ? cue.start : min))
 return cue
}
export function elementMotion(track: MotionTrack | undefined, time: number | null, reduced = false): Record<string,string|number> {
 if (!track || time === null) return {}
 const entering = time < track.exit.start
 const cue = entering ? track.enter : track.exit
 if (cue.effect === 'none') return {}
 let p = Math.min(1,Math.max(0,(time-cue.start)/cue.duration))
 p = track.easing === 'linear' ? p : track.easing === 'snappy' ? 1-(1-p)**5 : 1-(1-p)**3
 const hidden = entering ? 1-p : p
 const style: Record<string,string|number> = {opacity:1-hidden}
 if (reduced) return style
 if (cue.effect === 'rise') style.translate = `0 ${hidden*(entering?32:-32)}px`
 if (cue.effect === 'slide') style.translate = `${hidden*(entering?-50:50)}px 0`
 if (cue.effect === 'zoom') style.scale = 1-hidden*.14
 if (cue.effect === 'rotate') {style.rotate=`${hidden*(entering?-8:8)}deg`; style.scale=1-hidden*.08}
 if (cue.effect === 'wipe') {style.clipPath=`inset(0 ${hidden*100}% 0 0)`; style.opacity=1}
 return style
}
