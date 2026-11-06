<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { ArrowUpRight, ArrowUp, ArrowRight, Asterisk, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, CloudUpload as CloudCheck, Copy, Download, FolderOpen, GripVertical, Image as ImageIcon, LayoutGrid, LayoutPanelLeft, LayoutTemplate, PanelRight, Layers, Maximize2, MessageSquare, Minus, MoreHorizontal, MousePointer2, Palette, Play, Plus, Redo2, Search, Settings2, Share2, Sparkles, Trash2, Type, Undo2, Upload, Users, WandSparkles, X, AlignCenter, RectangleHorizontal, CheckCheck, SlidersHorizontal, Clapperboard, UserRound } from 'lucide-vue-next'
import { TabsRoot, TabsList, TabsTrigger, TabsContent, SwitchRoot, SwitchThumb, DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent, DropdownMenuRoot, DropdownMenuTrigger, DropdownMenuPortal, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from 'reka-ui'
import { Button } from '@/components/ui/button'
import Slider from '@/components/ui/slider/Slider.vue'
import Dialog from '@/components/ui/dialog/Dialog.vue'
import SlideCanvas from '@/components/SlideCanvas.vue'
import MotionStudio from '@/components/MotionStudio.vue'
import MotionInspector from '@/components/MotionInspector.vue'
import { type Target, type Phase, type MotionSequence } from '@/lib/motion'
import AiProgress from '@/components/AiProgress.vue'
import WorkspaceSettings from '@/components/WorkspaceSettings.vue'
import { copyDeck, presentationProviders, readWorkspaceSettings, settingsKey, type ProviderId } from '@/lib/workspace-settings'
import { initialDeck, themes, makeSlide, validateDeck, MAX_SLIDES, type Deck, type Slide, type ThemeName } from '@/lib/deck'

const STORAGE_KEY = 'aera-studio-deck-v1'
const deck = ref<Deck>(initialDeck())
const activeIndex = ref(0)
const current = computed(() => deck.value.slides[activeIndex.value] || deck.value.slides[0])
const panelTab = ref('design')
const section = ref('editor')
const inAccount = computed(() => section.value === 'profile' || section.value === 'settings')
const accountMenuOpen = ref(false)
const profileKey = 'aera-profile-name'
function readProfileName() {
 try { return localStorage.getItem(profileKey)?.trim().slice(0, 60) || 'Jamie' }
 catch { return 'Jamie' }
}
const profileName = ref(readProfileName())
const profileDraft = ref(profileName.value)
const profileInitial = computed(() => Array.from(profileName.value)[0]?.toLocaleUpperCase() || 'J')
const settingsTab = ref('connections')
const workspaceSettings = ref(readWorkspaceSettings())
const linkedProvider = computed(() => {
 const id = deck.value.linkedProvider
 return id && Object.hasOwn(presentationProviders, id) ? id : null
})
const slidesExpanded = ref(true)
const inspectorExpanded = ref(true)
const mobileSlides = ref(false)
const mobileInspector = ref(false)
const activeTool = ref('select')
const zoom = ref(100)
const motion = ref(true)
const motionOpen = ref(false)
const motionTime = ref<number | null>(null)
const motionTarget = ref<Target>('title')
const motionPhase = ref<Phase>('enter')
const motionInspector = ref<InstanceType<typeof MotionInspector>>()
const motionStudio = ref<InstanceType<typeof MotionStudio>>()
function closeMotion() { motionOpen.value=false;motionTime.value=null;nextTick(()=>{const toggle=document.querySelector<HTMLButtonElement>('.motion-inspector-timeline');const target=toggle?.getClientRects().length ? toggle : document.querySelector<HTMLButtonElement>('[aria-controls="inspector-sidebar"]');target?.focus()}) }
function inspectMotion(target = motionTarget.value, phase = motionPhase.value) {
 motionTarget.value=target;motionPhase.value=phase;panelTab.value='motion'
 if(viewportWidth.value<=1050) mobileInspector.value=true
 else inspectorExpanded.value=true
}
async function openMotionPalette() {motionOpen.value=true;inspectMotion();await nextTick();motionInspector.value?.focusSearch()}
function applyMotion(sequence: MotionSequence) {motionStudio.value?.stop();patchSlide({motion:sequence})}

const notesOpen = ref(false)
const showCollaboration = ref(true)
const demoCollaborators = [
 { name: 'Mina Park', shortName: 'Mina', initials: 'MP', color: '#bbaaff', x: '77%', y: '26%' },
 { name: 'Eli Santos', shortName: 'Eli', initials: 'ES', color: '#9de5bd', x: '86%', y: '71%' },
]
const saved = ref(true)
const storageAvailable = ref(true)
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout>
let saveTimer: ReturnType<typeof setTimeout>
let aiTimer: ReturnType<typeof setTimeout>
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)
const presenting = ref(false)
const presentMenuOpen = ref(false)
const presentIndex = ref(0)
const shareOpen = ref(false)
const assetsOpen = ref(false)
const helpOpen = ref(false)
const newOpen = ref(false)
const newTopic = ref('')
const newError = ref('')
const aiJob = ref<{ kind: 'slide' | 'deck'; startedAt: number; duration: number } | null>(null)
const creating = computed(() => aiJob.value?.kind === 'deck')
const prompt = ref('')
const aiBusy = computed(() => aiJob.value?.kind === 'slide')
const aiHistory = ref<{role:'user'|'assistant'; text:string; seconds?: string; applied?: boolean}[]>([])
const aiThread = ref<HTMLElement>()
const search = ref('')
const fileInput = ref<HTMLInputElement>()
const viewportWidth = ref(window.innerWidth)
const slidesVisible = computed(() => viewportWidth.value <= 760 ? mobileSlides.value : slidesExpanded.value)
const inspectorVisible = computed(() => viewportWidth.value <= 1050 ? mobileInspector.value : inspectorExpanded.value)

function toggleSlides() {
 if (viewportWidth.value <= 760) mobileSlides.value = !mobileSlides.value
 else slidesExpanded.value = !slidesExpanded.value
}

function toggleInspector() {
 if (viewportWidth.value <= 1050) mobileInspector.value = !mobileInspector.value
 else inspectorExpanded.value = !inspectorExpanded.value
}

const activeDrawer = computed(() => {
 if (section.value !== 'editor') return null
 if (shareOpen.value || assetsOpen.value || helpOpen.value || newOpen.value || presenting.value) return null
 if (viewportWidth.value <= 760 && mobileSlides.value) return 'slides'
 if (viewportWidth.value <= 1050 && mobileInspector.value) return 'inspector'
 return null
})
let drawerReturnFocus: HTMLElement | null = null
function onResize() { viewportWidth.value = window.innerWidth }
const sharedUrl = computed(() => window.location.origin + window.location.pathname)
const availableImages = [{url:'/images/alpine.jpg', name:'Alpine horizon', detail:'A different point of view'}, {url:'/images/night.jpg', name:'After the light', detail:'Room for possibility'}, {url:'/images/forest.jpg', name:'Wild & wonderful', detail:'A natural perspective'}]
const slideNames = ['The opening', 'A different view', 'Our guiding principles', 'The possibilities', 'A simple thought', 'The next chapter']

