# Start a presentation from PowerPoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Step 1 of the create wizard gets a **From a topic | From PowerPoint** switch. From PowerPoint uploads a `.pptx` and imports every slide as an editable template-v2 slide (content and design kept, no template, no AI rewrite). The deck then continues through Presenter → Preview → Narration → Export.

**Architecture:** The frontend reuses the template-import upload (`fonts/check`, `template/fonts-upload-and-slides-preview` → `modified_pptx_url`). One new synchronous endpoint, `POST /api/v1/ppt/presentation/import`, does the rest in one pass:
- converts the file with `convert_pptx_to_json`;
- fits non-16:9 slides into 1280×720;
- copies the PowerPoint speaker notes;
- picks the presenter slides (an explicit count is spread evenly; Automatic makes one LLM call, with a deterministic fallback);
- adds bottom-right portrait video slots;
- stores the deck with `source="pptx"`.

The pure logic lives in a small `services/pptx_import/` package. The endpoint only handles the database and the response. On the frontend, the deck wizard switches on `presentation.source === 'pptx'`, so the AI outline path is never mounted. The backend also refuses every route that would rebuild an imported deck from a template.

**Tech Stack:** FastAPI + SQLModel + Alembic, python-pptx, the `llmai` structured-output client (`utils/llm_calls`). Vue 3 + vue-router + TanStack Query + vue-i18n, shadcn-vue/reka-ui, Tailwind v4, Vitest + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-11-26-pptx-presentation-import-design.md` (approved). Also read `docs/superpowers/plans/2026-11-26-pptx-presentation-import-handoff.md`.

## Global Constraints

- Branch `feat/pptx-presentation-import` (already created from `dev`). Do not modify `servers/nextjs`. No Smart-generation features.
- Only `.pptx`. `MAX_NUMBER_OF_SLIDES = 50` (backend), `MAX_PPTX_BYTES = 100 * 1024 * 1024` (frontend, `api/templateImport.ts`).
- Stage is **1280×720**. Converter output is 1280 wide and keeps the deck's aspect (`_preview_dimensions_from_pptx` in `templates/fonts_and_slides_preview.py`).
- Imported slides: `layout_group="blank"`, `layout="__blank_slide__"`, `content={}`, `ui={id, description, background, components: [], elements}`.
- `presentations.source = "pptx"` for imports and `NULL` otherwise. `presentations.source_name` holds the original file name.
- Presenter slots go **bottom-right, portrait 9:16**: `default_placeholder_box(*PRESENTER_SLOT_ASPECT)` from `services/slide_video_service.py`. Never use `quietest_corner_box` here.
- Explicit count N on S slides: `N' = min(N, S)`. The indexes are `floor(i*(S-1)/(N'-1) + 0.5)` for `i in 0..N'-1`, and N' = 1 gives `[0]`. **Half-up rounding, not Python's `round`.**
- Automatic (`n_videos is None`): first and last slides plus the indexes the LLM picks. If the LLM fails: `[0, *range(4, S-1, 4), S-1]`, deduplicated, and `[0]` when S = 1. The import must never fail because of this step.
- `n_videos == 0` means no slots.
- Copy: switch labels **From a topic** / **From PowerPoint**; Presenter primary **Import slides**; limit note "Only the first 50 of 70 slides will be imported"; chat refusal "This slide came from PowerPoint; edit it directly in the editor." Every new string goes in `en` **and** `it`.
- URL: `?start=pptx` selects PowerPoint mode, and no `start` means topic mode. After import, land on `/p/:id/create/preview`.
- Aera look, additive only; light-theme tokens (`text-strong`, `theme-light.mjs`). The Presenter step keeps its full prominence in PowerPoint mode.
- Tests:
  - backend: `cd servers/fastapi && .venv/bin/python -m pytest <path> -q`
  - frontend: `cd frontend && npx vitest run <path>`
  - full frontend check: `cd frontend && npm run check`

## Review Focus

