# Create wizard — design

Date: 2026-11-20 · Status: draft for approval · Scope: `frontend/` (Vue). Template-based generation only.

## Intent

Today a deck is made across three unrelated screens: `/new` (Topic / Look / Details tabs), `/new/:id/outline`
(outline plus a second template/theme picker), then the editor, where voice, avatars and export hide in an
inspector tab, a footer tab and a dialog. Users don't see the full journey, can't tell what is still missing,
and once in the editor have no guided way to "finish" a deck.

The wizard turns this into one guided journey with a consistent layout, honest loading states and explicit
requirement checks — and it is **stateful**: a deck remembers how far it got, and the user can leave for the
editor and come back to continue at the next phase.

**The wizard is the simple, AI-driven path.** Ideally the user only gives inputs (topic, look, a few
details, a portrait) and approves what the AI produces; every step's happy path is one click with AI
defaults. Fine control — editing slides, per-slide voice/avatar work, AI edits through chat — belongs to the
editor, which the wizard links to ("Open in editor") rather than reproducing. Rule of thumb for any control
in the wizard: if it is needed to *produce* the deck it stays; if it is for *tuning* it goes to the editor.

## Steps

| # | Step | Deck exists? | Address |
|---|------|--------------|---------|
| 1 | Topic | no | `/new` (step in page state) |
| 2 | Look | no | `/new` |
| 3 | Details | no | `/new` |
| 4 | Outline | yes | `/p/:id/create/outline` |
| 5 | Preview | yes | `/p/:id/create/preview` |
| 6 | Avatar (voice + avatar) | yes | `/p/:id/create/avatar` |
| 7 | Export | yes | `/p/:id/create/export` |

The editor stays at `/p/:id`. `/new/:id/outline` redirects to `/p/:id/create/outline` (query preserved).

## Goals

- One wizard layout for all 7 steps: step bar, step body, sticky footer (Back · primary action · reason it is
  disabled / live status).
- Every step has: loading skeleton, error with retry, a requirement check that **says why** the primary
  action is disabled, and progress for long work.
- Step progress is **derived from backend state**, so reloading, reopening the deck, or arriving from the
  editor lands on the right step with the right status.
- Editor ↔ wizard round trip: "Edit slides" from the wizard opens the editor; a "Continue: <next step>"
  button in the editor header returns to the wizard.

## Non-goals

- Smart presentations (`generation_mode: "smart"`) — out of scope per CLAUDE.md.
- Rewriting voice/avatar/export internals. The wizard reuses `DeckStateProvider`, `useDeckNarration`,
  `useDeckAvatars`, `ExportOptions`, `TemplatePicker`/`NewTemplateSelector`, `ThemePicker`, `OutlineList`,
  `GenerationOptions`, `TopicComposer`, `SlideView`.
- Moving fine-grained voice/avatar controls (per-slide regenerate, voice bubble placement, upload own video)
  out of the editor. The wizard links to them.
- No changes to `servers/nextjs`.

## Anti-goals (a failure even if it "works")

- Losing the Aera look (see memory: extend additively, never remove). The wizard uses the existing
  `workspace-card`, typography, colours and `step-panel` transitions.
- Starting a paid HeyGen run twice (double click, reload mid-pipeline, two tabs).
- Export blocked forever (e.g. placeholders exist but HeyGen is not configured).
- Losing user edits silently (outline autosave, regenerate warnings).

## Approaches considered

- **A. One wizard layout, deck-bound addresses (chosen).** Shared `CreateWizard` shell; steps 1–3 at `/new`,
  4–7 at `/p/:id/create/:step`; progress derived from backend. Moderate refactor of NewView/OutlineView into
  step panels. Picked because it is the only option that gives every step the same layout and checks, and
  makes "continue from the editor" natural.
- B. Keep separate pages, share only a step bar. Less refactor but each page keeps its own spacing, footer
  and loading style — the inconsistency this work removes.
- C. Guided mode inside the editor for steps 4–7. No new routes, but crowds the editor and makes Preview
  meaningless.

## Decisions made with the user

