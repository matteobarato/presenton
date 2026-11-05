# Persistent slide animations (HyperFrames plans) — design

Date: 2026-11-05

## Intent

**What the user asked for:** make the HyperFrames slide animations a persistent,
first-class step of a presentation instead of something planned only inside the
MP4 export. Both goals matter, backend first:

1. Exports get faster and repeatable: plans already exist, so an export makes no
   LLM calls for them.
2. The plans can later be reviewed and edited in the editor. This spec delivers
   the backend and edit API only; the editor UI comes later.

**Decisions made with the user:**

- Trigger: an opt-in `animate` flag on generation, plus an on-demand endpoint.
  Export still plans whatever is missing.
- Hand-edited plans survive slide edits as long as the slide's element list
  (ids and kinds) is unchanged; otherwise they are re-planned and flagged.
- Storage: an `animation` JSON column on `slides`.

**Success criteria:**

- A deck can have its animation plans generated, read, edited, and cleared
  through the API.
- A second export of an unchanged deck makes zero animation LLM calls (already
  true through the file cache; must stay true with DB storage).
- Hand-edited plans are never silently lost or misapplied when targets shift.
- Generation never fails because of animation planning.

## Current state

- `utils/llm_calls/generate_slide_animations.py`: LLM planning, validation
  (`validate_slide_animation`, which clamps), and `fallback_slide_animation`.
  Returns `SlideTween` lists.
