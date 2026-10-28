# ElevenLabs Lip-synced Avatar Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a slide's silent avatar video with ElevenLabs Creatify Aurora from the slide's TTS audio and a per-deck portrait, for chosen slides, filling user-placed video placeholders; manual upload stays.

**Architecture:** Generated avatars are ordinary `slide_videos` rows (new `source` column) saved through a shared `store_slide_video_bytes`. A thin `httpx` client talks to ElevenLabs; a pure planner decides per slide; an in-process background job on `async_tasks` submits, polls, downloads and saves. New routes live in their own router module, included before `PRESENTATION_ROUTER`. The Videos panel gains portrait, placeholder and generation controls.

**Tech Stack:** FastAPI, SQLModel, Alembic, httpx, Pillow, pytest (`.venv/bin/python -m pytest`); Next.js/React/Redux Toolkit, `node --test` with esbuild bundling.

**Spec:** `docs/superpowers/specs/2026-10-28-elevenlabs-avatar-lipsync-design.md`

## Global Constraints

- ElevenLabs: `POST {base}/v1/flows/video`, header `xi-api-key`, body `{"model_id": "creatify-aurora", "image": {"type": "inline_base64", "content_base64", "mime_type"}, "audio": {...same}, "resolution": "720p"|"480p"}`; `GET {base}/v1/flows/video/{id}`.
- Env: `ELEVENLABS_API_KEY`; `ELEVENLABS_API_BASE_URL` default `https://api.elevenlabs.io`; `ELEVENLABS_LIPSYNC_CONCURRENCY` default 2, clamped 1–8.
- Audio sent as `audio/mpeg` or `audio/wav` only; other TTS formats are transcoded to mp3 with ffmpeg, else skipped `unsupported_audio_format`.
- Portrait: JPEG/PNG/WebP, ≤ 10 MB, stored at `app_data/videos/{id}/portrait.<ext>`, metadata in `presentations.narration["portrait"]`.
- Poll every 5 s; per-slide timeout 15 min; create retries 429/5xx ×3 (1 s, 2 s, 4 s, honour `Retry-After`).
- Async task type `slide_avatar_generation`; 409 while one is `PENDING` for the deck.
- Skip reasons (exact strings): `no_placeholder`, `no_audio`, `audio_stale`, `unsupported_audio_format`, `up_to_date`, `placeholder_removed`. Failure reasons: ElevenLabs `failure_reason` verbatim, plus `timeout`, `invalid_output`, `configuration`, `request_error`.
- `slide_videos.source`: `"upload"` | `"elevenlabs"`, NULL reads as `"upload"`.
- Deleting a video keeps its placeholder; removing a placeholder deletes its video.
- No real ElevenLabs calls in automated tests.
- Python tests: `cd servers/fastapi && .venv/bin/python -m pytest <path> -q`. Node tests: `cd servers/nextjs && node --test tests/<file>`. Type check: `cd servers/nextjs && npx tsc --noEmit -p .`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- A slide reordered or deleted while its avatar is generating → the video lands on the right slide (by `slide_id`) or is discarded; never on whatever now has that index. (Task 6 test `test_run_uses_slide_id_not_index`.)
- The portrait replaced or removed mid-job → the job uses the bytes loaded at start and still finishes. (Task 6 test `test_run_reads_portrait_once`.)
- A user deletes the generated video, then regenerates → placeholder kept, slide plans as `queued`. (Task 5 test `test_plan_empty_placeholder_is_queued`.)
- ElevenLabs returns `completed` with a non-MP4/WebM or truncated file → `failed / invalid_output`, nothing stored, no orphan file. (Task 6 test `test_run_invalid_output_leaves_no_file`.)
- Signed `content_url` must not receive the API key. (Task 4 test `test_download_sends_no_api_key`.)

---

### Task 1: `source` column and shared byte-storage path

Model: sonnet · effort: lower

