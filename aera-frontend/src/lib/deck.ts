import { validMotion, type MotionSequence } from './motion'
export type SlideKind = 'cover' | 'statement' | 'pillars' | 'image' | 'quote' | 'closing'
export type ThemeName = 'glacier' | 'nocturne' | 'sage' | 'terra'
export interface Slide {
 motion?: MotionSequence; id: string; title: string; subtitle: string; kind: SlideKind; image: string; notes: string; theme: ThemeName; layout: 'split' | 'center' | 'full'; font: string; scale: number; accent: string
}
export interface Deck { title: string; slides: Slide[]; linkedProvider?: 'powerpoint' | 'slides' }
export const MAX_SLIDES = 80
export const themes: {id: ThemeName; name: string; background: string; foreground: string; accent: string; image: string}[] = [
 { id: 'glacier', name: 'Glacier', background: '#f0f2ee', foreground: '#203332', accent: '#b9dfe9', image: '/images/alpine.jpg' },
 { id: 'nocturne', name: 'Nocturne', background: '#242a35', foreground: '#f0efe8', accent: '#c8c7eb', image: '/images/night.jpg' },
 { id: 'sage', name: 'Sage', background: '#dbe3d8', foreground: '#243a2c', accent: '#9ab399', image: '/images/forest.jpg' },
 { id: 'terra', name: 'Terra', background: '#e9ddd1', foreground: '#482e24', accent: '#cb987e', image: '/images/alpine.jpg' },
]
const base = { theme: 'glacier' as ThemeName, layout: 'split' as const, font: 'DM Sans', scale: 100, accent: '#b9dfe9' }
export const makeSlide = (title = 'A fresh perspective', kind: SlideKind = 'statement'): Slide => ({...base, id: crypto.randomUUID(), title, subtitle: 'Your next great idea starts here.', kind, image: '/images/alpine.jpg', notes: ''})
export const initialDeck = (): Deck => ({ title: 'A new perspective', slides: [
 {...base, id: 'slide-1', kind: 'cover', title: 'Ideas beyond\nthe ordinary.', subtitle: 'A new perspective on what comes next.', image: '/images/alpine.jpg', notes: 'Start with a pause. Invite the audience to imagine what becomes possible when we look at familiar things from a different angle.'},
 {...base, id: 'slide-2', kind: 'statement', title: 'Great things begin\nwith a different view.', subtitle: 'The most meaningful change starts with a simple question: what if?', image: '/images/alpine.jpg', notes: 'Set the scene: this is about questioning the expected and creating space for something new.'},
 {...base, id: 'slide-3', kind: 'pillars', title: 'Less expected.\nMore extraordinary.', subtitle: 'Three principles to move us forward.', image: '/images/forest.jpg', notes: 'Walk through the three principles: curiosity, clarity, and courage. Give an example of each in practice.'},
 {...base, id: 'slide-4', kind: 'image', title: 'Make room\nfor possibility.', subtitle: 'Step outside the familiar. See what happens.', image: '/images/night.jpg', notes: 'Let the image breathe. This is the moment to tell a story about taking the first step.'},
 {...base, id: 'slide-5', kind: 'quote', title: 'The best way forward\nis a new perspective.', subtitle: 'A simple thought. An entirely different horizon.', image: '/images/forest.jpg', notes: 'Bring the story back to the central idea: new perspectives reveal new possibilities.'},
 {...base, id: 'slide-6', kind: 'closing', title: 'Let’s make\nsomething matter.', subtitle: 'The next chapter starts with us.', image: '/images/alpine.jpg', notes: 'Close with a concrete invitation. What is one thing we can see differently today?'}
] })
export function validateDeck(value: unknown): value is Deck {
 if (!value || typeof value !== 'object') return false
 const d = value as Deck
 return typeof d.title === 'string' && Array.isArray(d.slides) && d.slides.length > 0 && d.slides.length <= MAX_SLIDES && d.slides.every(s => s && (s.motion === undefined || validMotion(s.motion)) && typeof s.id === 'string' && typeof s.title === 'string' && typeof s.subtitle === 'string' && typeof s.notes === 'string' && typeof s.image === 'string' && ['/images/alpine.jpg','/images/night.jpg','/images/forest.jpg'].includes(s.image) && ['cover','statement','pillars','image','quote','closing'].includes(s.kind) && themes.some(t => t.id === s.theme) && ['split','center','full'].includes(s.layout) && ['DM Sans','Manrope','Georgia'].includes(s.font) && typeof s.scale === 'number' && s.scale >= 70 && s.scale <= 120 && /^#[0-9a-f]{6}$/i.test(s.accent))
}
