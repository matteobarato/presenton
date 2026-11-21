# Wizard Avatar & Language Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Avatar-photo and Language steps after Topic in the create wizard; no photo ⇒ presenter-video count locked to None.

**Architecture:** Two new pre-create step keys (`presenter`, `language`) handled in `NewView.vue`. The chosen photo is held in memory and uploaded with `uploadPortrait` right after `createPresentation`. The existing post-Preview step keeps its route key `avatar` but is labelled "Narration" and loses portrait/language setup.

**Tech Stack:** Vue 3, Vite, TypeScript, Vitest, Tailwind v4, shadcn-vue (all in `frontend/`).

**Spec:** `docs/superpowers/specs/2026-11-21-wizard-avatar-language-steps-design.md`

## Global Constraints
- Template-based generation only; do not touch `servers/nextjs` or add smart-presentation features.
- Keep Aera look & feel: reuse `PortraitHero`, existing card/chip classes; extend additively.
- Photo types: JPEG/PNG/WebP, ≤ 10 MB (the copy already in `PortraitHero`).
- No photo ⇒ `options.videos === '0'` and the videos control disabled, hint "Add an avatar photo to use presenter slides".
- Route key of the post-Preview step stays `avatar` (URLs, `DeckStepKey` unchanged); only its label becomes "Narration".

## Review Focus
- Photo picked, then removed: videos returns to Auto (`''`) only if it was forced; user-chosen counts are not lost silently.
- Photo upload fails after deck creation: deck still opens (outline); user sees a non-blocking message, can add the photo in Narration/editor.
- Reload mid-wizard: draft restores options but the photo is gone; the Avatar step shows the "re-add" note and videos is forced to None.
- Documents + Auto language: submit jumps to the Language step (not Details) and focuses `#opt-language`.
- Oversized / wrong-type file is rejected with a message, not stored.

---

### Task 1: Step model and `forcedVideos` option logic

**Files:**
- Modify: `frontend/src/components/create/wizard/progress.ts`, `frontend/src/components/create/options.ts`
- Test: `frontend/tests/unit/create/wizardProgress.test.ts`, `frontend/tests/unit/create/options.test.ts` (create if absent)

**Interfaces:**
- Produces: `WizardStepKey` gains `'presenter' | 'language'`; `WIZARD_STEPS` = topic("Topic & look"), presenter("Avatar"), language("Language"), details("Details"), outline, preview, avatar("Narration"), export. `export const PHOTO_MAX_BYTES = 10 * 1024 * 1024`, `export function validatePortrait(file: File): string | null` (error text or null; accepts image/jpeg|png|webp ≤ PHOTO_MAX_BYTES) in `options.ts`. `export function effectiveVideos(videos: string, hasPhoto: boolean): string` → `'0'` when `!hasPhoto`, else `videos`. `avatarHint` takes the effective value (unchanged).

- [ ] **Step 1: Write failing tests** — `WIZARD_STEPS.map(s => s.key)` equals the order above and the `avatar` label is `'Narration'`; `effectiveVideos('', false) === '0'`, `effectiveVideos('3', false) === '0'`, `effectiveVideos('3', true) === '3'`; `validatePortrait` returns null for a 1 MB png, a message for a gif and for an 11 MB jpeg.
- [ ] **Step 2: Run** `cd frontend && npx vitest run tests/unit/create/wizardProgress.test.ts tests/unit/create/options.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** the types/consts/functions above; update existing step-count tests (6 → 8 steps) and the "seven-step" comment in `WizardSteps.vue`.
- [ ] **Step 4: Run** the same command — expect PASS.
- [ ] **Step 5: Commit** `feat(create): step model for avatar and language steps`.

### Task 2: Presenter and Language step components

**Files:**
- Create: `frontend/src/components/create/PresenterPicker.vue`, `frontend/src/components/create/LanguagePicker.vue`
- Modify: `frontend/src/components/create/GenerationOptions.vue` (remove Language card; add prop `hasPhoto: boolean`; videos fieldset renders Auto/None chips + number input `disabled` and `aria-checked` on None when `!hasPhoto`, with the hint above)
- Test: `frontend/tests/unit/create/PresenterPicker.test.ts`, `LanguagePicker.test.ts`, `GenerationOptions.test.ts`

**Interfaces:**
- Consumes: `validatePortrait` (Task 1); `PortraitHero.vue` props `portrait: Portrait | null | undefined`, `busy`, emits `upload(file)`, `remove`.
- Produces: `PresenterPicker` — `defineModel<File | null>()`, emits `error: [message: string]`; shows a preview via `URL.createObjectURL` (revoked on change/unmount), reuses the `PortraitHero` visual by passing `{ url: objectUrl }` as portrait; includes a "Skip, no avatar" note. `LanguagePicker` — `defineModel<string>()`, props `disabled?`, renders the `#opt-language` select moved verbatim from `GenerationOptions.vue`.

