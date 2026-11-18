# Vue frontend: motion editor (entrance animations) — design

Date: 2026-11-18

## Intent

Slides get an entrance animation that the AI can generate, the user can edit by
hand and preview in the editor, and the export plays exactly as previewed.
Today the HyperFrames plan is invisible: it is planned inside the MP4 export
and cannot be seen or changed first.

The look and interaction come from the Aera mockup (`aera-frontend`):
`MotionInspector.vue` (effect palette, start/duration/ease, presets),
`MotionStudio.vue` (draggable timeline, scrubber, play/loop) and
`lib/motion.ts`. This follows the standing rule to keep the Aera look and extend
it additively ([[aera-design-fidelity]]).

Builds on `2026-11-05-persistent-slide-animations-design.md`, whose backend
(storage, endpoints) is specified but not built. That spec said "editor UI comes
later"; this is that UI.

## Goals

- Generate a slide's animation with the AI, regenerate it, edit it, clear it.
- Edit by hand: pick an effect per element, set start, duration and ease,
  drag clips on a timeline, apply whole-slide presets.
- Preview in the editor with the same tween values and easing the export uses.
- Edits persist and the export uses them, with no LLM call for stored plans.
- Template slides only (see CLAUDE.md); smart slides show "not animatable".

## Non-goals / anti-goals

- No exit animations (decided: entrance only). The timeline is capped at the
  backend's entrance window (`SLIDE_ANIMATION_MAX_SECONDS` = 2.5 s) and has no
  exit lane. No change to the export's capture window.
- No smart-slide animation features.
- Not a free-form keyframe editor: one tween per element, `from` values only.
- Anti-goal: a preview that looks different from the export, even if it feels
  nicer. A mismatch is a bug.
- Anti-goal: dropping or restyling anything in the existing Aera editor chrome.

## Constraints

- Tween shape is fixed by the backend (`SlideTween`): `{target, from_values,
  duration, delay, ease}`. `from_values` keys: opacity, x, y, scale, rotation,
  blur, with the backend's clamped ranges. Eases come from `ANIMATION_EASES`.
  At most 24 tweens, duration 0.2–1.2 s, end by 2.5 s. The frontend mirrors these
  limits; the backend stays authoritative (validator clamps).
- Targets are positional ids `e0…eN` in layer order. The frontend already has
  `templateV2AnimationTargets` (`render/legacy`) and the `annotateElements`
  render option that wraps each element with its id, so the editor sees the same
  ids the export uses. The backend still fetches its composition from the old
  Next.js route; that stays as it is.
- Hand-edited plans survive content edits while the element list (ids and kinds)
  is unchanged; otherwise they are re-planned and flagged `reset_from_user`
  (staleness rules in the 2026-11-05 spec). The UI must surface that flag.
- `prefers-reduced-motion`: preview collapses to opacity only, as in the mockup.
- No GSAP in `frontend/` yet. The export uses `video-render-hyperframes`'s
  vendored GSAP; the editor adds `gsap` as a dependency.

## Approaches considered

- **A. Mockup-faithful (chosen).** Inspector "Motion" tab plus a "Motion" tab in
  the Notes/Voice footer holding the timeline; GSAP preview on the real slide DOM.
  Most work, closest to the mockup, additive.
- **B. Inspector only.** List of elements with delay/duration fields and a Play
  button; no timeline. About half the work; loses sequencing by eye, which is
  the mockup's point.
- **C. Floating-bar popover plus footer timeline.** Fits the element-editing
  pattern, but the palette and presets are cramped in a popover and AI
  generation has no home.

Preview engine: GSAP over a hand-rolled interpolator (the mockup's
`elementMotion`), because the export runs GSAP `fromTo` and ease names such as
`back.out(1.4)` only match exactly when the same library runs.

## Design

### 1. Backend (first; unchanged from the 2026-11-05 spec)

Build `slide_animation_service.py`, the `slides.animation` JSON column with
Alembic revision and `migrations.py` check, `api/v1/ppt/endpoints/slide_animations.py`
(`GET/POST/POST async/PUT/DELETE`), the `animate` flag on generation, and the
export switching to stored plans. Regenerate `openai_spec.json`, then
`frontend/src/api/schema.d.ts`. Tests as listed in that spec. One addition: the
`POST` accepts `slide_indexes` so the editor can regenerate one slide
(`force: true` for a hand-edited slide, after the UI confirms).

### 2. Frontend data layer (`frontend/src/motion/`)

- `effects.ts`: the palette. Each effect is a preset of `from_values`:
  Dissolve `{opacity:0}`, Rise `{opacity:0,y:32}`, Drift `{opacity:0,x:-50}`,
  Scale `{opacity:0,scale:0.86}`, Turn `{opacity:0,rotation:-8,scale:0.92}`,
  Blur-in `{opacity:0,blur:12}`. Wipe from the mockup has no backend property
  (no clip-path), so it is left out until the backend adds one (flagged below).
  `None` means the element has no tween. A tween whose `from_values` match no
  preset shows as "Custom" and keeps its raw values.
