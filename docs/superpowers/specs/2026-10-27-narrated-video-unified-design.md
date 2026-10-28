# Unified narrated video: avatar videos × MP4 export

Date: 2026-10-27
Branch: `feat/narrated-video-unified` (from `origin/main` @ `7a3b9dcc`) → PR into `main`

## Goal

Bring the two narrated-presentation features onto `main` as one coherent
system, with a single model of "who is presenting" used everywhere:

- **Avatar videos** (on `main` since PR #2, editor UI uncommitted on
  `feat/slide-avatar-videos`): one optional avatar video per template slide,
  shown in a `video_placeholder` element; `GET /{id}/playback` describes the
  deck for an external player; the deck's voice-bubble box lives in
  `presentations.narration`.
- **MP4 export** (`origin/feat/manual-speaker-notes` @ `1432328c`, not on
  `main`): narrated MP4 per language/preset, HyperFrames entrance animations
  planned by an LLM, a "speaker is talking" bubble overlaid by ffmpeg,
  subtitles, plus Vertex/OpenRouter TTS transports and other provider work.

Today the two disagree: the export hard-codes the bubble top-right, ignores
the deck's bubble box, ignores avatar videos, and would hand the placeholder
to the animation planner. The result of this work is one actor timeline that
both `/playback` and the MP4 export read.

## Decisions

| # | Decision | Source |
|---|----------|--------|
| D1 | Avatar videos are **silent**: lip-synced offline to the slide's TTS audio. TTS is always the soundtrack and the clock; any audio track in an uploaded file is ignored. | user |
| D2 | The MP4 crossfades between slides (default 0.5 s, `0` = hard cuts). No other transition types. | user |
| D3 | MP4 export stays API-only; no editor UI for it. | user |
| D4 | MP4 export routes are renamed `/{id}/video` → `/{id}/video-export`. | user |
| D5 | At a slide change the actor fades with the slide (bubble ↔ avatar crossfade in the same window); bubble → bubble stays steady. Exception (user, later 2026-10-27): avatar and bubble morph into each other (avatar rounds into a circle, travels and scales to the bubble, dissolving into it at the end; the reverse when the avatar starts); the bubble is drawn at half the bubble box's size. | default (option A) + user |
| D6 | An avatar is tied to the narration language it was synced to, and is stale when its note changed **or** that language's TTS audio was regenerated after the upload. | follows from D1, confirm in review |
| D7 | Everything else in `1432328c` (Vertex/OpenRouter TTS, LLM rate-limit retry, image transport, Docker/ffmpeg/HyperFrames, `docker-compose.yml`) comes along unchanged, except the committed `servers/fastapi/utils/__init__.pyc`, which is dropped. | default |

## 1. Git integration

1. Commit the uncommitted avatar-editor work as-is (Videos panel, canvas
   placeholder, toolbar, store slice, `is_template_slide` for component-only
   layouts). Its tests pass today (73 backend, 6 Node).
2. Merge `origin/feat/manual-speaker-notes`. The 7 textual conflicts are all
   "both sides appended" and resolve by keeping both:
   `alembic/env.py`, `migrations.py`, `services/database.py`,
   `utils/get_env.py`, `api/v1/ppt/endpoints/presentation.py` (routes and the
   deck-delete cleanup), `tests/integration/test_speaker_note_tts_endpoint_http.py`,
   and `openai_spec.json` (regenerated with
   `scripts/generate_openapi_spec.py`, never hand-merged).
3. Alembic: both branches add a revision on `a1c3e5f7b9d2`
   (`b7d9f1a3c5e8` slide videos, `c88953aea876` presentation videos). Add a
   **merge revision** with `down_revision = ("b7d9f1a3c5e8", "c88953aea876")`
   so a database already at either head upgrades cleanly. Neither existing
   revision is edited.
4. Integration commits (sections 2–7), then a PR into `main`.

## 2. One actor timeline

A pure function in `services/slide_video_service.py`:

```
resolve_slide_actors(slides, audio_by_slide, video_by_slide, *,
                     language, avatars=True) -> list[SlideActor]
```

`SlideActor` carries: the slide, `actor` (`"video" | "voice" | "none"`), the
TTS audio row (if any), the avatar row (if used), the placeholder box, and
`avatar_skipped` (reason an existing avatar was not used: `"disabled"`,
`"language"`).

Rules, per slide:

- Has an avatar, `avatars` is on, and the avatar's language is unset or equals
  `language` → `video`.
- Else has TTS audio → `voice`.
- Else → `none`. (An avatar on a slide with no audio and no note still
  plays, silently, as `video`.)

Both consumers use it:

