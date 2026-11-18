# Notes / Voice Tabbed Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the speaker-notes bar under the slide into a resizable two-tab bar (Notes | Voice) and move the sidebar's Narration tab into its Voice tab.

**Architecture:** `SpeakerNotes.vue` gains a tablist, a drag handle and a height-controlled body. `NarrationTab.vue` is renamed `VoiceTab.vue` and lays its sections out in columns inside the bar. Open/tab/height state lives in the editor store; the clamp is a pure helper.

**Tech Stack:** Vue 3, Pinia, Tailwind v4 (container queries), @vueuse/core, Vitest + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-11-18-notes-voice-tabbed-footer-design.md`

## Global Constraints

- Work only in `frontend/`; do not touch `servers/nextjs`. Template-based generation only (CLAUDE.md).
- Keep the Aera look: extend additively (existing colors/typography of the footer: `bg-[#1b1f21]`, `text-[11px]`, `border-line`).
- The working tree has unrelated uncommitted changes (`frontend/src/slide-editor/geometry.ts`, its test, `docs/superpowers/plans/*`). Every commit must `git add` explicit paths only, never `-A`/`.`.
- Commit messages end with the session's attribution trailers (`Co-Authored-By` / `Claude-Session`).
- Height is not persisted across reloads (store only).
- No second copy of the note textarea: it lives only in the Notes tab (`NotesStrip`).
- Verify with, from `frontend/`: `npx vitest run <files>`, `npx vue-tsc -b`, `npx eslint <files>`.

## Review Focus

1. Typing in Notes then clicking Voice: the note is saved before any voice generation can run (Notes unmounts → `useNoteDraft` flush). Tested in Task 3.
2. Resize clamping: card shorter than the minimum, or the window shrinking while the bar is tall, never yields a negative/oversized body; stored height is re-clamped at render. Tested in Task 1 (helper) and Task 3.
3. A cancelled or interrupted drag (`pointercancel`, lost capture) ends cleanly with no stuck drag state. Tested in Task 3.
4. Keyboard users can resize and switch tabs: Up/Down/Home/End on the separator, Left/Right on tabs, with correct `aria-*`. Tested in Task 3.
5. A running narration/avatar task is not lost when switching Voice → Notes → Voice (Voice stays mounted); and the header's "Narration and avatars" switches a bar open on Notes to Voice. Tested in Task 3.

---

### Task 1: Footer state and height clamp

**Files:**
- Create: `frontend/src/components/editor/footerHeight.ts`
- Modify: `frontend/src/stores/editor.ts` (replace `notesOpen`, line 32 and return list line 91)
- Test: `frontend/tests/unit/editor/footerHeight.test.ts`, `frontend/tests/unit/editor/editorStore.test.ts` (create if no store test exists; otherwise add to it)

**Interfaces:**
- Produces (`footerHeight.ts`): `FOOTER_MIN_HEIGHT = 96`, `FOOTER_DEFAULT_HEIGHT = 200`, `FOOTER_MAX_RATIO = 0.6`, `FOOTER_KEY_STEP = 16`, `clampFooterHeight(height: number, cardHeight: number): number` (body height in px; max is `floor(cardHeight * FOOTER_MAX_RATIO)`; the minimum wins when the max is below it).
- Produces (store): `export type FooterTab = 'notes' | 'voice'`; refs `footerOpen: boolean` (false), `footerTab: FooterTab` ('notes'), `footerHeight: number` (`FOOTER_DEFAULT_HEIGHT`, unclamped raw value); `openFooter(tab: FooterTab): void` (sets tab, opens). `notesOpen` is removed.

- [ ] **Step 1: Write failing tests**
  - `footerHeight.test.ts`: `clampFooterHeight(500, 1000) === 500`; `(900, 1000) === 600`; `(10, 1000) === 96`; `(300, 100) === 96` (min wins over a tiny card).
  - store test: initial `footerOpen === false`, `footerTab === 'notes'`, `footerHeight === 200`; `openFooter('voice')` sets `footerOpen === true` and `footerTab === 'voice'`; calling it again keeps it open.
- [ ] **Step 2: Run** `npx vitest run tests/unit/editor/footerHeight.test.ts tests/unit/editor/editorStore.test.ts` — Expected: FAIL (module/members missing).
- [ ] **Step 3: Implement** `footerHeight.ts` and the store changes per the Interfaces block. `SpeakerNotes.vue` still reads `notesOpen`; temporarily point it at `footerOpen` so `vue-tsc` stays green (Task 3 rewrites it).
- [ ] **Step 4: Run** the two test files plus `npx vue-tsc -b` — Expected: PASS, no type errors.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/editor/footerHeight.ts frontend/src/stores/editor.ts frontend/src/components/editor/SpeakerNotes.vue frontend/tests/unit/editor/footerHeight.test.ts frontend/tests/unit/editor/editorStore.test.ts
git commit -m "feat(frontend): footer state and height clamp in the editor store"
```

---

### Task 2: Move Narration into `VoiceTab`, remove the sidebar tab

**Files:**
- Rename: `frontend/src/components/editor/inspector/NarrationTab.vue` → `VoiceTab.vue` (`git mv`)
- Modify: `frontend/src/components/editor/inspector/narration/SlideVoiceSection.vue`
- Modify: `frontend/src/components/editor/inspector/tabs.ts`, `frontend/src/stores/editor.ts:4` (`InspectorTabId` loses `'narration'`)
- Modify: `frontend/src/components/editor/EditorHeader.vue:203` (item calls `editor.openFooter('voice')`; `openInspector` stays for any other caller, otherwise remove it and unused imports)
- Modify: `frontend/src/components/editor/EditorLayout.vue` (drawer `SheetDescription` text "Design and narration tools" → "Layers, insert and design tools")
- Rename/modify test: `frontend/tests/unit/editor/NarrationTab.test.ts` → `VoiceTab.test.ts`

**Interfaces:**
- Consumes: `editor.openFooter` (Task 1).
- Produces: `VoiceTab.vue` with the same props as today, `{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }`, providing the same deck narration/avatar state; root keeps `aria-label="Voice"` and the `data-testid="narration-slide"` "Slide N of M" line. `SlideVoiceSection` props become `{ slide: Slide }` (no `presentationId`) and it renders only the voice card (`data-testid="slide-voice"`), with the note textarea, "Write/Rewrite with AI" button, `useNoteDraft` and `generateSpeakerNotes` code removed; `onGenerate` just calls `generateSlide(slide.index)` (the Notes tab flushes on unmount).

- [ ] **Step 1: Update the tests first** (in the renamed `VoiceTab.test.ts`, import `VoiceTab`):
  - `'shows only the active slide'`: `findAll('textarea')` has length 0 (rest unchanged).
  - Delete the note-editing tests now covered by `NotesStrip.test.ts`: `'autosaves the active slide note…'`, `'autosaves after 800 ms…'`, `'a refetch does not overwrite a dirty draft'`, `"writes this slide's note with AI"`; in `'makes the note read-only…'` keep only the `Generate all notes` disabled assertion and rename it to `'disables Generate all notes while the deck is generating'`.
  - `'regenerates the audio of the active slide only…'`: drop the textarea typing and the save-order assertions; keep `expect(m.generateTtsAsync).toHaveBeenCalledWith('p1', { language: 'en-US', slide_indexes: [1], regenerate: true })`.
  - Add `'lays the sections out as columns'`: root contains a grid wrapper with `data-testid="voice-columns"` holding slide voice, avatar and whole-deck sections in that order.
- [ ] **Step 2: Run** `npx vitest run tests/unit/editor/VoiceTab.test.ts` — Expected: FAIL (import path / missing testid).
- [ ] **Step 3: Implement.** `git mv` the component; strip `SlideVoiceSection` as in Interfaces; in `VoiceTab` wrap the three sections in `<div data-testid="voice-columns" class="grid gap-4 …">` using container-query breakpoints (`@container` on the root, `@2xl:grid-cols-2 @4xl:grid-cols-3`; one column by default); reduce outer padding to `px-4 py-3`; the "Slide N of M" line stays above the columns. Remove the `narration` entry (and now-unused `AudioLines` import) from `tabs.ts` and the union; update the header item and drawer description.
- [ ] **Step 4: Run** `npx vitest run tests/unit/editor` and `npx vue-tsc -b` and `npx eslint src/components/editor src/stores tests/unit/editor` — Expected: PASS. (`EditorView.test.ts` builds its expected tabs from `inspectorTabs`, so it adapts.) Note: until Task 3, nothing renders `VoiceTab`; that is expected.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/editor frontend/src/stores/editor.ts frontend/tests/unit/editor
git commit -m "refactor(frontend): move narration out of the inspector into VoiceTab"
```

---

### Task 3: Tabbed, resizable footer

**Files:**
- Modify (rewrite): `frontend/src/components/editor/SpeakerNotes.vue`
- Modify: `frontend/src/styles/motion.css` (add `.footer-body` height transition; add it to the reduced-motion list at line 93 and remove `.disclosure` there only if no other user remains)
- Modify: `frontend/src/views/EditorView.vue:123` — pass the `presentation` to the footer (`<SpeakerNotes :presentation-id="id" :presentation="presentation" :slide="activeSlide" />`)
- Test: `frontend/tests/unit/editor/SpeakerNotes.test.ts` (create). Stub `VoiceTab.vue` via `vi.mock` with a tiny component that renders `data-testid="voice-stub"`; use the real `NotesStrip` with `@/api/speakerNotes` mocked, as `NotesStrip.test.ts` does.

**Interfaces:**
- Consumes: store `footerOpen/footerTab/footerHeight/openFooter` and `clampFooterHeight`, `FOOTER_MIN_HEIGHT`, `FOOTER_KEY_STEP` (Task 1); `VoiceTab` (Task 2).
- Produces: `SpeakerNotes.vue` props `{ presentationId: string; presentation: Presentation; slide: Slide | null }`. DOM contract the tests rely on: `role="tablist"` (aria-label "Notes and voice") with two `role="tab"` buttons labelled "Notes" and "Voice" (`aria-selected`, `aria-controls="footer-panel"`); a collapse chevron button (`aria-label="Collapse"`/`"Expand"`, `aria-expanded`); a `role="tabpanel"` `id="footer-panel"` body that is `inert` and zero-height when closed; a `role="separator"` `aria-orientation="horizontal"` `aria-label="Resize notes and voice"` handle with `aria-valuenow/min/max`, `tabindex=0`, rendered only while open, with `touch-action: none`.

- [ ] **Step 1: Write failing tests** (`SpeakerNotes.test.ts`):
  - `'starts collapsed on Notes; clicking a tab opens the bar on it'` — click Voice → `footerOpen` true, `footerTab` 'voice', `voice-stub` present, `aria-selected` on Voice.
  - `'clicking the active tab, or the chevron, collapses it'` — panel gets `inert`; height style is `0px`.
  - `'Left/Right arrow keys move between tabs'`.
  - `'keeps Voice mounted after switching to Notes'` — stub's mount counter stays 1 across Voice → Notes → Voice (Review Focus 5); Voice is not mounted before first opened.
  - `'saves a pending note when switching to Voice'` — open Notes, type in the textarea, click Voice, advance no timers: `updateSpeakerNotes` called with that slide and text (Review Focus 1).
  - `'dragging the handle resizes the body, clamped to the card'` — stub the parent's height (via a mocked `useElementSize` from `@vueuse/core`, or by setting the card element's size) to 500; `pointerdown` at y=400, `pointermove` to y=300 → `footerHeight` grows by 100; drag far up → capped at 300 (60%); drag far down → 96.
  - `'pointercancel ends the drag'` — after cancel, further `pointermove` does not change `footerHeight`.
  - `'the rendered height follows a shrinking card'` — raw `footerHeight` 400, card shrinks to 300 → body style height 180px, store value untouched.
  - `'separator keys: Up/Down by 16, Home/End to min/max, with aria-valuenow'`.
  - `'header action: openFooter("voice") while open on Notes switches to Voice'`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/editor/SpeakerNotes.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement `SpeakerNotes.vue`.**
  - Header row: tablist (icon + label per tab; MessageSquare for Notes, AudioLines for Voice), then the chevron; the "Only you can see these" hint shows only on the Notes tab at ≥1280px as today.
  - Tab click: if open and already active → `footerOpen = false`; else `openFooter(tab)`.
  - Body: Notes rendered with `v-if="footerTab === 'notes'"` (mount once opened — so leaving the tab unmounts and flushes); Voice rendered once first opened (`voiceMounted` flag) and then shown/hidden with `v-show`. Body is `overflow-y: auto` inside a `.footer-body` wrapper whose inline `height` is `0` when closed, otherwise `clampFooterHeight(footerHeight, cardHeight)` px; cardHeight from `useElementSize` on `rootEl.parentElement`.
  - Drag: pointerdown on the handle sets pointer capture and records start y/height, adds a `dragging` state that disables the height transition; pointermove sets `footerHeight = clampFooterHeight(startHeight + (startY - y), cardHeight)`; pointerup / pointercancel / lostpointercapture end it. Keys per the Interfaces list; Home/End = min/max.
  - Use a thin visual grip (existing `line`/muted tokens), a `cursor-row-resize` hit area at least 8px tall straddling the bar's top border.
- [ ] **Step 4: Run** `npx vitest run tests/unit/editor` and `npx vue-tsc -b` and `npx eslint src tests/unit/editor` — Expected: PASS.
- [ ] **Step 5: Manual check** per CLAUDE.md dev setup (Vite :5173): open the editor, confirm Notes typing/AI writing, Voice generate audio / avatar toggle / whole-deck section, drag and keyboard resize, and header menu → "Narration and avatars" opens Voice; check at 1280px, 1050px and 760px widths. Report anything not verified.
- [ ] **Step 6: Commit**
```bash
git add frontend/src/components/editor/SpeakerNotes.vue frontend/src/styles/motion.css frontend/src/views/EditorView.vue frontend/tests/unit/editor/SpeakerNotes.test.ts
git commit -m "feat(frontend): tabbed, resizable Notes/Voice footer"
```
