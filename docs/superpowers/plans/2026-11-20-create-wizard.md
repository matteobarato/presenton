# Create Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/new` → `/new/:id/outline` → editor hand-off with one stateful 7-step wizard (Topic, Look, Details, Outline, Preview, Avatar, Export) that resumes from backend state and links to and from the editor.

**Architecture:** A pure progress model derives every deck step's state from the presentation, stream, narration and avatar state. A shared shell (`WizardLayout` = step bar + body + sticky footer) hosts steps 1–3 in `NewView` (no deck yet) and steps 4–7 in a new `CreateDeckView` at `/p/:id/create/:step`, mounted inside `DeckStateProvider` so it reuses `useDeckNarration` / `useDeckAvatars`. A client-side pipeline composable chains notes → TTS → avatar generation and resumes across reloads.

**Tech Stack:** Vue 3 `<script setup>`, vue-router, @tanstack/vue-query, Pinia, shadcn-vue, Tailwind v4, Vitest + @vue/test-utils, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-20-create-wizard-design.md`

## Global Constraints

- Work only in `frontend/`. Do not modify `servers/nextjs`. No backend changes.
- Template-based generation only; no UI for smart mode (`generation_mode: "smart"`).
- Keep the Aera look: reuse `workspace-card`, `PageHeader`, the `step-panel` transition, existing colours/typography; extend, never remove.
- The wizard is the simple path: a control stays in the wizard only if it is needed to *produce* the deck; tuning controls stay in the editor and are linked with "Open in editor".
- Never a disabled primary action without a visible reason in the footer status line.
- Never start a HeyGen run twice (double click, reload, second tab).
- Step keys (exact strings): `topic | look | details | outline | preview | avatar | export`. Deck routes: `/p/:id/create/:step` with `step ∈ outline|preview|avatar|export`, route name `create`.
- Storage keys (exact): `slideshows.newDraft` (sessionStorage, New page draft), `slideshows.pipeline.<presentationId>` (sessionStorage, pipeline phase).
- Verification for every task: `cd frontend && npx vitest run <test files>`; before each commit also `npx vue-tsc -b` passes.

## Review Focus

1. A deck reopened mid-pipeline (reload during TTS) continues to avatars exactly once — pinned in Task 6 (`resumes after reload and starts avatars once`).
2. Placeholders exist but HeyGen is not configured → Export unlocks after voice only — pinned in Task 1 (`voice-only completes when generation unavailable`).
3. Typing `/p/:id/create/export` while avatars are required and missing redirects to Avatar with a reason — pinned in Task 3 (`locked step redirects to resume step`).
4. Outline edit made just before "Generate slides" is saved, not dropped — pinned in Task 4 (`flushes pending autosave before generating`).
5. A deck with zero slides opened at `/p/:id` lands on the Outline step, but a deck still streaming (`?stream=1`) does not — pinned in Task 9 (`empty deck redirects to outline step`, `streaming deck stays`).

---

### Task 1: Progress model

**Files:**
- Create: `frontend/src/components/create/wizard/progress.ts`
- Test: `frontend/tests/unit/create/wizardProgress.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type WizardStepKey = 'topic' | 'look' | 'details' | 'outline' | 'preview' | 'avatar' | 'export'
  export type DeckStepKey = 'outline' | 'preview' | 'avatar' | 'export'
  export const WIZARD_STEPS: readonly { key: WizardStepKey; label: string }[]  // labels: Topic, Look, Details, Outline, Preview, Avatar, Export
  export type StepState = 'done' | 'available' | 'locked' | 'running'
  export type AvatarRequirement = 'required' | 'optional' | 'undecided'
  export interface StepStatus { state: StepState; reason: string | null; badge: string | null }
  export interface WizardStepItem extends StepStatus { key: WizardStepKey; label: string; summary: string }
  export interface DeckProgressInput {
    slideCount: number
    outlineStreaming: boolean
    slidesStreaming: boolean
    narration: { ready: number; stale: number }        // ready counts 'ready' + 'translated'
    avatar: { placeholderSlides: number; withVideo: number; generationAvailable: boolean | undefined }
    pipelineRunning: boolean
  }
  export interface DeckProgress {
    steps: Record<DeckStepKey, StepStatus>
    avatarRequirement: AvatarRequirement             // never 'undecided' once slideCount > 0
    voiceOnly: boolean                                // placeholders exist but generationAvailable === false
    resume: DeckStepKey
  }
  export function deckProgress(i: DeckProgressInput): DeckProgress
  export function avatarHint(videosOption: string): AvatarRequirement  // '' → 'undecided', '0' → 'optional', other → 'required'
  export const AVATAR_BADGE: Record<AvatarRequirement, string>       // Required / Optional / Decided after Preview
  ```

Rules (from the spec):
- outline: `running` if `outlineStreaming`; `done` if `slideCount > 0 || slidesStreaming`; else `available`.
- preview: `locked` (reason `Generate slides from the outline first`) until outline done; `running` if `slidesStreaming`; `done` if `slideCount > 0`.
- avatar: `locked` (reason `Slides must finish generating first`) until preview done; `running` if `pipelineRunning`; required = `placeholderSlides > 0 && generationAvailable !== false`; `done` if `slideCount > 0 && narration.ready === slideCount && (!required || withVideo >= placeholderSlides)`; else `available`. Badge = `AVATAR_BADGE[avatarRequirement]`.
- export: `locked` while preview not done (same reason as avatar) or while required avatar not done, reason `` `${placeholderSlides - withVideo} slides still need their avatar` `` (singular "slide" when 1); otherwise `available`. Never `done`.
- resume: first of outline, preview, avatar whose state is not `done`; otherwise `export`. Optional avatar (not required) that is not done still counts as the resume step.

- [ ] **Step 1: Write the failing tests** — one `it` per rule above, including:
  - `fresh deck resumes at outline`: `{slideCount:0, outlineStreaming:true,…}` → `steps.outline.state === 'running'`, `resume === 'outline'`.
  - `slides streaming: preview running, avatar locked`.
  - `required avatars lock export with a count`: placeholderSlides 3, withVideo 1, generationAvailable true, all narration ready → `steps.export.reason === '2 slides still need their avatar'`, `resume === 'avatar'`.
  - `voice-only completes when generation unavailable`: placeholderSlides 2, withVideo 0, generationAvailable false, narration ready = slideCount → `steps.avatar.state === 'done'`, `voiceOnly === true`, `steps.export.state === 'available'`.
  - `stale narration reopens avatar`: narration ready 7 of 8, stale 1 → avatar `available`.
  - `no placeholders: optional and export available`.
  - `avatarHint`: `''`→undecided, `'0'`→optional, `'3'`→required.
- [ ] **Step 2: Run** `npx vitest run tests/unit/create/wizardProgress.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `progress.ts` per the interface and rules.
- [ ] **Step 4: Run** the test — expect PASS.
- [ ] **Step 5: Commit** `feat(create): wizard progress model`.