1. **A deck with hidden slides or more than 50 slides.** Notes must land on the right slide. Align by the converter's `slide_<n>` ids when they are present (Task 3 `align_speaker_notes` tests pin both id-based and count-based alignment).
2. **Uploading a second file (Replace) while the first is still checking or previewing.** The older result must never overwrite the newer one (Task 9 `usePowerPointStart` "stale result is dropped" test).
3. **Reaching a rebuild path on an imported deck by URL, reload or chat.** That covers `/p/:id/create/outline`, `GET /outlines/stream/{id}`, `/presentation/prepare`, `/presentation/stream/{id}` and the chat tools `saveSlide`/`updateSlide`/`addNewSlideLayout`. Each must refuse, not rebuild (Tasks 7 and 12 tests).
4. **A deck wider than 16:9, or one exactly 16:9 give or take a rounding pixel.** No bands are added, nothing is scaled up, and nothing ends up past y = 720 (Task 3 fit tests: 1280×720, 1280×721, 1280×600).
5. **Switching mode back and forth, and reloading on `?start=pptx`.** The typed topic and the uploaded deck both survive the switch. A reload keeps the mode (the file itself can't survive a reload, as with documents today) (Task 11 tests).

---

## File Structure

**Backend (`servers/fastapi/`)**

| File | Responsibility |
|---|---|
| `alembic/versions/d5e7f9a1b3c6_add_presentation_source.py` (new) | `source`, `source_name` nullable string columns |
| `migrations.py` | new revision constant + head, schema detection |
| `models/sql/presentation.py` | `source`, `source_name` fields; copied in `get_new_presentation` |
| `models/presentation_with_slides.py` | expose `source`, `source_name` |
| `models/presentation_import.py` (new) | `ImportPresentationRequest` |
| `constants/presentation.py` | `PRESENTATION_SOURCE_PPTX`, blank-slide layout constants moved here, refusal messages |
| `templates/fonts_and_slides_preview.py` | `original_slide_count` in the preview response |
| `services/pptx_import/__init__.py` (new) | package marker |
| `services/pptx_import/fit.py` (new) | fit converter elements into 1280×720 and detect the background colour |
| `services/pptx_import/notes.py` (new) | read PowerPoint notes, align them with converted slides |
| `services/pptx_import/presenter_slots.py` (new) | slot indexes (spread, fallback, normalise), add bottom-right slot |
| `services/pptx_import/service.py` (new) | `build_imported_deck`: path → converted, fitted slides + notes + slot indexes |
| `services/pptx_import/guards.py` (new) | `ensure_not_imported` (409) |
| `utils/slide_ui_text.py` (new) | readable text of a template-v2 `ui` |
| `utils/llm_calls/select_presenter_slides.py` (new) | Automatic presenter choice (one LLM call, never raises) |
| `api/v1/ppt/endpoints/presentation.py` | `POST /import`; guards on `/prepare`, `/stream/{id}`; speaker-note text from `ui` |
| `api/v1/ppt/endpoints/outlines.py` | guard on `/stream/{id}` |
| `services/chat/memory_layer.py` | `save_slide` refuses on imported decks |
| `openai_spec.json` | regenerated |

**Frontend (`frontend/src/`)**

| File | Responsibility |
|---|---|
| `api/schema.d.ts` | regenerated |
| `api/presentationImport.ts` (new) | `importPresentation(body)` |
| `lib/pptxUpload.ts` (new) | shared validation + error-message helpers (used by template import and PowerPoint start) |
| `composables/useTemplateImport.ts` | uses `lib/pptxUpload.ts` (behaviour unchanged) |
| `composables/usePowerPointStart.ts` (new) | PowerPoint-mode state: file, font check, preview, replacements, stale-result guard |
| `components/templates/import/FontReplacementList.vue` (new) | the font list extracted from `ImportFontsStep` |
| `components/templates/import/ImportFontsStep.vue` | uses `FontReplacementList` |
| `components/create/StartModeSwitch.vue` (new) | segmented From a topic / From PowerPoint control |
| `components/create/PowerPointStart.vue` (new) | PowerPoint-mode body of step 1 |
| `components/create/options.ts`, `setupSummary.ts`, `GenerationOptions.vue`, `NewPresenterStep.vue` | video count capped at slide count; import presenter copy |
| `views/NewView.vue` | mode switch, `?start=pptx`, PowerPoint submit, `.pptx` hint in topic mode |
| `components/create/wizard/progress.ts`, `composables/useDeckWizard.ts` | imported resume rule and summaries |
| `components/create/ImportedTopicSummary.vue`, `ImportedOutlineSummary.vue` (new) | read-only Topic/Outline for imported decks |
| `components/create/wizard/DeckWizard.vue` | never mounts `OutlineStep` for imported decks |
| `i18n/locales/{en,it}/{views,create,templates}.json` | new copy |

---

### Task 1: Mark imported decks (`source`, `source_name`)

**Files:**
- Create: `servers/fastapi/alembic/versions/d5e7f9a1b3c6_add_presentation_source.py`
- Modify: `servers/fastapi/migrations.py:44-46` (constants) and `_revision_past_unified_api_keys` (~L234)
- Modify: `servers/fastapi/models/sql/presentation.py`, `servers/fastapi/models/presentation_with_slides.py`, `servers/fastapi/constants/presentation.py`
- Test: `servers/fastapi/tests/unit/test_migrations.py`, `servers/fastapi/tests/unit/test_presentation_import_model.py` (new)

**Interfaces:**
- Produces:
  - `PresentationModel.source: Optional[str]` and `PresentationModel.source_name: Optional[str]`, both a nullable `String` column with default `None`.
  - The same two fields on `PresentationWithSlides`, both `Optional[str] = None`.
  - `constants.presentation.PRESENTATION_SOURCE_PPTX = "pptx"`.
  - `migrations.REVISION_PRESENTATION_SOURCE = "d5e7f9a1b3c6"`, with `REVISION_HEAD = REVISION_PRESENTATION_SOURCE`.

- [ ] **Step 1: Write the failing tests**

  In `test_migrations.py`, replace `test_slide_animation_revision_is_the_head_on_n_videos` with two tests:
  - `test_slide_animation_revision_sits_on_n_videos`: the same `down_revision` assertion, minus the head assertions.
  - `test_presentation_source_revision_is_the_head_on_slide_animation`:
    - asserts `REVISION_PRESENTATION_SOURCE == "d5e7f9a1b3c6"`;
    - asserts `REVISION_HEAD == REVISION_PRESENTATION_SOURCE`;
    - asserts that revision's `down_revision == REVISION_SLIDE_ANIMATION`;
    - asserts `script.get_heads() == [REVISION_PRESENTATION_SOURCE]`.

  Add `test_presentation_source_columns_are_added_nullable_and_dropped_on_downgrade(tmp_path)`, modelled on `test_presentation_n_videos_is_added_nullable_and_dropped_on_downgrade`:
  - after the upgrade, both `source` and `source_name` exist and are nullable;
  - after downgrading to `c4d6e8f0a2b3`, both are gone.

  Add `test_schema_with_presentation_source_is_detected_at_its_revision`. `_revision_past_unified_api_keys` returns `REVISION_PRESENTATION_SOURCE` for a schema whose `presentations` table has `source`. Build the schema the way the neighbouring detection tests do.

  New `test_presentation_import_model.py`:
  ```python
  def test_duplicate_keeps_import_source():
      p = PresentationModel(id=uuid.uuid4(), version=PresentationVersion.V2_STANDARD, content="", n_slides=1,
                            language="English", source="pptx", source_name="Deck.pptx")
      copy = p.get_new_presentation()
      assert (copy.source, copy.source_name) == ("pptx", "Deck.pptx")

  def test_presentation_response_exposes_source():
      fields = PresentationWithSlides.model_fields
      assert "source" in fields and "source_name" in fields
  ```

- [ ] **Step 2: Run the tests and check they fail**

  Run: `cd servers/fastapi && .venv/bin/python -m pytest tests/unit/test_migrations.py tests/unit/test_presentation_import_model.py -q`
  Expected: FAIL (`REVISION_PRESENTATION_SOURCE` missing; `source` is an unexpected field).

- [ ] **Step 3: Implement**

  - Write the migration as a copy of the pattern in `b3c5d7e9f1a4_add_presentation_n_videos.py`, with two `sa.String()` nullable columns and `_has_column` guards. Revision `"d5e7f9a1b3c6"`, down revision `"c4d6e8f0a2b3"`, create date 2026-11-26. The docstring says the columns mark decks imported from PowerPoint.
  - In `migrations.py`, add the constant and set the head. In `_revision_past_unified_api_keys`, inside the `slide_videos and presentation_videos` branch, return `REVISION_PRESENTATION_SOURCE` first when `_has_column(inspector, "presentations", "source")`.
  - In the model, add both fields. Copy both in `get_new_presentation`.
  - In `PresentationWithSlides`, add `source: Optional[str] = None` and `source_name: Optional[str] = None`.
  - In `constants/presentation.py`, add `PRESENTATION_SOURCE_PPTX`.

- [ ] **Step 4: Run the tests and check they pass**

  Same command. Expected: PASS. Also run `.venv/bin/python -m pytest tests/unit -q -x` to make sure nothing else pinned the old head.

- [ ] **Step 5: Commit** `feat(api): mark presentations imported from PowerPoint`

---

### Task 2: Report the original slide count in the upload preview

**Files:**
- Modify: `servers/fastapi/templates/fonts_and_slides_preview.py`
  - `FontsUploadAndSlidesPreviewResponse` (~L69)
  - `upload_fonts_and_preview_handler` (~L1292–1452)
- Test: `servers/fastapi/tests/unit/test_pptx_slide_count.py` (new)

**Interfaces:**
- Produces:
  - `FontsUploadAndSlidesPreviewResponse.original_slide_count: Optional[int] = None`.
  - `_count_pptx_slides(pptx_path: str) -> Optional[int]`: the number of `p:sldId` in `ppt/presentation.xml`, or `None` when the file can't be read.

- [ ] **Step 1: Write the failing tests** (build decks with python-pptx in `tmp_path`)
  ```python
  def test_counts_slides_in_presentation_xml(tmp_path):
      path = _deck(tmp_path, slides=3)
      assert _count_pptx_slides(path) == 3

  def test_unreadable_file_counts_as_unknown(tmp_path):
      bad = tmp_path / "bad.pptx"; bad.write_bytes(b"not a zip")
      assert _count_pptx_slides(str(bad)) is None
  ```
  Add `test_preview_response_carries_original_count`. Call `upload_fonts_and_preview_handler` on a 3-slide deck with `max_slides=2`, `get_slide_images=False`, `upload_presentation=False` and `upload_fonts=False`. Patch `upload_fonts_and_fix_fonts_in_pptx` and `_build_upload_preview_font_urls` the way `tests/test_pptx_font_utils.py` or the existing preview tests do. If patching gets heavy, assert on the response model only. Assert `original_slide_count == 3`.

- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/unit/test_pptx_slide_count.py -q`. Expected: FAIL (ImportError).

- [ ] **Step 3: Implement**

  - Add `_count_pptx_slides`, reusing `PPT_NS` and the zip/ET pattern of `_preview_dimensions_from_pptx`.
  - In the handler, call it (in `asyncio.to_thread`) on the saved upload **before** `_trim_pptx_to_max_slides`, and pass the result into the response.
  - Template import ignores the field, so its behaviour is unchanged.

- [ ] **Step 4: Run.** Expected: PASS. Also run `tests/unit/test_template_api.py -q`.

- [ ] **Step 5: Commit** `feat(api): say how many slides an uploaded deck had before the 50-slide cap`

---

### Task 3: Pure import helpers: fit, notes, slot indexes, slide text

**Files:**
- Create:
  - `servers/fastapi/services/pptx_import/__init__.py`
  - `servers/fastapi/services/pptx_import/fit.py`
  - `servers/fastapi/services/pptx_import/notes.py`
  - `servers/fastapi/services/pptx_import/presenter_slots.py`
  - `servers/fastapi/utils/slide_ui_text.py`
- Test:
  - `servers/fastapi/tests/unit/test_pptx_import_fit.py`
  - `servers/fastapi/tests/unit/test_pptx_import_notes.py`
  - `servers/fastapi/tests/unit/test_pptx_import_presenter_slots.py`
  - `servers/fastapi/tests/unit/test_slide_ui_text.py`

**Interfaces:**
- Produces (`fit.py`):
  - `slide_background_color(elements: list[dict], width: float, height: float) -> str`
  - `fit_slide_to_stage(elements: list[dict], width: float, height: float) -> list[dict]`. It returns new dicts and never mutates its input.
- Produces (`notes.py`):
  - `class SlideNote(NamedTuple): number: int; hidden: bool; text: str` (`number` is 1-based, in `sldIdLst` order)
  - `read_speaker_notes(pptx_path: str) -> list[SlideNote]`
  - `align_speaker_notes(layout_ids: Sequence[str], notes: Sequence[SlideNote]) -> list[str]`
- Produces (`presenter_slots.py`):
  - `spread_presenter_slides(slide_count: int, count: int) -> list[int]`
  - `fallback_presenter_slides(slide_count: int) -> list[int]`
  - `normalize_presenter_slides(indexes: Iterable[int], slide_count: int) -> list[int]`
  - `add_bottom_right_presenter_slot(ui: dict) -> dict`
- Produces (`utils/slide_ui_text.py`): `slide_ui_text(ui: Any) -> str`

**Rules the tests pin:**

**Fit.** Child positions are parent-relative (renderer: `renderContainer`/group children are absolutely positioned inside the parent; `slide_video_service._locate_video_placeholder` adds parent offsets). So:
- `scale = min(1280 / width, 720 / height)`, so a deck is never scaled up;
- `dx = (1280 - width*scale) / 2`, `dy = (720 - height*scale) / 2`.

Scaling and translation:
- Every **length** is multiplied by `scale` at every depth.
- The offset `(dx, dy)` is added only to **top-level** elements: to their `position`, or, for a top-level `vector`, to each `points[]` entry.

Numeric keys that are lengths (scaled wherever they appear as numbers):
- `x`, `y`, `width`, `height`
- `size` (font size)
- `letter_spacing`
- the `stroke.width` number, and each `dash` entry
- `tl`/`tr`/`bl`/`br` (border radius)
- `top`/`right`/`bottom`/`left` when numeric (padding)
- `gap`, `marker_gap`, `column_gap`, `row_gap`
- `blur`, `offset_x`, `offset_y`
- each `corner_radii` entry

**Never scaled:**
- `opacity`, `rotation`, `line_height` (a multiplier: `font.size * font.lineHeight` in `template-v2-json-to-html.ts`)
- `focus_x`, `focus_y`, `crop_scale`, `tension`, `segments`
- the integers `columns`/`rows`/`max_*`/`min_*`

Never descend into `data`, `series`, `categories` or `values` (chart and infographic data).

Already 16:9:
- When `abs(height - 720) <= 1` and `abs(width - 1280) <= 1`, return a deep copy unchanged: no band rectangle.
- Otherwise prepend a full-stage decorative rectangle in the background colour, shaped like `BLANK_PRESENTATION_SLIDE_UI`'s element (vector polygon, 4 points 0,0 → 1280,720, `closed: True`, `fill: {"color": bg}`, `decorative: True`).

Background colour: the first element in list order (the bottom-most) that has a `fill.color` and covers the whole source canvas. That means either a `vector` whose points span `[0,width]×[0,height]` within 1 px, or an element with `position` ≈ (0,0) and `size` ≥ (width−1, height−1). If none qualifies, `"#FFFFFF"`.

**Notes alignment:**
- If every layout id matches `^slide_(\d+)$` and every number is ≤ `len(notes)`, use the note with that `number`. The converter's own numbering then decides, hidden slides or not.
- Else, if `len(layout_ids) == len(notes)`, align by index.
- Else, if it equals the count of non-hidden notes, align by the visible order.
- Else align by index, and a missing note is `""`.

Reading notes:
- `read_speaker_notes` uses python-pptx: `slide.notes_slide.notes_text_frame.text.strip()` when `slide.has_notes_slide` and the frame exists, else `""`.
- `hidden` is `slide._element.get("show") == "0"`.

**Slot indexes:**
- `spread`: as in Global Constraints. `count <= 0` or `slide_count <= 0` → `[]`.
- `normalize`: drops out-of-range and non-int values, forces in `0` and `slide_count-1`, and returns the result sorted and unique.
- `add_bottom_right_presenter_slot`:
  - calls `ensure_video_placeholder(ui, x=…, y=…, width=…, height=…)` with `default_placeholder_box(*PRESENTER_SLOT_ASPECT)`;
  - returns `ui` unchanged (as a copy) when `find_video_placeholder(ui)` already finds one.

**Slide text:**
- Walk `ui["elements"]`, then `ui["components"][*]["elements"]`, in order, recursing into `child` and `children`.
- Skip elements with `decorative is True`, and images with `video_placeholder`.
- `text`: the joined `runs[*].text` (string runs only; skip `latex` runs).
- `text-list`: one line per item.
- `table`: the `columns` row, then each row, with cells joined by `" | "`.
- Blocks are joined by `"\n"`. Empty blocks are dropped, and whitespace is collapsed within a line.

- [ ] **Step 1: Write the failing tests**

  `test_pptx_import_fit.py`:
  ```python
  def test_16x9_deck_is_left_as_is():
      els = [_rect(0, 0, 1280, 720, "#112233"), _text(100, 100, 400, 50, size=24)]
      assert fit_slide_to_stage(els, 1280, 720) == els
      assert fit_slide_to_stage(els, 1280, 721) == els

  def test_4x3_deck_is_scaled_centred_with_background_band():
      els = [_rect(0, 0, 1280, 960, "#112233"),
             _text(0, 0, 1280, 100, size=40, letter_spacing=2, line_height=1.2)]
      out = fit_slide_to_stage(els, 1280, 960)       # scale 0.75, dx 160, dy 0
      assert out[0]["fill"]["color"] == "#112233" and _bbox(out[0]) == (0, 0, 1280, 720)
      t = out[2]
      assert t["position"] == {"x": 160, "y": 0} and t["size"] == {"width": 960, "height": 75}
      assert t["font"]["size"] == 30 and t["font"]["letter_spacing"] == 1.5
      assert t["font"]["line_height"] == 1.2

  def test_nested_children_scale_but_only_top_level_moves():
      group = {"type": "group", "position": {"x": 100, "y": 80}, "size": {"width": 400, "height": 400},
               "children": [_text(20, 40, 200, 40, size=20)]}
      out = fit_slide_to_stage([group], 1280, 960)
      assert out[1]["position"] == {"x": 235, "y": 60}
      assert out[1]["children"][0]["position"] == {"x": 15, "y": 30}
      assert out[1]["children"][0]["font"]["size"] == 15

  def test_top_level_vector_points_are_scaled_and_offset():
      v = {"type": "vector", "points": [{"x": 0, "y": 0}, {"x": 1280, "y": 960}], "stroke": {"color": "#000000", "width": 4}}
      out = fit_slide_to_stage([v], 1280, 960)[1]
      assert out["points"] == [{"x": 160, "y": 0}, {"x": 1120, "y": 720}] and out["stroke"]["width"] == 3

  def test_chart_data_is_not_scaled():
      chart = {"type": "chart", "position": {"x": 0, "y": 0}, "size": {"width": 640, "height": 480},
               "chart_type": "bar", "series": [{"name": "a", "values": [10, 20]}]}
      assert fit_slide_to_stage([chart], 1280, 960)[1]["series"][0]["values"] == [10, 20]

  def test_wider_than_16x9_is_centred_vertically_without_scaling():
      out = fit_slide_to_stage([_text(0, 0, 1280, 600)], 1280, 600)
      assert out[1]["position"] == {"x": 0, "y": 60} and out[1]["size"]["width"] == 1280

  def test_background_defaults_to_white_without_full_size_fill():
      assert slide_background_color([_text(0, 0, 10, 10)], 1280, 960) == "#FFFFFF"

  def test_input_is_not_mutated(): ...
  ```

  `test_pptx_import_notes.py`. Build decks with python-pptx in `tmp_path`, with notes on slides 1 and 3 and slide 2 hidden via `slide._element.set("show", "0")`.
  - `read_speaker_notes` returns 3 entries, with `hidden` only on #2 and stripped text.
  - `align_speaker_notes(["slide_1", "slide_3"], notes) == [note1, note3]`, which is the converter-skipped-hidden case.
  - `align_speaker_notes(["a", "b", "c"], notes)` aligns by index.
  - `align_speaker_notes(["a", "b"], notes)` aligns to the visible slides 1 and 3.
  - `align_speaker_notes(["a"] * 5, notes)` pads with `""`.
  - A slide with no notes slide gives `""`.

  `test_pptx_import_presenter_slots.py`:
  ```python
  @pytest.mark.parametrize("s,n,expected", [
      (12, 3, [0, 6, 11]), (10, 3, [0, 5, 9]), (6, 3, [0, 3, 5]),   # 4.5 / 2.5 round half-up
      (5, 1, [0]), (3, 9, [0, 1, 2]), (1, 2, [0]), (4, 0, []), (0, 3, []),
  ])
  def test_spread(s, n, expected): assert spread_presenter_slides(s, n) == expected

  @pytest.mark.parametrize("s,expected", [(1, [0]), (2, [0, 1]), (12, [0, 4, 8, 11]), (9, [0, 4, 8]), (5, [0, 4])])
  def test_fallback(s, expected): assert fallback_presenter_slides(s) == expected

  def test_normalize_forces_ends_and_drops_bad(): assert normalize_presenter_slides([3, 99, -1, 3, "x"], 6) == [0, 3, 5]

  def test_slot_is_bottom_right_portrait():
      ui = add_bottom_right_presenter_slot({"id": "s", "components": [], "elements": []})
      box = find_video_placeholder_box(ui)
      assert box == default_placeholder_box(*PRESENTER_SLOT_ASPECT)
      assert box.size.height > box.size.width
  ```

  `test_slide_ui_text.py`:
  - a ui with a title text, a text-list of 2 items, a 2×2 table, a decorative text, a group containing a text, and a video placeholder gives exactly `"Title\nOne\nTwo\nH1 | H2\na | b\nNested"`;
  - `slide_ui_text(None) == ""`.

- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/unit/test_pptx_import_fit.py tests/unit/test_pptx_import_notes.py tests/unit/test_pptx_import_presenter_slots.py tests/unit/test_slide_ui_text.py -q`. Expected: FAIL (ImportError).

- [ ] **Step 3: Implement** the four modules to the rules above. `fit.py` imports `STAGE_WIDTH`/`STAGE_HEIGHT` from `services/slide_video_service.py`. Round scaled values to 2 decimals so the tests compare exactly.

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit** `feat(api): helpers to fit, annotate and place presenters on imported slides`

---

### Task 4: Automatic presenter choice (LLM)

**Files:**
- Create: `servers/fastapi/utils/llm_calls/select_presenter_slides.py`
- Test: `servers/fastapi/tests/unit/test_select_presenter_slides.py`

**Interfaces:**
- Consumes: `normalize_presenter_slides`, `fallback_presenter_slides` (Task 3).
- Produces:
  - `async def select_presenter_slides(slides: Sequence[dict[str, str]], *, deck_title: str) -> list[int]`. Each dict has `"text"` and `"note"`. The function returns normalised indexes and **never raises**.
  - `presenter_slides_schema() -> dict`.

Implementation follows `utils/llm_calls/generate_slide_animations.py`: `get_client`, `get_llm_config`, `get_model`, `generate_structured_with_schema_retries`, `JSONSchemaResponse`.

The schema is exactly:
```json
{"type": "object", "properties": {"indexes": {"type": "array", "items": {"type": "integer"}}}, "required": ["indexes"], "additionalProperties": false}
```
No `minItems`/`maximum`: the Claude structured-output rules are covered in `test_templates_v2_anthropic_schema.py`.

The prompt has:
- a system part: the presenter appears on the first and last slides and on chapter/section introductions; otherwise roughly one slide in every 3–4; return 0-based indexes;
- a user part: deck title, then per slide `index`, the first 300 chars of `text` and the first 300 chars of `note`.

S ≤ 2 returns `normalize([], S)` without calling the LLM. Wrap **everything** after that (config lookup included) in `try/except Exception`: log a warning and return `fallback_presenter_slides(S)`.

- [ ] **Step 1: Write the failing tests**
  - `test_llm_choice_is_normalised`: patch the structured call to return `{"indexes": [5, 40, 5]}` for S = 10 → `[0, 5, 9]`.
  - `test_llm_failure_falls_back`: the patched call raises → `[0, 4, 8, 11]` for S = 12.
  - `test_missing_llm_config_falls_back`: patch `get_llm_config` to raise → fallback.
  - `test_tiny_decks_skip_the_llm`: S = 2 → `[0, 1]`, and the call mock is never awaited.
  - `test_schema_is_claude_compatible`: run `presenter_slides_schema()` through the same validator that `test_templates_v2_anthropic_schema.py` uses (import its helper, or assert no `minItems`/`maxItems`/`minimum`/`maximum` keys anywhere).

- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/unit/test_select_presenter_slides.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): let AI choose presenter slides for imported decks, with a fallback`

---

### Task 5: `POST /api/v1/ppt/presentation/import`

**Files:**
- Create:
  - `servers/fastapi/models/presentation_import.py`
  - `servers/fastapi/services/pptx_import/service.py`
- Modify:
  - `servers/fastapi/constants/presentation.py`: move `BLANK_PRESENTATION_LAYOUT_GROUP`, `BLANK_PRESENTATION_LAYOUT_ID` here from `presentation.py:216-217`, and keep the names importable from `presentation.py`.
  - `servers/fastapi/api/v1/ppt/endpoints/presentation.py`: new endpoint next to `create_blank_presentation` (~L2945).
- Test: `servers/fastapi/tests/unit/test_presentation_import_api.py`

**Interfaces:**
- Consumes: Task 1 fields, Task 3 helpers, `select_presenter_slides` (Task 4), `EXPORT_TASK_SERVICE.convert_pptx_to_json`, `RawSlideLayouts`, `resolve_app_path_to_filesystem`, `_preview_dimensions_from_pptx`, `_coerce_presentation_font_map`, `_presentation_response_data`.
- Produces:
  - `class ImportPresentationRequest(BaseModel)` with these fields:
    - `pptx_url: str`
    - `language: str = Field(min_length=1)`
    - `n_videos: Optional[int] = Field(default=None, ge=0)`
    - `fonts: Optional[dict[str, Any]] = None`
    - `title: Optional[str] = None`
    - `source_name: Optional[str] = None`
  - `@dataclass ImportedSlide(ui: dict, speaker_note: str)`.
  - `@dataclass ImportedDeck(slides: list[ImportedSlide], presenter_indexes: list[int])`.
  - `async def build_imported_deck(request: ImportPresentationRequest) -> ImportedDeck`.
  - Endpoint `import_presentation(request: ImportPresentationRequest, sql_session) -> PresentationWithSlides`, status 201.

`build_imported_deck`:
1. `resolve_app_path_to_filesystem(request.pptx_url)`. If it is missing or not a file → `HTTPException(404, "PowerPoint file not found. Upload it again.")`.
2. Convert, then validate with `RawSlideLayouts.model_validate`. A `ValidationError` gives a 500 with the same message as template import. **Store the converter's original layout dicts**, not `model_dump()`.
   - 0 layouts → 400 `"The PowerPoint has no slides."`
   - Keep at most `MAX_NUMBER_OF_SLIDES` layouts.
3. `(w, h) = _preview_dimensions_from_pptx(path)`. Each slide's `ui = {"id": layout["id"], "description": layout["description"], "background": slide_background_color(...), "components": [], "elements": fit_slide_to_stage(layout["elements"], w, h)}`.
4. `notes = align_speaker_notes([l["id"] for l in layouts], read_speaker_notes(path))`. Run python-pptx through `asyncio.to_thread`. If `read_speaker_notes` raises, log it and use `""` for every slide.
5. Pick the slots:
   - `n_videos is None` → `await select_presenter_slides([{"text": slide_ui_text(ui), "note": note}...], deck_title=title)`
   - `0` → `[]`
   - otherwise → `spread_presenter_slides(S, n_videos)`.

   Apply `add_bottom_right_presenter_slot` to the chosen slides.

Endpoint:
- `title = (request.title or "").strip() or Path(request.source_name or "").stem or "Imported presentation"`.
- Build `PresentationModel` with:
  - `version=V2_STANDARD`, `source=PRESENTATION_SOURCE_PPTX`, `source_name=request.source_name`
  - `n_slides=S`, `language=request.language`, `title`, `content=""`, `layout=None`
  - `include_title_slide=False`, `include_table_of_contents=False`
  - `n_videos=request.n_videos`, `fonts=_coerce_presentation_font_map(request.fonts)`
- Create one `SlideModel` per slide: blank group and layout constants, `index=i`, `content={}`, `speaker_note`, `ui`.
- Commit, rolling back on error, then refresh and return `PresentationWithSlides(**_presentation_response_data(p), slides=slides)`, as `create_blank_presentation` does.

- [ ] **Step 1: Write the failing tests.** Patch `EXPORT_TASK_SERVICE.convert_pptx_to_json` (as `test_template_api.py:357` does) and `resolve_app_path_to_filesystem` → a real python-pptx deck in `tmp_path` (4:3 size `Inches(10)×Inches(7.5)` for the fit test). Patch `select_presenter_slides` where Automatic is not under test. Use `FakeAsyncSession` from `tests/conftest.py`.
  - `test_import_creates_editable_slides_with_notes`: 3 layouts and 3 notes. Assert:
    - `source == "pptx"`, `source_name == "Q3 Review.pptx"`, `title == "Q3 Review"`;
    - every slide has `layout == "__blank_slide__"`, `content == {}`, `ui["elements"]` non-empty, and its note;
    - `fonts == {"Inter": "/app_data/fonts/inter.ttf"}`;
    - the 201 status.
  - `test_explicit_count_spreads_bottom_right_slots`: 12 layouts, `n_videos=3` → placeholders on exactly slides 0, 6, 11, at `default_placeholder_box(*PRESENTER_SLOT_ASPECT)`.
  - `test_automatic_uses_ai_choice`: `n_videos=None`, the patched selector returns `[0, 2, 4]` → slots on 0, 2, 4. The selector received the slide text extracted from `ui`.
  - `test_zero_videos_adds_no_slots`.
  - `test_4x3_deck_is_fitted`: no element box ends below y = 720. The first element is a full-stage rect in the source background colour.
  - `test_missing_file_is_404`, `test_empty_deck_is_400`.
  - `test_deck_over_50_slides_is_capped`: 55 layouts → 50 slides.
  - `test_notes_failure_does_not_fail_import`: `read_speaker_notes` raises, the import succeeds, and the notes are empty.

- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/unit/test_presentation_import_api.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run** the new tests plus `tests/unit/test_presentation_template_v2_ui.py tests/unit/test_slide_video_service.py -q`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): import a PowerPoint as an editable presentation`

