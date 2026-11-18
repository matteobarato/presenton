# Notes / Voice tabbed footer bar — design

Status: approved in conversation 2026-11-18. Size: small change.

## Intent
The speaker-notes bar under the slide becomes a two-tab bar (**Notes**, **Voice**). The sidebar's Narration tab moves into **Voice**, and the bar's height is draggable. Reason: narration is per-slide work that belongs next to the note it voices, and it frees the sidebar.

## Goals
- Footer bar with tabs Notes | Voice; clicking a tab opens the bar on it, clicking the active tab / chevron collapses it.
- Voice tab hosts everything from `NarrationTab` (slide voice, slide avatar, whole-deck section, avatar dialog), sharing one `useDeckNarration` / `useDeckAvatars` instance.
- Sidebar Narration tab removed; header "Narration and avatars" opens the bar on Voice.
- Bar height resizable by dragging its top edge (mouse/touch/keyboard); clamped so the slide stays visible.

## Non-goals / anti-goals
- No persistence across reloads (session memory only).
- No behaviour change to narration, avatar or note logic; no changes to `servers/nextjs`.
- No second copy of the note textarea (the one in `SlideVoiceSection` is dropped; Notes tab owns it).

## Approaches
Only one sensible way: extend `SpeakerNotes.vue` in place and move the existing narration components, rather than building a new panel or keeping the sidebar tab alongside. Alternatives (floating drawer, keeping both locations) duplicate state or fight the existing canvas-card layout.

## Design (builder's calls marked *call*)
- Store: replace `notesOpen` with flat refs `footerOpen`, `footerTab: 'notes'|'voice'`, `footerHeight` (*call*: flat, matching the store's style; `notesOpen` has one consumer, so no alias). Add `openFooter(tab)`.
- `SpeakerNotes.vue`: tablist header + chevron; body renders `NotesStrip` or the new `VoiceTab`; top-edge `role="separator"` handle with pointer capture and Up/Down keys; height clamped to [min, ~60% of the canvas card] (*call*); body scrolls internally.
- `VoiceTab.vue` (from `NarrationTab.vue`): columns Slide voice | Avatar | Whole deck, stacking on narrow widths; mounted on first open then kept (as Notes is today).
- `SlideVoiceSection`: remove the note textarea / "Write with AI" block; keep the voice card.
- `tabs.ts` / `InspectorTabId`: drop `'narration'`. `EditorHeader`: item calls `editor.openFooter('voice')`.
- Tests: tabs and open/close, header action, resize clamp (pure helper), sidebar tabs list.
