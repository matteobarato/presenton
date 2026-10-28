# Generated avatar videos: ElevenLabs lip-sync from slide TTS

Date: 2026-10-28
Builds on: `2026-10-27-narrated-video-unified-design.md` (actor model,
silent avatars, avatar language and staleness)

## Goal

Today an avatar video is made offline and uploaded by hand to a slide's
video placeholder. Add a second way to get one: generate it automatically
with ElevenLabs (Creatify Aurora lip-sync) from the slide's TTS audio and one
presenter portrait per deck, for one slide or a chosen set of slides. Manual
upload stays as it is.

A generated avatar is an ordinary `slide_videos` row, so `/playback`, the MP4
export, `resolve_slide_actors` and the stale warnings work on it unchanged.

## Decisions

| # | Decision | Source |
|---|----------|--------|
| G1 | The face image is **one portrait per deck**, uploaded in the Videos panel. | user |
| G2 | The avatar is optional. A slide **without a placeholder is never generated**; it keeps the TTS voice bubble. Generation only fills placeholders the user placed. | user |
| G3 | Placeholders can exist **without a video**: an "Add avatar placeholder" action creates one; deleting a video keeps its placeholder (empty); a separate "Remove placeholder" deletes it (and any video in it). Applies to uploaded avatars too. | user |
| G4 | A slide with **no TTS audio, or stale audio** (note changed after the audio), in the chosen language is **skipped and reported**; the job never synthesizes TTS. | user |
| G5 | A slide whose avatar is **fresh is skipped** (`up_to_date`); a stale or missing avatar is (re)generated; `force` regenerates anyway, uploads included. | user |
| G6 | Generation is started from the **Videos panel** (per-slide button and a multi-slide checklist) and from the **API**. | user |
| G7 | It runs as an **in-process background job** on `async_tasks`, polling ElevenLabs. A server restart fails the task (as for every async task); ElevenLabs generation ids are kept in the task for visibility. No resume, no webhooks. | user (approach 1) |
| G8 | Defaults: `720p` (request may pick `480p`); at most 2 slides in flight (`ELEVENLABS_LIPSYNC_CONCURRENCY`). | default |

## 1. ElevenLabs API (as verified 2026-10-28)

The pasted guideline's body shape is outdated. The reference
(<https://elevenlabs.io/docs/api-reference/flows/video/create>, `.../get`)
says:

- `POST /v1/flows/video`, header `xi-api-key`, JSON body:

  ```json
  {
    "model_id": "creatify-aurora",
    "image": {"type": "inline_base64", "content_base64": "...", "mime_type": "image/png"},
    "audio": {"type": "inline_base64", "content_base64": "...", "mime_type": "audio/mpeg"},
    "resolution": "720p"
  }
  ```

  Inputs may also be `{"type": "asset", "asset_id"}` (after
  `POST /v1/assets`) or `{"type": "generation", "generation_id"}` (output of
  an earlier ElevenLabs generation). We use `inline_base64` (≤ 25 MB decoded)
  for both: the TTS file is local and not an ElevenLabs generation, and it
  saves an upload round-trip. Accepted mimes: audio `audio/mpeg`,
  `audio/wav`; image `image/jpeg|png|webp|heic|heif`. Optional
  `audio_guidance_scale`, `guidance_scale`, `webhook` are not sent.
  Response: `{id, status: "pending"}`.
- `GET /v1/flows/video/{id}`: `status` is `pending | generating` (only `id`),
  `completed` (`content_url`, `content_mime_type`) or `failed`
  (`error_message`, `failure_reason` ∈ `timeout, model_error, moderated,
  invalid_parameters, dependency_failed, charging_failed, internal_error`).
  `content_url` is signed and expires about an hour after the response, so it
  is downloaded immediately. Failed generations are not charged.
- `GET /v1/flows/video` (list) is not used.

## 2. Data and storage

### 2.1 Portrait (G1)

- Stored in the existing `presentations.narration` JSON beside the bubble box:
  `narration.portrait = {path, url, mime_type, width, height, size_bytes,
  updated_at}`. No migration.
- File: `app_data/videos/{id}/portrait.<ext>`, replaced on re-upload (old file
  removed). Deck deletion already removes the folder's files; the portrait is
  added to what `remove_deck_video_files` removes.
- Accepted: JPEG, PNG, WebP; ≤ 10 MB; validated by decoding with Pillow (also
  gives `width`/`height`).
- Routes:
  - `PUT /{id}/videos/portrait` (multipart `file`) → `PortraitResponse`
  - `GET /{id}/videos/portrait` → `PortraitResponse` or 404
  - `DELETE /{id}/videos/portrait` → `{deleted: bool}`

  Registered before `/{id}/videos/{slide_index}` so `portrait` is never parsed
  as a slide index.

### 2.2 Generated avatars are `slide_videos` rows

- New nullable column `slide_videos.source`: `"upload" | "elevenlabs"`; `NULL`
  (rows before this change) reads as `"upload"`. New Alembic revision on top of
  `REVISION_SLIDE_VIDEO_LANGUAGE`; `REVISION_HEAD` points at it.
- For a generated row: `language` = the TTS audio's language;
  `source_note_hash` = **the audio row's** `source_note_hash` (what the avatar
  actually says); `original_filename` = `elevenlabs-<generation_id>.mp4`;
  `updated_at` is set on save, after the audio's `updated_at`, so
  `avatar_stale_reason` reports fresh.