---

### Task 6: Speaker notes read imported slides' text

**Files:**
- Modify: `servers/fastapi/api/v1/ppt/endpoints/presentation.py`: `_speaker_note_deck_context` (~L3113) and `_speaker_note_slide_title` (~L3100).
- Test: `servers/fastapi/tests/unit/test_speaker_notes.py` (add cases)

**Interfaces:**
- Consumes: `slide_ui_text` (Task 3).
- Produces: a context entry gains `"text": slide_ui_text(slide.ui)` when the slide has no `html_content` and its `content` is empty. Its `"title"` falls back to that text's first line, clipped to 120 chars.

- [ ] **Step 1: Write the failing tests**
  - `test_imported_slide_context_reads_ui_text`: a `SlideModel` with `content={}` and a `ui` holding a title text and a list → `context[0]["text"] == "Title\nOne\nTwo"` and `context[0]["title"] == "Title"`.
  - `test_template_slide_context_has_no_text_override`: a slide with `content={"title": "X"}` has no `"text"` key, so the existing behaviour is unchanged.
  - `test_existing_imported_notes_are_kept`: `_apply_speaker_notes` with the generator patched, two imported slides, one already with a note → only the empty one is requested (`indexes == [1]`).
- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/unit/test_speaker_notes.py -q`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** in `_speaker_note_deck_context`.
- [ ] **Step 4: Run.** Expected: PASS (all of `test_speaker_notes.py` and `test_speaker_notes_endpoint.py`).
- [ ] **Step 5: Commit** `feat(api): write speaker notes for imported slides from their text`

---

### Task 7: No route rebuilds an imported deck (server guards + chat refusal)

**Files:**
- Create: `servers/fastapi/services/pptx_import/guards.py`
- Modify:
  - `servers/fastapi/constants/presentation.py`: the messages.
  - `servers/fastapi/api/v1/ppt/endpoints/outlines.py`: `GET /stream/{id}` (~L84), right after the 404 check.
  - `servers/fastapi/api/v1/ppt/endpoints/presentation.py`: `prepare_presentation` (after it loads the presentation) and `stream_presentation` (after the 404 check).
  - `servers/fastapi/services/chat/memory_layer.py`: `save_slide` (~L1050), right after the presentation is loaded.
- Test: `servers/fastapi/tests/unit/test_pptx_import_guards.py`

**Interfaces:**
- Produces:
  - `IMPORTED_DECK_REBUILD_MESSAGE = "This presentation was imported from PowerPoint; its slides can't be rebuilt from a template."`
  - `IMPORTED_SLIDE_CHAT_MESSAGE = "This slide came from PowerPoint; edit it directly in the editor."`
  - `ensure_not_imported(presentation: PresentationModel) -> None`, which raises `HTTPException(409, IMPORTED_DECK_REBUILD_MESSAGE)` when `source == "pptx"`.
  - `save_slide` returns `{"saved": False, "message": IMPORTED_SLIDE_CHAT_MESSAGE, "validation_errors": []}` for imported decks. That covers the chat tools `saveSlide`, `updateSlide` and `addNewSlideLayout`, which all route through it (`services/chat/tools.py:667-695`). Element, component, theme and blank-slide tools keep working.

- [ ] **Step 1: Write the failing tests**
  - For each of `stream_outlines`, `prepare_presentation` and `stream_presentation`: call it directly with a `FakeAsyncSession` holding a `source="pptx"` presentation → `HTTPException` with status 409. Use the function names as defined in the modules.
  - `test_chat_save_slide_refuses_imported_deck`: build the memory layer the way `tests/unit/test_chat_service_template_v2.py` does, with an imported presentation, and call `save_slide(..., replace_old_slide_at_index=True)` and then `False` → `saved is False` and the message matches. The slide `ui` is untouched.
  - `test_chat_save_slide_still_works_for_template_decks`: an existing template-deck test still passes (run the file).
- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/unit/test_pptx_import_guards.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus `tests/unit/test_chat_service_template_v2.py tests/unit/test_slide_ui_chat_tools.py tests/unit/test_chat_llm_tools.py -q`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): refuse template rebuilds of imported decks`