**Files:**
- Create: `servers/fastapi/alembic/versions/f6a8b0c2d4e6_add_slide_video_source.py`
- Modify: `servers/fastapi/migrations.py` (add `REVISION_SLIDE_VIDEO_SOURCE = "f6a8b0c2d4e6"`, point `REVISION_HEAD` at it)
- Modify: `servers/fastapi/models/sql/slide_video.py` (add `source: Optional[str] = None`)
- Modify: `servers/fastapi/models/slide_video_response.py` (`SlideVideoResponse.source: Literal["upload","elevenlabs"] = "upload"`)
- Modify: `servers/fastapi/services/slide_video_service.py` (`slide_video_response` fills `source=video.source or "upload"`; split `save_slide_video`)
- Modify: `servers/fastapi/utils/video_files.py` (add `store_video_bytes`)
- Test: `servers/fastapi/tests/unit/test_migrations.py`, `servers/fastapi/tests/unit/test_slide_video_service.py`

**Interfaces:**
- Produces:
  - `utils.video_files.store_video_bytes(data: bytes, *, directory: str, stem: str, max_bytes: int) -> StoredVideo` — same container sniffing/validation and errors as `store_uploaded_video`.
  - `services.slide_video_service.store_slide_video_bytes(*, sql_session, presentation, slide, stored: StoredVideo, original_filename: Optional[str], language: Optional[str], source_note_hash: str, source: Literal["upload","elevenlabs"], x=None, y=None, width=None, height=None) -> SlideVideoModel` — everything `save_slide_video` does after storing the file (metadata, `ensure_video_placeholder`, upsert, commit, remove previous file, remove new file on error). `save_slide_video` keeps its signature and calls it with `source="upload"`, `source_note_hash=note_digest(slide.speaker_note or "")`.

