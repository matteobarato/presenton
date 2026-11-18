# Motion editor (entrance animations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slide entrance animations that the AI generates, the user edits and previews in the Vue editor, and the export plays exactly as previewed.

**Architecture:** Persist one plan per slide in `slides.animation`, served by a new `animations` API. The editor adds a Motion inspector tab and a Motion footer tab (timeline). It previews with a paused GSAP timeline on the live slide DOM, built exactly as the export builds it. The export reads stored plans instead of caching to a file.

**Tech Stack:** FastAPI + SQLModel + Alembic + pytest (`servers/fastapi`); Vue 3 + Pinia + vue-query + vitest + Playwright (`frontend`); `gsap` (new frontend dependency).

**Spec:** `docs/superpowers/specs/2026-11-18-vue-frontend-motion-editor-design.md` (backend half: `docs/superpowers/specs/2026-11-05-persistent-slide-animations-design.md`, whose staleness table and API table apply verbatim).

## Global Constraints

- Entrance only. Timeline window 0–2.5 s (`SLIDE_ANIMATION_MAX_SECONDS`); tween duration 0.2–1.2 s; at most 24 tweens; one tween per target.
- Tween shape `{target, from_values, duration, delay, ease}`; `from_values` keys limited to `opacity, x, y, scale, rotation, blur` with `ANIMATION_PROPERTIES` ranges; `ease` from `ANIMATION_EASES`. The backend validator is authoritative.
- Targets are `e0…eN` (layer order). Editor DOM selector: `[data-hf-el="eN"]` inside the `TemplateSlideHost` shadow root; the export's is `[data-hf-el="s{slide}-eN"]`.
- Preview GSAP calls equal `hyperframes_composition._tween_vars`: `blur` → `filter: blur(Npx)` → `blur(0px)`; every other property tweens from its value to its neutral; position on the timeline is `delay`.
- Template slides only; smart slides are status `unsupported` (CLAUDE.md). Do not touch `servers/nextjs`.
- `prefers-reduced-motion`: preview animates opacity only.
- Keep the Aera look (extend additively, no new colours); reuse existing tokens/classes.
- Alembic current head: `b3c5d7e9f1a4`.
- Commit messages end with the trailer lines the session attribution reminder specifies.

## Review Focus

- A slide whose element list changes after a hand edit: plan is re-planned and `reset_from_user` shown, never silently applied to wrong targets (Tasks 2, 9).
- Dragging a clip past 2.5 s, or typing a duration of 0 or 99: clamped, never saved out of range (Tasks 5, 10).
- Slide with zero animatable elements, or a smart slide: Motion tabs show an empty/"not animatable" state, no crash, no request (Tasks 8, 9, 10).
- Switching slide or tab mid-preview: slide DOM is restored, no leaked timeline (Tasks 6, 10).
- Save fails (422/502/offline): draft kept, inline error, preview still works (Task 8).

---

## Backend

### Task 1: `slides.animation` column

**Files:**
- Create: `servers/fastapi/alembic/versions/c4d6e8f0a2b3_add_slide_animation.py` (down_revision `b3c5d7e9f1a4`)
- Modify: `servers/fastapi/models/sql/slide.py`, `servers/fastapi/migrations.py` (add an `animation` `_has_column` readiness check beside `slide_ui_ready`, following the existing pattern), `servers/fastapi/services/presenton_cloud_persistence.py` (read/write `animation` next to `ui`)
- Test: `servers/fastapi/tests/unit/test_migrations.py`, `servers/fastapi/tests/unit/test_slide_model.py` (create)

**Interfaces:**
- Produces: `SlideModel.animation: Optional[dict]` (JSON, nullable, default None); `get_new_slide` deep-copies it.