---

### Task 8: Regenerate the OpenAPI spec and frontend types; add the API client

**Files:**
- Modify: `servers/fastapi/openai_spec.json`, `frontend/src/api/schema.d.ts`
- Create: `frontend/src/api/presentationImport.ts`
- Test: `frontend/tests/unit/api/presentationImport.test.ts`

**Interfaces:**
- Produces:
  - `export type ImportPresentationBody = components['schemas']['ImportPresentationRequest']`
  - `export function importPresentation(body: ImportPresentationBody): Promise<Presentation>`: `unwrap(api.POST('/api/v1/ppt/presentation/import', { body }))`
  - `Presentation['source']`, `Presentation['source_name']`
  - `ImportPreview['original_slide_count']`

- [ ] **Step 1:** `cd servers/fastapi && .venv/bin/python scripts/generate_openapi_spec.py && cd ../../frontend && npm run gen:api`. Check the diff: the spec gains only the import route, `ImportPresentationRequest`, `source`/`source_name` and `original_slide_count`. Check that `tests/unit/test_mcp_openapi_templates.py` still passes (`.venv/bin/python -m pytest tests/unit/test_mcp_openapi_templates.py -q`).
- [ ] **Step 2: Write the failing test.** `importPresentation` POSTs the body as JSON to `/api/v1/ppt/presentation/import` and resolves to the parsed deck. Mock `fetch` the way `tests/unit/api/templateImport.test.ts` does.
- [ ] **Step 3: Run** `cd frontend && npx vitest run tests/unit/api/presentationImport.test.ts`. Expected: FAIL, then implement, then PASS.
- [ ] **Step 4:** `npx vue-tsc -b`. Expected: no errors.
- [ ] **Step 5: Commit** `feat(frontend): API client for importing a PowerPoint deck`