- `build_playback` (`GET /{id}/playback`). Change: on `video` slides
  `duration_seconds` is the **audio** duration, falling back to the video's
  only when there is no audio (D1).
- The MP4 renderer (section 4).

## 3. Avatar language and staleness (D6)

- `slide_videos.language` (nullable string), in a new Alembic revision on top
  of the merge revision; `REVISION_HEAD` points at it.
- `PUT /{id}/videos/{slide_index}` takes an optional `language` form field.
  Unset → the deck's only narrated language if it has exactly one, else
  `NULL`. `NULL` (including every row uploaded before this change) means
  "any language".
- `SlideVideoResponse` keeps `stale: bool` and adds
  `stale_reason: "note_changed" | "audio_regenerated" | null` and `language`.
  `audio_regenerated` = the slide's TTS audio in the avatar's language has
  `updated_at` later than the avatar's `updated_at`. For a `NULL`-language
  avatar only the note check applies.
- The Videos panel shows the reason in its existing stale warning.
- Stale avatars are still used everywhere; staleness is a warning.

## 4. MP4 rendering (`services/presentation_video_service.py`)

New `VideoRenderOptions` fields: `avatars: bool = True`,
`crossfade_seconds: float = 0.5` (validated `0 ≤ x ≤ 1.5`). Request model
gains the same two fields.

Timing is unchanged: every slide still lasts
`max(lead_in + audio + lead_out, min_slide_seconds)` and narration audio is
placed exactly as today. Everything below is picture-only.

### 4.1 Bubble at the deck's bubble box

`utils/speaker_indicator.py` draws the bubble at a given stage box (1280×720
coordinates from `resolve_bubble`, scaled to the output resolution) instead of
the fixed top-right corner; diameter = half the box's shorter side, centred in
the box. It shows on
`voice` slides only; consecutive `voice` slides stay one steady interval as
today. `speaker_indicator=false` still removes it.

### 4.2 Avatar overlay

For each `video` slide, the avatar file is one more ffmpeg input (video
stream only). Its picture:

- is fitted to the placeholder box following the element's `fit`, read the
  way the editor reads it: `fill` (stretch), `cover` (scale + crop),
  `contain` (scale, transparent pad); a missing or unknown value is
  `contain`. Placeholders created on upload carry `fill`. Corner radius is
  not applied.
- starts playing at `slide_start + lead_in`, the instant the TTS starts, so
  the lips line up; its first frame is held before that and its last frame is
  held to the end of the slide; a longer video is cut at the slide's end.
- is placed on the timeline with `setpts=PTS-STARTPTS+<t>/TB` and overlaid
  after the slide picture and before burned subtitles, in both the still and
  the HyperFrames paths (shared `_video_output_parts`).

A video whose duration differs from its audio by more than 0.5 s is still
used and reported (see 4.6).

### 4.3 Crossfade between slides (D2)

Fade length per boundary `d = min(crossfade_seconds, dur_prev, dur_next)`,
centred on the boundary: `d/2` of the outgoing slide's lead-out and `d/2` of
the incoming slide's lead-in, so narration is never covered and the total
length is unchanged. In frames: boundary frame `f_b`, half-fade `h =
round(d·fps/2)`; the outgoing segment is extended by `h` cloned frames, the
incoming one prefixed by `h` cloned frames, and `xfade=fade:duration=2h/fps:
offset=(f_b−h)/fps` joins them.

- **Still path**: with `crossfade_seconds > 0`, each slide is its own looped
  image input (as the burned-subtitle path already does) and the slides are
  chained with `xfade`. `crossfade_seconds = 0` keeps today's concat-demuxer
  path untouched.
- **HyperFrames path**: each segment is `trim → format → tpad(start/stop
  clone)`, then retimed to constant frame rate **after** `tpad` (the existing
  ffmpeg 7.x caveat forbids retiming between `trim` and `tpad`), then chained
  with `xfade`. The incoming slide's entrance animation starts at its
  boundary, i.e. once its fade-in has finished, so the fade shows the slide's
  pre-entrance state.

### 4.4 Actor across slide changes (D5)

Actor overlays are drawn after the slide crossfade, on top of it.

- `voice → voice`: one bubble interval, no change.
- `voice ↔ video` morphs, over its own window of 0.8 s centred on the change
  (half of it capped by the lead-in, the lead-out and half of each slide, so
  narration is never covered; skipped with hard cuts or no bubble). The avatar
  stream is split into the morph in, the plain playback and the morph out. In
  a morph a `geq` mask rounds a centred rectangle from the placeholder to its
  largest circle (smootherstep, anti-aliased from the signed distance), the
  canvas is scaled with `scale … eval=frame` until that circle is the bubble's
  diameter and `overlay` x/y expressions move its centre to the bubble's. The
  avatar stays opaque and sharp; the bubble and the avatar only cross-dissolve
  over the last (collapse) or first (expand) fifth of the window.