- `plan.ts`: pure functions: `tweenEffect`, `applyEffect`, `constrainTween`
  (clamps start/duration to the window, mirrors backend ranges), `applyPreset`
  (Cinematic reveal, Staggered cascade, Soft & subtle, Remove all: rewritten as
  tween lists over the slide's real targets, e.g. cascade staggers by layer order).
- `preview.ts`: builds a paused GSAP timeline on the slide DOM using the same
  `fromTo` shape as `hyperframes_composition.timeline_script`, exposes
  `seek(t)`, `play`, `pause`, `restore`. `blur` maps to the same CSS filter the
  export uses.
- `useSlideAnimation(presentationId, slide)`: vue-query read of
  `GET …/animations`, mutations for `PUT`, `DELETE`, generate/regenerate
  (`POST`, async variant for the whole deck). Edits update a local draft
  immediately (live preview) and save debounced; failure shows an inline error
  and keeps the draft, as `useNoteDraft` does.
- Editor store: `footerTab` gains `'motion'`; `inspectorTab` gains `'motion'`;
  plus `motionTarget` (selected element id) and `motionTime` (preview time or
  null = restored).

### 3. UI

- **Inspector → Motion tab** (`MotionTab.vue`, icon Clapperboard): intro,
  element select, searchable effect palette (⌘K focuses search, as in the
  mockup), Start / Duration / Ease fields, a "Custom values" disclosure for raw
  `from_values`, the whole-slide preset menu, and "Generate with AI" /
  "Regenerate". States: no plan yet (empty state with the generate button),
  generating (AiProgress), stale with `reset_from_user` (banner: "Your edits
  were reset because the layout changed"), unsupported smart slide (muted note).
- **Footer → Motion tab** (`MotionTimeline.vue`): one track per element, named
  from the element's kind and text (e.g. "Title – Quarterly results"), ruler
  0–2.5 s, draggable and keyboard-nudged clips (arrow keys ±0.1 s), scrubber,
  Play/Pause, Stop, Loop. Selecting a track or clip selects that element in the
  Motion tab and outlines it on the slide with the mockup's dashed outline.
- **Canvas**: renders the slide with `annotateElements` while Motion is the
  active tab or footer tab; the preview hands DOM control to GSAP and restores
  the slide on stop/tab change/slide change (as the mockup does). Direct editing
  on the canvas is disabled while previewing.
- **Export**: `VideoExportCard` shows whether stored animation plans exist
  (e.g. "Animations: 12 of 14 slides") and links to the Motion tab; the existing
  `animate` option keeps working.
- Theme and styling reuse the Aera tokens already in use; no new colours.

### 4. Generation and create flow

`animate` already exists in the video export; add an "Animate slides" switch to
the create flow's generation options, sent as `GeneratePresentationRequest.animate`.
After a streamed generation finishes, the editor calls `POST …/animations/async`
once (per the backend spec).

## Testing

- Backend: as listed in the 2026-11-05 spec.
- Frontend unit (vitest): `plan.ts` (clamping, preset output, effect detection),
  `preview.ts` (timeline built from tweens equals the export's `fromTo` args,
  using the same fixtures as `test_hyperframes_composition.py`),
  `useSlideAnimation` (draft/save/failure), tab and timeline components (drag
  and arrow-key edits, selection sync).
- Playwright (mocked): open Motion tab, change an effect, drag a clip, play,
  confirm the persisted `PUT` body.
- Golden check: one preview frame at `t` compared to the export frame at `t`
  for a sample slide (best effort; see open items).

## Calls made while writing this (not yet confirmed)

- "Remove all effects" saves an empty tween list with `PUT` (valid, means "no
  animation"); `DELETE` is the separate "Clear plan" action that returns the
  slide to "not planned" so the export plans it again.
- The Motion tab has a secondary "Generate for all slides" action, using the
  async deck endpoint with `AiProgress`.
- Track names and kinds come from the backend `targets`; DOM lookups use the
  `e0…eN` ids from the frontend render. A mismatch between the two sets is shown
  as a "layout changed, refresh" state rather than guessed around.
- Regenerating a hand-edited slide asks for confirmation first.

## Left to the builder

- Exact clip and track styling within the Aera tokens.
- The debounce interval and the precise preset tween lists.
- File layout inside `frontend/src/motion/` and the component split.

## Open items

- Wipe/clip-path reveal: needs a backend property; deferred.
- Per-element `from_values` for cases the palette can't express stay editable
  only through "Custom values".