onMounted(() => {
 try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) { const stored = JSON.parse(raw); if (validateDeck(stored)) deck.value = stored } } catch { storageAvailable.value = false }
 window.addEventListener('keydown', onKeydown)
 window.addEventListener('resize', onResize)
})
onUnmounted(() => { window.removeEventListener('keydown', onKeydown); window.removeEventListener('resize', onResize); clearTimeout(toastTimer); clearTimeout(saveTimer); clearTimeout(aiTimer) })
watch(activeDrawer, async (value, previous) => {
 if (value && !previous) drawerReturnFocus = document.activeElement as HTMLElement
 await nextTick()
 if (value) document.querySelector<HTMLElement>(value === 'slides' ? '.slides-panel .slide-thumbnail-button[aria-current=true]' : '.inspector-panel [role=tab][data-state=active]')?.focus({preventScroll:true})
 else if (previous && !shareOpen.value && !assetsOpen.value && !helpOpen.value && !newOpen.value && !presenting.value) drawerReturnFocus?.focus({preventScroll:true})
})
watch(deck, () => {
 saved.value = false
 clearTimeout(saveTimer)
 saveTimer = setTimeout(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(deck.value)); storageAvailable.value = true; saved.value = true } catch { storageAvailable.value = false; notify('Browser storage is full. Export your deck to keep a copy.') } }, 550)
}, {deep:true})
watch(workspaceSettings, settings => {
 try { localStorage.setItem(settingsKey, JSON.stringify(settings)) }
 catch { notify('Workspace settings could not be saved in this browser') }
}, { deep: true })
watch(activeIndex, () => { zoom.value = 100 })
watch(() => current.value.id, () => {motionTarget.value='title';motionPhase.value='enter'})
// On narrow screens the inspector drawer must close to reach the timeline.
const motionFocused = computed(() =>
 section.value === 'editor' && panelTab.value === 'motion' &&
 (viewportWidth.value <= 1050 || inspectorExpanded.value)
)
watch(motionFocused, focused => {
 motionOpen.value = focused
 if (!focused) motionTime.value = null
})
watch(section, () => { mobileSlides.value = false; mobileInspector.value = false })
watch(presenting, open => { document.body.style.overflow = open ? 'hidden' : '' })

function notify(message:string) { toast.value = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.value = '', 3600) }
function mutate(fn: () => void) { undoStack.value.push(JSON.stringify(deck.value)); if (undoStack.value.length > 40) undoStack.value.shift(); redoStack.value = []; fn() }
function undo() { const last = undoStack.value.pop(); if (!last) return; redoStack.value.push(JSON.stringify(deck.value)); deck.value = JSON.parse(last); activeIndex.value = Math.min(activeIndex.value, deck.value.slides.length-1) }
function redo() { const next = redoStack.value.pop(); if (!next) return; undoStack.value.push(JSON.stringify(deck.value)); deck.value = JSON.parse(next); activeIndex.value = Math.min(activeIndex.value, deck.value.slides.length-1) }
function patchSlide(patch: Partial<Slide>) { mutate(() => Object.assign(current.value, patch)) }
function editSlide(key: 'title'|'subtitle', value:string) { if (current.value[key] !== value) patchSlide({[key]:value}) }
function rename(event: Event) { const title = (event.target as HTMLInputElement).value.trim(); if (title && title !== deck.value.title) mutate(() => deck.value.title = title); else (event.target as HTMLInputElement).value = deck.value.title }
function canAddSlide() { if (deck.value.slides.length < MAX_SLIDES) return true; notify('This demo supports 80 slides. Remove one before adding another.'); return false }
function addSlide() { if (!canAddSlide()) return; mutate(() => { deck.value.slides.splice(activeIndex.value+1, 0, {...makeSlide(), theme:current.value.theme, accent:current.value.accent, font:current.value.font}); activeIndex.value++ }); notify('A fresh slide, ready for your ideas.') }
function duplicateSlide(index = activeIndex.value) {
 if (!canAddSlide()) return
 mutate(() => {
  deck.value.slides.splice(index + 1, 0, {...deck.value.slides[index], id:crypto.randomUUID()})
  activeIndex.value = index + 1
 })
 notify('Slide duplicated')
}

