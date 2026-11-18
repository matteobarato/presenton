# Voice in the footer, Avatar in the sidebar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The footer Voice tab keeps only speech; a new right-sidebar **Avatar** tab holds the current slide's avatar video and the deck-wide avatar settings.

**Architecture:** `useDeckNarration` / `useDeckAvatars` are created once by a renderless `DeckStateProvider` wrapped around `EditorLayout` in `EditorView`, so the footer and the sidebar inject the same instances. Existing components move; no behaviour changes.

**Tech Stack:** Vue 3 `<script setup>`, Pinia, TanStack Query, vitest + @vue/test-utils, Playwright (mocked e2e), lucide-vue-next. Run everything from `frontend/`.

**Spec:** `docs/superpowers/specs/2026-11-18-voice-footer-avatar-sidebar-design.md` (builds on `2026-11-18-notes-voice-tabbed-footer-design.md`).

## Global Constraints

- Work only in `frontend/`; never touch `servers/nextjs`. No smart-presentation features (CLAUDE.md).
- Keep the Aera look: extend additively, reuse existing classes/tokens (`rounded-card border border-white/[0.06]`, `text-[12px] font-semibold text-[#f6f8f9]`, `text-[11px] text-muted`).
- Each control lives in exactly one place: footer = voice/speech, sidebar = avatar/video/portrait/bubble. Test ids kept as-is: `slide-voice`, `slide-avatar`, `avatar-reason`, `slide-avatar-reason`, `narration-counts`, `narration-slide`, `voice-columns`.
- The working tree already has unrelated uncommitted changes (`src/slide-editor/geometry.ts`, its test, docs); `git add` only the files named in each task.
- Commit messages: `type(frontend): …`, ending with the attribution lines from the session's commit instructions (Co-Authored-By + Claude-Session).
- Gate per task: the task's tests, then `npx vue-tsc -b` and `npx eslint <touched files>` clean.

## Review Focus

- Avatar generation started in the sidebar keeps running and showing progress while the footer is closed or never opened (one shared state, not per-surface).
- Changing the narration language in the footer immediately updates the Avatar tab's language line and its blockers.
- Empty deck / no active slide: the Avatar tab renders without throwing.
- Inspector drawer (< 1050px, teleported Sheet) still reaches the provided state.
- No duplicate controls or element ids once both surfaces are mounted (`avatar-reason`, the avatar dialog).

## File Structure

- Create `src/components/editor/DeckStateProvider.vue` — creates and provides the two deck states.
- Create `src/components/editor/inspector/AvatarTab.vue` — sidebar tab: this slide + whole deck + generate dialog.
- Create `src/components/editor/inspector/video/DeckAvatarSection.vue` — deck-wide avatar settings (moved out of `DeckNarrationSection`).
- Modify `VoiceTab.vue`, `narration/DeckNarrationSection.vue`, `inspector/tabs.ts`, `stores/editor.ts`, `EditorHeader.vue`, `views/EditorView.vue`, `inspector/element/VideoSection.vue`, `canvas/floating/bars/video.ts` (comment).
- Tests: create `tests/unit/editor/helpers/deckHost.ts`, `DeckStateProvider.test.ts`, `AvatarTab.test.ts`; modify `VoiceTab.test.ts`, `editorStore.test.ts`, `tests/e2e/mocked.spec.ts`.

---

### Task 1: Lift the deck state above both surfaces

**Files:**
- Create: `src/components/editor/DeckStateProvider.vue`, `tests/unit/editor/helpers/deckHost.ts`, `tests/unit/editor/DeckStateProvider.test.ts`
- Modify: `src/views/EditorView.vue`, `src/components/editor/inspector/VoiceTab.vue`, `tests/unit/editor/VoiceTab.test.ts`

**Interfaces:**
- Produces: `DeckStateProvider` — props `{ presentationId: string; presentation: Presentation }`, default slot, no DOM of its own; calls `useDeckNarration`, `useDeckAvatars(id, deck, narration)`, `provideDeckNarration`, `provideDeckAvatars` (same wiring `VoiceTab` has today).
- Produces: `deckHost(Tab: Component): Component` in `tests/unit/editor/helpers/deckHost.ts` — a test host with props `presentationId`, `presentation`, `activeSlide` that renders `DeckStateProvider` around `Tab` and passes the three props through.
- Consumes: `provideDeckNarration`/`injectDeckNarration`, `provideDeckAvatars`/`injectDeckAvatars`.