- `save_slide_video` is split: the part after reading the upload
  (store file, probe metadata, ensure placeholder, upsert row, remove the old
  file) becomes `store_slide_video_bytes(...)`, shared by upload and
  generation. Upload behaviour is unchanged.
- `SlideVideoResponse` gains `source`.

### 2.3 Placeholders without a video (G3)

- `POST /{id}/videos/{slide_index}/placeholder` (optional form/JSON
  `x, y, width, height`) → adds an empty placeholder (bottom-right default box,
  as on upload) or moves the existing one; 422 for a non-template slide.
  Returns the slide's placeholder box and updated `ui`.
- `DELETE /{id}/videos/{slide_index}/placeholder` → removes the placeholder
  and any video (row + file) on that slide.
- `DELETE /{id}/videos/{slide_index}` and `DELETE /{id}/videos` now remove the
  video row and file but **keep** the placeholder.
- Empty placeholder semantics: no video row ⇒ `resolve_slide_actors` gives
  `voice` (or `none`), unchanged code. Its poster stays transparent in static
  exports and is excluded from animation targets (already the case).
- `slide_video_service.py` module docstring and the upload docstring are
  rewritten ("the placeholder lives on a slide only while the slide has a
  video" no longer holds).
- Editor: `slideVideoActions.ts` stops calling `withoutVideoPlaceholder` on
  video delete; it calls it on "Remove placeholder".

## 3. ElevenLabs client (`services/elevenlabs_lipsync.py`)

Thin, Presenton-independent, `httpx.AsyncClient`, injectable transport for
tests.

- Config getters in `utils/get_env.py`: `ELEVENLABS_API_KEY`,
  `ELEVENLABS_API_BASE_URL` (default `https://api.elevenlabs.io`),
  `ELEVENLABS_LIPSYNC_CONCURRENCY` (default 2, clamped 1–8).
- `async create(image: bytes, image_mime, audio: bytes, audio_mime,
  resolution) -> str` (generation id). Retries 429 and 5xx up to 3 times with
  exponential backoff (1 s, 2 s, 4 s; honours `Retry-After`).
- `async get(generation_id) -> LipsyncStatus` (dataclass: `state`,
  `content_url`, `content_mime_type`, `failure_reason`, `error_message`).
  Transient 5xx/network errors on `get` are retried on the next poll, not
  raised.
- `async download(content_url, max_bytes) -> bytes`, streamed, aborts above
  `get_slide_video_max_upload_bytes()`. No API key header is sent to the
  signed URL.
- Errors: `ElevenLabsConfigurationError` (key missing, 401/403),
  `ElevenLabsRequestError` (422 with `detail`, other 4xx, retries exhausted).

## 4. Generation job

### 4.1 `POST /{id}/videos/generate` → `AsyncTaskModel`

Request `SlideAvatarGenerationRequest`:

| field | type | default |
|---|---|---|
| `slide_indices` | `list[int] \| null` | `null` = every slide with a placeholder |
| `language` | `str \| null` | deck's only narrated language |
| `force` | `bool` | `false` |
| `resolution` | `"720p" \| "480p"` | `"720p"` |

Checked up front (synchronous 4xx, no task created):

- API key set → else 503 `ElevenLabsConfigurationError` message.
- Deck has a portrait → else 422.
- Language resolves → `MultipleNarrationLanguagesError` 422 as for
  `/playback`; deck with no narration at all → 422 "generate TTS first".
- Every index exists → else 404.
- No `slide_avatar_generation` task for this deck is `PENDING` → else 409
  with `{task_id}` in the detail.

The task (`type = "slide_avatar_generation"`) is created with its plan in
`data` (4.2) and the run is scheduled with `BackgroundTasks`, capturing the
owner id as the video-export task does.

### 4.2 Planning (pure function, `plan_avatar_generation`)

Per requested slide, in slide order, first matching rule wins:

1. not a template slide, or no placeholder → `skipped / no_placeholder`
2. no TTS audio in the language → `skipped / no_audio`
3. audio's `source_note_hash` ≠ current note digest → `skipped / audio_stale`
4. audio format not mp3/wav and ffmpeg unavailable →
   `skipped / unsupported_audio_format` (with ffmpeg, the audio is
   transcoded to mp3 in memory before sending)
5. has an avatar, `avatar_stale_reason` is `None`, not `force` →
   `skipped / up_to_date`
6. otherwise → `queued`

`task.data`:

```json
{
  "presentation_id": "...", "language": "en", "resolution": "720p",
  "phase": "queued|generating|done",
  "total": 5, "queued": 3, "completed": 1, "failed": 0, "skipped": 2,
  "slides": [
    {"slide_index": 2, "slide_id": "...", "state": "done",
     "generation_id": "...", "video_id": "..."},
    {"slide_index": 4, "slide_id": "...", "state": "failed",
     "reason": "moderated", "message": "...", "generation_id": "..."},
    {"slide_index": 5, "slide_id": "...", "state": "skipped", "reason": "no_audio"}
  ]
}
```

States: `queued → generating → done | failed`; `skipped` is final from
planning or from 4.3's re-check.

### 4.3 Run (`run_avatar_generation_task`)

- Loads portrait bytes once. Processes queued slides with an
  `asyncio.Semaphore(concurrency)`.
- Per slide: read audio file → `create` → store `generation_id`, state
  `generating` → poll `get` every 5 s, timeout 15 min (`failed / timeout`) →
  on `completed` download → **re-check** in a fresh session that the slide
  still exists and still has a placeholder (else `skipped /
  placeholder_removed`, video discarded) → `store_slide_video_bytes` with
  `source="elevenlabs"`, language and note hash from the audio row → `done`
  with `video_id`.
- ElevenLabs `failed` → `failed` with its `failure_reason` and message.
  Download/probe errors → `failed / invalid_output`.
- `task.data` is written after every state change (own short session per
  write, so polling sees progress).
- Final status: `ERROR` when an `ElevenLabsConfigurationError` occurs mid-run
  (remaining slides marked `failed / configuration`) or when every queued
  slide failed; otherwise `COMPLETED` (including "nothing to do"). `message`
  summarises counts, e.g. "2 generated, 1 failed, 2 skipped".
- Restart: `fail_interrupted_async_tasks` marks it failed, unchanged.

### 4.4 `GET /{id}/videos/generate`

Returns the deck's most recent `slide_avatar_generation` task (or 404), so the
editor can resume polling after a reload. Task details are polled through the
existing async-task status route.

### 4.5 `GET /{id}/videos` additions

`SlideVideosResponse` gains `portrait: PortraitResponse | null` and
`generation_available: bool` (API key configured).

## 5. Editor (Videos panel)

- **Presenter portrait** block at the top: thumbnail + Replace/Remove, or a
  drop zone. Caption: "Used to generate lip-synced avatars for every slide."
- **This slide**, by state:
  - not a template slide → existing note;
  - no placeholder → "Add avatar placeholder" + one line: without one, this
    slide is narrated by the voice bubble;
  - empty placeholder → "Upload video", "Generate", "Remove placeholder";
  - has a video → as today (Replace/Delete, stale warning) + "Generated" or
    "Uploaded" badge + "Regenerate" (sends `force` for this slide) + "Remove
    placeholder";
  - generating → spinner, "Generating… this takes a few minutes".
  - "Generate"/"Regenerate" are disabled with a tooltip giving the reason:
    no API key, no portrait, no audio, stale audio, or a job already running.
- **"Generate avatars…"** above "In this deck" opens a modal listing every
  slide with a placeholder: checkbox, slide number and title, status chip
  (`ready`, `no audio`, `audio stale`, `up to date`; `up to date` rows also
  show whether the avatar was uploaded or generated). `ready` rows are
  pre-ticked. Ticking an `up to date` row makes the request carry `force`;
  this is safe for the other ticked rows, which are missing or stale and would
  be generated anyway, and unticked rows are not in `slide_indices`. Language selector
  only when the deck has several narrated languages. Footer: "Generate N
  avatars". Chip logic is a pure helper, computed from `/videos` + the deck's
  audio list.
- **Progress**: polls the task every 3 s; per-slide state chips in "In this
  deck" and on "This slide". On each newly `done` slide, refetches that
  slide's video into the `slideVideos` store slice and syncs the placeholder
  `ui` via `withVideoPlaceholder`, so the canvas shows the avatar without a
  reload. On finish with failures/skips, a dismissible summary lists them with
  readable reasons. On panel mount, `GET /{id}/videos/generate` resumes
  polling a `PENDING` task.
- **Canvas**: an empty placeholder draws as today's dashed "Avatar" frame;
  the existing toolbar moves and resizes it.
- API wrapper additions in `services/api/slide-videos.ts`.

## 6. Configuration and docs

- `.env.example` and `docker-compose.yml` (both service blocks, like the TTS
  vars): `ELEVENLABS_API_KEY`, `ELEVENLABS_API_BASE_URL`,
  `ELEVENLABS_LIPSYNC_CONCURRENCY`.
- README: portrait, empty placeholders, generate endpoint with a curl example,
  skip reasons, env vars, cost note (each generated slide spends ElevenLabs
  credits; failed generations are free).
- `openai_spec.json` regenerated with `scripts/generate_openapi_spec.py`.

## 7. Testing

Backend unit:

- Client with `httpx.MockTransport`: exact create body (`model_id`,
  `inline_base64`, mimes, resolution), status mapping for all four states,
  401/403 → configuration error, 422 detail surfaced, 429 retried then
  succeeds / exhausted, download size cap, no `xi-api-key` on the signed URL.
- `plan_avatar_generation`: each skip reason, `force`, `slide_indices=null`,
  rule order.
- Runner with a fake client and an in-memory DB: transitions, concurrency
  cap respected, per-slide timeout, partial failure → `COMPLETED`, all failed
  → `ERROR`, configuration error mid-run, placeholder removed mid-run →
  `skipped`, saved row fields (`source`, `language`, note hash = audio's,
  not stale).
- Placeholders: add/move/remove; delete video keeps placeholder; remove
  placeholder deletes the video; empty placeholder slide → `voice` in
  `resolve_slide_actors`.
- Migration test extended for `source`.

Backend integration (HTTP, client mocked): portrait PUT/GET/DELETE and
validation; placeholder routes; generate 503/422/404/409; poll a task to
completion; `GET /videos` exposes `portrait` and `generation_available`; deck
delete removes the portrait file.

Frontend: Node tests for the placeholder-helper change and the status-chip
helper; Next.js type check.

Live smoke (manual, after explicit go-ahead because it spends credits): one
slide, `480p`, with the real key; check the saved video plays in the editor
and in `/playback`.

## Out of scope

Resume after restart; webhooks; synthesizing missing TTS inside the job;
per-slide portraits; cost estimates; other lip-sync providers; copying avatars
or the portrait when a deck is duplicated.

## Risks

- **Undocumented limits**: the API reference states no maximum audio length.
  A long note may be rejected or time out; it surfaces as a per-slide failure
  with ElevenLabs' message.
- **Credits on restart**: generations in flight at a restart are paid but
  lost; their ids stay in `task.data`.
- **Output aspect**: Aurora's output follows the portrait's aspect; the
  placeholder's `fit` (default `fill` on upload) decides how it is framed. A
  portrait matching the default 9:16 placeholder looks best; the README says
  so.