- [ ] **Step 1: Tests.** Migration test mirroring the existing `language` revision test: after upgrade `slide_videos` has `source`; `REVISION_HEAD == "f6a8b0c2d4e6"`. Service tests: `test_store_slide_video_bytes_sets_source_and_hash` (row has `source="elevenlabs"`, given hash and language, placeholder present); `test_upload_sets_source_upload`; `test_response_source_defaults_to_upload_for_null`; `test_store_video_bytes_rejects_non_video` (raises the same error type as uploads).
- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/unit/test_migrations.py tests/unit/test_slide_video_service.py -q` → new tests FAIL.
- [ ] **Step 3: Implement.** Migration copies the idempotent `_has_table/_has_column` pattern of `e5f7a9b1c3d5`, `down_revision = "e5f7a9b1c3d5"`, nullable `sa.String`. Refactor `store_uploaded_video` so its validation is shared with `store_video_bytes`.
- [ ] **Step 4: Run** the full backend suite `.venv/bin/python -m pytest tests -q` → PASS (upload behaviour unchanged).
- [ ] **Step 5: Commit** `feat(video): slide video source column and byte-storage path`.

### Task 2: Placeholders without a video

Model: sonnet · effort: default

**Files:**
- Create: `servers/fastapi/api/v1/ppt/endpoints/slide_avatars.py` (`SLIDE_AVATARS_ROUTER = APIRouter(prefix="/presentation", tags=["Presentation"])`)
- Create: `servers/fastapi/models/slide_avatar_generation.py` (request/response models for Tasks 2, 3, 6)
- Modify: `servers/fastapi/api/v1/ppt/router.py` (include `SLIDE_AVATARS_ROUTER` **before** `PRESENTATION_ROUTER`)
- Modify: `servers/fastapi/services/slide_video_service.py` (`delete_slide_videos` keeps placeholders; new functions below; module + upload docstrings rewritten per spec 2.3)
- Modify: `servers/nextjs/app/(presentation-generator)/presentation/utils/slideVideoActions.ts` (`removeSlideVideo` no longer calls `withoutVideoPlaceholder`)
- Test: `servers/fastapi/tests/unit/test_slide_video_service.py`, `servers/fastapi/tests/integration/test_slide_avatar_endpoints_http.py` (new; copy `_build_client`, `_mp4`, `_template_ui` helpers from `test_slide_video_endpoint_http.py` into a shared `tests/integration/_video_http_helpers.py` and import them from both files)

**Interfaces:**
- Consumes: `_presentation_with_slides_for_speaker_notes`, `_slide_at_index` from `api/v1/ppt/endpoints/presentation.py`.
- Produces:
  - `set_video_placeholder(sql_session, slide, *, x=None, y=None, width=None, height=None) -> StageBox` (raises `SlideVideoNotSupportedError` for non-template slides).
  - `remove_slide_placeholder(sql_session, *, presentation_id, slide) -> bool` (deletes any video row + file, strips the placeholder; returns whether a placeholder existed).
  - `PlaceholderResponse(slide_index: int, slide_id: uuid.UUID, placeholder: StageBox, ui: dict)`.
  - Routes: `POST /{id}/videos/{slide_index}/placeholder` (JSON body `{x?, y?, width?, height?}`) → `PlaceholderResponse`, 422 non-template; `DELETE /{id}/videos/{slide_index}/placeholder` → `{"removed": bool}`.

- [ ] **Step 1: Tests.** Unit: `test_delete_video_keeps_placeholder`; `test_set_placeholder_adds_default_box` (box equals `default_placeholder_box(None, None)`); `test_set_placeholder_moves_existing`; `test_remove_placeholder_deletes_video_and_file`; `test_empty_placeholder_resolves_voice` (`resolve_slide_actors` gives `voice` for a slide with placeholder + audio, no video). Integration: POST then GET slide shows one placeholder; POST on a non-template slide → 422; DELETE placeholder after upload → video gone (404 on `GET /videos/{i}`), placeholder gone.
- [ ] **Step 2: Run** them → FAIL.
- [ ] **Step 3: Implement** service functions, models, router, router inclusion; update `removeSlideVideo` in the editor and its doc comment.
- [ ] **Step 4: Run** backend suite + `node --test tests/video-placeholder.test.mjs` → PASS.
- [ ] **Step 5: Commit** `feat(video): avatar placeholders that outlive their video`.

### Task 3: Deck portrait

Model: sonnet · effort: lower

**Files:**
- Create: `servers/fastapi/services/slide_avatar_portrait.py`
- Modify: `servers/fastapi/api/v1/ppt/endpoints/slide_avatars.py` (portrait routes)
- Modify: `servers/fastapi/models/slide_video_response.py` (`SlideVideosResponse.portrait: Optional[PortraitResponse] = None`, `generation_available: bool = False`)
- Modify: `servers/fastapi/api/v1/ppt/endpoints/presentation.py` (`get_slide_videos` fills both fields; deck delete removes the portrait file)
- Modify: `servers/fastapi/utils/get_env.py` (`get_elevenlabs_api_key_env`, `get_elevenlabs_api_base_url_env`, `get_elevenlabs_lipsync_concurrency_env` — raw `os.getenv`, like the TTS getters)
- Test: `servers/fastapi/tests/unit/test_slide_avatar_portrait.py`, `servers/fastapi/tests/integration/test_slide_avatar_endpoints_http.py`

**Interfaces:**
- Produces:
  - `PortraitResponse(url: str, mime_type: str, width: int, height: int, size_bytes: int, updated_at: datetime)` (in `models/slide_avatar_generation.py`).
  - `async save_portrait(sql_session, presentation, data: bytes) -> PortraitResponse` — Pillow-decodes, rejects non JPEG/PNG/WebP or > 10 MB with `InvalidPortraitError(ValueError)`; writes `portrait-<hex8>.<ext>` (new name each time, cache-busting like videos), removes the previous file, reassigns `presentation.narration` as a new dict.
  - `portrait_response(presentation) -> Optional[PortraitResponse]`
  - `read_portrait(presentation) -> Optional[tuple[bytes, str]]` (bytes, mime)
  - `async delete_portrait(sql_session, presentation) -> bool`
  - `portrait_path(presentation) -> Optional[str]` (used by deck delete)
  - `generation_available() -> bool` (API key non-empty)
  - Routes `PUT/GET/DELETE /{id}/videos/portrait` (PUT multipart `file`; 422 on `InvalidPortraitError`; GET 404 when none).

- [ ] **Step 1: Tests.** Unit: save PNG → response dims, file exists, `narration["bubble"]` untouched; re-save removes old file; 11 MB → `InvalidPortraitError`; GIF → `InvalidPortraitError`; delete removes file + key. Integration: PUT/GET/DELETE; `GET /videos` has `portrait` and `generation_available` toggling with `monkeypatch.setenv("ELEVENLABS_API_KEY", "k")`; `GET /videos/portrait` is not swallowed by `/{slide_index}` (200, not 422); deck delete removes the portrait file.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** backend suite → PASS.
- [ ] **Step 5: Commit** `feat(video): per-deck presenter portrait`.

### Task 4: ElevenLabs lip-sync client

Model: sonnet · effort: default

**Files:**
- Create: `servers/fastapi/services/elevenlabs_lipsync.py`
- Test: `servers/fastapi/tests/unit/test_elevenlabs_lipsync.py`

**Interfaces:**
- Consumes: env getters from Task 3.
- Produces:
  - `MODEL_ID = "creatify-aurora"`
  - `@dataclass(frozen=True) LipsyncStatus(state: Literal["pending","generating","completed","failed"], content_url: Optional[str] = None, content_mime_type: Optional[str] = None, failure_reason: Optional[str] = None, error_message: Optional[str] = None)`
  - `class ElevenLabsConfigurationError(RuntimeError)`, `class ElevenLabsRequestError(RuntimeError)` (`.status_code: Optional[int]`)
  - `class ElevenLabsLipsyncClient(api_key: str, base_url: str = "https://api.elevenlabs.io", *, transport: Optional[httpx.AsyncBaseTransport] = None, sleep: Callable[[float], Awaitable[None]] = asyncio.sleep)` with `async create(*, image: bytes, image_mime: str, audio: bytes, audio_mime: str, resolution: str) -> str`, `async get(generation_id: str) -> Optional[LipsyncStatus]` (None on transient network/5xx), `async download(url: str, *, max_bytes: int) -> bytes`, `async aclose()`.
  - `lipsync_client_from_env() -> ElevenLabsLipsyncClient` (raises `ElevenLabsConfigurationError` when the key is unset/blank).
  - `lipsync_concurrency() -> int` (default 2, clamp 1–8, bad value → 2).

- [ ] **Step 1: Tests** (all with `httpx.MockTransport`, injected no-op `sleep`): `test_create_body` (exact JSON incl. base64 of given bytes, header `xi-api-key`); `test_get_maps_each_state` (four payloads from spec §1); `test_401_raises_configuration`; `test_422_surfaces_detail` (message contains first `detail[].msg`); `test_429_retried_then_succeeds` (sleeps recorded `[1, 2]` or `Retry-After` value); `test_429_exhausted_raises_request_error`; `test_get_5xx_returns_none`; `test_download_size_cap`; `test_download_sends_no_api_key`; `test_from_env_requires_key`; `test_concurrency_clamped`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(video): ElevenLabs Creatify Aurora lip-sync client`.