1. Steps are Topic, Look, Details, Outline, Preview, Avatar, Export. The outline review stays, redesigned.
2. Voice and avatar are **one wizard step called "Avatar"**. One "Generate" press runs narration, then
   avatars, as a single client-orchestrated pass with one progress view.
3. **Avatar is required** when at least one slide has an avatar placeholder (`hasVideoPlaceholder`); then
   Export stays locked until it is done. With no placeholders, Avatar is optional (voice-only offered, can be
   skipped).
   - Before slides exist the step bar uses the Details option as a hint: a number > 0 → "Required",
     "None" → "Optional", "Auto" → "Decided after Preview". Once slides exist, the slides decide.
   - If HeyGen is not configured (`videos.generation_available === false`), voice-only completes the step,
     with a warning that placeholder slides will show the voice bubble.
4. Once the deck exists, Topic / Look / Details are **read-only summaries** (changing them = a new deck).
   Outline is editable until slides are generated. Going back to Outline after Preview means regenerating
   the slides, after a confirmation warning that slide edits, voice and avatars will be lost. The **theme**
   stays changeable at any time without regenerating.

## Design

### Routing

- `/new` → `NewView` hosts steps 1–3 inside the wizard shell (steps 4–7 shown, locked, with "after you
  create the outline").
- `/p/:id/create/:step` (`name: 'create'`, `step ∈ outline|preview|avatar|export`) → `CreateDeckView`.
  An unknown step redirects to the deck's resume step. `/p/:id/create` (no step) → resume step.
- `/new/:id/outline` → redirect to `{ name: 'create', params: { id, step: 'outline' }, query }`.
- Visiting a **locked** step redirects to the resume step (e.g. `/export` while avatars are required and not
  done → `/avatar`), with a toast saying why.

### Wizard shell (`components/create/wizard/`)

- `WizardSteps.vue` — evolution of `NewSteps.vue`: 7 items, each with label, one-line summary, and a state:
  `current | done | available | locked | running`, plus a `badge` (`Required`, `Optional`,
  `Decided after Preview`). Locked items are not clickable and show the reason as a tooltip/`title`.
  `running` shows a spinner (outline streaming, slides generating, pipeline running). Steps 1–3 on a deck
  render as done and open a read-only summary.
  - Responsive: under 1050px only the current step's label is shown next to numbered dots; under 520px the
    bar becomes "Step 4 of 7 · Outline" with a thin progress bar.
- `WizardFooter.vue` — sticky footer (today's NewView footer style): Back, optional secondary action, primary
  action, and one status line that shows the **blocking reason** when the primary is disabled, or the live
  stage when work is running. Errors appear as an `Alert` above the buttons with Retry where it applies.
- `WizardLayout.vue` — `PageHeader` + `workspace-card` + title/lede per step + `WizardSteps` + body slot +
  `WizardFooter`. Step bodies transition with the existing `step-panel` transition. Focus moves to the step
  heading on step change; reduced-motion respected.

### Progress model (`composables/useWizardProgress.ts`)

Pure derivation, unit-tested, from: presentation (slides, stream status), outline stream status, narration
(`counts`, `running`), avatars (`placeholderSlides`, `videoBySlide`, `videos.generation_available`,
`running`, plan states).

- outline: `running` while streaming; `done` once slides exist.
- preview: `locked` until outline done (slides requested); `running` while slides stream; `done` when slides
  exist and the stream is not running.
- avatar:
  - `required = placeholderSlides.length > 0 && generation_available !== false`.
  - `done` when every slide's narration is `ready` (or `translated`) **and**, if required, every
    placeholder slide has a video.
  - `locked` until preview done; `running` while the pipeline runs.
- export: `locked` while avatar is required and not done, else available. Export is "done" never (it's the
  end); it shows a check after a successful export in this session only.
- **Resume step** = first step that is not done (outline → preview → avatar → export). Preview counts as done
  once slides finished generating; landing on Avatar is one Back away from Preview. (My call: no persisted
  "preview accepted" flag; it would need a backend field and adds nothing the slide state doesn't tell us.)
- Stale narration (notes edited after audio) makes avatar not done again: the step shows "N slides out of
  date" with an "Update" action that runs the pipeline for those slides only.

### Step 1 — Topic, 2 — Look, 3 — Details (`/new`)

Same content as today's NewView panels, moved into the shell. Changes:
- **Look now requires a template** (generation is template-only). The primary is disabled with "Pick a
  template to continue". Theme stays optional. The outline step no longer shows a template/theme picker.
  (My call: today the template can be deferred to the outline page; with Look read-only after deck creation
  there is nowhere else to pick it.)
- Details: unchanged `GenerationOptions`; the language check for uploaded documents stays.
- Primary action on step 3: "Create outline" (today's submit, with its upload/decompose stages shown in the
  footer status line). Topic missing → disabled with "Add a topic or a document" and a link to step 1.
- The step bar badge for Avatar reflects the videos option (decision 3).
- Draft persistence (my call): prompt + options are kept in `sessionStorage` (`slideshows.newDraft`) so a
  reload of `/new` doesn't lose them; cleared after the deck is created. Template/theme stay in the query
  string as today. Files are not persisted (the user re-adds them; the composer says so if a draft had files).
- After the deck exists these steps are read-only summary panels built from the presentation: topic
  (`content`), language, tone, verbosity, slide count, template (from the slides' layout group or the stored
  query), theme. A small "Start a new deck from this" link pre-fills `/new` (nice-to-have).

### Step 4 — Outline (`/p/:id/create/outline`)

Redesigned outline review, keeping `useOutlineStream`, autosave and `OutlineList` behaviour:
- Header: "Shape the story", slide count ("8 slides · max N"), a save indicator (Saving… / Saved /
  error with retry) in place of the bare error alert.
- Streaming: `AiProgress` + skeleton cards that fill in as slides arrive; cards are read-only until done.
- Cards: slide number, the first line as a title, the rest as a muted preview. Reading and approving is the
  main path; light edits (expand to edit text, drag to reorder, delete, add) stay available as today's
  `OutlineList` already does them, visually secondary. Over the slide limit → inline warning and primary
  disabled with the reason.
- Side summary (desktop) / collapsed row (mobile): chosen template thumbnail (`TemplateCardThumb`) and
  theme, read-only, with "Theme can be changed later" — no pickers here anymore.
- Primary: "Generate slides". Runs today's `preparePresentation` + theme apply, then goes to
  `/p/:id/create/preview` (stream query flag as today). Once slides exist this step shows the outline
  read-only with a "Regenerate slides from outline…" secondary action behind the confirmation dialog
  (decision 4).

### Step 5 — Preview (`/p/:id/create/preview`)

- While generating: `usePresentationStream` drives a grid of slide thumbnails that fill in as slides arrive,
  remaining slots as skeletons; `GenerationMetrics` shown compactly. Footer status "Generating slide 3 of 8…".
  The "animate slides" motion planning that EditorView starts after generation moves here as well (the
  editor keeps it too for decks opened there with the stream flag).
- When done: responsive thumbnail grid (`SlideView`, deck theme/fonts). Click opens a lightbox with
  prev/next and keyboard arrows. A small marker on slides with an avatar placeholder ("Presenter").
- Actions: **Edit slides** (secondary, opens `/p/:id`), **Present** (ghost), primary **"Looks good —
  continue to Avatar"**. If avatar is optional the primary reads "Continue" and a "Skip to Export" link
  appears.
- Errors: stream error → Alert with Retry.

### Step 6 — Avatar (`/p/:id/create/avatar`)

Mounted inside `DeckStateProvider`, so it shares narration/avatar state with the editor's code.

Layout: left column "Setup", right column "Slides".

- **Setup** (requirement checklist, each item ✓ / ✗ with an inline fix):
  1. Narration language — `TtsLanguageSelect`.
  2. Presenter portrait — `PortraitHero` (upload/remove). Only shown when required/placeholder slides exist.
  3. Avatar service — HeyGen configured? If not: warning "Placeholder slides will use the voice bubble";
     voice-only completes the step (decision 3).
  4. Summary: "8 slides narrated · 3 with a presenter avatar".
- **Slides**: compact read-only status list (reuse the `AvatarSlideList` look) with per-slide voice state
  (`narrationState`) and avatar chip (`chipOf`). No per-slide controls; if some slides fail, one
  "Retry failed slides" action re-runs the pipeline for them. Per-slide work is in the editor.
- **Primary: "Generate voice & avatars"** (or "Generate voice" when no avatar applies). Disabled with the
  first unmet requirement as the reason. Pressing it is the confirmation (the footer line states what will
  run, including the HeyGen slide count); `GenerateAvatarsDialog` is not shown in the wizard.
- **Pipeline** (`composables/useNarrationAvatarPipeline.ts`), client-orchestrated, phases shown as one
  progress view with three labelled segments:
  1. Notes — only if any slide has empty speaker notes: `generateNotes` (fill missing).
  2. Voice — `startTts({})` for missing/stale slides; wait for the TTS task to finish (`running` false, no
     error), then refetch TTS.
  3. Avatars — if required and HeyGen available: `generate` with `pendingIndices = eligibleSlides`,
     `force: false`; wait for the run.
  - A `sessionStorage` key `slideshows.pipeline.<id>` holds `{ phase, startedAt }` while running. On mount, if
    the key exists: follow the running server task of the current phase (both tasks already resume), then
    continue to the next phase. If the key is gone and a task is running (started from the editor), the step
    just shows that task's progress without chaining.
  - Guards against double runs: primary disabled while any phase is pending or any server task is running;
    a 409 from avatar generation follows the existing run (already handled in `useDeckAvatars`).
  - Failure in a phase stops the pipeline, shows the error with "Retry from <phase>", keeps what finished.
- When done: summary + "Fine-tune voice and avatars in the editor" link (opens `/p/:id`), primary
  "Continue to Export".
- Optional case: "Skip" secondary → Export.

### Step 7 — Export (`/p/:id/create/export`)

- `ExportOptions` embedded on the page (not a dialog), plus a header line with deck title and slide count.
- Locked case is unreachable by URL (redirect), and in the step bar shows "3 slides still need their avatar".
- Secondary actions: Present, Open in editor, Back to library. Primary in the footer: none other than
  the export card's own button (the footer shows Back only).

### Editor integration

- `EditorHeader` gains a **"Continue: <step>"** button (pill, accent outline) when the deck's resume step is
  not Export-and-everything-done; it routes to `/p/:id/create/<resume>`. When the deck is complete, the
  existing Export button stays as is. A small "Setup" menu item lists all wizard steps for direct jumps.
- EditorView with `?stream=1` keeps working (old links), but new decks go through Preview instead.
- Library: decks with no slides yet open `/p/:id/create/outline`; others open the editor as today.

### Shared states / UX rules

- Never a disabled primary without a visible reason in the footer status line.
- Long work always shows: what is happening, progress (n of N or %), and that it continues if the user
  leaves ("You can leave this page; we'll keep going").
- Every fetched area has a skeleton with the final layout's size; every failure has Retry.
- Keyboard: Enter on a step submits its primary when valid; Alt+←/→ go Back/Next (my call).
- Accessible: `aria-current="step"`, live region for status line, focus to step heading on change.

## Constraints

- Vue 3 + Vite + shadcn-vue + Tailwind v4 in `frontend/`; Aera look; reuse existing composables.
- No backend changes expected. Regenerating from the outline is supported: `prepare` overwrites the
  structure, and `stream_presentation` deletes the old slides after the new ones are built
  (`servers/fastapi/api/v1/ppt/endpoints/presentation.py` ~3762). Builder should confirm that orphaned
  narration audio / avatar videos of deleted slides are cleaned up or simply ignored (they are keyed by slide
  id, so the new slides start as "missing").
- Tests: unit tests for `useWizardProgress` and the pipeline orchestration (mocked composables); update
  `NewView`, outline and editor header tests; extend `tests/e2e/mocked.spec.ts` with the full journey.

## Left to the builder

- Exact visual details within the Aera system (card sizes, grid breakpoints, icons).
- Component split inside `components/create/wizard/`.
- How the template summary is derived for decks created before this change (layout group or fallback text).