function removeSlide(index: number) {
 if (deck.value.slides.length === 1) return
 mutate(() => {
  deck.value.slides.splice(index, 1)
  if (index < activeIndex.value) activeIndex.value--
  activeIndex.value = Math.min(activeIndex.value, deck.value.slides.length - 1)
 })
 nextTick(() => document.querySelector<HTMLButtonElement>('.slide-thumbnail-button[aria-current=true]')?.focus())
 notify('Slide deleted. You can undo this.')
}
function reorder(target:number) { if (dragIndex.value === null || dragIndex.value === target) { dragIndex.value = null; dropIndex.value = null; return } const from = dragIndex.value; const selectedId = current.value.id; mutate(() => { const [item] = deck.value.slides.splice(from,1); deck.value.slides.splice(target,0,item); activeIndex.value = deck.value.slides.findIndex(s=>s.id===selectedId) }); dragIndex.value = null; dropIndex.value = null }
function chooseTheme(id:ThemeName) { const theme = themes.find(t=>t.id===id)!; patchSlide({theme:id, accent:theme.accent}) }
function applyAll() { const source = {...current.value}; mutate(() => deck.value.slides.forEach(s => { s.theme=source.theme; s.accent=source.accent; s.font=source.font })); notify('Your look, across every slide.') }
function startPresentation(index = activeIndex.value) {
 presentIndex.value = index
 presenting.value = true
}
function presentationStep(delta:number) { presentIndex.value = Math.max(0,Math.min(deck.value.slides.length-1,presentIndex.value+delta)) }
function selectText() { activeTool.value='text'; nextTick(()=>{ const el = document.querySelector('.main-slide h2') as HTMLElement; if (!el) return; el.focus(); const range=document.createRange(); range.selectNodeContents(el); const sel=window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range) }) }
async function openAssistant() {
 panelTab.value = 'assistant'
 if (viewportWidth.value <= 1050) mobileInspector.value = true
 else inspectorExpanded.value = true
 await nextTick()
 document.querySelector<HTMLTextAreaElement>('.assistant-input-area textarea:not(:disabled)')?.focus({preventScroll:true})
}
function onKeydown(e:KeyboardEvent) {
 if (e.defaultPrevented || presentMenuOpen.value || accountMenuOpen.value) return
 const target=e.target as HTMLElement
 if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='k' && section.value==='editor' && !presenting.value && !activeDrawer.value && !shareOpen.value && !assetsOpen.value && !helpOpen.value && !newOpen.value) { e.preventDefault();openMotionPalette();return }
 if(e.key==='Escape' && motionOpen.value && !activeDrawer.value && !presenting.value) {e.preventDefault();closeMotion();return}
 if (activeDrawer.value && e.key === 'Escape') { e.preventDefault(); mobileSlides.value=false; mobileInspector.value=false; return }
 if (activeDrawer.value && e.key === 'Tab') {
  const panel = document.querySelector(activeDrawer.value === 'slides' ? '.slides-panel' : '.inspector-panel')
  const controls = Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') || []).filter(el=>el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && el.getAttribute('tabindex') !== '-1')
  const first=controls[0], last=controls.at(-1)
  if (e.shiftKey && target === first && last) {e.preventDefault();last.focus()}
  else if (!e.shiftKey && target === last && first) {e.preventDefault();first.focus()}
  return
 }
 if (presenting.value) { if (['ArrowRight','ArrowDown'].includes(e.key) || (e.key===' ' && !target.closest('button,[role=button],input,textarea,select'))) {e.preventDefault();presentationStep(1)} if (['ArrowLeft','ArrowUp'].includes(e.key)) {e.preventDefault();presentationStep(-1)} return }
 if (target.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(target.tagName)) return
 if ((e.metaKey||e.ctrlKey) && e.key==='z') {e.preventDefault();e.shiftKey?redo():undo()}
 if ((e.metaKey||e.ctrlKey) && e.key==='d' && section.value==='editor') {e.preventDefault();duplicateSlide()}
 if (shareOpen.value||assetsOpen.value||helpOpen.value||newOpen.value) return
 if (target.closest('#motion-studio,.motion-inspector')) return
 if (e.key==='ArrowDown' && section.value==='editor') {e.preventDefault();activeIndex.value=Math.min(activeIndex.value+1,deck.value.slides.length-1)}
 if (e.key==='ArrowUp' && section.value==='editor') {e.preventDefault();activeIndex.value=Math.max(0,activeIndex.value-1)}
  if ((e.metaKey||e.ctrlKey) && e.key==='Enter' && section.value==='editor') {e.preventDefault();addSlide()}
  if (e.key==='Escape') {mobileSlides.value=false;mobileInspector.value=false}
}
async function runAI(value = prompt.value) {
 if (!value.trim() || aiJob.value) return
 const text = value.trim(); if (/closing|new slide|add a slide/i.test(text) && !canAddSlide()) return; const targetId = current.value.id
 const job = { kind: 'slide' as const, startedAt: performance.now(), duration: 3000 }
 const targetDeck = deck.value
 prompt.value = ''
 panelTab.value = 'assistant'
 aiJob.value = job
 aiHistory.value.push({role:'user',text})
 nextTick(()=>aiThread.value?.scrollTo({top:aiThread.value.scrollHeight,behavior:'smooth'}))
 aiTimer = setTimeout(()=>{
  const slide = deck.value === targetDeck && deck.value.slides.find(s => s.id === targetId)
  if (!slide) {
   finishSlidePreview('The original slide is no longer available. Select a slide and try again.', job.startedAt, false)
   return
  }
  if (/closing|new slide|add a slide/i.test(text) && deck.value.slides.length >= MAX_SLIDES) {
   finishSlidePreview('This deck has reached the 80-slide demo limit. Remove a slide, then try again.', job.startedAt, false)
   return
  }
  let response = ''
  mutate(() => {
   const s = slide
   if (/closing|new slide|add a slide/i.test(text)) { deck.value.slides.push({...makeSlide('The next chapter\nstarts here.','closing'),theme:s.theme,accent:s.accent}); activeIndex.value=deck.value.slides.length-1; response='A closing slide, with a little room for possibility. It’s at the end of your deck.' }
   else if (/concise|shorter|simplif/i.test(text)) { s.title='A different view.\nA bigger possibility.'; s.subtitle='See what comes next.'; response='Fewer words. More room for the idea. I’ve simplified the headline and supporting text.' }
   else if (/dark|cinematic|mood|bold/i.test(text)) { s.theme='nocturne';s.accent='#c8c7eb';s.layout='full';s.image='/images/night.jpg';response='A cinematic direction: deeper tones, a full-bleed image, and room for your headline to breathe.' }
   else if (/notes|speaker/i.test(text)) { s.notes='Open with a question: what changes when we look at this differently? Pause, then introduce the core idea. Connect it to an experience the audience knows. End with one clear action they can take today.'; notesOpen.value=true; response='Speaker notes are ready below your slide. They open with a question and close with a clear next step.' }
   else if (/nature|green|organic/i.test(text)) {s.theme='sage';s.accent='#9ab399';s.image='/images/forest.jpg';response='A softer, natural direction with sage tones and a forest image.'}
   else { const clean=text.replace(/^(create|make|write|change|rewrite|a slide about|a presentation about)\s+/i,''); s.subtitle=clean.charAt(0).toUpperCase()+clean.slice(1,160); response='I’ve used your direction as the supporting text. You can click directly on the slide to refine the wording.' }
  })
  finishSlidePreview(response, job.startedAt, true)
 }, job.duration)
}
function finishSlidePreview(text: string, startedAt: number, applied: boolean) {
 aiJob.value = null
 aiHistory.value.push({ role: 'assistant', text, seconds: ((performance.now() - startedAt) / 1000).toFixed(1), applied })
 if (applied) notify('AI preview applied · Undo is always available')
 nextTick(() => aiThread.value?.scrollTo({ top: aiThread.value.scrollHeight, behavior: 'smooth' }))
}

function setNewOpen(open: boolean) {
 if (!open && creating.value) {
  clearTimeout(aiTimer)
  aiJob.value = null
 }
 newOpen.value = open
}