- [ ] **Step 1:** Write failing tests: `test_slides_have_animation_column_after_upgrade` (follow the existing column-after-upgrade tests in `test_migrations.py`) and `test_get_new_slide_deep_copies_animation` (mutating the copy's `animation["tweens"]` leaves the original unchanged).
- [ ] **Step 2:** Run `cd servers/fastapi && uv run pytest tests/unit/test_migrations.py tests/unit/test_slide_model.py -q`; expect FAIL.
- [ ] **Step 3:** Add the field, the Alembic revision, the `migrations.py` readiness check and the cloud-persistence read/write.
- [ ] **Step 4:** Re-run the same command plus `uv run alembic heads` (expect one head, `c4d6e8f0a2b3`); expect PASS.
- [ ] **Step 5:** Commit `feat(db): slides.animation column`.

### Task 2: `slide_animation_service`

**Files:**
- Create: `servers/fastapi/services/slide_animation_service.py`
- Test: `servers/fastapi/tests/unit/test_slide_animation_service.py`

**Interfaces:**
- Consumes: `generate_slide_animations`, `validate_slide_animation`, `fallback_slide_animation`, `SlideTween`, `SLIDE_ANIMATION_MAX_SECONDS` from `utils.llm_calls.generate_slide_animations`; `_fetch_video_composition(presentation_id, cookie_header) -> dict` from `services.presentation_video_service` (move it here, leave a re-export import there so the video service and its tests keep working). Composition entry shape: `{"id", "index", "html", "elements": [{"id","kind","box","text"}]}`.
- Produces:
  - `PlanStatus = Literal["fresh","stale_content","stale_layout","missing","unsupported"]`
  - `targets_signature(elements: Sequence[dict]) -> str` (sha256 of ordered `[id, kind]`)
  - `plan_status(stored: Optional[dict], entry: dict) -> PlanStatus` (pure; rules = the staleness table in the 2026-11-05 spec; `unsupported` when `entry["html"]` is falsy)
  - `set_user_animation(slide: SlideModel, entry: dict, tweens: list[dict]) -> dict` — `tweens` in stored shape; flattens `from_values` to the validator's raw shape (`opacity,x,y,scale,rotation,blur` keys), validates against the entry's element ids, stores `source:"user"`, `reset_from_user:false`; raises `AnimationValidationError` when tweens were sent and none survive; `[]` is valid.
  - `async resolve_slide_animations(sql_session, presentation, cookie_header, *, slide_ids=None, force=False, on_progress=None) -> dict[UUID, dict]` (stored-plan dicts for in-scope slides that have one). Stale `user` plans: content-only change → keep, re-validate, update `html_hash`; layout change → re-plan, `reset_from_user: true`. Fallback plans are re-planned under `force`. Adopt `animation-plans.json` entries when `slide.animation` is None and `html_hash` matches (as `source:"llm"`).
  - Stored plan dict: `{version:1, source, html_hash, targets_signature, tweens:[SlideTween.to_dict()], reset_from_user, updated_at}`.

- [ ] **Step 1:** Write failing tests, LLM stubbed with a call counter: one parametrized `test_plan_status` covering every cell of the staleness table; `test_resolve_plans_only_missing_and_stale`; `test_force_replans_user_plans_and_sets_nothing_silently`; `test_layout_change_resets_user_plan_and_flags_it`; `test_legacy_file_adopted_only_on_hash_match`; `test_set_user_animation_clamps_to_window` (a tween with `delay=2.4, duration=1.2` ends ≤ 2.5); `test_set_user_animation_rejects_all_unknown_targets`; `test_set_user_animation_empty_list_valid`.
- [ ] **Step 2:** Run `uv run pytest tests/unit/test_slide_animation_service.py -q`; expect FAIL (module missing).
- [ ] **Step 3:** Implement the module as specified. Commit per slide inside one transaction; `on_progress` receives `{"stage":"animation-plan","done":int,"total":int}`.
- [ ] **Step 4:** Re-run the file plus `tests/unit/test_presentation_video_service.py -q`; expect PASS.
- [ ] **Step 5:** Commit `feat(animations): persisted slide animation service`.

### Task 3: `animations` endpoints

**Files:**
- Create: `servers/fastapi/api/v1/ppt/endpoints/slide_animations.py`, `servers/fastapi/models/slide_animation.py` (Pydantic request/response models)
- Modify: `servers/fastapi/api/v1/ppt/router.py` (include before `PRESENTATION_ROUTER`, like `SLIDE_AVATARS_ROUTER`), `servers/fastapi/openai_spec.json` (regenerate the way the repo already does; check `git log -3 -- servers/fastapi/openai_spec.json` for the command)
- Test: `servers/fastapi/tests/unit/test_slide_animations_endpoints.py`

**Interfaces:**
- Consumes: Task 2 functions; `build_export_cookie_header`, `_presentation_with_slides_for_speaker_notes`, `_slide_at_index` from `api.v1.ppt.endpoints.presentation`; `AsyncTaskModel` pattern from `slide_avatars.py`.
- Produces (paths under `/api/v1/ppt/presentation/{id}`):
  - `GET /animations` → `{slides: [{slide_id, index, status, source|null, reset_from_user, tweens: [SlideTween dict], targets: [{id,kind,box,text}]}]}`
  - `POST /animations` body `{slide_indexes?: int[], force?: bool}` → same shape
  - `POST /animations/async` → `AsyncTaskModel`, type `presentation.animations`, `data` carries per-slide `done/total`
  - `PUT /animations/{slide_index}` body `{tweens: [{target, from_values, duration, delay, ease}]}` → the slide's entry (above); 422 on `AnimationValidationError` or `unsupported`
  - `DELETE /animations/{slide_index}` → 204
  - Errors: composition fetch failure → 502 with upstream detail; unknown slide/presentation → 404.

- [ ] **Step 1:** Write failing tests with the composition fetch mocked: GET shape and statuses; POST scope with and without `force`; PUT returns normalized tweens, 422 for all-unknown targets and for an `unsupported` slide; DELETE then GET shows `missing`; 404s; 502; async task type and progress.
- [ ] **Step 2:** Run `uv run pytest tests/unit/test_slide_animations_endpoints.py -q`; expect FAIL.
- [ ] **Step 3:** Implement the router and models; regenerate `openai_spec.json`.
- [ ] **Step 4:** Re-run; expect PASS. Also run `uv run pytest tests/unit -q -k "openapi or spec"` if such tests exist.
- [ ] **Step 5:** Commit `feat(animations): animations API`.

### Task 4: Export uses stored plans; `animate` on generation

**Files:**
- Modify: `servers/fastapi/services/presentation_video_service.py` (`_build_animated_video` calls `resolve_slide_animations`; delete `_resolve_animation_plans` and the cache write path; keep `animation-plan` progress stage and the file's deletion on deck delete), `servers/fastapi/models/generate_presentation_request.py` (`animate: bool = False`), `servers/fastapi/api/v1/ppt/endpoints/presentation.py` (`generate_presentation_handler` resolves after slides commit when true, using the export cookie; failure logged, never fails generation), `servers/fastapi/openai_spec.json`
- Test: `servers/fastapi/tests/unit/test_presentation_video_service.py`, `servers/fastapi/tests/test_presentation_generation_api.py`

**Interfaces:** Consumes Task 2 `resolve_slide_animations`. Produces: nothing new for later tasks except the `animate` request field (Task 11).

- [ ] **Step 1:** Failing tests: `test_second_export_makes_zero_animation_llm_calls` (stored plans exist); `test_export_uses_hand_edited_tweens` (a `user` plan's tweens reach `build_composition_slides` unchanged); `test_generate_with_animate_calls_resolve`, `test_generate_without_animate_does_not`, `test_generate_survives_resolve_failure`.
- [ ] **Step 2:** Run those; expect FAIL.
- [ ] **Step 3:** Make the changes.
- [ ] **Step 4:** Run `uv run pytest tests/unit -q`; expect PASS (including existing hyperframes tests).
- [ ] **Step 5:** Commit `feat(animations): export and generation use stored plans`.

## Frontend

### Task 5: API client and types

**Files:**
- Modify: `frontend/src/api/schema.d.ts` (regenerate with the repo's openapi-typescript script, see `frontend/package.json`), `frontend/src/api/types.ts` (export `SlideAnimation`, `AnimationTween`, `AnimationStatus`)
- Create: `frontend/src/api/animations.ts`
- Test: `frontend/tests/unit/api/animations.test.ts` (follow the neighbouring api tests)

**Interfaces — Produces:**
```ts
type AnimationTween = { target: string; from_values: Partial<Record<'opacity'|'x'|'y'|'scale'|'rotation'|'blur', number>>; duration: number; delay: number; ease: string }
type AnimationStatus = 'fresh'|'stale_content'|'stale_layout'|'missing'|'unsupported'
type SlideAnimation = { slide_id: string; index: number; status: AnimationStatus; source: 'llm'|'fallback'|'user'|null; reset_from_user: boolean; tweens: AnimationTween[]; targets: { id: string; kind: string; text: string }[] }
getAnimations(id: string): Promise<{ slides: SlideAnimation[] }>
generateAnimations(id: string, body?: { slide_indexes?: number[]; force?: boolean }): Promise<{ slides: SlideAnimation[] }>
generateAnimationsAsync(id: string, body?: same): Promise<AsyncTask>
putAnimation(id: string, slideIndex: number, tweens: AnimationTween[]): Promise<SlideAnimation>
deleteAnimation(id: string, slideIndex: number): Promise<void>
```

- [ ] **Step 1:** Failing tests: each function calls the right method/path/body (mock `api`, as other api tests do).
- [ ] **Step 2:** `cd frontend && npx vitest run tests/unit/api/animations.test.ts`; expect FAIL.
- [ ] **Step 3:** Regenerate the schema, add types and `animations.ts` (mirror `speakerNotes.ts`).
- [ ] **Step 4:** Re-run; expect PASS; `npx vue-tsc --noEmit` clean.
- [ ] **Step 5:** Commit `feat(frontend): animations API client`.

### Task 6: Pure motion model (`effects.ts`, `plan.ts`)

**Files:**
- Create: `frontend/src/motion/effects.ts`, `frontend/src/motion/plan.ts`
- Test: `frontend/tests/unit/motion/plan.test.ts`

**Interfaces — Produces:**
```ts
// effects.ts
export const MOTION_WINDOW = 2.5, MIN_DURATION = 0.2, MAX_DURATION = 1.2, MAX_TWEENS = 24
export const EASES: { id: string; label: string }[]   // the 8 backend eases, labelled Smooth/Soft/Strong/Sharp/Expo/Sine/Circ/Overshoot
export type EffectId = 'none'|'fade'|'rise'|'slide'|'zoom'|'turn'|'blur'|'custom'
export const effects: { id: Exclude<EffectId,'custom'>; name: string; detail: string; from: AnimationTween['from_values'] }[]
// fade {opacity:0}, rise {opacity:0,y:32}, slide {opacity:0,x:-50}, zoom {opacity:0,scale:0.86}, turn {opacity:0,rotation:-8,scale:0.92}, blur {opacity:0,blur:12}; none = {}
// plan.ts
export function tweenEffect(t: AnimationTween | undefined): EffectId          // none when undefined; custom when from_values match no preset
export function applyEffect(tweens: AnimationTween[], target: string, effect: EffectId): AnimationTween[]  // none removes the tween; new tween defaults delay 0, duration 0.6, ease power2.out
export function constrainTween(t: AnimationTween, patch: Partial<AnimationTween>): AnimationTween  // clamps duration to 0.2–1.2, delay ≥ 0, delay+duration ≤ 2.5 (shorten after pulling earlier), unknown ease → power2.out
export type PresetId = 'cinematic'|'cascade'|'subtle'|'clear'
export function applyPreset(preset: PresetId, targets: { id: string; kind: string; box?: { y: number; x: number } }[]): AnimationTween[]  // cascade staggers 0.12 s in reading order; clear → []; result always satisfies constrainTween and ≤ MAX_TWEENS
```

- [ ] **Step 1:** Failing tests: `tweenEffect` for each preset and for `{opacity:0,y:30}` (→ custom); `applyEffect('none')` removes; `constrainTween({delay:2.4,duration:1.2})` ends ≤ 2.5 and keeps duration ≥ 0.2; duration 0 → 0.2, 99 → 1.2; `applyPreset('cascade')` with 30 targets → ≤ 24 tweens, none past 2.5 s; `applyPreset('clear')` → `[]`.
- [ ] **Step 2:** `npx vitest run tests/unit/motion/plan.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement; pure functions, no Vue imports. Cinematic = rise then fade in order, 0.15 s steps; subtle = fade only, 0.4 s.
- [ ] **Step 4:** Re-run; expect PASS.
- [ ] **Step 5:** Commit `feat(frontend): motion effects and plan model`.

### Task 7: GSAP preview engine

**Files:**
- Modify: `frontend/package.json` (add `gsap`, an exact pinned version at least 2 weeks old; install with the repo's package manager, see `pnpm-lock.yaml`/`package-lock.json` and use what CI uses)
- Create: `frontend/src/motion/preview.ts`
- Test: `frontend/tests/unit/motion/preview.test.ts`

**Interfaces:**
- Consumes: `AnimationTween`, `MOTION_WINDOW`.
- Produces:
```ts
export function tweenVars(t: AnimationTween): { from: Record<string, number|string>; to: Record<string, number|string> }  // mirrors hyperframes_composition._tween_vars
export interface MotionPreview { seek(time: number): void; play(opts?: { loop?: boolean; onEnd?: () => void }): void; pause(): void; restore(): void; time(): number; dispose(): void }
export function createPreview(root: ParentNode, tweens: AnimationTween[], opts?: { reducedMotion?: boolean }): MotionPreview
// selects [data-hf-el="<target>"] under root; missing elements skipped; reducedMotion keeps only opacity; restore() clears all inline GSAP styles and kills the timeline; dispose() = restore + release
```

- [ ] **Step 1:** Failing tests (jsdom): `tweenVars` for `{opacity:0,y:32,scale:0.86,blur:12}` gives from `{opacity:0,y:32,scale:0.86,filter:'blur(12px)'}` and to `{opacity:1,y:0,scale:1,filter:'blur(0px)'}`; `seek(0)` puts an element at opacity 0, `seek(2.5)` at 1; a tween whose target element is missing does not throw; `restore()` removes inline `opacity/transform/filter`; reduced motion produces no transform; `dispose()` twice is safe.
- [ ] **Step 2:** `npx vitest run tests/unit/motion/preview.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement with a paused `gsap.timeline` of `fromTo(el, from, {...to, duration, ease}, delay)`; `seek` uses `tl.time()`.
- [ ] **Step 4:** Re-run; expect PASS.
- [ ] **Step 5:** Commit `feat(frontend): GSAP motion preview`.

### Task 8: `useSlideAnimation` and editor store state

**Files:**
- Create: `frontend/src/composables/useSlideAnimation.ts`
- Modify: `frontend/src/stores/editor.ts` (`InspectorTabId` += `'motion'`; `FooterTab` += `'motion'`; new refs `motionTarget: string|null`, `motionTime: number|null`; reset both when the active slide changes)
- Test: `frontend/tests/unit/composables/useSlideAnimation.test.ts`, `frontend/tests/unit/editor/editorStore.test.ts` (extend)

**Interfaces:**
- Consumes: Task 5 API, Task 6 `constrainTween/applyEffect/applyPreset`.
- Produces:
```ts
useSlideAnimation(presentationId: Ref<string>, slide: Ref<Slide>): {
  animation: ComputedRef<SlideAnimation | undefined>   // from one deck-wide vue-query read, selected by slide.index
  draft: Ref<AnimationTween[]>                           // local, drives preview instantly
  dirty: ComputedRef<boolean>
  error: Ref<string | null>
  busy: ComputedRef<boolean>                             // generating or saving
  setEffect(target: string, effect: EffectId): void
  patchTween(target: string, patch: Partial<AnimationTween>): void  // via constrainTween
  applyPreset(p: PresetId): void
  generate(opts?: { force?: boolean }): Promise<void>    // POST /animations with this slide only
  generateAll(): Promise<AsyncTask>                      // async endpoint
  clear(): Promise<void>                                 // DELETE
  save(): Promise<void>                                  // debounced 600 ms after edits; PUT
}
```
Edits mutate `draft` immediately, save debounced; on failure `draft` is kept and `error` set (like `useNoteDraft`); a refetch for another slide never overwrites a dirty draft.

- [ ] **Step 1:** Failing tests: debounce saves once after rapid edits with the constrained body; failed PUT keeps draft and sets `error`; `generate` replaces the draft with the response; slide switch discards a non-dirty draft and flushes a dirty one first; `unsupported` slide makes edit functions no-ops (no request); store test: changing `activeSlideId` resets `motionTarget/motionTime`.
- [ ] **Step 2:** Run both test files; expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run; expect PASS.
- [ ] **Step 5:** Commit `feat(frontend): slide animation draft and store state`.

### Task 9: Inspector Motion tab

**Files:**
- Create: `frontend/src/components/editor/inspector/MotionTab.vue`
- Modify: `frontend/src/components/editor/inspector/tabs.ts` (add `{ id:'motion', label:'Motion', icon: Clapperboard, ... }` after Design), `frontend/src/components/editor/Inspector.vue` only if the four-tab note needs adjusting for five tabs (inactive tabs already show icons only)
- Test: `frontend/tests/unit/editor/MotionTab.test.ts`

**Interfaces:** Consumes `useSlideAnimation`, `effects`, `EASES`, `AiProgress` (`components/shell/AiProgress.vue`). Props as every inspector tab: `presentationId`, `presentation`, `activeSlide`. Uses `editor.motionTarget` for the selected element.

Content per spec: element select (names "Kind – first words of text"), searchable effect palette (⌘K focuses the search while the Motion tab is open), Start/Duration/Ease fields, "Custom values" disclosure with number fields for each `from_values` key, preset menu (Cinematic reveal, Staggered cascade, Soft & subtle, Remove all effects), "Generate with AI"/"Regenerate" (confirm before overwriting a `source:"user"` plan), "Generate for all slides", "Clear plan". States: `missing` empty state with the generate button; busy → `AiProgress`; `reset_from_user` banner "Your edits were reset because the layout changed" (dismissible, local); `unsupported` muted "This slide can't be animated"; `error` inline `role="alert"`.

- [ ] **Step 1:** Failing tests: choosing "Rise" for the selected element calls `setEffect(target,'rise')`; Duration field `99` shows 1.2 after blur; regenerating a `user` plan asks for confirmation and does not call `generate` on cancel; `reset_from_user` banner appears and dismisses; `unsupported` renders the note and no controls; ⌘K focuses the search input; empty element list shows the empty state.
- [ ] **Step 2:** `npx vitest run tests/unit/editor/MotionTab.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement; reuse Aera classes from `DesignTab.vue` and `AvatarTab.vue`.
- [ ] **Step 4:** Re-run plus `npx vitest run tests/unit/editor`; expect PASS.
- [ ] **Step 5:** Commit `feat(frontend): inspector Motion tab`.

### Task 10: Timeline footer tab and canvas preview

**Files:**
- Create: `frontend/src/components/editor/MotionTimeline.vue`
- Modify: `frontend/src/components/editor/SpeakerNotes.vue` (third footer tab `motion` using the existing tab pattern at its `tabs` array and `openFooter`), `frontend/src/components/editor/canvas/EditableSlide.vue` (pass `annotate` true while `inspectorTab==='motion'` or `footerTab==='motion'`; own a `MotionPreview` created from the host's shadow root; subscribe to `editor.motionTime`; outline the selected element with a dashed outline; on unmount, tab change or slide change call `restore()`), `frontend/src/render/TemplateSlideHost.vue` (expose `shadowRoot(): ShadowRoot | null`), `frontend/src/components/editor/EditorHeader.vue` (menu entry "Motion" next to the Voice entry, calling `editor.openFooter('motion')`)
- Test: `frontend/tests/unit/editor/MotionTimeline.test.ts`, `frontend/tests/unit/editor/canvas/EditableSlideMotion.test.ts`

**Interfaces:** Consumes `useSlideAnimation`, `createPreview`, `MOTION_WINDOW`, editor store. Timeline: one track per `animation.targets` entry, ruler 0–2.5 s, clip `left = delay/2.5`, `width = duration/2.5`; pointer-drag changes `delay` (rounded to 0.1, via `patchTween`), arrow keys ±0.1 s on a focused clip, clicking a track/clip sets `editor.motionTarget` and `inspectorTab = 'motion'`; transport: Play/Pause, Stop (`motionTime = null`), Loop, scrubber (`motionTime = value`), time output `0.0 / 2.5 s`. Tracks without a tween render an empty lane with an "Add" affordance that calls `setEffect(target,'fade')`. Direct slide editing is disabled while `motionTime !== null`.

- [ ] **Step 1:** Failing tests: clip geometry for `delay 0.5 duration 1` is `20%`/`40%`; keyboard nudge to the window end stops at 2.5 − duration; dragging beyond the lane clamps; Play advances `motionTime` and Stop sets it to `null`; the canvas calls `restore()` on slide change and on leaving Motion; selecting a clip sets `motionTarget` and opens the Motion inspector tab; no-animatable-element slide renders "Nothing to animate on this slide."
- [ ] **Step 2:** Run both files; expect FAIL.
- [ ] **Step 3:** Implement. Use `prefers-reduced-motion` via `useMediaQuery` and pass it to `createPreview`.
- [ ] **Step 4:** Re-run plus `npx vitest run tests/unit/editor tests/unit/render`; expect PASS.
- [ ] **Step 5:** Commit `feat(frontend): motion timeline and canvas preview`.

### Task 11: Export card, create flow, post-generation

**Files:**
- Modify: `frontend/src/components/editor/export/VideoExportCard.vue` (read `getAnimations` and show "Animations: N of M slides" with a "Edit in Motion tab" link that closes the dialog and opens the tab), `frontend/src/components/create/GenerationOptions.vue` and `frontend/src/components/create/options.ts` (add `animate` switch, off by default, sent as `GeneratePresentationRequest.animate`), `frontend/src/views/EditorView.vue` or the stream-finished handler it uses (`usePresentationStream`): when a generation finishes and the deck was created with `animate`, call `generateAnimationsAsync` once and show `AiProgress`
- Test: `frontend/tests/unit/editor/ExportOptions.test.ts`, `frontend/tests/unit/create/NewView.test.ts` (extend)

- [ ] **Step 1:** Failing tests: export card shows the count from a mocked `getAnimations`; the create flow posts `animate: true` only when the switch is on; the post-generation call happens once and only then.
- [ ] **Step 2:** Run those; expect FAIL.
- [ ] **Step 3:** Implement (the create-flow file set already has local edits in the working tree; read them first and extend, do not overwrite).
- [ ] **Step 4:** Re-run plus `npx vitest run`; expect PASS.
- [ ] **Step 5:** Commit `feat(frontend): animation summary in export, animate option in create flow`.

### Task 12: End-to-end check

**Files:**
- Modify: `frontend/tests/e2e/mocked.spec.ts` (extend; keep existing local edits)

- [ ] **Step 1:** Add `motion editor` test with mocked `animations` routes: open the Motion tab, choose Rise for the first element, drag its clip, press Play, and assert the captured `PUT` body has `from_values {opacity:0,y:32}` and a `delay` that matches the drag.
- [ ] **Step 2:** Run `cd frontend && npx playwright test tests/e2e/mocked.spec.ts -g "motion editor"`; expect PASS after fixing any wiring gaps found.
- [ ] **Step 3:** Run the whole suites: `cd frontend && npx vitest run && npx vue-tsc --noEmit && npx eslint src tests` and `cd servers/fastapi && uv run pytest tests/unit -q`; expect all green.
- [ ] **Step 4:** Manual parity check (record the result in the PR text): with `docker compose up production`, preview a slide in the editor, export a video, compare the entrance at 0.5 s and 1.0 s.
- [ ] **Step 5:** Commit `test: motion editor e2e`.

## Self-review notes

- Spec coverage: generate/regenerate/edit/clear (3, 8, 9); presets and effect palette (6, 9); timeline with drag/keys/scrub/play/loop (10); GSAP-equal preview (7, 10); persistence and export use (1–4); `reset_from_user` surfaced (2, 9); unsupported slides (2, 9, 10); create-flow `animate` and post-generation call (4, 11); export summary (11); Wipe and exits intentionally absent.
- Decisions from the spec's "Calls made" list: "Remove all" saves `[]` (Task 8 `applyPreset('clear')` → PUT `[]`), "Clear plan" is DELETE (Tasks 3, 8, 9), "Generate for all slides" (9), confirm before regenerating a user plan (9), backend `targets` for names and `e0…eN` for DOM (8, 10).
- Open for the executor: the spec's golden frame comparison is replaced by the manual parity check in Task 12 step 4.