- `utils/hyperframes_composition.py`: turns tweens into GSAP/HyperFrames.
- `services/presentation_video_service.py`: `_resolve_animation_plans` fetches
  the composition from Next.js `/api/video-composition/{id}` (which forwards the
  caller's cookie via `x-export-cookie`), plans missing slides, and caches plans
  in `videos/{presentation_id}/animation-plans.json`, keyed by slide id plus
  sha256 of the slide's composition HTML.
- Animation targets are positional (`e0`, `e1`, … in layer order), from
  `templateV2AnimationTargets` in `servers/nextjs/lib/template-v2-json-to-html.ts`.
- Async tasks capture the caller's cookie when the request comes in
  (`build_export_cookie_header`), so background work can call the composition
  route. No Python port of element extraction is needed.

## Components

### `services/slide_animation_service.py` (new)

The only reader and writer of persisted plans.

- `resolve_slide_animations(sql_session, presentation, cookie_header, *,
  slide_ids=None, force=False, on_progress=None) -> dict[UUID, SlideAnimationPlan]`
  - Fetches the composition (moved here from the video service, which imports it).
  - Works out each in-scope slide's status (below), calls
    `generate_slide_animations` only for slides that need planning, writes the
    results to `slide.animation`, commits, and returns plans for all in-scope
    slides that have one.
  - `force=True` re-plans every in-scope slide, hand-edited ones included.
- `set_user_animation(slide, composition_entry, tweens) -> SlideAnimationPlan`
  - Flattens stored-shape tweens into the validator's input shape, runs
    `validate_slide_animation` against the entry's current target ids, and stores
    the result with `source: "user"`, `reset_from_user: false`.
  - Raises a validation error when tweens were sent and none survive.
    An empty list is valid and means "no animation".
- `plan_status(stored, entry) -> Literal["fresh", "stale_content",
  "stale_layout", "missing", "unsupported"]`: a pure function.
- `targets_signature(elements) -> str`: sha256 of the ordered `[id, kind]` list.

`generate_slide_animations.py` and `hyperframes_composition.py` are unchanged.

### Data model

New nullable JSON column `slides.animation` (Alembic revision, plus a matching
`_has_column` check in `migrations.py` schema inference, like the other columns):

```json
{
  "version": 1,
  "source": "llm | fallback | user",
  "html_hash": "<sha256 of composition html>",
  "targets_signature": "<sha256 of ordered [id, kind]>",
  "tweens": [{"target": "e0", "from_values": {"opacity": 0}, "duration": 0.6, "delay": 0, "ease": "power2.out"}],
  "reset_from_user": false,
  "updated_at": "<ISO 8601>"
}
```

- `SlideModel.get_new_slide` deep-copies `animation`.
- `services/presenton_cloud_persistence.py` reads and writes `animation`
  alongside `ui`.
- Migrating the legacy file: when `slide.animation` is null and
  `animation-plans.json` has an entry for the slide whose `html_hash` matches,
  that entry is adopted as `source: "llm"`. The file is read-only from now on and
  is removed in a later release (it is still listed among the deck's files to
  delete when the deck is deleted).
- Smart slides (`html_content`, no renderable `ui`) are `unsupported`: no plan,
  still frames in the export as today.

## Staleness rules

| Compared with the current composition | `llm` / `fallback` plan | `user` plan |
|---|---|---|
| `html_hash` matches → `fresh` | keep | keep |
| only `html_hash` differs → `stale_content` | re-plan | keep: re-validate tweens, update `html_hash` |
| `targets_signature` differs → `stale_layout` | re-plan | re-plan with the LLM, set `reset_from_user: true` |
| no plan → `missing` | plan | — |
| not Template-v2 → `unsupported` | skip | skip |

`reset_from_user` clears the next time an edit is saved with `PUT`.
`fallback` plans are re-planned when `force` is used.

## API

New router file `api/v1/ppt/endpoints/slide_animations.py`, mounted like
`slide_avatars.py`. All endpoints use `build_export_cookie_header(request)` for
the composition fetch and the usual ownership checks.

| Method & path | Behaviour |
|---|---|
| `GET /presentation/{id}/animations` | Per slide: `slide_id`, `index`, `status`, `source`, `reset_from_user`, `tweens`, `targets` (composition elements). |
| `POST /presentation/{id}/animations` | Body `{slide_indexes?: int[], force?: bool}`. Plans missing and stale slides (all, with `force`) and returns the `GET` shape. |
| `POST /presentation/{id}/animations/async` | Same as an `AsyncTaskModel`, type `presentation.animations`, with per-slide progress. |
| `PUT /presentation/{id}/animations/{slide_index}` | Body `{tweens: [{target, from_values, duration, delay, ease}]}`. Returns the normalized stored plan. 422 if tweens were sent but none survive validation, or if the slide is `unsupported`. |
| `DELETE /presentation/{id}/animations/{slide_index}` | Clears the plan (204). |

`openai_spec.json` is regenerated to include the new routes.

## Flows

**Generation.** `GeneratePresentationRequest.animate: bool = False`. When true,
`generate_presentation_handler` calls `resolve_slide_animations` after the slides
are committed, using `export_cookie_header`. The streaming endpoints
(`stream_presentation`, `stream_smart_presentation`) are unchanged; the editor
calls `POST …/animations/async` once a stream finishes.

**Export.** `_build_animated_video` calls `resolve_slide_animations` in place of
`_resolve_animation_plans`; the latter and the file-cache write path are removed.
Progress keeps the existing `animation-plan` stage name. Export results are
unchanged.

**Concurrency.** Two resolves of the same slide at once: last write wins. Both
results are valid plans; no locking.

## Error handling

| Failure | Endpoints | Generation (`animate=true`) | Export |
|---|---|---|---|
| Composition fetch fails | 502 with the upstream detail | logged, step skipped, generation succeeds | `AnimatedVideoUnavailableError` (unchanged) |
| LLM fails for a slide | fallback plan stored as `source: "fallback"` | same | same |
| Slide index out of range | 404 | — | — |
| Presentation missing or not owned | 404 | — | — |

## Testing (test-first, `servers/fastapi/tests/unit/`)

- `test_slide_animation_service.py`
  - `plan_status` for every row and column of the staleness table.
  - Resolve plans only missing or stale slides (LLM stubbed, call counter).
  - `force` scope, including user plans; `reset_from_user` set and cleared.
  - Legacy file seed adopted only when the hash matches.
  - Two resolves at once finish without errors.
- `set_user_animation`: clamping, empty list stored, all-unknown targets raise,
  flattening of the stored shape.
- `test_slide_animations_endpoints.py`, with the composition fetch mocked: `GET`
  shape, `POST` scope, `PUT`/`DELETE`, 404, 422, 502, async task type.
- Generation: `animate=true` calls resolve, `animate=false` does not, and a
  resolve failure does not fail generation.
- `test_presentation_video_service.py`: a second export with stored plans makes
  zero LLM calls; export output unchanged.
- Model and migration: the column exists after upgrade; `get_new_slide` and cloud
  persistence carry `animation` over.

## Out of scope

- Editor UI and live animation preview.
- Changes to the streaming generation endpoints.
- Removing `animation-plans.json` (one release later).
- The out-of-repo web player.