---

### Task 9: Shared upload pieces and PowerPoint-start state

**Files:**
- Create:
  - `frontend/src/lib/pptxUpload.ts`
  - `frontend/src/composables/usePowerPointStart.ts`
  - `frontend/src/components/templates/import/FontReplacementList.vue`
- Modify:
  - `frontend/src/composables/useTemplateImport.ts`: use `lib/pptxUpload.ts` (remove its local `extensionOf`/`messageOf`/validation)
  - `frontend/src/components/templates/import/ImportFontsStep.vue`: render `FontReplacementList`
- Test:
  - `frontend/tests/unit/composables/usePowerPointStart.test.ts`
  - `frontend/tests/unit/lib/pptxUpload.test.ts`
  - the existing `frontend/tests/unit/templates/ImportTemplateView.test.ts` stays green, as the regression check

**Interfaces:**
- Produces (`lib/pptxUpload.ts`):
  - `pptxFileError(file: File): string | null`: `templates.import.errors.notPptx` / `tooLarge`
  - `fontFileError(file: File): string | null`: `fontType` / `fontTooLarge`
  - `uploadErrorMessage(e: unknown, fallbackKey: string): string`: today's `messageOf`
  - `baseName(name: string): string`
- Produces (`FontReplacementList.vue`):
  - props `{ fonts: FontInfo[]; replacements: Record<string, File>; busy: boolean }`
  - emits `replace: [name: string, file: File | null]`
  - It holds exactly the `<ul>` from `ImportFontsStep.vue` (lines 29–60 today).