### Task 2: Wizard shell components

**Files:**
- Create: `frontend/src/components/create/wizard/WizardSteps.vue` (evolves `NewSteps.vue`, which is deleted at the end of Task 4)
- Create: `frontend/src/components/create/wizard/WizardFooter.vue`
- Create: `frontend/src/components/create/wizard/WizardLayout.vue`
- Test: `frontend/tests/unit/create/WizardShell.test.ts`

**Interfaces:**
- Consumes: `WizardStepKey`, `StepState`, `WizardStepItem`, `WIZARD_STEPS` (Task 1).
- Produces:
  - `WizardSteps` props `{ items: WizardStepItem[]; current: WizardStepKey; disabled?: boolean }`, emits `select(key: WizardStepKey)` (never for `locked` items). `WizardStepItem` comes from `progress.ts` (Task 1). Renders `data-testid="step-<key>"`, `aria-current="step"` on current, a check icon for `done`, a spinner for `running`, a lock + `title=reason` and `aria-disabled="true"` for `locked`. Responsive per spec: ≥1050 full labels + summaries; <1050 labels only for current; <520 replaced by `Step N of 7 · Label` + progress bar (`data-testid="steps-compact"`).
  - `WizardFooter` props `{ status?: string; error?: string | null; busy?: boolean }`, emits `retry`; slots `back`, `secondary`, `primary`. Status line is a `role="status"` live region; error renders an `Alert variant="destructive"` with a Retry button when a `retry` listener exists. Styling copied from today's NewView sticky footer.
  - `WizardLayout` props `{ title: string; heading: string; lede: string; items: WizardStepItem[]; current: WizardStepKey; parent?: { label: string; to: RouteLocationRaw } }`, emits `select`; default slot = step body (wrapped in `<Transition name="step-panel">` keyed by `current`), `footer` slot. Moves focus to the `h2` heading (`tabindex="-1"`) when `current` changes. Alt+ArrowLeft / Alt+ArrowRight emit `navigate('back' | 'next')`.