### Task 5: Generation planner and lip-sync audio

Model: sonnet · effort: default

**Files:**
- Create: `servers/fastapi/services/slide_avatar_generation.py` (planner + audio part only)
- Test: `servers/fastapi/tests/unit/test_slide_avatar_generation_plan.py`

**Interfaces:**
- Consumes: `find_video_placeholder`, `is_template_slide`, `avatar_stale_reason` (slide_video_service); `note_digest` (speaker_note_tts_service); `utils.ffmpeg_utils.ffmpeg_available`.
- Produces:
  - `@dataclass SlidePlan(slide_index: int, slide_id: uuid.UUID, state: Literal["queued","skipped"], reason: Optional[str] = None)` with `to_dict() -> dict` matching spec §4.2 slide entries.
  - `plan_avatar_generation(slides: Sequence[SlideModel], videos: Sequence[SlideVideoModel], audios: Sequence[SpeakerNoteAudioModel], *, language: str, slide_indices: Optional[Sequence[int]], force: bool, can_transcode: bool) -> list[SlidePlan]` — rules in spec §4.2 order; `slide_indices=None` means every slide that has a placeholder (slides without one are omitted, not reported); explicit indices are all reported, in slide order. `audios` already filtered to `language`.
  - `LIPSYNC_AUDIO_MIME = {"mp3": "audio/mpeg", "wav": "audio/wav"}`
  - `async lipsync_audio(path: str, audio_format: str) -> tuple[bytes, str]` — mp3/wav read as-is; others transcoded with `ffmpeg -i <path> -f mp3 -` in a subprocess.