- Produces (`usePowerPointStart.ts`):
  ```ts
  export type PowerPointPhase = 'idle' | 'checking' | 'preparing' | 'ready'
  export interface PowerPointStart {
    file: Ref<File | null>; preview: Ref<ImportPreview | null>; phase: Ref<PowerPointPhase>; error: Ref<string | null>
    missingFonts: Ref<FontInfo[]>; replacements: Ref<Record<string, File>>
    /** `slide_image_urls.length`; 0 before a preview exists. */
    slideCount: ComputedRef<number>
    /** `original_slide_count ?? slideCount`. */
    originalSlideCount: ComputedRef<number>
    selectFile(f: File): Promise<void>
    setReplacement(name: string, f: File | null): string | null
    /** Re-runs the preview with the chosen replacement fonts. */
    applyFonts(): Promise<void>
    reset(): void
  }
  export function usePowerPointStart(): PowerPointStart
  ```

Behaviour of `selectFile`:
- An invalid file sets `error` and keeps the current file and preview.
- A valid file goes `checking` → `checkFonts` (`null` means unknown and is treated as no missing fonts) → `preparing` → `prepareImport(file, [])` → `ready`.
- If any call fails: `error`, phase `idle`, and the previous file and preview are dropped.
- Every call takes a ticket (an incrementing counter). A result whose ticket is not the latest is ignored.

`applyFonts` keeps the current preview visible while it re-prepares and swaps it in when done. It uses the same ticket guard.

- [ ] **Step 1: Write the failing tests.** Mock `@/api/templateImport` (`checkFonts`, `prepareImport`).
  - `prepares immediately and keeps missing fonts for the inline warning`: checkFonts → `[{name: 'Gotham'}]` → phase `ready`, `missingFonts` has length 1, and prepareImport was called with `[]`.
  - `treats an unavailable font check as no warning`: checkFonts → `null` → `ready`, no missing fonts.
  - `rejects non-pptx and oversized files without losing the current deck`.
  - `stale result is dropped`: select A (prepare deferred), select B, resolve B and then A → `preview` is B's and `file` is B.
  - `applyFonts sends the replacements`: prepareImport called with `[{name: 'Gotham', file}]`.
  - `originalSlideCount falls back to slideCount`.
  - `pptxUpload.test.ts`: the four helpers' outputs (extension case-insensitive, size limits from `MAX_PPTX_BYTES`/`MAX_FONT_BYTES`).
- [ ] **Step 2: Run** `npx vitest run tests/unit/composables/usePowerPointStart.test.ts tests/unit/lib/pptxUpload.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, refactoring `useTemplateImport` and `ImportFontsStep` onto the shared pieces with no visible change.
- [ ] **Step 4: Run** those tests plus `npx vitest run tests/unit/templates tests/unit/api/templateImport.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `refactor(frontend): share PowerPoint upload pieces; add PowerPoint-start state`

---

### Task 10: Presenter step for imports (count capped, copy)

**Files:**
- Modify:
  - `frontend/src/components/create/options.ts`: `clampMediaCount`
  - `frontend/src/components/create/setupSummary.ts`
  - `frontend/src/components/create/GenerationOptions.vue`
  - `frontend/src/components/create/NewPresenterStep.vue`
  - `frontend/src/i18n/locales/{en,it}/create.json`