- [ ] **Step 1: Write failing tests**: `locked step is not selectable` (click → no `select` emitted, has `aria-disabled`), `done step shows check and is selectable`, `running step shows spinner`, `footer shows status as live region`, `footer retry emits`, `layout focuses heading on step change`, `alt+arrow emits navigate`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/create/WizardShell.test.ts` — FAIL.
- [ ] **Step 3: Implement** the three components.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(create): wizard shell (steps, footer, layout)`.

### Task 3: Deck route, view skeleton and guards

**Files:**
- Modify: `frontend/src/router.ts` (add `create` route, redirect `/new/:id/outline`, remove `outline` route)
- Create: `frontend/src/views/CreateDeckView.vue`
- Create: `frontend/src/composables/useDeckWizard.ts`
- Test: `frontend/tests/unit/create/CreateDeckView.test.ts`, extend `frontend/tests/unit/router.test.ts`

**Interfaces:**
- Consumes: `deckProgress`, `WizardLayout` (Tasks 1–2), `usePresentation`, `useOutlineStream`, `usePresentationStream`, `DeckStateProvider`, `injectDeckNarration`, `injectDeckAvatars`, `hasVideoPlaceholder`.
- Produces:
  - Route `{ path: '/p/:id/create/:step?', name: 'create', component: CreateDeckView, meta: { layout: 'app' } }`; `{ path: '/new/:id/outline', redirect: (to) => ({ name: 'create', params: { id: to.params.id, step: 'outline' }, query: to.query }) }`.
  - `useDeckWizard(id: Ref<string>, presentation: Ref<Presentation>, opts: { slidesStreaming: Ref<boolean>; outlineStreaming: Ref<boolean>; pipelineRunning: Ref<boolean> }): { progress: ComputedRef<DeckProgress>; items: ComputedRef<WizardStepItem[]> }` — must be called inside `DeckStateProvider`; builds `DeckProgressInput` from `injectDeckNarration().counts` and `injectDeckAvatars()` (`placeholderSlides.length`, count of placeholder slides with `videoBySlide.get(s.id)`, `videos.generation_available`). Items for topic/look/details are `done` with summaries from the presentation (topic = clipped `content`; look = template name or `Template` fallback; details = `${n_slides} slides · ${tone} · ${verbosity}`).
  - `CreateDeckView` loads the presentation (same loading/not-found/error states as EditorView), wraps in `DeckStateProvider`, renders `WizardLayout` and one step component per `step` param via a `#step-<key>` placeholder section (steps filled by Tasks 4, 5, 7, 8). Missing `step` param or unknown step → `router.replace` to `progress.resume`. Requested step `locked` → `router.replace` to `progress.resume` + `toast` with the step's `reason`. Steps topic/look/details selected from the bar open a read-only summary panel (`data-testid="summary-<key>"`) inside the same layout.