- Other actor changes (`video → video` with different avatars,
  anything ↔ `none`): the outgoing actor fades out and the incoming actor
  fades in over the same `[f_b − h, f_b + h]` window as the slide.
- Implementation: each bubble interval and each avatar is its own input
  segment with alpha fades (`format=yuva420p`, `fade=…:alpha=1`) at its
  faded edges, then `overlay` with `eof_action=pass`. With
  `crossfade_seconds = 0` the edges are hard cuts.
- The deck's first and last slides have no outer fade: the actor is present
  from frame 0 to the last frame.

### 4.5 Cache key and presets

`compute_video_source_hash` also covers, per slide: actor, avatar id +
`updated_at`, placeholder box and fit; plus the bubble box, `avatars` and
`crossfade_seconds`. Preset suffixes are added only for non-default values
(`-cut` for `crossfade_seconds=0`, `-xf<ms>` for other non-defaults,
`-noavatar` for `avatars=false`), so existing default presets keep their
names and are simply re-rendered on the next request.

### 4.6 Response

`PresentationVideoGenerationResponse` gains an `avatars` summary next to
`animation`: `{requested, applied_slides, stale: [{slide_index, reason}],
skipped: [{slide_index, reason}], duration_mismatch: [{slide_index,
video_seconds, audio_seconds}], silent: [slide_index]}`. `silent` lists avatar
slides with no TTS audio: the avatar is a lip-sync of that audio, which is
always the soundtrack, so such a slide has no sound and needs its audio
generated.

## 5. Animated slides (Next.js)

`templateV2AnimationTargets` and the `annotateElements` wrapper in
`lib/template-v2-json-to-html.ts` skip elements flagged
`video_placeholder: true`: the placeholder is never wrapped in `data-hf-el`
and never sent to the LLM planner. Its transparent poster still renders, as
in the PDF export.

## 6. API and storage

- Renamed (D4): `POST/GET/DELETE /api/v1/ppt/presentation/{id}/video-export`,
  `POST /{id}/video-export/async`. Request gains `avatars`,
  `crossfade_seconds`. Python names (`PresentationVideoModel`,
  `presentation_videos` table) are unchanged.
- Unchanged routes: `/{id}/videos[/{slide_index}]`, `/{id}/playback`,
  `/{id}/playback/bubble`.
- Avatar files and MP4 renders both live in `app_data/videos/{id}/` (names do
  not collide). Deck deletion removes both sets plus the animation-plan cache;
  the folder is removed once empty (both cleanup helpers already only
  `rmdir`). The duplicated `_remove_video_file` / URL helpers are folded onto
  `utils/video_files.py` and `app_data_file_url`.

## 7. Docs

README: avatars are silent and lip-synced to the TTS (replacing "carries its
own audio"), avatar `language`, the renamed export routes and the new
`avatars` / `crossfade_seconds` options. Docstrings in
`slide_video_service.py` and the upload endpoint corrected likewise.

## 8. Testing

- All existing suites from both branches pass: backend unit + integration,
  Node tests (`tests/*.test.mjs`), Next.js type check.
- New unit tests (pure argv / filter builders, no ffmpeg needed):
  `resolve_slide_actors` rules incl. language and `avatars=false`;
  `/playback` uses audio duration on video slides; staleness reasons; bubble
  position from box; avatar input, fit, start offset = `start + lead_in`;
  `xfade` offsets keep total frames equal to the timeline; `-cut` keeps the
  concat path byte-identical to today; actor fade windows; preset names and
  hash inputs; placeholder excluded from animation targets.
- Integration (HTTP): renamed routes; upload with `language`; deck delete
  removes avatar files and renders.
- Real encode: ffmpeg is not installed on this machine. A static ffmpeg 7.x
  (the version in the Docker image) is fetched into the session scratchpad to
  run the generated argv on a tiny synthetic deck (still + animated-clip
  stand-in, one avatar, crossfades) and check duration, frame count and
  sampled frames at the fade windows. A full in-app render needs the Docker
  image.

## Out of scope

Editor UI for MP4 export; transition types other than crossfade; a
avatar corner radius; the external playback
player; copying avatars when a deck is duplicated.

## Risks

- `xfade` chains over many inputs may buffer more than the concat path did;
  mitigated by keeping hard cuts on the old path and by the real-encode check
  above (memory sampled on a 20-slide synthetic deck).
- ffmpeg 6.x vs 7.x filter differences (already bitten `tpad`): verify on 7.x.
