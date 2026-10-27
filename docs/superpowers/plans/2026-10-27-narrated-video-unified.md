# Unified Narrated Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the MP4 export (HyperFrames animations, subtitles, TTS providers) from `origin/feat/manual-speaker-notes` into `main`'s avatar-video work, and make both read one actor timeline: silent avatars lip-synced to TTS, the bubble at the deck's bubble box, crossfades between slides.

**Architecture:** One pure function, `resolve_slide_actors`, decides each slide's presenter (`video`/`voice`/`none`) and feeds both `GET /playback` and the MP4 renderer. The renderer keeps its two picture paths (still PNG frames, HyperFrames entrance clip). Two new pure modules add crossfades (`utils/video_crossfade.py`) and actor overlays (`utils/video_actors.py`) on top of either path. Audio timing never changes.

**Tech Stack:** FastAPI + SQLModel + Alembic (Python 3.11), ffmpeg 7.1 filter graphs, HyperFrames (`@hyperframes/producer` 0.8.203, `gsap` 3.13.0, headless Chrome), Next.js / TypeScript, pytest, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-27-narrated-video-unified-design.md`

## Global Constraints

- Branch `feat/narrated-video-unified` (already created from `origin/main` @ `7a3b9dcc`, no upstream). Never push without asking the user.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Stage coordinates are 1280×720 (`STAGE_WIDTH`, `STAGE_HEIGHT` in `slide_video_service.py`).
- Avatars are silent: the avatar's audio stream is never mapped; TTS is the only soundtrack and sets every slide's length.
- `crossfade_seconds`: default `0.5`, valid `0 ≤ x ≤ 1.5`, `0` = hard cuts on today's concat path.
- `avatars`: default `True`.
- MP4 export routes: `/{id}/video-export`, `/{id}/video-export/async`.
- Alembic: merge revision `d4e6f8a0b2c4` (down `("b7d9f1a3c5e8", "c88953aea876")`), language revision `e5f7a9b1c3d5` (down `d4e6f8a0b2c4`). Never edit `b7d9f1a3c5e8` or `c88953aea876`.
- HyperFrames comes over unchanged: `video-render-hyperframes/{package.json,package-lock.json,render.mjs}` pinning `@hyperframes/producer` 0.8.203 (with `core`, `engine`, `parsers`, `lint`, `studio-server` 0.8.203) and `gsap` 3.13.0; `utils/hyperframes_runner.py`, `utils/hyperframes_composition.py`, the Dockerfile/Dockerfile.dev install steps.
- ffmpeg target is 7.1 (Debian trixie, the Docker image). Never put a retiming filter (`setpts`, `fps`) between `trim` and `tpad` on a clip segment (ffmpeg 7.x drops the padding).
- New code matches its module: docstrings that say *why*, no new dependencies.

**Shell setup used by every task** (run once per shell):

```bash
cd /var/www/presenton
export SP=/tmp/claude-1000/-var-www-presenton/c8a20b70-d78b-42d7-9024-f2457fcbab35/scratchpad
export FF=$SP/ffmpeg/ffmpeg-n7.1-latest-linux64-gpl-7.1
export FFMPEG_BINARY=$FF/bin/ffmpeg FFPROBE_BINARY=$FF/bin/ffprobe
export HYPERFRAMES_BROWSER_PATH=/usr/bin/google-chrome
```

All pytest commands below are run from `servers/fastapi` as `.venv/bin/python -m pytest -q <paths>`; Node tests from `servers/nextjs` as `node --test <file>`.

## Review Focus

1. **An avatar shorter than its slide** (offline render trimmed tight): its last frame must stay on screen to the end of the slide, not vanish. Owned by Task 7 (real-ffmpeg test samples after the avatar's end).
2. **An uploaded avatar that does carry an audio track**: it must not be heard. Owned by Task 7 (`-an` before the avatar input; audio input count unchanged).
3. **A deck whose first or last slide is an avatar slide**: the avatar is there from frame 0 / to the last frame, with no fade from black. Owned by Task 7 (`plan_actor_segments` edge test).
4. **Very short slides with a long crossfade** (`min_slide_seconds=0.3`, `crossfade_seconds=1.5`): fades must not overlap and the video must keep the narration's length. Owned by Task 6 (clamp test plus a real-ffmpeg frame count).
5. **A multi-language deck where the avatar was synced to one language**: rendering another language shows the bubble with that language's TTS, and the response says why. Owned by Tasks 4 and 7.

---

### Task 1: Commit the avatar editor work

**Files:** the 7 modified and 11 untracked paths already in the working tree (`git status --short`): `services/slide_video_service.py`, `tests/unit/test_slide_video_service.py`, `PresentationActions.tsx`, `PresentationPage.tsx`, `TemplateV2KonvaSlide.tsx`, `nodes.tsx`, `store/store.ts`, `VideosPanel.tsx`, `useSlideVideo.ts`, `slideVideoActions.ts`, `services/api/slide-videos.ts`, `components/slide-editor/video/*`, `public/figma/presentation-actions/videos.svg`, `store/slices/slideVideos.ts`, `tests/video-placeholder.test.mjs`.

- [ ] **Step 1: Verify it passes as-is**

Run: `.venv/bin/python -m pytest -q tests/unit/test_slide_video_service.py tests/unit/test_video_files.py tests/integration/test_slide_video_endpoint_http.py` → `73 passed`.
Run (servers/nextjs): `node --test tests/video-placeholder.test.mjs` → `pass 6`. Record the type-check baseline: `npx tsc --noEmit -p . | grep -c "error TS" > $SP/tsc-baseline.txt`; none of the errors may be in the listed files. Later tasks' "type check" means: the same count or lower, and none in files the task touched.

- [ ] **Step 2: Commit**

```bash
git add -A servers/fastapi/services/slide_video_service.py servers/fastapi/tests/unit/test_slide_video_service.py servers/nextjs
git commit -m "feat(editor): upload, replace and remove slide avatar videos from the editor"
```

---

### Task 2: Merge the speaker-notes branch (MP4 export + HyperFrames)

**Files:**
- Merge: `origin/feat/manual-speaker-notes` (`1432328c`)
- Resolve: `servers/fastapi/alembic/env.py`, `servers/fastapi/migrations.py`, `servers/fastapi/services/database.py`, `servers/fastapi/utils/get_env.py`, `servers/fastapi/api/v1/ppt/endpoints/presentation.py`, `servers/fastapi/tests/integration/test_speaker_note_tts_endpoint_http.py`, `servers/fastapi/openai_spec.json`
- Create: `servers/fastapi/alembic/versions/d4e6f8a0b2c4_merge_slide_and_presentation_videos.py`
- Create: `servers/fastapi/tests/unit/test_hyperframes_real_render.py`
- Delete from index: `servers/fastapi/utils/__init__.pyc`; Modify: `.gitignore`
- Test: `servers/fastapi/tests/unit/test_migrations.py`

**Interfaces:**
- Produces: `migrations.REVISION_SLIDE_VIDEOS = "b7d9f1a3c5e8"`, `REVISION_PRESENTATION_VIDEOS = "c88953aea876"`, `REVISION_VIDEOS_MERGE = "d4e6f8a0b2c4"`, `REVISION_HEAD = REVISION_VIDEOS_MERGE` (Task 3 moves the head).

- [ ] **Step 1: Provision the real-render toolchain (scratchpad, not the repo)**

```bash
mkdir -p $SP/ffmpeg && curl -fsSL -o $SP/ffmpeg/ff.tar.xz \
  https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n7.1-latest-linux64-gpl-7.1.tar.xz \
  && tar -xJf $SP/ffmpeg/ff.tar.xz -C $SP/ffmpeg && $FFMPEG_BINARY -version | head -1
```
Expected: `ffmpeg version n7.1...`.

- [ ] **Step 2: Merge and resolve**

`git merge --no-ff --no-commit origin/feat/manual-speaker-notes`. Resolve every conflict by keeping **both** sides:
- `env.py`, `database.py` (3 hunks), the test's table-create hunk: import/register/create both `SlideVideoModel` and `PresentationVideoModel`.
- `get_env.py`: keep `get_slide_video_max_upload_mb_env` and every TTS/OpenRouter/Vertex/rate-limit getter.
- `presentation.py`: deck delete collects `audio_paths`, `slide_video_paths(...)` **and** `presentation_video_paths(...)` and removes both after commit (`remove_slide_video_files`, `remove_presentation_video_files`); keep all avatar routes and all export routes.
- `migrations.py`: both revision constants plus `REVISION_VIDEOS_MERGE`, `REVISION_HEAD = REVISION_VIDEOS_MERGE`.
- `openai_spec.json`: take either side, then regenerate: `.venv/bin/python scripts/generate_openapi_spec.py`.

Then `git rm --cached servers/fastapi/utils/__init__.pyc`, and add `*.pyc` to `.gitignore` if no rule covers it.

- [ ] **Step 3: Write the merge revision**

`d4e6f8a0b2c4_merge_slide_and_presentation_videos.py`: `revision = "d4e6f8a0b2c4"`, `down_revision = ("b7d9f1a3c5e8", "c88953aea876")`, empty `upgrade()`/`downgrade()`, docstring saying it joins the two branches' heads.

- [ ] **Step 4: Write the failing migration tests** in `tests/unit/test_migrations.py`, following the existing tests that end with `assert version == migrations.REVISION_HEAD`:

```python
@pytest.mark.parametrize("start", ["b7d9f1a3c5e8", "c88953aea876"])
def test_database_at_either_video_head_upgrades_to_head(tmp_path, start):
    # upgrade a fresh sqlite db to `start`, run the startup migration,
    # then: version == migrations.REVISION_HEAD
    # and both "slide_videos" and "presentation_videos" tables exist
```

- [ ] **Step 5: Install HyperFrames locally and add a real-render test**

```bash
(cd video-render-hyperframes && PUPPETEER_SKIP_DOWNLOAD=1 npm ci --omit=dev)
```
`tests/unit/test_hyperframes_real_render.py`, skipped unless `hyperframes_available() and ffmpeg_available()`:

```python
def test_two_slide_composition_renders_with_real_hyperframes(tmp_path):
    # two CompositionSlide: html "<div data-hf-el=\"e0\" ...>A</div>", 0–1 s and 1–2 s,
    # one SlideTween(target="e0", from_values={"opacity": 0.0}, duration=0.5, delay=0.0, ease="power2.out") on the first
    # write_hyperframes_project(..., width=1280, height=720, gsap_path=str(gsap_script_path()))
    # await render_hyperframes_project(project_dir, out, fps=30)
    # assert ffprobe frame count of out in (59, 60, 61) and width x height == 1280x720
```

- [ ] **Step 6: Run everything**

Run: `.venv/bin/python -m pytest -q tests` → all pass; the `needs a real ffmpeg` tests and the new HyperFrames test **run** (not skipped): check with `-rs` that no test from `test_presentation_video_service.py`, `test_speaker_indicator.py` or `test_hyperframes_real_render.py` is listed as skipped.
Run (servers/nextjs): `node --test tests/video-placeholder.test.mjs tests/template-v2-animation-targets.test.mjs` → all pass.

- [ ] **Step 7: Commit the merge**

```bash
git add -A && git commit -m "Merge narrated MP4 export, HyperFrames animations and TTS providers into the avatar work"
```

---

### Task 3: Avatar language and stale reasons

**Files:**
- Create: `servers/fastapi/alembic/versions/e5f7a9b1c3d5_add_slide_video_language.py`
- Modify: `servers/fastapi/migrations.py` (`REVISION_SLIDE_VIDEO_LANGUAGE`, `REVISION_HEAD`), `servers/fastapi/models/sql/slide_video.py`, `servers/fastapi/models/slide_video_response.py`, `servers/fastapi/services/slide_video_service.py`, `servers/fastapi/api/v1/ppt/endpoints/presentation.py` (`upload_slide_video`, `get_slide_videos`, `get_slide_video`)
- Modify: `servers/nextjs/app/(presentation-generator)/services/api/slide-videos.ts`, `.../presentation/components/VideosPanel.tsx`
- Test: `servers/fastapi/tests/unit/test_slide_video_service.py`, `servers/fastapi/tests/integration/test_slide_video_endpoint_http.py`

**Interfaces:**
- Produces:
  - `SlideVideoModel.language: Optional[str] = None`
  - `SlideVideoResponse.language: Optional[str] = None`, `SlideVideoResponse.stale_reason: Optional[Literal["note_changed", "audio_regenerated"]] = None` (`stale` stays, `= stale_reason is not None`)
  - `avatar_stale_reason(video: SlideVideoModel, slide: SlideModel, audio: Optional[SpeakerNoteAudioModel]) -> Optional[Literal["note_changed", "audio_regenerated"]]`
  - `slide_video_response(video, slide, audio: Optional[SpeakerNoteAudioModel] = None) -> SlideVideoResponse`
  - `slide_videos_response(presentation_id, slides, videos, audios: Sequence[SpeakerNoteAudioModel] = ()) -> SlideVideosResponse`. It matches each video to the audio of the same slide and `language == video.language`.
  - `save_slide_video(..., language: Optional[str] = None)`. An explicit value goes through `resolve_tts_language(...).code`. If unset, it is the deck's only narrated language, else `None`.

- [ ] **Step 1: Write the failing unit tests**

```python
def test_stale_reason_is_note_changed_when_the_note_was_edited():
    # video.source_note_hash = note_digest("old"); slide.speaker_note = "new"
    assert avatar_stale_reason(video, slide, None) == "note_changed"

def test_stale_reason_is_audio_regenerated_when_its_language_audio_is_newer():
    # same note; video.language="en", updated_at=T; audio.language="en", updated_at=T+60s
    assert avatar_stale_reason(video, slide, audio) == "audio_regenerated"

def test_audio_in_another_language_does_not_make_the_avatar_stale():
    # video "en" at T, audio "it" at T+60s, via slide_videos_response
    assert response.videos[0].stale is False and response.videos[0].stale_reason is None

def test_avatar_without_language_only_checks_the_note():
    # video.language=None, newer audio, same note
    assert avatar_stale_reason(video, slide, audio) is None
```

- [ ] **Step 2: Write the failing HTTP tests**

`test_upload_records_the_given_language`: form `language=en` → `200`, `body["language"] == "en"`.
`test_upload_defaults_to_the_decks_only_narrated_language`: one `SpeakerNoteAudioModel` in `en` → `body["language"] == "en"`.
`test_upload_without_narration_leaves_language_unset`: no audio → `body["language"] is None`.
`test_upload_rejects_an_unsupported_language`: `language=xx-nope` → `422`.

- [ ] **Step 3: Run to see them fail**

Run: `.venv/bin/python -m pytest -q tests/unit/test_slide_video_service.py tests/integration/test_slide_video_endpoint_http.py` → the 8 new tests FAIL.

- [ ] **Step 4: Implement**

The migration adds a nullable `language` column (`sa.String`) to `slide_videos`, guarded by a has-column check like `b7d9f1a3c5e8`, and its downgrade drops it. Update `REVISION_HEAD` to `"e5f7a9b1c3d5"`. The endpoint adds `language: Optional[str] = Form(default=None)` and maps `UnsupportedTTSLanguageError` → 422 via `_speaker_note_audio_http_error`. The `get_slide_videos` and `get_slide_video` endpoints load `list_speaker_note_audios(sql_session, presentation_id=id)` and pass them in.

- [ ] **Step 5: Editor copy**

In `slide-videos.ts`, add `language?: string | null; stale_reason?: "note_changed" | "audio_regenerated" | null` to the video type. The VideosPanel warning text depends on `stale_reason`:
- `note_changed`: "The speaker note changed after this video was uploaded, so the avatar may not say what the note says." (today's text)
- `audio_regenerated`: "The narration audio was regenerated after this video was uploaded, so the lips may not match the voice."

The deck-list badge reads "Note changed" or "Audio changed".

- [ ] **Step 6: Run tests**

Run: the Step 3 command → all pass. Then `.venv/bin/python -m pytest -q tests/unit/test_migrations.py` → pass. Run (servers/nextjs): type check against the baseline (Task 1).

- [ ] **Step 7: Commit** — `feat: tie avatar videos to their narration language and report why one is stale`

---

### Task 4: One actor timeline for playback and export

**Files:**
- Modify: `servers/fastapi/services/slide_video_service.py` (new `SlideActor`, `resolve_slide_actors`, `avatar_box`, `avatar_fit`; `build_playback` uses them)
- Test: `servers/fastapi/tests/unit/test_slide_video_service.py`, `servers/fastapi/tests/integration/test_slide_video_endpoint_http.py`

**Interfaces:**
- Produces (in `services/slide_video_service.py`):
  ```python
  ActorKind = Literal["video", "voice", "none"]

  @dataclass(frozen=True)
  class SlideActor:
      slide: SlideModel
      actor: ActorKind
      audio: Optional[SpeakerNoteAudioModel]
      video: Optional[SlideVideoModel]          # set only when actor == "video"
      avatar_skipped: Optional[Literal["disabled", "language"]] = None

  def resolve_slide_actors(slides: Sequence[SlideModel],
                           audio_by_slide: Mapping[uuid.UUID, SpeakerNoteAudioModel],
                           video_by_slide: Mapping[uuid.UUID, SlideVideoModel], *,
                           language: Optional[str], avatars: bool = True) -> list[SlideActor]
  def avatar_box(slide: SlideModel, video: SlideVideoModel) -> StageBox   # placeholder box, else default_placeholder_box(video.width, video.height)
  def avatar_fit(slide: SlideModel) -> Literal["fill", "cover", "contain"] # placeholder "fit"; anything else -> "contain" (the editor's imageFit rule)
  ```
- Rules: avatar present and `avatars` and (`video.language is None` or `== language`) → `video`; else audio → `voice` with `avatar_skipped` set when an avatar existed; else `none`.

- [ ] **Step 1: Write the failing tests**

`test_avatar_wins_when_it_matches_the_language` → `actor == "video"`.
`test_voice_when_avatars_are_disabled` → `actor == "voice"`, `avatar_skipped == "disabled"`.
`test_voice_when_avatar_language_differs` (video `en`, language `it`) → `"voice"`, `"language"`.
`test_avatar_without_language_matches_any_language` → `"video"`.
`test_silent_avatar_slide_is_still_video` (no audio) → `"video"`, `audio is None`.
`test_none_without_audio_or_avatar` → `"none"`.
`test_avatar_box_falls_back_to_default_when_placeholder_was_removed` → `avatar_box(slide_without_placeholder, video(width=720,height=1280)) == default_placeholder_box(720, 1280)`.
`test_avatar_fit_mirrors_the_editor` → `"fill"`, `"cover"`, `"contain"` pass through; missing or `"stretch"` → `"contain"`.
HTTP: `test_playback_video_slide_duration_is_the_audio_duration`: avatar `duration_seconds=5.0` and audio `4.2` → playback slide `duration_seconds == 4.2`, `actor == "video"`.

- [ ] **Step 2: Run to see them fail** — same pytest paths as Task 3, Step 3 → new tests FAIL.

- [ ] **Step 3: Implement** the functions. Then rewrite `build_playback`'s per-slide loop on `resolve_slide_actors(..., language=resolved.code if resolved else None)`. For video slides, `duration = audio.duration_seconds`, falling back to the video's. Fix its docstring and the `get_presentation_playback` docstring: the avatar is silent and lip-synced to `audio`.

- [ ] **Step 4: Run tests** → all pass (including the 73 pre-existing avatar tests).

- [ ] **Step 5: Commit** — `refactor: resolve each slide's presenter in one place for playback and export`

---

### Task 5: Draw the MP4 bubble at the deck's bubble box

**Files:**
- Modify: `servers/fastapi/utils/speaker_indicator.py` (`write_speaker_indicator_frames`)
- Modify: `servers/fastapi/services/presentation_video_service.py` (call site passes `resolve_bubble(presentation)`)
- Test: `servers/fastapi/tests/unit/test_speaker_indicator.py`, `servers/fastapi/tests/unit/test_presentation_video_service.py`

**Interfaces:**
- Produces: `write_speaker_indicator_frames(directory: str, *, box: tuple[float, float, float, float], width: int, height: int, fps: int) -> SpeakerIndicatorFrames`. `box` is `(x, y, w, h)` in stage px. The diameter is `_even(min(w, h) * height / 720)`, the bubble is centred in the scaled box, and `x`/`y` are the frame's top-left corner, shadow padding included.

- [ ] **Step 1: Write the failing tests** (replace `test_frames_form_a_loop_in_the_top_right_corner`; pass `box` in the other existing calls)

```python
def test_frames_sit_centred_in_the_bubble_box(tmp_path):
    frames = write_speaker_indicator_frames(str(tmp_path), box=(1160, 600, 96, 96), width=1920, height=1080, fps=30)
    assert (frames.x, frames.y, frames.size, frames.frame_count) == (1720, 880, 184, 36)

def test_non_square_box_uses_its_shorter_side(tmp_path):
    frames = write_speaker_indicator_frames(str(tmp_path), box=(100, 100, 200, 80), width=1280, height=720, fps=30)
    # diameter 80 -> padding 12 -> size 104, centred on (200, 140)
    assert (frames.size, frames.x, frames.y) == (104, 148, 88)
```
Service: `test_bubble_is_drawn_at_the_decks_bubble_box`. Capture `box` with a monkeypatched `write_speaker_indicator_frames` in the full-pipeline harness. The default deck gives `(1160.0, 600.0, 96.0, 96.0)`. A deck with `narration={"bubble": {"position": {"x": 40, "y": 40}, "size": {"width": 120, "height": 120}}}` gives `(40.0, 40.0, 120.0, 120.0)`.

- [ ] **Step 2: Run to see them fail** — `.venv/bin/python -m pytest -q tests/unit/test_speaker_indicator.py tests/unit/test_presentation_video_service.py` → new tests FAIL.
- [ ] **Step 3: Implement.** Update the module docstring: the bubble now sits in the deck's bubble box, which defaults to bottom-right.
- [ ] **Step 4: Run tests** → all pass, real-ffmpeg tests included (not skipped).
- [ ] **Step 5: Commit** — `feat(video): draw the MP4 voice bubble at the deck's bubble box`

---

### Task 6: Crossfade between slides

**Files:**
- Create: `servers/fastapi/utils/video_crossfade.py`
- Modify: `servers/fastapi/services/presentation_video_service.py` (`VideoRenderOptions`, `compute_video_source_hash`, `build_ffmpeg_args`, `build_animated_ffmpeg_args`)
- Modify: `servers/fastapi/models/presentation_video_response.py` (`PresentationVideoRequest.crossfade_seconds: Optional[float] = None`), `servers/fastapi/api/v1/ppt/endpoints/presentation.py` (`_presentation_video_options_from_request` passes it when set)
- Test: `servers/fastapi/tests/unit/test_video_crossfade.py`, `servers/fastapi/tests/unit/test_presentation_video_service.py`

**Interfaces:**
- Produces (in `utils/video_crossfade.py`):
  ```python
  MAX_CROSSFADE_SECONDS = 1.5
  def slide_frames(spans: Sequence[tuple[float, float]], fps: int) -> list[tuple[int, int]]
      # (start_seconds, duration_seconds) -> (start_frame, frames) by rounding cumulative start/end, like plan_animated_segments
  def plan_half_fades(frames: Sequence[int], crossfade_seconds: float, fps: int) -> list[int]
      # one per boundary; 0 when crossfade_seconds == 0, else max(1, round(min(crossfade_seconds*fps, frames[b], frames[b+1]) / 2))
  def segment_padding(index: int, half_fades: Sequence[int]) -> tuple[int, int]   # (pre, post) cloned frames
  def xfade_chain(labels: Sequence[str], boundary_frames: Sequence[int], half_fades: Sequence[int], fps: int, output_label: str) -> list[str]
  ```
- `VideoRenderOptions.crossfade_seconds: float = 0.5`. Out-of-range values raise `ValueError("crossfade_seconds must be between 0 and 1.5")`. The preset gains `-cut` when `0` and `-xf{round(x*1000)}` for any other non-default value. The hash gains a `crossfade_seconds={x!r}` line.
- Consumed by Task 7: `slide_frames`, `plan_half_fades`.

- [ ] **Step 1: Write the failing pure tests** (`test_video_crossfade.py`)

```python
def test_half_fades_are_centred_and_rounded():
    assert plan_half_fades([90, 120, 60], 0.5, 30) == [8, 8]

def test_half_fades_never_exceed_the_shorter_neighbour():
    assert plan_half_fades([10, 120], 1.5, 30) == [5]

def test_zero_crossfade_means_hard_cuts():
    assert plan_half_fades([90, 120], 0, 30) == [0]

def test_xfade_offsets_keep_the_timeline():
    assert xfade_chain(["s0", "s1", "s2"], [90, 210], [8, 8], 30, "vcf") == [
        "[s0][s1]xfade=transition=fade:duration=0.533333:offset=2.733333[x1]",
        "[x1][s2]xfade=transition=fade:duration=0.533333:offset=6.733333[vcf]",
    ]
```

- [ ] **Step 2: Write the failing service tests**

`test_crossfade_presets`: `VideoRenderOptions().preset == "1080p-30-soft"`. `crossfade_seconds=0` gives `"1080p-30-soft-cut"` and `1.0` gives `"1080p-30-soft-xf1000"`.
`test_options_reject_crossfade_out_of_range`: `-0.1` and `1.6` raise `ValueError`.
`test_source_hash_changes_when_crossfade_changes`.
`test_build_ffmpeg_args_with_crossfade_loops_each_slide_and_chains_xfade` (2 slides): `"concat" not in argv`, `argv.count("-loop") == 2`, `"xfade=transition=fade"` in the filter.
`test_build_ffmpeg_args_without_crossfade_keeps_the_concat_path`: `crossfade_seconds=0` gives `["-f", "concat"]` in argv and no `xfade`.
`test_build_animated_ffmpeg_args_pads_segments_for_crossfade`: segment 1's chain contains `tpad=start=8:start_mode=clone`. In every segment chain, `trim` comes before `tpad`, which comes before `setpts`.
Real ffmpeg (gated like the existing ones):
- `test_crossfaded_still_video_keeps_the_narration_length_with_real_ffmpeg`: 3 slides of 3.0 s, 2.0 s and 0.3 s, crossfade 1.5, fps 30. ffprobe frame count must be `round(5.3*30) ± 1`.
- `test_crossfaded_animated_video_keeps_every_hold_with_real_ffmpeg`: use the existing animated real test's setup with crossfade 0.5. Frame count must be the timeline's ±1.

- [ ] **Step 3: Run to see them fail** — `.venv/bin/python -m pytest -q tests/unit/test_video_crossfade.py tests/unit/test_presentation_video_service.py` → new tests FAIL.

- [ ] **Step 4: Implement**

The still path, when `crossfade_seconds > 0` and there are 2+ slides: one input per slide, `-loop 1 -framerate {fps} -t {(frames+pre+post)/fps:.6f} -i img`, chained as `[i:v]format=yuv420p,fps=fps={fps},trim=end_frame={frames+pre+post},setpts=N/{fps}/TB[s{i}]`, then `xfade_chain`. Burned subtitles keep working from the chain's output. The concat path stays byte-for-byte for `0`.
The animated path, when `crossfade_seconds > 0`: each segment is `trim=end_frame={clip_frames},format=yuv420p,tpad=start={pre}:start_mode=clone:stop={hold+post}:stop_mode=clone,setpts=N/{fps}/TB`. Omit `start=` when `pre == 0`. Then `xfade_chain`. `0` keeps today's concat and `setpts`.
In both paths `boundary_frames[b] = start_frame[b+1]` from `slide_frames`.

- [ ] **Step 5: Run tests** → all pass; real-ffmpeg ones not skipped.
- [ ] **Step 6: Commit** — `feat(video): crossfade between slides without moving the narration`

---

### Task 7: Avatars and actor fades in the MP4

**Files:**
- Create: `servers/fastapi/utils/video_actors.py`
- Modify: `servers/fastapi/utils/speaker_indicator.py` (remove `speaker_indicator_intervals`, `speaker_indicator_input_args`, `speaker_indicator_overlay`; their tests move to `test_video_actors.py`)
- Modify: `servers/fastapi/services/presentation_video_service.py` (`VideoRenderOptions.avatars`, `SlideTiming` actor fields, `_build_timings`, both ffmpeg arg builders, `compute_video_source_hash`, `PresentationVideoResult.avatars`, `generate_presentation_video`)
- Modify: `servers/fastapi/models/presentation_video_response.py` (`PresentationVideoRequest.avatars: bool = True`, `PresentationVideoGenerationResponse.avatars: Optional[dict[str, Any]] = None`), `servers/fastapi/api/v1/ppt/endpoints/presentation.py` (pass `avatars`; copy `avatars` into the async task's final data wherever `animation` is)
- Test: `servers/fastapi/tests/unit/test_video_actors.py`, `servers/fastapi/tests/unit/test_presentation_video_service.py`

**Interfaces:**
- Consumes: `resolve_slide_actors`, `avatar_box`, `avatar_fit`, `resolve_bubble`, `list_slide_videos` (Task 4 / main); `slide_frames`, `plan_half_fades` (Task 6); `write_speaker_indicator_frames` (Task 5).
- Produces (in `utils/video_actors.py`):
  ```python
  @dataclass(frozen=True)
  class ActorSpan:                 # one slide, in output frames
      kind: Literal["voice", "video", "none"]
      start_frame: int
      frames: int
      avatar_path: Optional[str] = None
      box: Optional[tuple[int, int, int, int]] = None   # output px, even w/h
      fit: str = "fill"
      lead_in_frames: int = 0

  @dataclass(frozen=True)
  class ActorSegment:
      kind: Literal["bubble", "avatar"]
      start_frame: int
      frames: int
      fade_in_frames: int
      fade_out_frames: int
      avatar_path: Optional[str] = None
      box: Optional[tuple[int, int, int, int]] = None
      fit: str = "fill"
      play_from_frame: int = 0      # held first frames before the avatar plays

  def scale_box(box: tuple[float, float, float, float], width: int, height: int) -> tuple[int, int, int, int]
  def fit_filter(fit: str, width: int, height: int) -> str           # ends in an alpha format
  def plan_actor_segments(spans: Sequence[ActorSpan], half_fades: Sequence[int]) -> list[ActorSegment]
  def actor_input_args(segments: Sequence[ActorSegment], indicator: Optional[SpeakerIndicatorFrames], fps: int) -> list[str]
  def actor_overlay_filters(segments: Sequence[ActorSegment], *, first_input_index: int,
                            indicator: Optional[SpeakerIndicatorFrames], fps: int,
                            video_label: str, output_label: str) -> list[str]
  ```
- Segment rules: consecutive `voice` spans merge into one bubble segment, every `video` span is its own avatar segment, and `none` draws nothing. An edge facing another slide with `h = half_fades[b] > 0` extends the segment by `h` and fades it over `2h`. Deck start and end edges never fade. An avatar's `play_from_frame` is the extension at its start plus `lead_in_frames`.
- `SlideTiming` gains `actor: str = "none"`, `avatar_id`, `avatar_updated_at`, `avatar_path`, `avatar_box: Optional[tuple[float, float, float, float]]` (stage px), `avatar_fit: str = "fill"`. In the MP4, `actor` is `"video"` only when the avatar file exists. It is `"voice"` only when the audio file exists.
- `VideoRenderOptions.avatars: bool = True`. The preset gains `-noavatar` when it is false. `speaker_indicator=False` turns voice spans into `none` and leaves avatars alone.
- The `avatars` summary looks like `{"requested": bool, "applied_slides": [int], "stale": [{"slide_index", "reason"}], "skipped": [{"slide_index", "reason"}], "duration_mismatch": [{"slide_index", "video_seconds", "audio_seconds"}]}`. A mismatch is a gap over 0.5 s.

- [ ] **Step 1: Write the failing pure tests** (`test_video_actors.py`)

```python
SPANS = [ActorSpan("voice", 0, 90), ActorSpan("voice", 90, 90),
         ActorSpan("video", 180, 120, avatar_path="/a.mp4", box=(1000, 400, 240, 400), lead_in_frames=12),
         ActorSpan("none", 300, 60)]

def test_voice_slides_share_one_bubble_and_the_avatar_fades_across_its_edges():
    bubble, avatar = plan_actor_segments(SPANS, [8, 8, 8])
    assert (bubble.kind, bubble.start_frame, bubble.frames, bubble.fade_in_frames, bubble.fade_out_frames) == ("bubble", 0, 188, 0, 16)
    assert (avatar.start_frame, avatar.frames, avatar.fade_in_frames, avatar.fade_out_frames, avatar.play_from_frame) == (172, 136, 16, 16, 20)

def test_hard_cuts_without_crossfade():
    bubble, avatar = plan_actor_segments(SPANS, [0, 0, 0])
    assert (bubble.frames, avatar.start_frame, avatar.frames, avatar.fade_in_frames) == (180, 180, 120, 0)

def test_first_and_last_slides_have_no_outer_fade():
    (only,) = plan_actor_segments([ActorSpan("video", 0, 90, avatar_path="/a.mp4", box=(0, 0, 2, 2))], [])
    assert (only.start_frame, only.fade_in_frames, only.fade_out_frames) == (0, 0, 0)

def test_consecutive_avatar_slides_are_separate_segments():
    assert len(plan_actor_segments([ActorSpan("video", 0, 60, avatar_path="/a.mp4", box=(0,0,2,2)),
                                    ActorSpan("video", 60, 60, avatar_path="/b.mp4", box=(0,0,2,2))], [8])) == 2

def test_scale_box_to_1080p():
    assert scale_box((1160, 600, 96, 96), 1920, 1080) == (1740, 900, 144, 144)

def test_fit_filters():
    assert fit_filter("fill", 240, 400) == "scale=240:400,format=yuva420p"
    assert fit_filter("cover", 240, 400) == "scale=240:400:force_original_aspect_ratio=increase,crop=240:400,format=yuva420p"
    assert fit_filter("contain", 240, 400) == "scale=240:400:force_original_aspect_ratio=decrease,format=yuva420p,pad=240:400:(ow-iw)/2:(oh-ih)/2:color=black@0"

def test_avatar_audio_is_never_read():
    _, avatar = plan_actor_segments(SPANS, [8, 8, 8])
    assert actor_input_args([avatar], None, 30) == ["-an", "-i", "/a.mp4"]

def test_avatar_holds_its_first_and_last_frame_and_fades():
    _, avatar = plan_actor_segments(SPANS, [8, 8, 8])
    graph = ";".join(actor_overlay_filters([avatar], first_input_index=5, indicator=None, fps=30, video_label="vbase", output_label="vout"))
    assert "tpad=start=20:start_mode=clone:stop=-1:stop_mode=clone,trim=end_frame=136" in graph
    assert "fade=t=in:s=0:n=16:alpha=1" in graph and "fade=t=out:s=120:n=16:alpha=1" in graph
    assert "overlay=x=1000:y=400:eof_action=pass" in graph and graph.endswith("format=yuv420p[vout]")
```
The bubble input is `["-f", "image2", "-loop", "1", "-framerate", "30", "-t", "6.266667", "-i", <pattern>]` for 188 frames (`test_bubble_input_is_cut_to_its_segment`).

- [ ] **Step 2: Write the failing service tests**

- `test_avatar_slide_keeps_tts_audio_and_shows_no_bubble`: an audio input per slide (as today), the avatar input preceded by `-an`, and no bubble segment covering the video slide.
- `test_avatars_false_falls_back_to_bubble_and_changes_preset`: preset ends with `-noavatar` and the video slide becomes part of a bubble segment.
- `test_source_hash_changes_when_avatar_is_replaced` (avatar `updated_at`), `test_source_hash_changes_when_bubble_box_moves`, `test_source_hash_changes_when_placeholder_moves`.
- `test_response_reports_stale_skipped_and_mismatched_avatars`:
  - full-pipeline harness: one stale avatar (`note_changed`), one in another language, one 5.0 s avatar on 4.2 s of audio
  - `avatars == {"requested": True, "applied_slides": [...], "stale": [{"slide_index": i, "reason": "note_changed"}], "skipped": [{"slide_index": j, "reason": "language"}], "duration_mismatch": [{"slide_index": k, "video_seconds": 5.0, "audio_seconds": 4.2}]}`
- Real ffmpeg: `test_avatar_appears_in_its_box_only_on_its_slide_with_real_ffmpeg`.
  - Make a 1.0 s solid-red avatar (`-f lavfi -i color=red:s=240x400:r=30:d=1`).
  - Deck: 3 white stills of 2.0 s each, actors voice/video/none, crossfade 0, lead-in 0.4.
  - Pixel at the avatar box centre: red at t=3.0, still red at t=3.9 (held after it ends at 3.4), not red at t=1.0 and t=5.5.

- [ ] **Step 3: Run to see them fail** — `.venv/bin/python -m pytest -q tests/unit/test_video_actors.py tests/unit/test_presentation_video_service.py tests/unit/test_speaker_indicator.py` → new tests FAIL.

- [ ] **Step 4: Implement `utils/video_actors.py`**

Filter chains (one label per segment, overlays chained from `video_label`, the last one then `format=yuv420p` into `output_label`):
- bubble: `[k:v]format=rgba,trim=end_frame={frames},setpts=N/{fps}/TB+{start/fps:.6f}/TB{fades}[a{n}]`, overlaid at `indicator.x/y`
- avatar: `[k:v]setpts=PTS-STARTPTS,fps={fps},{fit_filter},tpad=start={play_from}:start_mode=clone:stop=-1:stop_mode=clone,trim=end_frame={frames},setpts=N/{fps}/TB+{start/fps:.6f}/TB{fades}[a{n}]`, overlaid at the box's x/y
- `{fades}` = `,fade=t=in:s=0:n={fin}:alpha=1` and/or `,fade=t=out:s={frames-fout}:n={fout}:alpha=1`, each only when non-zero
- every overlay: `overlay=x=..:y=..:eof_action=pass:format=auto`

- [ ] **Step 5: Wire the service**

1. `generate_presentation_video` loads `list_slide_videos` and calls `resolve_slide_actors(ordered_slides, audio_by_slide, video_by_slide, language=target_language.code, avatars=opts.avatars)`.
2. `_build_timings` takes the actors and fills the new `SlideTiming` fields.
3. `_actor_spans(timings, options) -> list[ActorSpan]` uses `slide_frames`, `avatar_fit` and `lead_in_frames = round(lead_in_seconds*fps)`. It also uses `scale_box` on `timing.avatar_box`, which `_build_timings` filled from `avatar_box()` as `(position.x, position.y, size.width, size.height)`.
4. Both arg builders replace `_add_speaker_indicator_input`/`speaker_indicator_overlay` with `actor_input_args` + `actor_overlay_filters` inside `_video_output_parts`, before burned subtitles.
5. Bubble frames are written only when some segment is a bubble.

- [ ] **Step 6: Run tests** — the Step 3 command and then the whole suite `.venv/bin/python -m pytest -q tests -rs`. Everything passes; no real-ffmpeg or HyperFrames test is skipped.
- [ ] **Step 7: Commit** — `feat(video): play silent avatars in their placeholder and fade the presenter with the slide`

---

### Task 8: Rename the export routes and fold duplicate helpers

**Files:**
- Modify: `servers/fastapi/api/v1/ppt/endpoints/presentation.py` (export route decorators)
- Modify: `servers/fastapi/utils/video_files.py`, `servers/fastapi/services/slide_video_service.py`, `servers/fastapi/services/presentation_video_service.py`
- Modify: `servers/fastapi/openai_spec.json` (regenerated)
- Test: `servers/fastapi/tests/integration/test_presentation_video_endpoint_http.py`, `servers/fastapi/tests/integration/test_slide_video_endpoint_http.py`, `servers/fastapi/tests/unit/test_video_files.py`

**Interfaces:**
- Produces (in `utils/video_files.py`): `remove_file(path: Optional[str]) -> None` (missing file ignored, other `OSError` logged) and `remove_deck_video_files(presentation_id: uuid.UUID, paths: Sequence[str]) -> None` (removes the files, then `rmdir`s `<videos>/<presentation_id>` once empty). These replace both services' `_remove_video_file` and `remove_*_video_files`. `presentation_video_service._video_url_for_path` is replaced by `asset_directory_utils.app_data_file_url`.

- [ ] **Step 1: Write the failing tests**

In `test_presentation_video_endpoint_http.py`, change every `/video` and `/video/async` URL to `/video-export` and `/video-export/async`. Add:
- `test_old_video_route_is_gone`: `POST /{id}/video` → status in `(404, 405)`.
- `test_deleting_a_deck_removes_avatars_and_rendered_videos`: the deck has an uploaded avatar and a `PresentationVideoModel` row with files on disk. After `DELETE /presentation/{id}`, both files and the `videos/<id>` folder are gone.

In `test_video_files.py`, add `test_remove_deck_video_files_keeps_a_folder_that_still_has_files`.

- [ ] **Step 2: Run to see them fail** — `.venv/bin/python -m pytest -q tests/integration/test_presentation_video_endpoint_http.py tests/unit/test_video_files.py` → FAIL.
- [ ] **Step 3: Implement**, then regenerate the spec: `.venv/bin/python scripts/generate_openapi_spec.py`.
- [ ] **Step 4: Run the whole backend suite** — `.venv/bin/python -m pytest -q tests` → all pass.
- [ ] **Step 5: Commit** — `refactor(api): move MP4 export to /video-export and share video file cleanup`

---

### Task 9: Keep the placeholder out of animation planning

**Files:**
- Modify: `servers/nextjs/lib/template-v2-json-to-html.ts` (`templateV2AnimationTargets`, `renderSlideRoot`)
- Test: `servers/nextjs/tests/template-v2-animation-targets.test.mjs`

**Interfaces:**
- Consumes: `isVideoPlaceholderElement(value: unknown)` from `@/components/slide-editor/video/video-placeholder` (Task 1).
- Ids stay positional: a skipped placeholder at index `n` leaves `e{n}` unused, so the targets and the annotated HTML still line up.

- [ ] **Step 1: Write the failing test**

`placeholder is rendered but never an animation target`. The ui is `[text "Title", placeholder image {video_placeholder: true}]`.
- `templateV2AnimationTargets(ui).map((t) => t.id)` deep-equals `["e0"]`.
- `templateV2UiToHtmlFragment(ui, { annotateElements: true })` contains exactly one `data-hf-el=` and still contains the placeholder's `<img`.

- [ ] **Step 2: Run to see it fail** — `node --test tests/template-v2-animation-targets.test.mjs` → FAIL.
- [ ] **Step 3: Implement** (skip in both places with `isVideoPlaceholderElement`).
- [ ] **Step 4: Run** — `node --test tests/template-v2-animation-targets.test.mjs tests/video-placeholder.test.mjs` → pass; type check against the baseline (Task 1).
- [ ] **Step 5: Commit** — `fix(video): never animate the avatar placeholder`

---

### Task 10: Docs, full verification, image build

**Files:**
- Modify: `README.md` (avatar and video-export sections), docstrings in `servers/fastapi/services/slide_video_service.py` and the upload endpoint (no remaining "carries its own audio")

- [ ] **Step 1: Docs**

The README must say:
- Avatars are silent and lip-synced to the slide's TTS; any audio track in the file is ignored.
- The upload takes a `language` field, and the stale reasons are `note_changed` and `audio_regenerated`.
- The export lives at `/{id}/video-export[/async]`, with `avatars` (default `true`) and `crossfade_seconds` (default `0.5`, `0`–`1.5`).
- The MP4 bubble uses the deck's bubble box (`PUT /{id}/playback/bubble`), which defaults to bottom-right.
- HyperFrames needs `npm ci` in `video-render-hyperframes/` outside Docker.

`grep -rn "own audio" README.md servers/fastapi --include=*.py --include=*.md` must return nothing.

- [ ] **Step 2: Full verification**

Run: `.venv/bin/python -m pytest -q tests -rs` → all pass, nothing skipped for missing ffmpeg/HyperFrames.
Run (servers/nextjs): `node --test tests/*.test.mjs` → all pass; type check against the baseline (Task 1).
Run: `docker build -f Dockerfile -t presenton:narrated-video .` → succeeds (`npm ci` for `video-render-hyperframes`, `ffmpeg` installed). Then `docker run --rm presenton:narrated-video sh -c 'ffmpeg -version | head -1 && test -d /app/video-render-hyperframes/node_modules/@hyperframes/producer && echo ok'` → `ffmpeg version 7.1...` and `ok`.

- [ ] **Step 3: Commit** — `docs: silent avatars, video-export options and HyperFrames setup`

- [ ] **Step 4: Ask the user before pushing**, then `git push -u origin feat/narrated-video-unified` and open a PR into `main` whose body summarises the decisions table in the spec and ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