- [ ] **Step 1: Write failing tests**: router `old outline url redirects to create/outline keeping query`; view `missing step resumes`, `locked step redirects to resume step` (deck with 3 placeholder slides, no videos, request `export` → lands on `avatar`, toast called with `3 slides still need their avatar`), `read-only summary for topic`, `not found shows message`. Mock `@/api/presentations`, `@/api/tts`, `@/api/videos` following `tests/unit/editor/DeckStateProvider.test.ts`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/create/CreateDeckView.test.ts tests/unit/router.test.ts` — FAIL.
- [ ] **Step 3: Implement** route, `useDeckWizard`, `CreateDeckView`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(create): deck wizard route with resume and locked-step guards`.

### Task 4: Steps 1–3 in the shell (`NewView`)

**Files:**
- Modify: `frontend/src/views/NewView.vue`
- Create: `frontend/src/components/create/wizard/useNewDraft.ts`
- Delete: `frontend/src/components/create/NewSteps.vue`
- Test: `frontend/tests/unit/create/NewView.test.ts` (update)

**Interfaces:**
- Consumes: `WizardLayout`, `WizardFooter`, `WIZARD_STEPS`, `avatarHint`, `AVATAR_BADGE`.
- Produces: `useNewDraft(prompt: Ref<string>, options: Ref<CreateOptions>): { clear(): void; hadFiles: Ref<boolean> }` — restores from and writes to `sessionStorage['slideshows.newDraft']` as `{ prompt, options, hadFiles }` (try/catch around storage); `clear()` removes the key.
- NewView behaviour changes:
  - Items: topic/look/details from page state; outline/preview/export `locked` with reason `Create the outline first`; avatar `locked` with `badge = AVATAR_BADGE[avatarHint(options.videos)]`.
  - Look primary "Continue" disabled until a template is chosen; footer status `Pick a template to continue`. Theme stays optional.
  - Details primary "Create outline" (submit). Disabled reasons, in order: `Add a topic or a document` (with a button to go to Topic), `Pick a template` (button to Look). Upload/decompose stages show in the footer status.
  - On success: `useNewDraft().clear()`, then `router.push({ name: 'create', params: { id, step: 'outline' }, query: { template, theme? } })`.
  - If a restored draft had files: Topic shows `Re-add your documents; files aren't kept after a reload.`

- [ ] **Step 1: Update/add failing tests**: `look requires a template` (primary disabled + status text), `submit navigates to create outline with template`, `draft survives remount` (type prompt, remount → prompt restored), `draft cleared after create`, `avatar badge follows videos option` (`'0'` → `Optional`, `'2'` → `Required`, `''` → `Decided after Preview`). Replace the `outline` stub route in `mountView` with `{ path: '/p/:id/create/:step?', name: 'create', component: view }`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/create/NewView.test.ts` — FAIL.
- [ ] **Step 3: Implement** `useNewDraft` and rework `NewView` onto `WizardLayout`; delete `NewSteps.vue` and its imports.
- [ ] **Step 4: Run** — PASS. Also `npx vitest run tests/unit/AppShell.test.ts` (it may reference the new page) — PASS.
- [ ] **Step 5: Commit** `feat(create): topic, look and details in the wizard shell`.

### Task 5: Outline step

**Files:**
- Create: `frontend/src/components/create/steps/OutlineStep.vue` (logic moved from `OutlineView.vue`)
- Create: `frontend/src/components/create/steps/RegenerateDialog.vue`
- Modify: `frontend/src/components/create/OutlineList.vue`, `OutlineItem.vue` (card visuals: number, title line, muted preview; editing visually secondary)
- Modify: `frontend/src/views/CreateDeckView.vue` (mount OutlineStep for `outline`)
- Delete: `frontend/src/views/OutlineView.vue`
- Test: move `frontend/tests/unit/create/OutlineView.test.ts` → `OutlineStep.test.ts`

**Interfaces:**
- Consumes: `useOutlineStream`, `saveOutline`, `preparePresentation`, `MAX_OUTLINE_SLIDES`, `updatePresentation`, `withSourceTheme`, `useTemplateLayouts`, `useThemeParam`, `WizardFooter`.
- Produces: `OutlineStep` props `{ presentation: Presentation }`, emits `streaming(boolean)` (feeds `outlineStreaming` in Task 3). Template comes from `route.query.template` (required; if absent, footer error `No template chosen — start a new deck` and primary disabled). No template/theme pickers; side summary shows `TemplateCardThumb` + theme swatch with `Theme can be changed later`.
- Save indicator `data-testid="outline-save"`: `Saving…` / `Saved` / error text + Retry.
- Primary `Generate slides`: flush pending autosave, `preparePresentation`, apply theme (existing logic and toasts), then `router.replace({ name: 'create', params: { id, step: 'preview' }, query: { stream: '1' } })`.
- When `presentation.slides.length > 0`: list read-only, primary `Continue to Preview`, secondary `Regenerate slides from outline…` → `RegenerateDialog` (copy: `Regenerating replaces every slide. Slide edits, narration and avatars will be lost.`, confirm `Regenerate slides`) → unlocks editing; Generate then proceeds as above.

- [ ] **Step 1: Port tests and add failing ones**: `no template pickers on the outline step`, `flushes pending autosave before generating` (edit, click Generate inside debounce → `saveOutline` called before `preparePresentation`), `generate goes to preview with stream flag`, `deck with slides is read-only until regenerate is confirmed`, `over the slide limit disables generate with reason`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/create/OutlineStep.test.ts` — FAIL.
- [ ] **Step 3: Implement** OutlineStep, RegenerateDialog, card visuals; wire into CreateDeckView; delete OutlineView.
- [ ] **Step 4: Run** the test plus `tests/unit/create/CreateDeckView.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat(create): redesigned outline step`.