- [ ] **Step 1: Write failing tests** — picker: choosing a valid file sets the model; an invalid file emits `error` and leaves model null; remove sets null. Language: change emits update. GenerationOptions: with `hasPhoto=false` the videos "None" radio is checked and every videos control is disabled with the hint text; with `true` the Auto/None/count chips work as before; no `#opt-language` in it.
- [ ] **Step 2: Run** `npx vitest run tests/unit/create/PresenterPicker.test.ts tests/unit/create/LanguagePicker.test.ts tests/unit/create/GenerationOptions.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** the components and the `GenerationOptions` change.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(create): presenter and language pickers`.

### Task 3: Wire steps into `NewView.vue`

**Files:**
- Modify: `frontend/src/views/NewView.vue`, `frontend/src/components/create/wizard/useNewDraft.ts` (add `hadPhoto` flag alongside `hadFiles`; photo itself is never stored)
- Test: `frontend/tests/unit/create/NewView.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `uploadPortrait(id: string, file: File)` from `@/api/videos`.
- Produces: `NewStepKey = 'topic' | 'presenter' | 'language' | 'details'`; `ORDER` in that order; `portrait = ref<File | null>(null)`; `hasPhoto = computed(() => !!portrait.value)`.

- [ ] **Step 1: Write failing tests** — (a) Topic → Next shows Avatar step, Next again shows Language, then Details; (b) Avatar step can be skipped with Next without a photo; (c) with no photo the Details videos control is disabled/None and `createPresentation` is called with `n_videos: 0`; (d) with a photo and videos `''`, `n_videos` is `null` and `uploadPortrait(newId, file)` is called after create and before navigation; (e) `uploadPortrait` rejection still navigates to the outline and shows a toast/message; (f) documents + Auto language → submit moves to Language step and focuses `#opt-language`; (g) draft restore with `hadPhoto` shows the re-add note and forces None; (h) step summaries: Avatar shows file name or "No avatar", Language shows chosen language.
- [ ] **Step 2: Run** `npx vitest run tests/unit/create/NewView.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** — extend `ORDER`/`copy`/`items` (summaries as in (h); `mine()` helper for the new keys; Avatar badge from `AVATAR_BADGE[avatarHint(effectiveVideos(o.videos, hasPhoto))]`), render `PresenterPicker`/`LanguagePicker` in `#new-form`, remove the language-needed link target `go('details')` → `go('language')`, `advance()` steps through `ORDER` (topic still requires a template), `submit()` sends `n_videos: mediaCountForRequest(effectiveVideos(...))` and uploads the portrait in its own try/catch after create. Primary "Create outline" button stays on the last step (Details); Language step and Avatar step show Next.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(create): avatar and language steps before details`.

### Task 4: Narration step cleanup

**Files:**
- Modify: `frontend/src/components/create/steps/AvatarStep.vue`, `frontend/src/components/create/wizard/DeckWizard.vue` (`copy.avatar` heading → "Narration"), `frontend/src/composables/useDeckWizard.ts` if labels are duplicated there
- Test: `frontend/tests/unit/create/AvatarStep.test.ts`, `WizardShell.test.ts`, `CreateDeckView.test.ts`

**Interfaces:**
- Consumes: Task 1 labels. Produces: AvatarStep setup view shows a read-only summary row (language name; presenter thumbnail if set) with a `Settings` button opening the existing editing controls (`TtsLanguageSelect`, `PortraitHero`) so they remain changeable but are no longer the primary setup.

- [ ] **Step 1: Update/write failing tests** — step label reads "Narration"; setup view shows summary rows; clicking Settings reveals the language select and portrait hero; generation behaviour tests unchanged.
- [ ] **Step 2: Run** `npx vitest run tests/unit/create` — expect FAIL on changed assertions.
- [ ] **Step 3: Implement** the summary + collapsible settings (reuse the existing `editing` ref pattern); keep the pipeline blocker logic (`languageOk`, `portraitOk`) intact so a missing portrait still blocks avatar generation when placeholders exist.
- [ ] **Step 4: Run** `npx vitest run && npx vue-tsc --noEmit` — expect all PASS, no type errors.
- [ ] **Step 5: Commit** `refactor(create): narration step keeps language/portrait as settings`.

## Self-review
Spec coverage: flow/steps (T1,T3), Avatar step (T2,T3), Language step (T2,T3), Details lock (T2,T3), Narration rename (T1,T4). Names consistent: `effectiveVideos`, `validatePortrait`, `PresenterPicker`, `LanguagePicker`, step keys `presenter`/`language`.
