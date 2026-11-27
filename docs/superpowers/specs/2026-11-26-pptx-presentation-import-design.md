# Start a presentation from PowerPoint (Vue frontend)

Date: 2026-11-26 · Status: draft for approval

## Intent

Users who already have a PowerPoint want to bring it in **as it is** (its content and its design)
and keep working on it here: edit it in the classic editor, add a narrated voice and a presenter
(avatar) video, export it. Today a `.pptx` can only become a template, or be attached as a source
document that AI rewrites into a new deck.

The first step of the create wizard gets a two-option switch: **From a topic** (today's view) and
**From PowerPoint** (upload a deck and import it). An imported deck goes through the same wizard
(Presenter → Preview → Narration → Export) but skips everything that writes or designs slides.

## Decisions made with the user

- **Keep content and design** (option B): every PowerPoint slide becomes an editable slide with no
  AI step and no template. (Rejected: keep content only and re-design with a template.)
- **Presenter videos: just a count** on the Presenter step (option B). The app spreads the videos
  across the deck and places each in the bottom-right corner; the user moves them in the editor.
  (Rejected: pick the slides from thumbnails; voice only and add videos later.)
- **Automatic presenter count** (the step's default): the first and last slides always get a
  presenter; AI picks the others from the speaker notes and slide text, usually one every 3–4
  slides or on chapter/section introductions. An explicit count is spread evenly (as above).
- **Decks that aren't 16:9** (4:3, A4, 16:10): fitted into 16:9 at import: scaled down to fit,
  centred, side (or top/bottom) bands filled with the slide's background colour. Nothing is cut off.
- **Approach 1** (below): one synchronous import endpoint that reuses the template-import upload.
- **UI refinements** accepted as proposed:
  1. Switch labels **From a topic** / **From PowerPoint**.
  2. After upload: file name, slide count, a thumbnail strip of every slide, and **Replace**.
  3. In PowerPoint mode the template grid and the length/tone/images/etc. chips are hidden; only the
     narration language stays.
  4. Switching modes keeps both sides' state (typed topic, uploaded file); the mode is in the URL
     (`?start=pptx`), so a reload keeps it.
  5. Dropping a `.pptx` into the topic composer shows a hint offering to switch to From PowerPoint
     (keep its design) instead of attaching it as a document.
  6. The Presenter step speaks about the imported deck ("Presenter on 3 of 12 slides, placed
     bottom-right; move it in the editor"). Its primary button reads **Import slides**.
  7. The Outline step of an imported deck is a read-only summary ("From PowerPoint · 12 slides").
     It must never start the AI outline stream or offer Generate slides.
  8. After importing, the user lands on **Preview**.

## Goals

- Upload a `.pptx`, fix missing fonts, see the slides, set language and presenter, import.
- Imported slides look like the PowerPoint and are fully editable with the existing slide editor
  (floating bar, Layers, text editing, move/resize).
- Speaker notes in the PowerPoint become the slides' speaker notes; Narration writes notes (with AI)
  only for slides that have none, reading the text on the slide.
- Presenter video slots are added to the requested number of slides; the existing Narration step
  (TTS + avatar generation) works on them unchanged.
- Export works unchanged.

## Non-goals

- `.ppt`, `.pptm`, `.odp`: only `.pptx` (what the converter and the template-import upload accept).
- Importing PowerPoint animations or transitions. The wizard's AI "animate" plan is not run for
  imports; the editor's Motion tab still works.
- Turning the imported deck into a template, or re-designing it with one.
- A background task with progress (approach 2): only if real decks turn out slow.
- Any change to `servers/nextjs`.

## Anti-goals (failure even if it "works")

- Any path that silently replaces the imported design: the AI outline stream, Generate/Regenerate
  slides, or anything else that rebuilds slides from a template, must be unreachable for an
  imported deck.
- A presenter step that loses prominence in PowerPoint mode (the avatar is a flagship feature).
- Losing the user's typed topic or uploaded file when they flip the switch.

## Constraints

- **Template-only rule (CLAUDE.md):** the rule exists to keep Smart generation out. Imported slides
  use the same template-v2 element model (`slide.ui.elements`) as blank and template slides and get
  no Smart features. Worth one line in CLAUDE.md after this ships so the rule isn't misread.
- Aera look and feel, extended additively; light theme tokens (`text-strong`, `theme-light.mjs`).
- `POST /api/v1/ppt/fonts/check` is **admin-only** (403 for others). The frontend already treats
  403 as "check unavailable" (`checkFonts` returns `null`): non-admins see no font warning.
- `MAX_NUMBER_OF_SLIDES = 50` (`constants/presentation.py`), `MAX_PPTX_BYTES = 100 MB`.
- New `/api/v1/ppt/presentation/*` routes already reach FastAPI through nginx (dev and prod); no
  proxy change is needed.

## Approaches

1. **One import endpoint that reuses the template-import upload (chosen).** Frontend reuses the
   upload + font fix (`checkFonts`, `prepareImport` → `modified_pptx_url`, `slide_image_urls`,
   `fonts`). A new synchronous `POST /presentation/import` converts, creates the deck and slides,
   copies notes, adds video slots. The only AI is one short call choosing presenter slides when the
   count is Automatic, so it takes seconds; a spinner is fine.
2. Same, as an async task with polling. Only worth it for slow imports; more code and failure
   modes. Rejected for now.
3. Parse the `.pptx` in the browser. Can't match the converter's fidelity (shapes, tables, charts,
   images). Rejected.

## How it works today (relevant facts)

- `EXPORT_TASK_SERVICE.convert_pptx_to_json(path)` (`services/export_task_service.py:685`) returns
  `{layouts: [...]}`, validated as `RawSlideLayouts` (`templates/v2/models/layouts.py:34`):
  one `{id, description, elements: [SlideElement]}` per slide. Image assets are copied under
  `app_data/pptx-to-json/users/<owner>/<session>/` and URLs rewritten to `/app_data/...`, so they
  persist (not temp files).
- A blank slide (`create_blank_presentation`, `api/v1/ppt/endpoints/presentation.py:2945`) stores
  `ui = {id, description, background, components: [], elements: [...]}` with
  `layout_group="blank"`, `layout="__blank_slide__"`. The Vue editor classifies slides with
  `ui.elements` as template-v2 slides (`frontend/src/render/slide-kind.ts`) and edits them.
- `ensure_video_placeholder(ui)` (`services/slide_video_service.py:361`) adds a video placeholder
  component on top of any slide, in the box from `default_placeholder_box()` (bottom-right).
- Speaker-note writing (`utils/llm_calls/generate_speaker_notes.py`, `_slide_text`) uses
  `slide["text"]` first, then HTML (smart) or `content` (template). Imported slides have
  `content={}`, so today they would read as empty.
- The wizard derives step state from the deck (`frontend/src/components/create/wizard/progress.ts`):
  `slideCount > 0` marks Outline done; Preview/Narration/Export follow. Opening the Outline step
  mounts `OutlineStep`, whose `useOutlineStream` starts the AI outline stream when the deck has no
  outline. That is the path item 7 must close.
- `NewView.vue` holds the two pre-deck steps (Topic, Presenter) and creates the deck on submit; the
  per-deck steps live in `DeckWizard.vue` at `/p/:id/create/:step`.

## Design

### Backend

**Mark imported decks.** Add a nullable `source: Optional[str]` column to `presentations` (Alembic
migration), returned in the presentation responses. Value `"pptx"` for imports, `NULL` otherwise.
*(Builder's call made by me: a dedicated column, rather than overloading `generation_mode` or
`structure`, so nothing that switches on those fields changes behaviour.)* Optionally store the
original file name alongside (e.g. `source_name`) for the Topic summary; the builder may instead keep
it in `content` or `title`.

**`POST /api/v1/ppt/presentation/import`** (JSON body):

| field | type | notes |
|---|---|---|
| `pptx_url` | str | `modified_pptx_url` from `fonts-upload-and-slides-preview` |
| `language` | str | narration language, required |
| `n_videos` | int \| null | presenter slots; clamped to the slide count; null/0 = none |
| `fonts` | object \| null | the preview response's `fonts`, so the deck can load them |
| `title` | str \| null | sent by the frontend: the file name without extension |
| `source_name` | str \| null | the original file name, for the Topic summary |

The server can't recover the original name: the stored file is renamed (e.g. `…-first-50.pptx`),
so the frontend sends both.

**More than 50 slides** *(my call)*. `fonts-upload-and-slides-preview` already trims the file to the
first 50 slides (`_trim_pptx_to_max_slides`) without saying so. Add an additive
`original_slide_count` field to its response (template import ignores it, so its behaviour is
unchanged). When it exceeds 50, the From PowerPoint view shows "Only the first 50 of 70 slides will
be imported" next to the thumbnails, and the deck is imported with the first 50.

**Editor chat on imported decks** *(my call)*. The chat's slide-replace tool
(`services/chat/memory_layer.py`, `_build_template_slide_ui`) rebuilds `slide.ui` from the deck's
template, which an imported deck doesn't have; it would throw away the design or fail. For
`source == "pptx"`, chat tools that rebuild a slide from a template are refused with a clear message
("This slide came from PowerPoint; edit it directly in the editor"). Other chat tools stay. Making
chat edit text inside imported elements is a separate, later project.

Steps:
1. Resolve `pptx_url` to a file (`resolve_app_path_to_filesystem`), 404 if missing; same ownership
   rules as `template/init`.
2. `convert_pptx_to_json` → `RawSlideLayouts`. 0 slides → 400. (Decks over
   `MAX_NUMBER_OF_SLIDES` never reach here: see "More than 50 slides" below.)
   **Fit to 16:9.** The converter normalises width to 1280 px and keeps the deck's aspect, so a 4:3
   deck comes out 1280×960 (see `_preview_dimensions_from_document` in
   `templates/fonts_and_slides_preview.py`), while the editor, playback, MP4 export and presenter
   placement assume 1280×720. When the slide size isn't 1280×720, scale every element uniformly by
   `min(1280 / w, 720 / h)` (positions, sizes, font sizes, stroke widths, radii, paddings, nested
   containers), centre the result, and add a full-stage background rectangle first, coloured like
   the slide's background (the colour of the slide's bottom-most full-size fill if there is one,
   else white). The slide size comes from `ppt/presentation.xml` `p:sldSz`, as
   `_preview_dimensions_from_pptx` already reads it. The preview thumbnails keep the deck's own
   shape; the import notice says the slides will be fitted to 16:9.
3. Read speaker notes with python-pptx (already a dependency): per slide,
   `slide.notes_slide.notes_text_frame.text` when `has_notes_slide`, stripped. Align by slide
   index; the builder must verify the converter keeps hidden slides and slide order the same as
   python-pptx (if not, align the same way the converter does).
4. Create a `PresentationModel`: `version=V2_STANDARD`, `source="pptx"`, `n_slides=<count>`,
   `language`, `title`, `content=""`, `layout=None`, `include_title_slide=False`,
   `include_table_of_contents=False`, `n_videos`, `fonts` as the renderer expects them.
5. One `SlideModel` per layout: `layout_group="blank"`, `layout="__blank_slide__"` (reuse the
   constants), `content={}`, `speaker_note=<note or "">`, `ui={id, description, components: [],
   elements: <converted elements>}`.
6. Presenter slots. Which slides:
   - **Automatic** (`n_videos` null, the default): the first and last slides always (one slide
     when S = 1). For the others, one LLM call reads every slide's text and PowerPoint note and
     returns the slide indexes that should get a presenter: chapter/section introductions, and
     otherwise roughly one every 3–4 slides. Structured output (a list of indexes), validated:
     out-of-range indexes dropped, first and last forced in. If the call fails or no LLM is
     configured, fall back to first, last and every 4th slide in between, so the import never
     fails because of this step. Use the existing `utils/llm_calls` client patterns.
   - **0:** none.
   - **Explicit N:** with `N = min(n_videos, S)` and S slides, slide indexes
     `round(i * (S - 1) / (N - 1))` for `i in 0..N-1` (N = 1 → slide 0).

   Each chosen slide gets a placeholder via
   `ensure_video_placeholder`, bottom-right, in the same slot shape normal generation uses
   (portrait 9:16, so the presenter's face isn't cropped to a strip). *(My call.)*
7. Commit and return `PresentationWithSlides`.

**Speaker notes from imported slides.** When writing notes, a slide whose `content` is empty but
whose `ui` has elements gets its text from the elements: text runs, text-list items and table
cells, in element order, decorative elements skipped. Pass it as the slide's `text`, which
`_slide_text` already prefers. Existing notes (copied from the PowerPoint) are kept: the default
"fill only empty notes" behaviour already does that.

### Frontend

**Mode switch (`NewView.vue`).** A segmented two-option control above the step-1 content, in the
Aera style: **From a topic** | **From PowerPoint**. Bound to `?start=pptx` (absent = topic). Topic
state (prompt, files, options, template) and PowerPoint state (file, preview, font fixes) live side
by side; switching never clears either.

**From PowerPoint view (new component, e.g. `PowerPointStart.vue`).**
- Empty: a dropzone for one `.pptx` (reuse `ImportDropzone.vue`, `MAX_PPTX_BYTES`).
- On file: `checkFonts`, then `prepareImport(file, replacements)`; while it runs, a progress state
  in the existing loading style. Result: file name, slide count, horizontal thumbnail strip from
  `slide_image_urls`, **Replace**.
- Missing fonts (when the check ran): an inline warning naming them with **Fix**, which opens the
  same font-replacement UI as template import (extract it into a shared component rather than
  copying it). Replacing fonts re-runs `prepareImport`.
- Language picker (existing `LanguagePicker`/chip), required: Auto is not allowed, as with attached
  documents today.
- No template grid, no other setup chips.
- Shared logic with `useTemplateImport.ts` (validation, font replacements, error messages) is
  factored out rather than duplicated; the template-import flow keeps working unchanged.

**Topic composer hint.** Dropping or attaching a `.pptx` in topic mode shows a one-line note:
"Keep its design? Switch to From PowerPoint", which switches mode and moves the file over.

**Steps before the deck exists (in PowerPoint mode).**
- Stepper summary for Topic: file name · slide count.
- Next is enabled once a preview exists and a language is set; blockers say what's missing, like
  today.
- Presenter step: same `NewPresenterStep` (photo + video count), count capped at the slide count,
  copy adapted ("Presenter on 3 of 12 slides, placed bottom-right; move it in the editor").
  Automatic stays the default and is described for imports as "First and last slide, plus section
  introductions"; it is sent as `n_videos: null` (as `mediaCountForRequest` already does for `''`).
  With no photo, behaviour is as today (`effectiveVideos`).
- Primary: **Import slides** → `POST /presentation/import` → upload portrait if any (same as today)
  → `router.push` to `create` with `step: 'preview'`. No `rememberDeckLook`, no animate flag.

**Deck wizard for imported decks (`presentation.source === 'pptx'`).**
- Topic summary: file name and first slide thumbnail in place of prompt and template card.
- Outline: a read-only summary panel ("From PowerPoint · 12 slides", slide titles or thumbnails).
  `OutlineStep` is never mounted, so no outline stream can start.
- Preview: shows the slides; any Regenerate / Generate slides action is hidden or disabled; "Open in
  editor" stays.
- Narration and Export: unchanged.
- Resume/landing step for an imported deck: Preview until narration exists, then as today.

**API types.** Regenerate `frontend/src/api/schema.d.ts` for the new endpoint and `source` field.

**i18n.** All new copy in `en` and `it`.

## Left to the builder

- Exact component split and names; how the font-replacement UI is extracted for reuse.
- Whether the read-only Outline summary shows thumbnails or extracted titles.
- How the renderer loads fonts for a template-less deck (`presentation.fonts` or otherwise),
  provided imported slides render with the PowerPoint's fonts in Preview, editor and export.
- Test coverage: backend unit tests for the endpoint (mocked converter), slot spreading, notes
  alignment, limits; frontend tests for the mode switch, state retention, and that an imported
  deck never mounts `OutlineStep`. Final manual check in the browser on a real deck.

## Verification before calling it done

- A real `.pptx` with images, a table, a chart, speaker notes and a missing font: imports, looks
  right in Preview and the editor, text is editable.
- Notes from the PowerPoint appear in Narration; slides without notes get AI notes that match the
  slide text.
- With 3 videos on a 12-slide deck: slots on slides 1, 7, 12; avatar generation fills them.
- With Automatic: slots on the first and last slides plus AI-chosen ones; with the LLM unavailable,
  the fallback pattern, and the import still succeeds.
- A 4:3 deck imports fitted into 16:9 with background-coloured bands, nothing off-stage, text still
  editable.
- A 70-slide deck shows the "first 50 of 70" note and imports 50 slides.
- Editor chat on an imported slide refuses template rebuilds with the PowerPoint message.
- Clicking Outline on an imported deck never starts the outline stream.
- PPTX and MP4 export of the imported deck.