### Task 6: Narration → avatar pipeline composable

**Files:**
- Create: `frontend/src/composables/useNarrationAvatarPipeline.ts`
- Test: `frontend/tests/unit/create/useNarrationAvatarPipeline.test.ts`

**Interfaces:**
- Consumes: `DeckNarration` (`generateNotes`, `startTts`, `running`, `taskError`, `counts`, `stateOf`, `canStart`), `DeckAvatars` (`generate`, `pendingIndices`, `eligibleSlides`, `running`, `taskError`, `deckRunBlocker`, `videos`, `planBySlide`), presentation.
- Produces:
  ```ts
  export type PipelinePhase = 'idle' | 'notes' | 'voice' | 'avatars' | 'done' | 'error'
  export function useNarrationAvatarPipeline(id: Ref<string>, presentation: Ref<Presentation>, narration: DeckNarration, avatars: DeckAvatars): {
    phase: Ref<PipelinePhase>
    failedPhase: Ref<'notes' | 'voice' | 'avatars' | null>
    error: Ref<string | null>
    running: ComputedRef<boolean>            // phase in notes|voice|avatars, or either server task running
    plan: ComputedRef<{ notes: boolean; voice: boolean; avatars: number }>  // what start() would run
    blocker: ComputedRef<string | null>      // first unmet requirement: language, then portrait (only if avatars would run), else null
    start(): void                            // no-op when running or blocker
    retry(): void                            // restarts from failedPhase
  }
  ```
- Behaviour: `notes` runs `generateNotes` only if some slide has an empty `speaker_note`; `voice` runs `startTts.mutate({})` only if any slide is `missing`/`stale` and waits until `narration.running` goes false; error if `narration.taskError`. `avatars` runs only if required and `generation_available !== false`: set `avatars.pendingIndices.value = eligibleSlides.map(s => s.index)`, `avatars.generate.mutate(false)`, wait for `avatars.running` false. Retry of failed slides: `plan.avatars` counts placeholder slides whose plan state is `failed` or that have no video.
- Persistence: write `sessionStorage['slideshows.pipeline.<id>'] = JSON.stringify({ phase })` on each phase change; remove on `done`/`error`. On creation: if the key exists, set `phase` from it and, once the corresponding server task stops running, continue to the next phase. If no key but a server task runs, `running` is true and nothing chains.