- Test: `frontend/tests/unit/create/options.test.ts`, `frontend/tests/unit/create/GenerationOptions.test.ts` (add cases), `frontend/tests/unit/create/NewPresenterStep.test.ts` (new)

**Interfaces:**
- Produces:
  - `clampMediaCount(value: string, max: number = MAX_SLIDES): string`
  - `GenerationOptions` prop `maxVideos?: number`. It caps the video input and hides presets above it (Auto and None always stay).
  - `importPresenterNote(hasPhoto: boolean, videos: string, slideCount: number): string | null`:
    - no photo → `null`
    - `'0'` → `create.summary.presenterNone`
    - `''` → `create.summary.importPresenterAuto` = "First and last slide, plus section introductions. Placed bottom-right; move it in the editor."
    - `n` → `create.summary.importPresenterAdds` = "Presenter on {count} of {total} slides, placed bottom-right; move it in the editor.", with `count = min(n, slideCount)`
  - `NewPresenterStep` prop `slideCount?: number`. When set, it passes `:max-videos="slideCount"` and uses `importPresenterNote`. Otherwise everything is as today. The radio cards, photo picker and their prominence are unchanged.
- Consumed by: Task 11 (`:slide-count`).

- [ ] **Step 1: Write the failing tests**
  - `clampMediaCount('9', 4) === '4'`, and `clampMediaCount('9') === '9'`.
  - `importPresenterNote(true, '3', 12)` says "3 of 12".
  - `importPresenterNote(true, '20', 12)` says "12 of 12".
  - `importPresenterNote(true, '', 12)` is the Automatic copy.
  - With `max-videos=4`, typing 9 → the model gets '4', and the preset '5' is not rendered.
  - `NewPresenterStep` with `slideCount` shows the import note.
- [ ] **Step 2: Run** `npx vitest run tests/unit/create/options.test.ts tests/unit/create/GenerationOptions.test.ts tests/unit/create/NewPresenterStep.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): presenter step speaks about the imported deck`

---

### Task 11: Step 1 mode switch and the From PowerPoint view

**Files:**
- Create:
  - `frontend/src/components/create/StartModeSwitch.vue`
  - `frontend/src/components/create/PowerPointStart.vue`
- Modify:
  - `frontend/src/views/NewView.vue`
  - `frontend/src/i18n/locales/{en,it}/views.json`, `create.json`
- Test:
  - `frontend/tests/unit/create/NewView.test.ts` (add a `describe('From PowerPoint')`)
  - `frontend/tests/unit/create/PowerPointStart.test.ts`

**Interfaces:**
- Consumes: `usePowerPointStart` (Task 9), `FontReplacementList` (Task 9), `ImportDropzone`, `LanguagePicker`, `AiProgress`, the shadcn `Dialog`.
- Produces:
  - `StartModeSwitch.vue`: `defineModel<'topic' | 'pptx'>()`. A `role="radiogroup"` with two `role="radio"` buttons (`data-testid="start-mode-topic"` / `"start-mode-pptx"`), using `rovingKeydown`/`rovingTab` from `@/lib/roving`. It is styled as an Aera segmented control (the same chrome as the presenter radio cards, compact).
  - `PowerPointStart.vue`:
    - props `{ start: PowerPointStart; disabled?: boolean; languageError?: boolean }`
    - `v-model:language` (string)
    - `defineExpose({ focusLanguage })`

What `PowerPointStart.vue` shows, by phase:
- `idle`: `ImportDropzone` (error = `start.error`).
- `checking`/`preparing`: `AiProgress`. Stage copy: "Checking fonts…" / "Reading your slides…". Expected time 15 s.
- `ready`:
  - the file name;
  - `N slides`;
  - a horizontal, scrollable strip of `<img>` from `slide_image_urls` (`data-testid="pptx-thumbs"`, lazy, alt "Slide n");
  - a **Replace** button: a hidden file input → `start.selectFile`.
- When `originalSlideCount > slideCount`: `data-testid="pptx-limit-note"` with "Only the first {count} of {total} slides will be imported".
- When the first thumbnail's natural aspect differs from 16:9 by more than 2%: `data-testid="pptx-fit-note"` with "Slides will be fitted to 16:9; the sides are filled with the slide's background colour."
- When `missingFonts.length`: an inline `role="note"` warning naming the fonts, with a **Fix** button. Fix opens a `Dialog` holding `FontReplacementList` and an **Apply** button → `start.applyFonts()`. `fontFileError` messages show in the dialog.
- `LanguagePicker` (card style, not bare) under the result. `languageError` adds the same error ring and copy as topic mode.