- [ ] **Step 1: Tests:** one per rule (`no_placeholder` for non-template and for template without placeholder, `no_audio`, `audio_stale`, `unsupported_audio_format` with `can_transcode=False`, transcodable ogg is `queued` with `can_transcode=True`, `up_to_date`, `force` → `queued`), `test_plan_empty_placeholder_is_queued`, `test_plan_none_indices_lists_placeholder_slides_only`, `test_plan_rule_order` (non-template slide without audio → `no_placeholder`), `test_lipsync_audio_passthrough_mp3`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(video): plan which slides get a generated avatar`.

### Task 6: Generation job and endpoints

Model: opus · effort: default (concurrency, sessions, partial failure)

**Files:**
- Modify: `servers/fastapi/services/slide_avatar_generation.py` (runner)
- Modify: `servers/fastapi/api/v1/ppt/endpoints/slide_avatars.py` (generate routes)
- Modify: `servers/fastapi/models/slide_avatar_generation.py` (`SlideAvatarGenerationRequest`, `AvatarGenerationPreview`)
- Test: `servers/fastapi/tests/unit/test_slide_avatar_generation_run.py`, `servers/fastapi/tests/integration/test_slide_avatar_endpoints_http.py`

**Interfaces:**
- Consumes: Tasks 1, 3, 4, 5; `async_session_maker`, `set_current_owner_id`, `set_current_owner_is_admin` as used by `run_generate_presentation_video_task`.
- Produces:
  - `ASYNC_TASK_TYPE_SLIDE_AVATAR_GENERATION = "slide_avatar_generation"`
  - `SlideAvatarGenerationRequest(slide_indices: Optional[list[int]] = None, language: Optional[str] = None, force: bool = False, resolution: Literal["720p","480p"] = "720p")`
  - `initial_task_data(presentation_id, *, language, resolution, plans: list[SlidePlan]) -> dict` (spec §4.2 shape, `phase="queued"`, counts).
  - `async run_avatar_generation_task(task_id: str, presentation_id: uuid.UUID, owner_id: Optional[uuid.UUID], *, client_factory: Callable[[], ElevenLabsLipsyncClient] = lipsync_client_from_env, poll_interval: float = 5.0, slide_timeout: float = 900.0, session_maker = async_session_maker) -> None`
  - Routes:
    - `POST /{id}/videos/generate` → `AsyncTaskModel`; checks in spec §4.1 order: key (503), portrait (422), language (422 via `MultipleNarrationLanguagesError`; no narration at all → 422 "generate TTS first"), indices (404), running task (409, `detail={"message": ..., "task_id": ...}`).
    - `GET /{id}/videos/generate` → latest task of the type for the deck (match `data["presentation_id"]`), 404 if none.
    - `GET /{id}/videos/generate/preview?language=` → `AvatarGenerationPreview(language: str, slides: list[dict])` = the dry-run plan with `slide_indices=None, force=False`. The editor uses it for chips and disabled reasons instead of re-implementing staleness in TypeScript (spec §5 chip helper, simplified).
- Runner behaviour: spec §4.3. Per slide re-check by `slide_id` (not index) in a fresh session; task `data` rewritten after every state change; `client.aclose()` in `finally`; final status/message per spec.

- [ ] **Step 1: Tests.** Unit with a fake client (scripted statuses) and a temp SQLite: `test_run_happy_path` (row `source="elevenlabs"`, language and note hash from audio, `avatar_stale_reason` is None, task `COMPLETED`, slide `done` with `video_id`); `test_run_partial_failure_completes` (one `moderated`); `test_run_all_failed_is_error`; `test_run_timeout` (`slide_timeout=0.01`); `test_run_configuration_error_marks_rest`; `test_run_respects_concurrency` (max in-flight creates == `lipsync_concurrency()`); `test_run_placeholder_removed_mid_run`; `test_run_uses_slide_id_not_index`; `test_run_reads_portrait_once`; `test_run_invalid_output_leaves_no_file`. Integration (runner patched to a fake client): 503 no key; 422 no portrait; 422 two languages without `language`; 404 bad index; 409 second request while first `PENDING`; POST → poll `/api/v1/async-tasks/status/{id}` → `COMPLETED`; `GET /videos/generate` returns it; preview lists chips for a mixed deck.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** full backend suite → PASS.
- [ ] **Step 5: Commit** `feat(video): background job generating lip-synced avatars`.

### Task 7: Editor data layer

Model: sonnet · effort: lower

**Files:**
- Modify: `servers/nextjs/app/(presentation-generator)/services/api/slide-videos.ts`
- Modify: `servers/nextjs/store/slices/slideVideos.ts` (portrait, `generationAvailable`, generation task snapshot)
- Modify: `servers/nextjs/app/(presentation-generator)/presentation/utils/slideVideoActions.ts`
- Create: `servers/nextjs/app/(presentation-generator)/presentation/utils/avatarGeneration.ts` (pure helpers)
- Test: `servers/nextjs/tests/avatar-generation.test.mjs` (esbuild pattern of `video-placeholder.test.mjs`)

**Interfaces:**
- Consumes: Task 2/3/6 routes and response shapes.
- Produces:
  - Types: `SlideVideoSource = "upload" | "elevenlabs"`; `SlideVideo.source`; `PortraitInfo`; `AvatarSlidePlan = {slide_index, slide_id, state: "queued"|"generating"|"done"|"failed"|"skipped", reason?, message?, generation_id?, video_id?}`; `AvatarGenerationTask = {id, status, message, data: {phase, total, queued, completed, failed, skipped, language, slides: AvatarSlidePlan[]}}`.
  - `SlideVideosApi`: `uploadPortrait(id, file)`, `deletePortrait(id)`, `addPlaceholder(id, slideIndex)`, `removePlaceholder(id, slideIndex)`, `generate(id, body)`, `latestGeneration(id)` (null on 404), `previewGeneration(id, language?)`, `getTask(taskId)` (`/api/v1/async-tasks/status/{id}`).
  - Thunks: `addSlidePlaceholder({presentationId, slideId})`, `removeSlidePlaceholder({presentationId, slideId})` (syncs `ui` with `withVideoPlaceholder` / `withoutVideoPlaceholder`), `startAvatarGeneration({presentationId, slideIds, language?, force})` (maps ids → saved indices via `savedSlide`), `pollAvatarGeneration(presentationId, taskId)` (every 3 s until not `pending`; on each newly `done` slide fetches that slide's video and syncs its placeholder, reusing the upload path's code).
  - Pure: `chipFor(plan?: AvatarSlidePlan, preview?: AvatarSlidePlan): "ready"|"no_audio"|"audio_stale"|"up_to_date"|"unsupported_audio"|"generating"|"failed"|"done"`; `generateDisabledReason({generationAvailable, hasPortrait, preview, running}): string | null` (exact copy: "Set ELEVENLABS_API_KEY on the server to generate avatars.", "Upload a presenter portrait first.", "Generate this slide's narration audio first.", "The note changed since the audio was made. Regenerate the audio first.", "An avatar generation is already running."); `newlyDone(prev, next): string[]` (slide ids); `failureLabel(reason): string`.
- [ ] **Step 1: Tests** for `chipFor`, `generateDisabledReason` (each message, priority in listed order), `newlyDone`, `failureLabel` (`moderated` → "Rejected by moderation", unknown → raw reason).
- [ ] **Step 2: Run** `node --test tests/avatar-generation.test.mjs` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** node tests + `npx tsc --noEmit -p .` → PASS.
- [ ] **Step 5: Commit** `feat(editor): avatar generation data layer`.

### Task 8: Videos panel UI

Model: sonnet · effort: default

**Files:**
- Modify: `servers/nextjs/app/(presentation-generator)/presentation/components/VideosPanel.tsx`
- Create: `servers/nextjs/app/(presentation-generator)/presentation/components/GenerateAvatarsDialog.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/presentation/hooks/useSlideVideo.ts` (expose placeholder + generation actions)

**Interfaces:**
- Consumes: Task 7 thunks/helpers; existing `Modal`/button styles in the panel.
- Produces: UI per spec §5 — portrait block; "This slide" states (no placeholder / empty / has video with Generated|Uploaded badge + Regenerate / generating spinner "Generating… this takes a few minutes"); "Generate avatars…" dialog (rows from preview, `ready` pre-ticked, `force` when an `up_to_date` row is ticked, language select only with >1 language, footer "Generate N avatars"); per-row chips in "In this deck"; dismissible finish summary "X generated, Y failed, Z skipped" with per-slide reasons via `failureLabel`; on mount `latestGeneration` resumes polling a `pending` task.
- [ ] **Step 1:** Implement; keep existing upload/replace/delete flows intact.
- [ ] **Step 2: Run** `npx tsc --noEmit -p .` and `node --test` → PASS.
- [ ] **Step 3: Manual check** with the `run` skill: add placeholder, upload portrait, open dialog (chips correct with no key → disabled reason shown), delete video keeps the dashed frame.
- [ ] **Step 4: Commit** `feat(editor): generate lip-synced avatars from the Videos panel`.

### Task 9: Configuration and docs

Model: haiku · effort: lower

**Files:**
- Modify: `.env.example`, `docker-compose.yml` (both service blocks, next to `OPENAI_COMPAT_TTS_*`), `README.md`, `servers/fastapi/openai_spec.json` (regenerate via `scripts/generate_openapi_spec.py`, never hand-edit)
- Modify: `/home/matteo/.claude/projects/-var-www-presenton/memory/narrated-playback-actor-model.md` (avatars can now be generated via ElevenLabs as well as uploaded)
- [ ] **Step 1:** Add the three env vars (empty defaults). README section per spec §6 incl. curl for `POST /videos/generate`, skip reasons, the 9:16 portrait tip and the credits note.
- [ ] **Step 2: Run** the spec generator; `git diff --stat` shows only the new routes/models changed in `openai_spec.json`.
- [ ] **Step 3: Commit** `docs: ElevenLabs avatar generation setup`.

### Task 10: Whole-branch review and live smoke

Model: opus · effort: default

- [ ] **Step 1:** Full suites: backend, `node --test`, `tsc`.
- [ ] **Step 2:** Code review of the whole diff against the spec and the Review Focus list.
- [ ] **Step 3:** Ask the user before the live smoke (spends credits): one slide, `resolution="480p"`, real key; check the saved video plays in the editor and appears in `GET /{id}/playback` as `actor: "video"`.