- [ ] **Step 1: Write failing tests** with fake reactive narration/avatars objects (refs + `vi.fn` mutates): `runs notes, voice, then avatars in order`, `skips notes when every slide has notes`, `skips avatars when generation unavailable`, `stops and reports failed phase on tts error`, `retry restarts from failed phase`, `start is a no-op while running` (call twice → `generate.mutate` once), `resumes after reload and starts avatars once` (pre-set storage `{phase:'voice'}`, narration.running true→false → `generate.mutate` called exactly once), `blocker asks for portrait only when avatars would run`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/create/useNarrationAvatarPipeline.test.ts` — FAIL.
- [ ] **Step 3: Implement** with `watch` on the running flags; no timers.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(create): chained notes, voice and avatar pipeline`.

### Task 7: Preview step

**Files:**
- Create: `frontend/src/components/create/steps/PreviewStep.vue`, `frontend/src/components/create/steps/SlideLightbox.vue`
- Modify: `frontend/src/views/CreateDeckView.vue` (mount for `preview`; pass `slidesStreaming`)
- Test: `frontend/tests/unit/create/PreviewStep.test.ts`

**Interfaces:**
- Consumes: `usePresentationStream(id, enabled)` (`status`, `metrics`), `GenerationMetrics`, `SlideView`, `provideDeckAnimationRun` + `animateFlagKey` (same `planMotionIfRequested` logic as EditorView — extract it into `frontend/src/composables/usePlanMotionAfterGeneration.ts` with signature `usePlanMotionAfterGeneration(id: Ref<string>, status: Ref<StreamStatus>): { planning: Ref<boolean> }` and use it in both EditorView and PreviewStep), `hasVideoPlaceholder`, `DeckProgress`.
- Produces: `PreviewStep` props `{ presentation: Presentation; progress: DeckProgress }`, emits `streaming(boolean)`. Stream enabled when `route.query.stream` is `1`/`true`; on `done` the flag is removed from the query.
- While streaming: grid of `presentation.n_slides` slots, generated slides rendered, remaining as skeletons; footer status `Generating slide ${k} of ${n}…`.
- Done: grid of `SlideView` thumbs (button, `aria-label="Open slide N"`), `Presenter` marker on placeholder slides, click → `SlideLightbox` (prev/next buttons, ←/→ keys, Esc closes).
- Footer: secondary `Edit slides` (→ `{ name: 'editor', params: { id } }`), ghost `Present`, primary `Looks good — continue to Avatar` (required/undecided) or `Continue` + link `Skip to Export` (optional). Stream error → footer error with Retry (re-enable stream).

- [ ] **Step 1: Write failing tests**: `skeleton slots while streaming`, `removes stream flag when done`, `presenter marker on placeholder slides`, `lightbox navigates with arrow keys`, `edit slides opens editor`, `optional avatar shows skip to export`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/create/PreviewStep.test.ts` — FAIL.
- [ ] **Step 3: Implement** PreviewStep, SlideLightbox, `usePlanMotionAfterGeneration`; switch EditorView to the extracted composable.
- [ ] **Step 4: Run** the test plus `tests/unit/editor/EditorView.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat(create): preview step with live generation and lightbox`.

### Task 8: Avatar and Export steps

**Files:**
- Create: `frontend/src/components/create/steps/AvatarStep.vue`, `frontend/src/components/create/steps/ExportStep.vue`
- Modify: `frontend/src/views/CreateDeckView.vue` (mount both; feed `pipelineRunning` from the pipeline)
- Test: `frontend/tests/unit/create/AvatarStep.test.ts`, `frontend/tests/unit/create/ExportStep.test.ts`

**Interfaces:**
- Consumes: `useNarrationAvatarPipeline` (Task 6), `injectDeckNarration`, `injectDeckAvatars`, `TtsLanguageSelect`, `PortraitHero`, `AvatarChip`/`chipOf`, `narrationState`, `ExportOptions`, `DeckProgress`.
- Produces: `AvatarStep` props `{ presentation: Presentation; progress: DeckProgress }`, emits `running(boolean)`. `ExportStep` props `{ presentation: Presentation }`.
- AvatarStep layout: Setup checklist (`data-testid="avatar-setup"`) — language ✓/✗, portrait ✓/✗ (only when `plan.avatars > 0`), avatar service (warning `Placeholder slides will use the voice bubble` when `progress.voiceOnly`), summary `${n} slides narrated · ${m} with a presenter avatar`. Slides column: read-only list with voice state + avatar chip. Progress view with three segments Notes/Voice/Avatars (`data-testid="pipeline-<phase>"`), each pending/running/done/skipped. Footer primary `Generate voice & avatars` / `Generate voice` (from `plan`), disabled with `blocker`; status line states the run (`Will narrate 8 slides and render 3 avatars with HeyGen`) or the live phase plus `You can leave this page; we'll keep going.`; error → Retry calls `retry()`. Stale narration → `${k} slides out of date` with `Update` = `start()`. Done → link `Fine-tune voice and avatars in the editor`, primary `Continue to Export`. Optional → secondary `Skip` → export.
- ExportStep: title line (`presentation.title · N slides`), embedded `ExportOptions`, links Present / Open in editor / Back to library. Footer shows Back only.