`NewView.vue` changes:
- `mode = computed<'topic' | 'pptx'>({ get: () => route.query.start === 'pptx' ? 'pptx' : 'topic', set: (m) => router.replace({ query: { ...route.query, start: m === 'pptx' ? 'pptx' : undefined } }) })`.
- Put `<StartModeSwitch v-model="mode" />` above the step-1 sections. `topic` renders today's two sections unchanged; `pptx` renders `<PowerPointStart>`.
- Both modes' state lives in `NewView` (`prompt`, `files`, `options` and `const pptx = usePowerPointStart()`), so switching never clears either.
- `hasTopic`/`hasTemplate`/`canSubmit` gain PowerPoint branches. In PowerPoint mode, `canSubmit = !pending && pptx.phase === 'ready' && options.language !== AUTO_LANGUAGE` (spec: Next is enabled once a preview exists and a language is set). Blockers, in order:
  - `{id: 'deck', text: 'Upload a PowerPoint'}` when there is no preview (focuses the dropzone's file input);
  - `{id: 'language', text: 'Choose the narration language'}` while the language is Auto (calls `focusLanguage()`).

  `fixMissing` takes `'topic' | 'look' | 'deck' | 'language'`.
- Step bar Topic summary in PowerPoint mode: `"<file name> · N slides"` (`views.new.pptxSummary`).
- Presenter step in PowerPoint mode:
  - pass `:slide-count="pptx.slideCount"` to `NewPresenterStep` (Task 10);
  - the footer status uses the import note instead of the outline note;
  - the primary label is **Import slides** (`views.new.importSlides`), with the stage copy "Importing slides…".
- `submitImport()` in PowerPoint mode (reachable only when `canSubmit`):
  - `importPresentation({ pptx_url: preview.modified_pptx_url, language, n_videos: mediaCountForRequest(effectiveVideos(o.videos, hasPhoto)), fonts: preview.fonts, title: baseName(file.name), source_name: file.name })`;
  - then upload the portrait if there is one (same try/toast as today);
  - then `router.push({ name: 'create', params: { id, step: 'preview' } })` and `draft.clear()`.
  - No `rememberDeckLook`, no animate flag.
- The `.pptx` hint in topic mode: `const pptxInTopic = computed(() => files.value.find((f) => f.name.toLowerCase().endsWith('.pptx')) ?? null)`. When it is set, render `<p role="note" data-testid="pptx-hint">` with "Keep its design?" and a button "Switch to From PowerPoint". The button removes that file from `files`, sets `mode = 'pptx'` and calls `pptx.selectFile(file)`.

- [ ] **Step 1: Write the failing tests** (`NewView.test.ts`; mock `@/api/templateImport` and `@/api/presentationImport`)
  - `shows the topic view by default and the PowerPoint view on ?start=pptx`.
  - `switching modes keeps the typed topic and the uploaded deck`: type a prompt, switch to pptx, upload (preview ready), switch back → the prompt is still there; switch again → thumbnails still shown with no new `prepareImport` call; the URL `start` query follows.
  - `hides the template grid and setup chips in PowerPoint mode`.
  - `shows the first-50 note`: preview with 50 urls and `original_slide_count: 70` → the note text contains "50" and "70".
  - `missing fonts show a warning whose Fix applies replacements`.
  - `Next needs a deck and a language`: with no upload, the primary is disabled and the blocker reads "Upload a PowerPoint". With the preview ready but language Auto, the primary is disabled and the blocker "Choose the narration language" focuses the language select on click. `importPresentation` is never called.
  - `Import slides creates the deck and lands on Preview`: language English, presenter count '3', with photo → body `{ pptx_url, language: 'English', n_videos: 3, fonts, title: 'Q3 Review', source_name: 'Q3 Review.pptx' }`, `uploadPortrait` called, route `/p/new-id/create/preview`.
  - `Automatic presenter count is sent as null` (with photo, videos '') and `no photo sends 0`.
  - `a .pptx attached in topic mode offers to switch, moving the file over`.
  - `PowerPointStart.test.ts`: Replace re-selects; the fit note shows for a 4:3 thumbnail (stub `naturalWidth/Height` and fire `load`).
- [ ] **Step 2: Run** `npx vitest run tests/unit/create/NewView.test.ts tests/unit/create/PowerPointStart.test.ts`. Expected: the new tests FAIL and the existing ones still pass.
- [ ] **Step 3: Implement**, adding the `en`/`it` copy as you go.
- [ ] **Step 4: Run** both files plus `npx vitest run tests/unit/i18n.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): start a presentation from PowerPoint in step 1`

---

### Task 12: Deck wizard for imported decks

**Files:**
- Create:
  - `frontend/src/components/create/ImportedTopicSummary.vue`
  - `frontend/src/components/create/ImportedOutlineSummary.vue`
- Modify:
  - `frontend/src/components/create/wizard/progress.ts`
  - `frontend/src/composables/useDeckWizard.ts`
  - `frontend/src/components/create/wizard/DeckWizard.vue`
  - `frontend/src/i18n/locales/{en,it}/create.json`
- Test:
  - `frontend/tests/unit/create/wizardProgress.test.ts`
  - `frontend/tests/unit/create/CreateDeckView.test.ts` (add a `describe('imported deck')` with a fixture deck `source: 'pptx'`)

**Interfaces:**
- Produces:
  - `DeckProgressInput.imported?: boolean`. When `true`, `narration.ready === 0` and `!pipelineRunning` → `resume = 'preview'`. Otherwise the resume rule is today's.
  - `ImportedTopicSummary.vue`, props `{ presentation: Presentation }`:
    - a summary card titled "From PowerPoint" with `source_name` (fallback `title`) and `N slides`;
    - a second card with slide 0 rendered by `SlideView` (`fit="width"`, theme and fonts from the deck);
    - the same `.summary-card` look as `DeckWizard`.
  - `ImportedOutlineSummary.vue`, props `{ presentation: Presentation }`, `data-testid="imported-outline"`:
    - the heading "From PowerPoint · {n} slides";
    - an ordered grid of small `SlideView` thumbnails (lazy);
    - a note that the slides keep the PowerPoint's design and are edited in the editor;
    - a footer (`WizardStepFooter`) with primary "Next: Preview".
    - No AI actions.
- In `useDeckWizard`, when imported, the topic summary is `"<source_name> · N slides"` and `imported` is passed into `deckProgress`.
- In `DeckWizard`:
  - `const imported = computed(() => props.presentation.source === 'pptx')`;
  - the Topic summary renders `ImportedTopicSummary` when imported, followed by no `DeckSetupChips`;
  - the outline branch renders `<ImportedOutlineSummary>` when imported and `<OutlineStep>` otherwise. `OutlineStep` is never instantiated for an imported deck.

- [ ] **Step 1: Write the failing tests**
  - `wizardProgress.test.ts`:
    - an imported deck with slides and no narration resumes on `preview`;
    - with one narrated slide it resumes on `avatar`;
    - a non-imported deck is unchanged (`avatar`).
  - `CreateDeckView.test.ts` (imported fixture):
    - `/p/p1/create` redirects to `preview`;
    - `/p/p1/create/outline` shows `imported-outline`;
    - **`OutlineStep` is never mounted**: `wrapper.findComponent(OutlineStep).exists() === false`, and the mocked outline stream (`useOutlineStream` / `@/api/outlines` stream fn) was never called;
    - the Topic summary shows the file name, with no template card and no setup chips.
- [ ] **Step 2: Run** `npx vitest run tests/unit/create/wizardProgress.test.ts tests/unit/create/CreateDeckView.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** those, then the full `npx vitest run tests/unit/create`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): imported decks skip the AI outline in the wizard`

---

### Task 13: Full checks, docs, and the manual verification

**Files:**
- Modify: `CLAUDE.md` (Frontend section), memory file `pptx-presentation-import.md` (status → built)

- [ ] **Step 1: Full automated checks**
  - `cd servers/fastapi && .venv/bin/python -m pytest tests/unit -q`. Expected: all pass.
  - `cd frontend && npm run check`. Expected: vue-tsc, vitest and eslint are clean.
- [ ] **Step 2: CLAUDE.md.** Add one bullet under "Template-based generation only": "Importing a `.pptx` as a deck ('From PowerPoint', `presentations.source = "pptx"`) is allowed: imported slides use the template-v2 element model and get no Smart features; nothing may rebuild them from a template."
- [ ] **Step 3: Verify the hidden-slide behaviour on the real converter.**
  - Bring up the stack (`docker compose up production`, then `docker compose -f docker-compose.frontend.yml up`).
  - Make a 3-slide deck with python-pptx: slide 2 hidden, notes on all three.
  - Run the preview and import through the UI. The imported deck's notes must match their slides.
  - If they don't, fix `align_speaker_notes` and add a test with the converter's actual ids before going on.
- [ ] **Step 4: Manual verification in the browser** (every item in the spec's "Verification before calling it done"):
  1. A real `.pptx` with images, a table, a chart, speaker notes and a missing font:
     - the font warning appears, and Fix → upload → Apply re-renders the thumbnails;
     - Import slides lands on Preview, and the slides look like the PowerPoint;
     - in the editor, the text is editable and the floating bar and Layers work.
  2. Narration shows the PowerPoint's notes. Slides without notes get AI notes that match the slide text.
  3. 3 videos on a 12-slide deck → presenter markers on slides 1, 7, 12, bottom-right. Avatar generation fills them.
  4. Automatic → first and last slides plus AI-chosen ones. With the LLM key removed/invalid, the import still succeeds with the 0, 4, 8, … last pattern.
  5. A 4:3 deck → fitted with background-coloured bands, nothing off-stage, text editable. The fit note was shown before import.
  6. A 70-slide deck → "Only the first 50 of 70 slides will be imported", and 50 slides are imported.
  7. In the editor chat on an imported deck, ask it to "rebuild this slide with another layout" → it answers with the PowerPoint message and the slide is unchanged.
  8. Click Outline on an imported deck → the read-only summary, and no `/outlines/stream` request in the network tab.
  9. Export the imported deck as PPTX and MP4. Both complete, and fonts and layout match Preview.
  10. Reload on `?start=pptx` → still PowerPoint mode. Switching modes keeps the typed topic.
  11. A `.pptx` dropped into the topic composer → the hint appears, and Switch moves the file over.
  12. The light theme and a phone width (375 px) look right for the switch, the thumbnail strip and the font dialog.
- [ ] **Step 5: Commit** `docs: note that PowerPoint imports are allowed alongside templates`. Then use superpowers:finishing-a-development-branch.