- [ ] **Step 1: Write the failing test** `DeckStateProvider.test.ts` (mock `@/api/*` as `VoiceTab.test.ts` does): mount the provider with two child components that each call `injectDeckNarration()` and `injectDeckAvatars()`; assert both children received the *same* object (`toBe`) for each, and that mounting with no provider still throws `'useDeckNarration was not provided'`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/editor/DeckStateProvider.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement `DeckStateProvider.vue`** by moving the setup block of `VoiceTab.vue` (computed refs of the props, the two `use…` calls, the two `provide…` calls) and rendering `<slot />`.
- [ ] **Step 4: `VoiceTab.vue` injects instead of creating:** `const { language } = injectDeckNarration()`; `const { confirming, pendingIndices, generate } = injectDeckAvatars()`. Template unchanged this task.
- [ ] **Step 5: `EditorView.vue`:** wrap `<EditorLayout>…</EditorLayout>` (inside the `v-else` branch, so `presentation` is defined) in `<DeckStateProvider :presentation-id="id" :presentation="presentation">`. `ExportDialog` stays outside.
- [ ] **Step 6: `VoiceTab.test.ts`:** write `deckHost` and make `mountTab` mount `deckHost(VoiceTab)` instead of `VoiceTab` (same props; `show()`'s `setProps` keeps working).
- [ ] **Step 7: Run** `npx vitest run tests/unit/editor/DeckStateProvider.test.ts tests/unit/editor/VoiceTab.test.ts tests/unit/editor/SpeakerNotes.test.ts tests/unit/editor/EditorView.test.ts` — Expected: all PASS. If `EditorView.test.ts` fails because its `fetch` stub answers `[]` to the TTS/videos endpoints, return a minimal valid body per endpoint in that stub rather than loosening the code.
- [ ] **Step 8: Commit** — `refactor(frontend): provide deck narration and avatar state from the editor page`

### Task 2: The Avatar tab in the sidebar

**Files:**
- Create: `inspector/AvatarTab.vue`, `inspector/video/DeckAvatarSection.vue`, `tests/unit/editor/AvatarTab.test.ts`
- Modify: `src/stores/editor.ts:5` (`InspectorTabId` gains `'avatar'`), `inspector/tabs.ts`

**Interfaces:**
- Consumes: `injectDeckNarration()` (`language`, `languageName`), `injectDeckAvatars()` (`videos`, `portraitMut`, `eligibleSlides`, `placeholderSlides`, `deckRunBlocker`, `requestGenerate`, `running`, `progress`, `task`, `taskError`, `confirming`, `pendingIndices`, `generate`), `PortraitCard`, `BubblePlacer`, `SlideAvatarSection`, `GenerateAvatarsDialog`.
- Produces: `AvatarTab` — props `{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }`; `DeckAvatarSection` — same props. Tab entry `{ id: 'avatar', label: 'Avatar', icon: UserRound, component: lazy AvatarTab }` appended after Design.

- [ ] **Step 1: Write the failing tests** `AvatarTab.test.ts` — same `vi.mock` header and fixtures as `VoiceTab.test.ts`, mounted through `deckHost(AvatarTab)`. Move here (copy, then Task 3 deletes them from `VoiceTab.test.ts`) the describes *VoiceTab: avatar of the active slide*, *VoiceTab: avatars for the whole deck*, and the *uploads and removes the portrait* test, renamed `AvatarTab: …`. Add:
  - `renders this slide before the whole deck`: children of the tab root are `slide-avatar` then `Whole deck avatars` (aria-label).
  - `shows the narration language read-only and follows changes`: `[data-testid="avatar-language"]` text contains `English`; after the shared `setLanguage('it-IT')` it contains `Italian`; it contains no `<select>`.
  - `renders without an active slide`: `activeSlide: null` → no throw, no `slide-avatar`, a "Select a slide" hint.
  - `shows avatar progress for a deck run`: with a running avatar task, `[aria-label="Avatar generation progress"]` exists exactly once.
- [ ] **Step 2: Run** `npx vitest run tests/unit/editor/AvatarTab.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement `DeckAvatarSection.vue`** (`<section aria-label="Whole deck avatars">`, collapsible like `DeckNarrationSection`, `useLocalStorage('presenton.editor.deck-avatars-open', true)`, summary `"<language> · <eligible>/<placeholders> ready"`): the avatar progress block, a read-only language line (`data-testid="avatar-language"`, text "Avatars are lip-synced to <languageName>; change the language in the Voice tab"), then `PortraitCard`, the "Avatars" generate block (button, count, `avatar-reason`, error alert) and the "Voice bubble" placer — all moved verbatim from `DeckNarrationSection.vue`.
- [ ] **Step 4: Implement `AvatarTab.vue`:** `<section class="flex flex-col gap-3 px-4 py-3" aria-label="Avatar">`; with an active slide render `SlideAvatarSection` then `DeckAvatarSection`, otherwise a muted "Select a slide to edit its avatar." plus `DeckAvatarSection`; include `GenerateAvatarsDialog` bound to `confirming` exactly as `VoiceTab` does today.
- [ ] **Step 5: Register** `'avatar'` in `InspectorTabId` and `inspectorTabs` (lucide `UserRound`).
- [ ] **Step 6: Run** `npx vitest run tests/unit/editor/AvatarTab.test.ts tests/unit/editor/EditorView.test.ts` — Expected: PASS (the EditorView tab-list test reads `inspectorTabs`, so it now expects four tabs).
- [ ] **Step 7: Commit** — `feat(frontend): Avatar tab in the inspector`

### Task 3: The footer Voice tab keeps only speech

**Files:**
- Modify: `inspector/VoiceTab.vue`, `inspector/narration/DeckNarrationSection.vue`, `tests/unit/editor/VoiceTab.test.ts`

**Interfaces:**
- Produces: `DeckNarrationSection` props shrink to `{ presentation: Presentation }`; it contains language, counts, generate notes/narration, delete narration + dialog, narration progress. `VoiceTab` props unchanged (`SpeakerNotes` passes them).

- [ ] **Step 1: Update `VoiceTab.test.ts` first:** delete the avatar/portrait/deck-avatar tests now living in `AvatarTab.test.ts`; `shows only the active slide` expects 0 `[role="switch"]`; `lays the sections out as columns` expects `['slide-voice', 'Whole deck']`; add `has no avatar controls`: no `slide-avatar`, no `Presenter portrait`, no button "Generate avatars", no "Voice bubble".
- [ ] **Step 2: Run** `npx vitest run tests/unit/editor/VoiceTab.test.ts` — Expected: the new/changed tests FAIL.
- [ ] **Step 3: Implement.** `DeckNarrationSection`: remove `PortraitCard`, the "Avatars" block, the "Voice bubble" block, avatar progress/error, and the now-unused imports, props and `injectDeckAvatars`. `VoiceTab`: remove `SlideAvatarSection`, `GenerateAvatarsDialog` and the `injectDeckAvatars` use; grid becomes `@2xl:grid-cols-2`; pass only `:presentation` to `DeckNarrationSection`.
- [ ] **Step 4: Run** `npx vitest run tests/unit/editor` then `npx vue-tsc -b` — Expected: PASS, no type errors.
- [ ] **Step 5: Commit** — `refactor(frontend): footer Voice tab keeps only speech controls`

### Task 4: Entry points and copy

**Files:**
- Modify: `src/stores/editor.ts`, `src/components/editor/EditorHeader.vue:198-200`, `inspector/element/VideoSection.vue:7,39`, `canvas/floating/bars/video.ts:8`, `tests/unit/editor/editorStore.test.ts`, `tests/e2e/mocked.spec.ts`

**Interfaces:**
- Produces: `editor.openAvatar(): void` — sets `inspectorTab = 'avatar'` and `inspectorOpen = true` (mirrors `openInsert`).

- [ ] **Step 1: Write the failing test** in `editorStore.test.ts`: after `inspectorOpen = false`, `openAvatar()` leaves `inspectorTab === 'avatar'` and `inspectorOpen === true`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/editor/editorStore.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `openAvatar` in the store (and export it). In `EditorHeader.vue` replace the single "Narration and avatars" item by two: "Narration" → `editor.openFooter('voice')` and "Avatars" → `editor.openAvatar()`, each with its own lucide icon (`AudioLines`, `UserRound`).
- [ ] **Step 4: Copy:** `VideoSection.vue` text and doc comment → "Upload or generate one in the Avatar tab."; update the `video.ts` comment the same way.
- [ ] **Step 5: e2e** (`mocked.spec.ts`): after the Voice assertions, assert `slide-avatar` is absent in the footer, click the sidebar tab `Avatar`, and assert `slide-avatar` is visible; both tests' `unexpected` list must stay empty (the shared state now fetches on editor load — add any missing endpoint mocks to `mockApi`).
- [ ] **Step 6: Final gate:** `npx vue-tsc -b && npx vitest run && npx eslint . && npx playwright test tests/e2e/mocked.spec.ts` — Expected: all green. Then run the app (`docker compose -f docker-compose.frontend.yml up`) and check at < 1050px that the inspector drawer's Avatar tab works.
- [ ] **Step 7: Commit** — `feat(frontend): Narration and Avatars menu entries open their own surfaces`