- [ ] **Step 1: Write failing tests**: AvatarStep `generate disabled with language reason`, `portrait required only when avatars will run`, `voice-only warning when generation unavailable`, `generate starts the pipeline once`, `done shows continue to export`, `optional shows skip`; ExportStep `renders export options and present link`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/create/AvatarStep.test.ts tests/unit/create/ExportStep.test.ts` — FAIL.
- [ ] **Step 3: Implement** both steps and wire them into CreateDeckView.
- [ ] **Step 4: Run** — PASS, plus `tests/unit/create/CreateDeckView.test.ts`.
- [ ] **Step 5: Commit** `feat(create): avatar and export steps`.

### Task 9: Editor integration

**Files:**
- Modify: `frontend/src/components/editor/EditorHeader.vue` (Continue button + Setup menu entries)
- Modify: `frontend/src/views/EditorView.vue` (empty-deck redirect)
- Test: `frontend/tests/unit/editor/EditorView.test.ts`, new `frontend/tests/unit/editor/EditorHeaderContinue.test.ts`

**Interfaces:**
- Consumes: `useDeckWizard` (Task 3; EditorHeader is already inside `DeckStateProvider`), `WIZARD_STEPS`.
- Produces: header button `data-testid="continue-setup"` labelled `Continue: <Label>` routing to `{ name: 'create', params: { id, step: progress.resume } }`; hidden when `resume === 'export'` and `steps.avatar.state === 'done'`. Dropdown section "Setup" with one item per deck step (locked ones disabled with reason). EditorView: once loaded, `slides.length === 0` and no `stream` query → `router.replace({ name: 'create', params: { id, step: 'outline' } })`.

- [ ] **Step 1: Write failing tests**: `continue button points at resume step`, `hidden when deck is complete`, `empty deck redirects to outline step`, `streaming deck stays`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/editor/EditorHeaderContinue.test.ts tests/unit/editor/EditorView.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(editor): continue setup in the wizard`.

### Task 10: End-to-end journey and full check

**Files:**
- Modify: `frontend/tests/e2e/mocked.spec.ts` (+ fixtures under `tests/e2e/fixtures` as needed)

- [ ] **Step 1: Add e2e test** `wizard: topic → export with resume from editor`: fill topic, pick template, create outline (mocked stream), generate slides, preview grid visible, `Edit slides` → editor, `Continue: Avatar` → avatar step, generate (mocked TTS + avatar tasks complete), Export step shows export options. Plus `export url redirects to avatar while avatars are missing`.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/mocked.spec.ts -g wizard` — PASS (fix mocks, not assertions).
- [ ] **Step 3: Run full check** `npm run check` — vue-tsc, all vitest, eslint pass.
- [ ] **Step 4: Visual check** with the dev stack (`docker compose -f docker-compose.frontend.yml up`) at 1440, 1024, 760, 400px widths: step bar responsive modes, sticky footer, no horizontal scroll.
- [ ] **Step 5: Commit** `test(e2e): create wizard journey`.