function createDeck() {
 if (aiJob.value) return
 const topic = newTopic.value.trim()
 if (!topic) {
  newError.value = 'Give your presentation a topic to get started.'
  return
 }
 const job = { kind: 'deck' as const, startedAt: performance.now(), duration: 4500 }
 aiJob.value = job
 newError.value = ''
 aiTimer = setTimeout(() => {
  mutate(() => {
   const starter = initialDeck()
   starter.title = topic
   starter.slides[0].title = topic
   starter.slides[0].subtitle = 'A fresh perspective on what comes next.'
   starter.slides[1].title = 'Start with\na better question.'
   starter.slides[1].subtitle = `What could a different approach to ${topic.toLowerCase()} make possible?`
   deck.value = starter
   activeIndex.value = 0
  })
  aiJob.value = null
  newOpen.value = false
  section.value = 'editor'
  newTopic.value = ''
  aiHistory.value = []
  notify(`Your six-slide starter is ready · ${((performance.now() - job.startedAt) / 1000).toFixed(1)}s`)
 }, job.duration)
}
async function copyLink() { try {await navigator.clipboard.writeText(sharedUrl.value);notify('Design study link copied')} catch {notify('Select and copy the link in the field below.')} }
function exportDeck() { const blob=new Blob([JSON.stringify(copyDeck(deck.value),null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=deck.value.title.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.aera.json';a.click();URL.revokeObjectURL(url);notify('Your editable deck has been downloaded.') }
async function importDeck(event:Event) {const input=event.target as HTMLInputElement;const file=input.files?.[0];if(!file)return;try {if(file.size>2_000_000)throw Error();const data=JSON.parse(await file.text());if(!validateDeck(data))throw Error();mutate(()=>{deck.value=copyDeck(data);activeIndex.value=0});section.value='editor';notify('Deck imported. Welcome back.')}catch{notify('This file isn’t an Aera deck. Choose an exported .aera.json file.')}input.value=''}
function openProfile() {
 profileDraft.value = profileName.value
 section.value = 'profile'
}
function saveProfile() {
 const name = profileDraft.value.trim()
 if (!name) {
  notify('Enter a display name to save your profile.')
  return
 }
 try {
  localStorage.setItem(profileKey, name)
  profileName.value = name
  profileDraft.value = name
  notify('Profile saved.')
 } catch {
  notify('This browser could not save your profile.')
 }
}
function openSettings(tab = 'connections') {
 settingsTab.value = tab
 section.value = 'settings'
}
function importProviderDeck(id: ProviderId) {
 if (aiBusy.value || creating.value) {
  notify('Wait for the current preview to finish before importing.')
  return
 }
 const connection = workspaceSettings.value.connections[id]
 if (!connection.access) return
 const pulling = linkedProvider.value === id
 mutate(() => {
  deck.value = { ...copyDeck(connection.document), linkedProvider: id }
  activeIndex.value = 0
 })
 section.value = 'editor'
 notify(pulling ? 'Provider edits pulled into Aera' : 'Demo presentation imported and linked')
}
function printDeck() { shareOpen.value=false; nextTick(()=>window.print()) }
</script>

<template>
 <div class="aera-app" :class="{'motion-off':!motion}">
  <aside class="app-rail" :inert="Boolean(activeDrawer)" aria-label="Main navigation">
   <button class="brand-mark" aria-label="Aera workspace" title="Aera workspace" @click="section='workspace'"><svg viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M6 27 16 6h7L13 27z" fill="currentColor"/><path d="m18 18 6 9h7L22 12z" fill="currentColor"/></svg></button>
   <div class="rail-links">
    <button :class="['rail-link',{active:section==='editor'}]" @click="section='editor'" title="Editor"><LayoutPanelLeft /><span>Editor</span></button>
    <button :class="['rail-link',{active:section==='workspace'}]" @click="section='workspace'" title="Projects"><FolderOpen /><span>Projects</span></button>
    <button :class="['rail-link',{active:section==='templates'}]" @click="section='templates'" title="Templates"><LayoutTemplate /><span>Templates</span></button>
    <button class="rail-link" @click="assetsOpen=true" title="Visual library"><ImageIcon /><span>Library</span></button>
   </div>
   <div class="rail-bottom"><button class="rail-link" @click="helpOpen=true" title="Help and keyboard shortcuts"><CircleHelp /><span>Help</span></button><DropdownMenuRoot v-model:open="accountMenuOpen" :modal="false">
     <DropdownMenuTrigger class="profile-avatar" :class="{'profile-avatar-active':inAccount}" aria-label="Profile and settings" title="Profile and settings">
      {{ profileInitial }}<span aria-hidden="true"></span>
     </DropdownMenuTrigger>
     <DropdownMenuPortal>
      <DropdownMenuContent class="present-menu account-menu" side="right" align="end" :side-offset="10" :collision-padding="12" aria-label="User menu">
       <div class="account-menu-name">{{ profileName }}</div>
       <DropdownMenuItem class="present-menu-item" @select="openProfile()"><UserRound :size="15"/>Profile</DropdownMenuItem>
       <DropdownMenuItem class="present-menu-item" @select="openSettings()"><Settings2 :size="15"/>Settings</DropdownMenuItem>
      </DropdownMenuContent>
     </DropdownMenuPortal>
    </DropdownMenuRoot></div>
  </aside>

  <div class="app-main">
   <header class="topbar" :inert="Boolean(activeDrawer)">
    <div class="document-heading"><button class="breadcrumb-home" @click="section='workspace'">My workspace</button><ChevronRight class="breadcrumb-chevron" :size="13"/><input v-if="section==='editor'" class="document-name" :value="deck.title" @change="rename" aria-label="Presentation name" maxlength="80"/><span v-else class="page-name">{{inAccount ? 'Account' : section==='templates' ? 'Templates' : 'Your projects'}}</span><span class="document-chevron"><ChevronDown :size="13" /></span><button v-if="section==='editor' && linkedProvider" class="linked-deck-badge" @click="openSettings()" :title="'Linked demo copy · ' + presentationProviders[linkedProvider].name">{{ presentationProviders[linkedProvider].name }}</button><span class="save-state" :class="{'is-saving':!saved}"><CloudCheck :size="15"/><span>{{!storageAvailable?'Not saved':saved?'All changes saved':'Saving changes…'}}</span></span></div>
    <div class="header-actions"><span class="demo-label">DESIGN STUDY</span>
     <PopoverRoot v-if="section==='editor'">
      <PopoverTrigger class="presence-trigger" aria-label="Collaboration preview">
       <span v-if="showCollaboration" class="presence-stack" aria-hidden="true">
        <span v-for="person in demoCollaborators" :key="person.name" class="presence-avatar" :style="{'--person-color':person.color}">{{person.initials}}</span>
       </span>
       <Users v-else :size="16" aria-hidden="true"/>
       <span class="presence-trigger-label">Preview</span>
      </PopoverTrigger>
      <PopoverPortal>
       <PopoverContent class="presence-popover" align="end" :side-offset="10" :collision-padding="12" aria-label="Collaboration preview">
        <h2>Collaboration preview</h2>
        <p>See how teammates could appear while editing the same slide.</p>
        <ul class="presence-roster">
         <li v-for="person in demoCollaborators" :key="person.name">
          <span class="presence-avatar" :style="{'--person-color':person.color}" aria-hidden="true">{{person.initials}}</span>
          <span><strong>{{person.name}}</strong><small>Sample collaborator</small></span>
         </li>
        </ul>
        <div class="presence-setting">
         <label for="show-demo-cursors">Show avatars and cursors</label>
         <SwitchRoot id="show-demo-cursors" v-model="showCollaboration" class="ui-switch"><SwitchThumb class="switch-thumb"/></SwitchRoot>
        </div>
       </PopoverContent>
      </PopoverPortal>
     </PopoverRoot>
     <Button v-if="!inAccount" variant="outline" class="share-button" @click="shareOpen=true"><Share2 :size="14"/><span>Share</span></Button><div v-if="section==='editor'" class="present-split">
      <Button class="present-button" @click="startPresentation()"><Play :size="14" fill="currentColor"/><span>Present</span></Button>
      <DropdownMenuRoot v-model:open="presentMenuOpen" :modal="false">
       <DropdownMenuTrigger as-child>
        <Button class="present-options-button" aria-label="Presentation and export options" title="Presentation and export options"><ChevronDown :size="14"/></Button>
       </DropdownMenuTrigger>
       <DropdownMenuPortal>
        <DropdownMenuContent class="present-menu" align="end" :side-offset="8" :collision-padding="12" aria-label="Presentation and export options" @close-auto-focus="presenting && $event.preventDefault()">
         <DropdownMenuItem class="present-menu-item" @select="startPresentation()"><Play :size="15"/>Present from current slide</DropdownMenuItem>
         <DropdownMenuItem class="present-menu-item" @select="startPresentation(0)"><Play :size="15"/>Present from beginning</DropdownMenuItem>
         <DropdownMenuSeparator class="present-menu-divider"/>
         <DropdownMenuItem class="present-menu-item" @select="exportDeck()"><Download :size="15"/>Export editable deck</DropdownMenuItem>
         <DropdownMenuItem class="present-menu-item" @select="printDeck()"><RectangleHorizontal :size="15"/>Print / Save PDF</DropdownMenuItem>
        </DropdownMenuContent>
       </DropdownMenuPortal>
      </DropdownMenuRoot>
     </div><Button v-else-if="inAccount" variant="outline" @click="section='editor'"><ChevronLeft :size="15"/>Back to editor</Button><Button v-else @click="newOpen=true"><Plus :size="16"/>Create new</Button></div>
   </header>

   <main v-if="section==='editor'" class="editor-shell" :class="{'slides-collapsed':!slidesExpanded, 'inspector-collapsed':!inspectorExpanded}">
    <div v-if="activeDrawer" class="mobile-backdrop" @click="mobileSlides=false;mobileInspector=false"></div>
    <aside id="slide-sidebar" class="slides-panel" :inert="activeDrawer==='inspector'" :role="activeDrawer==='slides'?'dialog':undefined" :aria-modal="activeDrawer==='slides'?true:undefined" :class="{'mobile-open':mobileSlides}" aria-label="Slides">
     <div class="panel-heading"><div>Slides <span class="count-badge">{{deck.slides.length}}</span></div><button class="icon-button" aria-label="Show all slides" title="Show all slides" @click="section='overview'"><LayoutGrid :size="15"/></button><button class="icon-button mobile-only" aria-label="Close slides" @click="mobileSlides=false"><X :size="16"/></button></div>
     <div class="slide-list">
      <div v-for="(slide,index) in deck.slides" :key="slide.id" class="slide-list-item" :class="{'is-selected':index===activeIndex,'drag-over':index===dropIndex}" draggable="true" @dragstart="dragIndex=index" @dragover.prevent="dropIndex=index" @dragleave="dropIndex=null" @drop.prevent="reorder(index)" @dragend="dragIndex=null;dropIndex=null">
       <div class="slide-number"><span>{{String(index+1).padStart(2,'0')}}</span><GripVertical :size="12"/></div>
       <div class="slide-list-card">
       <button class="slide-thumbnail-button" :aria-label="`Select slide ${index+1}: ${slide.title.replace('\n',' ')}`" :aria-current="index===activeIndex?'true':undefined" @click="activeIndex=index;mobileSlides=false">
        <div class="thumbnail-frame"><SlideCanvas :slide="slide" :index="index" :total="deck.slides.length" compact/><span v-if="index===activeIndex" class="thumbnail-selected"><Check :size="10"/></span></div>
       </button>
       <div class="slide-card-footer">
        <span class="thumbnail-label" :title="slide.title">{{slideNames[index] || slide.title.split('\n')[0]}}</span>
        <button class="icon-button slide-card-action" :aria-label="`Duplicate slide ${index + 1}`" title="Duplicate slide" :disabled="deck.slides.length >= MAX_SLIDES" @click="duplicateSlide(index)"><Copy :size="12"/></button>
        <button class="icon-button slide-card-action delete-slide" :aria-label="`Delete slide ${index + 1}`" title="Delete slide" :disabled="deck.slides.length === 1" @click="removeSlide(index)"><Trash2 :size="12"/></button>
       </div>
       </div>
      </div>
     </div>
     <div class="slides-bottom"><Button variant="outline" class="add-slide" @click="addSlide"><Plus :size="16"/> Add slide <span>⌘ ↵</span></Button><span class="slides-hint">A little structure. Endless possibility.</span></div>
    </aside>

    <section class="center-workspace" :inert="Boolean(activeDrawer)" aria-label="Presentation editor">
     <div class="canvas-card" :class="{'has-motion-studio':motionOpen}">
     <div class="workspace-toolbar">
      <div class="editing-tools" role="toolbar" aria-label="Slide tools">
       <button class="tool-button" :class="{active:slidesVisible}" :aria-label="slidesVisible ? 'Collapse slides sidebar' : 'Open slides sidebar'" :title="slidesVisible ? 'Collapse slides sidebar' : 'Open slides sidebar'" :aria-expanded="slidesVisible" aria-controls="slide-sidebar" @click="toggleSlides"><LayoutPanelLeft :size="17"/></button>
       <button :class="['tool-button',{active:activeTool==='select'}]" aria-label="Select tool" title="Select" @click="activeTool='select'"><MousePointer2 :size="17"/></button><span class="tool-divider"></span>
       <button :class="['tool-button',{active:activeTool==='text'}]" aria-label="Edit slide text" title="Edit text" @click="selectText"><Type :size="18"/></button>
       <button class="tool-button" aria-label="Change slide image" title="Change image" @click="assetsOpen=true"><ImageIcon :size="17"/></button>
       <button class="tool-button" :class="{active:inspectorVisible}" :aria-label="inspectorVisible ? 'Collapse right sidebar' : 'Open right sidebar'" :title="inspectorVisible ? 'Collapse right sidebar' : 'Open right sidebar'" :aria-expanded="inspectorVisible" aria-controls="inspector-sidebar" @click="toggleInspector"><PanelRight :size="17"/></button><span class="tool-divider"></span>
       <button class="tool-button" aria-label="Undo" title="Undo (⌘ Z)" :disabled="!undoStack.length" @click="undo"><Undo2 :size="16"/></button><button class="tool-button" aria-label="Redo" title="Redo (⌘ ⇧ Z)" :disabled="!redoStack.length" @click="redo"><Redo2 :size="16"/></button>
       <span class="tool-divider"></span><button class="ai-shortcut" :class="{'is-open':inspectorVisible && panelTab==='assistant','is-thinking':aiBusy}" :aria-expanded="inspectorVisible && panelTab==='assistant'" aria-controls="inspector-sidebar" @click="openAssistant" title="Open Aera AI"><Sparkles :size="15"/><span>{{aiBusy?'Creating…':'Ask Aera'}}</span></button>
      </div>
     </div>

     <div class="canvas-stage">

      <div class="canvas-scroll" :class="{'canvas-is-zoomed':zoom>100}"><div class="canvas-zoom" :style="{'--zoom':zoom/100}"><Transition name="slide-change" mode="out-in"><SlideCanvas :key="current.id" class="main-slide" :slide="current" :index="activeIndex" :total="deck.slides.length" :motion-time="motionTime" :motion-target="panelTab==='motion' && inspectorVisible ? motionTarget : null" :motion-enabled="motion" :editable="motionTime===null" @edit="editSlide"/></Transition>
       <div v-if="showCollaboration && motionTime===null" class="presence-cursors" aria-hidden="true">
        <div v-for="person in demoCollaborators" :key="person.name" class="presence-cursor" :style="{'--person-color':person.color, left:person.x, top:person.y}">
         <MousePointer2 :size="19" :stroke-width="2"/>
         <span>{{person.shortName}}</span>
        </div>
       </div>
      </div></div>
      <div class="canvas-status"><div class="canvas-details"><span class="slide-context-number">{{String(activeIndex+1).padStart(2,'0')}}</span><span class="canvas-slide-name">{{slideNames[activeIndex] || 'Your next idea'}}</span><span class="canvas-ratio">16:9</span></div><div class="zoom-controls"><button class="icon-button" aria-label="Zoom out" :disabled="zoom<=70" @click="zoom=Math.max(70,zoom-10)"><Minus :size="13"/></button><button class="zoom-label" @click="zoom=100" title="Fit to canvas">{{zoom}}%</button><button class="icon-button" aria-label="Zoom in" :disabled="zoom>=130" @click="zoom=Math.min(130,zoom+10)"><Plus :size="13"/></button><span class="tool-divider"></span><button class="icon-button" aria-label="Preview presentation" @click="startPresentation()"><Maximize2 :size="13"/></button></div></div>


     </div>

     <MotionStudio v-if="motionOpen" ref="motionStudio" :sequence="current.motion" :slide-id="current.id" :enabled="motion" v-model:target="motionTarget" v-model:phase="motionPhase" @change="patchSlide({motion:$event})" @preview="motionTime=$event" @inspect="inspectMotion" @close="closeMotion"/>
     <div class="speaker-notes"><button class="notes-heading" :aria-expanded="notesOpen" @click="notesOpen=!notesOpen"><MessageSquare :size="14"/><span>Speaker notes</span><ChevronDown :class="{'rotated':notesOpen}" :size="14"/><span class="notes-private">Only you can see these</span></button><textarea v-if="notesOpen" :key="current.id" :value="current.notes" @change="patchSlide({notes:($event.target as HTMLTextAreaElement).value})" placeholder="Give your story a little direction. Add speaker notes…" aria-label="Speaker notes"/></div>
     </div>
    </section>

    <aside id="inspector-sidebar" class="inspector-panel" :inert="activeDrawer==='slides'" :role="activeDrawer==='inspector'?'dialog':undefined" :aria-modal="activeDrawer==='inspector'?true:undefined" :class="{'mobile-open':mobileInspector}" aria-label="Slide design, motion and AI assistant">
     <TabsRoot v-model="panelTab" class="inspector-tabs"><TabsList class="inspector-tab-list has-motion-tab" aria-label="Editor panels"><TabsTrigger value="design"><SlidersHorizontal :size="14"/><span>Design</span></TabsTrigger><TabsTrigger value="motion"><Clapperboard :size="14"/><span>Motion</span></TabsTrigger><TabsTrigger value="assistant"><Sparkles :size="14"/><span>Aera AI</span><span class="tiny-dot"></span></TabsTrigger><button class="mobile-only icon-button" aria-label="Close inspector" @click="mobileInspector=false"><X :size="16"/></button></TabsList>
      <TabsContent value="design" class="design-content">
       <div class="inspector-intro"><h1>Make it yours.</h1><p>A little character goes a long way.</p></div>
       <div class="control-section theme-section"><div class="section-label"><span>Theme</span><span class="subtle-tag">Curated by Aera</span></div><div class="theme-grid"><button v-for="theme in themes" :key="theme.id" :class="['theme-option',{selected:current.theme===theme.id}]" :aria-pressed="current.theme===theme.id" @click="chooseTheme(theme.id)"><span class="theme-art" :style="{'background':theme.background,'color':theme.foreground}"><span class="theme-art-copy">Aa<span>A new<br/>perspective.</span></span><img :src="theme.image" alt=""/><span v-if="current.theme===theme.id" class="theme-check"><Check :size="11"/></span></span><span class="theme-name">{{theme.name}}<span class="theme-dots"><i :style="{background:theme.foreground}"></i><i :style="{background:theme.accent}"></i><i :style="{background:theme.background}"></i></span></span></button></div></div>
       <div class="control-section"><div class="section-label"><label for="font-select">Typography</label><span class="small-preview">Aa</span></div><div class="select-wrap"><Type :size="16"/><select id="font-select" :value="current.font" @change="patchSlide({font:($event.target as HTMLSelectElement).value})"><option>DM Sans</option><option>Manrope</option><option>Georgia</option></select><ChevronDown :size="13"/></div><div class="type-scale"><span>Text size</span><Slider :model-value="[current.scale]" :min="70" :max="120" :step="5" label="Text size" @update:model-value="v=>patchSlide({scale:v[0]})"/><span>{{current.scale}}%</span></div></div>
       <div class="control-section"><div class="section-label"><span>Accent color</span><span class="color-hex">{{current.accent.toUpperCase()}}</span></div><div class="color-swatches"><button v-for="color in ['#b9dfe9','#c8c7eb','#9ab399','#cb987e','#e4d5a7']" :key="color" :style="{background:color}" :class="{selected:current.accent===color}" :aria-label="`Use accent ${color}`" :aria-pressed="current.accent===color" @click="patchSlide({accent:color})"><Check v-if="current.accent===color" :size="14"/></button><label class="custom-color" title="Choose a custom color"><Plus :size="15"/><input type="color" :value="current.accent" @change="patchSlide({accent:($event.target as HTMLInputElement).value})" aria-label="Custom accent color"/></label></div></div>
       <div class="control-section"><div class="section-label"><span>Layout</span><span class="muted">{{current.layout==='split'?'Split':current.layout==='center'?'Centered':'Full image'}}</span></div><div class="layout-options"><button :class="{selected:current.layout==='split'}" :aria-pressed="current.layout==='split'" aria-label="Split layout" title="Split layout" @click="patchSlide({layout:'split'})"><LayoutPanelLeft :size="23"/></button><button :class="{selected:current.layout==='center'}" :aria-pressed="current.layout==='center'" aria-label="Centered layout" title="Centered layout" @click="patchSlide({layout:'center'})"><AlignCenter :size="23"/></button><button :class="{selected:current.layout==='full'}" :aria-pressed="current.layout==='full'" aria-label="Full image layout" title="Full image layout" @click="patchSlide({layout:'full'})"><RectangleHorizontal :size="23"/></button></div></div>
       <div class="control-section motion-section"><div><span>Give it a little motion</span><p>Soft, considered transitions.</p></div><SwitchRoot v-model="motion" class="ui-switch" aria-label="Slide transitions"><SwitchThumb class="switch-thumb"/></SwitchRoot></div>
       <button class="motion-design-link" @click="openMotionPalette()"><Clapperboard :size="15"/><span>Open motion studio</span><ArrowUpRight :size="14"/></button>
       <div class="inspector-bottom"><Button variant="secondary" class="apply-theme" @click="applyAll"><CheckCheck :size="15"/>Apply style to all slides</Button><span>Good design is in the details.</span></div>
      </TabsContent>
      <TabsContent value="motion" class="motion-tab-content"><MotionInspector ref="motionInspector" :sequence="current.motion" :timeline-open="motionOpen" v-model:target="motionTarget" v-model:phase="motionPhase" @change="applyMotion" @timeline="motionOpen ? closeMotion() : motionOpen=true"/></TabsContent>
      <TabsContent value="assistant" class="assistant-content">
       <div class="assistant-scroll" ref="aiThread"><div class="assistant-intro"><div class="assistant-symbol"><Sparkles :size="26"/></div><h2>Your idea.<br/>A little more extraordinary.</h2><p>Let’s find the right words, the right mood, and a fresh point of view.</p><span class="ai-demo-badge">Interactive AI preview</span></div><div class="suggestion-list" v-if="!aiHistory.length"><button @click="runAI('Make it more concise')"><WandSparkles :size="16"/><span>Say more with less</span><ArrowUpRight :size="14"/></button><button @click="runAI('Give it a cinematic mood')"><Palette :size="16"/><span>Try a cinematic mood</span><ArrowUpRight :size="14"/></button><button @click="runAI('Add a closing slide')"><Plus :size="16"/><span>Give it a great ending</span><ArrowUpRight :size="14"/></button></div><div v-for="(message,i) in aiHistory" :key="i" class="ai-message" :class="message.role"><div v-if="message.role==='assistant'" class="assistant-message-label"><Sparkles :size="13"/>Aera<span v-if="message.seconds" class="ai-message-time">{{ message.seconds }}s</span></div><p>{{message.text}}</p><button v-if="message.applied && i===aiHistory.length-1" class="undo-ai" :disabled="!undoStack.length" @click="undo();notify('Last change undone')"><Undo2 :size="12"/>Undo change</button></div><AiProgress v-if="aiJob?.kind === 'slide'" v-bind="aiJob" :motion="motion"/></div>
       <div class="assistant-input-area"><form @submit.prevent="runAI()"><textarea v-model="prompt" aria-label="Ask the AI assistant" placeholder="What are you imagining?" :disabled="aiBusy" @keydown.enter.exact.prevent="runAI()"/><div><span><Layers :size="12"/>Slide {{activeIndex+1}}</span><button class="send-prompt" :disabled="!prompt.trim()||aiBusy" aria-label="Send to Aera"><ArrowUp :size="17"/></button></div></form><button class="assistant-model-link" @click="openSettings('ai')" title="AI model settings"><Settings2 :size="12"/> {{ workspaceSettings.ai.model }} <span>· Preview</span></button></div>
      </TabsContent>
     </TabsRoot>
    </aside>
   </main>

   <div v-else-if="inAccount" class="account-section">
    <nav class="account-nav" aria-label="Account">
     <button :aria-current="section==='profile' ? 'page' : undefined" @click="openProfile()"><UserRound :size="15"/>Profile</button>
     <button :aria-current="section==='settings' ? 'page' : undefined" @click="openSettings()"><Settings2 :size="15"/>Settings</button>
    </nav>
    <WorkspaceSettings v-if="section==='settings'" v-model:tab="settingsTab" v-model:settings="workspaceSettings" :deck="deck" :linked-provider="linkedProvider" @import="importProviderDeck" @status="notify"/>
    <main v-else class="workspace-page settings-page">
     <div class="settings-shell">
      <header class="settings-intro"><div><h1>Your profile</h1><p>Choose the name shown in your Aera workspace.</p></div></header>
      <form class="account-profile-form" @submit.prevent="saveProfile">
       <div class="account-profile-initial" aria-hidden="true">{{ profileInitial }}</div>
       <label for="profile-name">Display name</label>
       <input id="profile-name" v-model="profileDraft" maxlength="60" required autocomplete="nickname"/>
       <p>Your profile is saved in this browser.</p>
       <Button type="submit" :disabled="!profileDraft.trim() || profileDraft.trim()===profileName">Save profile</Button>
      </form>
     </div>
    </main>
   </div>
   <main v-else class="workspace-page">
    <template v-if="section==='workspace'"><div class="workspace-welcome"><div><h1>What will you create today?</h1><p>Your next great story is waiting to happen.</p></div><div class="workspace-aera-symbol"><Asterisk :size="95" stroke-width="1"/></div></div><button class="create-banner" @click="newOpen=true"><div class="command-orb"><Sparkles :size="22"/></div><div><strong>Start with an idea.</strong><p>Turn a thought into a beautifully considered presentation.</p></div><span>Create with Aera <ArrowUpRight :size="18"/></span></button><div class="projects-heading"><h2>Your presentations <span>1</span></h2><div><div class="search-box"><Search :size="15"/><input v-model="search" placeholder="Find a presentation" aria-label="Search presentations"/></div><Button variant="outline" @click="fileInput?.click()"><Upload :size="15"/>Import</Button><Button variant="outline" @click="openSettings()"><ArrowUpRight :size="15"/>Connected apps</Button></div></div><div v-if="deck.title.toLowerCase().includes(search.toLowerCase())" class="project-grid"><button class="project-card" @click="section='editor'"><SlideCanvas :slide="deck.slides[0]" :index="0" :total="deck.slides.length" compact/><div><h3>{{deck.title}}</h3><MoreHorizontal :size="17"/><p>{{deck.slides.length}} slides · Saved in this browser</p></div></button><button class="blank-project" @click="newOpen=true"><Plus :size="25"/><span>A fresh canvas</span><p>Make something that’s yours.</p></button></div><div v-else class="empty-search"><Search :size="28"/><h2>No presentations match “{{search}}”</h2><p>Try a different title, or start a new presentation.</p><Button variant="secondary" @click="search=''">Clear search</Button></div></template>
    <template v-else-if="section==='templates'"><div class="page-intro"><h1>A head start on something great.</h1><p>Four distinct personalities. One that feels like you.</p></div><div class="template-gallery"><button v-for="theme in themes" :key="theme.id" @click="chooseTheme(theme.id);applyAll();section='editor'"><SlideCanvas :slide="{...deck.slides[0],theme:theme.id,accent:theme.accent,image:theme.image}" :index="0" :total="deck.slides.length"/><div><h2>{{theme.name}}</h2><span>Use this theme <ArrowUpRight :size="15"/></span></div></button></div></template>
    <template v-else><div class="projects-heading"><div><h1>The whole story.</h1><p>Every slide, at a glance.</p></div><Button variant="outline" @click="section='editor'"><ChevronLeft :size="15"/>Back to editor</Button></div><div class="overview-grid"><button v-for="(s,i) in deck.slides" :key="s.id" @click="activeIndex=i;section='editor'"><SlideCanvas :slide="s" :index="i" :total="deck.slides.length"/><span>{{String(i+1).padStart(2,'0')}}<strong>{{slideNames[i]||'Your next idea'}}</strong></span></button><button class="overview-add" @click="addSlide();section='editor'"><Plus :size="25"/>Add a slide</button></div></template>
   </main>
   <footer class="app-footer" :inert="Boolean(activeDrawer)"><span class="footer-brand">aera<span>®</span></span><span>A space for your next big idea.</span><div><span class="local-dot"></span><span>Personal workspace</span><button @click="helpOpen=true">Keyboard shortcuts<span>?</span></button></div></footer>
  </div>

  <Dialog v-model:open="shareOpen" title="Good ideas deserve to travel." description="Share the design study, or take your presentation with you.">
   <div class="share-preview"><SlideCanvas :slide="deck.slides[0]" :index="0" :total="deck.slides.length" compact/><div><strong>{{deck.title}}</strong><span>{{deck.slides.length}} slides · Personal workspace</span></div></div><label class="form-label" for="share-link">Design study link</label><div class="share-link-field"><input id="share-link" :value="sharedUrl" readonly @focus="($event.target as HTMLInputElement).select()"/><Button variant="secondary" size="icon" @click="copyLink" aria-label="Copy design study link"><Copy :size="16"/></Button></div><p class="field-note">This link opens the demo. Your edits stay in this browser; export a deck to share them.</p><div class="export-actions"><Button variant="outline" @click="exportDeck"><Download :size="16"/>Export editable deck</Button><Button variant="outline" @click="printDeck"><RectangleHorizontal :size="16"/>Print / Save PDF</Button></div>
  </Dialog>
  <Dialog v-model:open="assetsOpen" title="A different point of view." description="A small, curated collection to give your story room to breathe." wide><div class="asset-gallery"><button v-for="asset in availableImages" :key="asset.url" @click="patchSlide({image:asset.url});assetsOpen=false;section='editor';notify('A fresh view for your slide.')"><img :src="asset.url" :alt="asset.name"/><span><strong>{{asset.name}}</strong><Check v-if="current.image===asset.url" :size="16"/><small>{{asset.detail}}</small></span></button></div><p class="field-note">Photography via Unsplash. Images are included in this design study.</p></Dialog>
  <Dialog :open="newOpen" @update:open="setNewOpen" title="Every great story starts somewhere." description="Tell Aera what’s on your mind. We’ll build a starter you can make your own."><span class="ai-demo-badge">AI generation preview</span><form @submit.prevent="createDeck"><label class="form-label" for="new-topic">What is your presentation about?</label><textarea id="new-topic" v-model="newTopic" class="new-topic-input" placeholder="A bold vision for a more thoughtful future…" maxlength="100" :disabled="creating"/><p v-if="newError" class="form-error" role="alert">{{newError}}</p><div class="new-deck-options"><span><Layers :size="14"/>6 slides</span><span><Palette :size="14"/>Glacier theme</span><span>English</span></div><p class="field-note">This demo creates a sample structure from your title. It isn’t connected to a live AI service.</p><AiProgress v-if="aiJob?.kind === 'deck'" v-bind="aiJob" :motion="motion"/><p v-if="aiBusy" class="field-note">Finish the current Ask Aera preview before creating a deck.</p><Button v-if="creating" type="button" variant="outline" class="create-deck-button" @click="setNewOpen(false)">Cancel generation</Button><Button v-else class="create-deck-button" :disabled="aiBusy"><Sparkles :size="17"/>Create my presentation<ArrowRight :size="17"/></Button></form></Dialog>
  <Dialog v-model:open="helpOpen" title="A little help along the way." description="Aera is an interactive presentation editor concept. Your work is saved in this browser."><div class="shortcut-list"><div><span>Move between slides</span><span><kbd>↑</kbd><kbd>↓</kbd></span></div><div><span>Undo a change</span><span><kbd>⌘ / Ctrl</kbd><kbd>Z</kbd></span></div><div><span>Redo a change</span><span><kbd>⌘ / Ctrl</kbd><kbd>⇧</kbd><kbd>Z</kbd></span></div><div><span>Duplicate a slide</span><span><kbd>⌘ / Ctrl</kbd><kbd>D</kbd></span></div><div><span>Exit presentation</span><kbd>Esc</kbd></div></div><div class="help-tip"><MousePointer2 :size="18"/><p>Click directly on any slide title or subtitle to edit it. Drag thumbnails to reorder your story.</p></div><p class="field-note">AI interactions are simulated. Share links open the demo; export an editable deck to keep or transfer your changes.</p></Dialog>

  <DialogRoot v-model:open="presenting"><DialogPortal><DialogOverlay class="presentation-overlay"/><DialogContent class="presentation-shell" :class="{'motion-off':!motion}" @escape-key-down="presenting=false"><DialogTitle class="sr-only">{{deck.title}} — presentation</DialogTitle><DialogDescription class="sr-only">Use left and right arrows to navigate slides. Press Escape to exit.</DialogDescription><div class="presentation-top"><span class="presentation-wordmark">aera<span> / {{deck.title}}</span></span><Button variant="ghost" @click="presenting=false"><X :size="16"/>Exit presentation</Button></div><div class="presentation-stage"><Transition name="present-change" mode="out-in"><SlideCanvas :key="presentIndex" :slide="deck.slides[presentIndex]" :index="presentIndex" :total="deck.slides.length"/></Transition></div><div class="presentation-controls"><Button variant="ghost" size="icon" :disabled="presentIndex===0" @click="presentationStep(-1)" aria-label="Previous slide"><ChevronLeft :size="20"/></Button><span>{{String(presentIndex+1).padStart(2,'0')}}<i>/</i>{{String(deck.slides.length).padStart(2,'0')}}</span><Button variant="ghost" size="icon" :disabled="presentIndex===deck.slides.length-1" @click="presentationStep(1)" aria-label="Next slide"><ChevronRight :size="20"/></Button></div><div class="presentation-progress"><span :style="{transform:`scaleX(${(presentIndex+1)/deck.slides.length})`}"></span></div></DialogContent></DialogPortal></DialogRoot>
  <Transition name="toast"><div v-if="toast" class="toast-message" role="status"><div><Check :size="13"/></div>{{toast}}<button @click="toast=''" aria-label="Dismiss notification"><X :size="14"/></button></div></Transition>
  <input ref="fileInput" type="file" accept=".json,.aera.json" class="sr-only" tabindex="-1" @change="importDeck"/>
  <section class="print-deck" aria-hidden="true"><div v-for="(slide,i) in deck.slides" :key="slide.id" class="print-page"><SlideCanvas :slide="slide" :index="i" :total="deck.slides.length"/></div></section>
 </div>
</template>

