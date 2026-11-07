# Vue frontend — Phase 2a: core on-slide editing

Date: 2026-11-07. Status: approved design, awaiting plan.

## Goal

Let users edit a template slide directly on the canvas in the new Vue
frontend (`/frontend`): select elements, move and resize them, edit text
inline, replace images, and delete / duplicate / copy-paste / group, with
undo/redo and autosave.

Phase 2 is split into three specs, each shippable on its own:

- **2a (this spec)** — core editing: selection, move/resize, inline text, text
  toolbar, image replace, structural ops, undo.
- **2b** — data elements: charts, tables, infographics.
- **2c** — building: insert elements, shape/line styling, containers and
  flex/grid, rotation, crop handles, design variables.

Phase 3 (settings/providers, admin, fonts, community, onboarding) gets its own
spec after Phase 2. The custom-template builder and the layout editor are not
planned.

Constraints (from `CLAUDE.md`): template-based slides only; smart slides get no
editing. Do not modify `servers/nextjs`; port code into `/frontend` as copies.
Keep Aera design fidelity (extend additively).

## Approach

The old editor (`servers/nextjs/components/slide-editor`, ~50k lines) has two
layers:

1. A **pure-TS editing model**: element paths, selection rules, patching `ui`,
   resize maths, alignment guides, clipboard payloads, group/ungroup, text
   runs. No React.
2. A **Konva surface** (`surface/nodes.tsx`, `TemplateV2KonvaSlide.tsx`, ~10k
   lines) that re-implements the HTML renderer in Konva. This duplication is
   the source of the old editor's editor-vs-export drift and typing lag.

Phase 2 keeps layer 1 (ported near-verbatim) and replaces layer 2: the slide
keeps rendering through the existing HTML renderer
(`templateV2UiToHtmlFragment` in `TemplateSlideHost`), and a Vue overlay draws
selection, handles and guides on top, calling the ported model. One renderer
serves editor, preview and export.

## Scope

In scope:

1. **Selection.** Click selects a component (a root element is selected as an
   element); double-click selects the deepest element under the pointer and
   opens its editor (inline text for text), following the old `nodes.tsx`
   click/double-click handlers. Shift-click adds
   or removes components (multi-select). Esc or a click on empty canvas
   deselects. Hover outline on the element under the pointer.
2. **Move.** Pointer drag moves the selection (single or multi). Alignment
   guides and snapping via the ported `surface/alignmentGuides.ts` (slide edges
   and centre, other components). Arrow keys nudge 1px; Shift+arrow 10px.
3. **Resize.** Eight handles; maths via ported `model/component-resize.ts` and
   `layout/layoutResize.ts`. Shift keeps aspect ratio. Resizing a multi-select
   is not supported (handles hidden; move only).
4. **Inline text.** Double-click a `text` or `text-list` element (or press
   Enter with it selected) opens a Tiptap editor over the element. Runs
   (bold, italic, underline, colour) round-trip through
   `text-runs.ts` / `template-v2-text-editing.ts`. The commit happens on
   close (Esc, click outside, slide change); typing never re-renders the slide.
5. **Text toolbar.** Font family, font size, bold / italic / underline,
   colour, horizontal alignment, line height. Applies to the whole element
   when selected, or to the Tiptap selection while editing inline. A trimmed
   port of the old `TextToolbar`.
6. **Images.** "Replace" opens an image picker dialog with tabs Upload,
   Uploaded, Generate (AI) and Stock (`/api/v1/ppt/images/upload|uploaded|
   generate|search`). Toolbar: fit mode (cover / contain) and crop focus
   (9-point anchor). Full crop handles are 2c.
7. **Structural ops.** Delete, duplicate (Ctrl+D), copy / paste (Ctrl+C / V),
   group / ungroup (Ctrl+G / Ctrl+Shift+G). Clipboard uses the old MIME type
   `application/x-presenton-template-v2` and the `PRESENTON_TEMPLATE_V2:` text
   prefix, so pasting works between the old and new apps.
8. **Undo/redo.** Every commit is one `HistoryCommand` in the existing history
   store; the existing toolbar buttons and Ctrl+Z / Ctrl+Shift+Z work.
9. **Gating.** No editing on smart slides (no handles, no hover). No editing
   while `editor.locked` (generation or a chat/Ask turn).

Out of scope (2b/2c): charts, tables, infographics editing; inserting
elements; shape and line styling; containers, flex/grid controls; rotation;
crop handles; design variables; vector point editing. Selecting such elements
works (they can be moved, resized, deleted, duplicated), but they have no
element-specific toolbar.

## 1. Model port

`frontend/src/slide-editor/model/` receives copies of these old files, import
paths rewritten, behaviour unchanged:

| From `servers/nextjs/components/slide-editor/` | Purpose |
|---|---|
| `model/model.ts`, `model/core.ts` | element paths, selection, `updateElementInUi`, boxes, `deleteSelectionFromUi` |
| `model/component-resize.ts`, `layout/layoutResize.ts` | resize maths |
| `model/element-model.ts`, `model/render-style.ts` | toolbar element views |
| `model/template-v2-group.ts`, `model/template-v2-ungroup.ts` | group/ungroup |
| `model/inserted-content.ts`, `model/chart-model.ts` | transitive deps (paste ids, chart typing) |
| `clipboard/clipboard.ts` | clipboard payloads |
| `surface/alignmentGuides.ts` | guides and snapping |
| `selection/toolbarTarget.ts`, `selection/toolbarTypes.ts` | which toolbar a selection gets |
| `text/text-runs.ts`, `text/template-v2-text-editing.ts` | runs ↔ raw text |

Already ported under `frontend/src/render/legacy/components/slide-editor/`
(`types.ts`, `layout/flowLayout.ts`, `text/template-v2-text.ts`,
`video/video-placeholder.ts`, …) are reused, not duplicated.

Required adaptations, kept minimal and listed in a header comment of each
touched file:

- `model.ts` and `core.ts` use `Konva.Node` in a few position helpers
  (`positionFromNodeInParent` and friends). Replace the parameter with a plain
  `{ x: number; y: number }` point; drop functions the overlay doesn't call
  only if they need Konva at runtime.
- `toolbarTarget.ts` imports type guards (`isTemplateV2GroupElement`,
  `isTemplateV2LayoutElement`, `isTemplateV2InfographicToolbarElement`) and
  types from React `.tsx` toolbars and `state/state`. Extract those guards
  and types into a plain `selection/guards.ts` in the port.
- `events/events.ts` types (`TemplateV2SurfaceSelectedDetail`) are copied as
  types only; the DOM custom-event mechanism is not used.

## 2. Frontend units

```
frontend/src/slide-editor/
  model/…               ported model (§1)
  geometry.ts           hit-testing and overlay geometry
  useSlideEditing.ts    selection state, draft ui, commit
  useEditingShortcuts.ts keyboard shortcuts active while editing
  useClipboard.ts       browser clipboard integration (Vue rewrite of old useClipboard)
frontend/src/components/editor/canvas/
  EditableSlide.vue     TemplateSlideHost + overlay in one scaled 1280×720 box
  SelectionOverlay.vue  hover/selection boxes, handles, guides, pointer logic
  InlineTextEditor.vue  Tiptap editor positioned over a text element
  toolbars/ContextToolbar.vue   picks Text / Image / Multi / Generic toolbar
  toolbars/TextToolbar.vue
  toolbars/ImageToolbar.vue
  ImagePickerDialog.vue
frontend/src/api/images.ts      upload, list uploaded/generated, generate, stock search
```

### geometry.ts

- `hitTest(ui, point, current?: Selection): Selection | null` — topmost
  component whose `absoluteBoxForSelection` contains the point; with a
  double-click, returns the deepest element under the point
  (`kind: 'element'`).
- `selectionBoxes(ui, selection): Box[]` and `overlayScale(hostWidth)` (slide
  px → screen px). Hit-testing uses model boxes, not the DOM, so nested
  elements are hit without finer render annotation.

### useSlideEditing (per active slide)

State: `selection`, `draftUi` (non-null only during a drag/resize),
`inlineEdit` (path + runs, non-null while Tiptap is open), `guides`.

- `effectiveUi = draftUi ?? slide.ui` drives the overlay; during a drag the
  dragged component's DOM wrapper (`data-hf-el="e<i>"` via `annotate`) gets a
  CSS `transform: translate(...)` instead of a re-render. Resize does re-render
  from `draftUi`, throttled to one frame.
- `commit(nextUi, label)` → `useSlideMutations.applyEdit(label, p => p with
  this slide's ui replaced)` and a history command whose `undo` writes the
  previous `ui` back and `do` writes `nextUi` again. Commands find their slide
  by id; if it is gone they no-op, like the existing structural edits.
- Watches `slide.ui`: when it changes from outside (chat, refetch), an open
  inline editor closes without committing and the selection is revalidated by
  path (dropped if the element is gone).
- Disabled (returns inert state, overlay hidden) when the slide is smart or
  `editor.locked`.

### EditableSlide.vue

Replaces `SlideView` inside `EditorCanvas.vue` for template slides; smart
slides keep `SlideView`. Renders `TemplateSlideHost` with `annotate`, rendering a copy of the `ui` in which the element under inline
edit has its text blanked (so nested elements work, unlike top-level
`include`), and positions
`SelectionOverlay` and `InlineTextEditor` in the same scaled box. A
ResizeObserver keeps the scale correct across zoom and panel animations.

### ContextToolbar

Takes the place of the `FloatingToolbar` contents while something is
selected (same glass style and position; Aera classes), with a back/deselect
button on the left. Chosen by `toolbarTarget`: text → TextToolbar, image →
ImageToolbar, multiple → Multi (group, delete, duplicate), anything else →
Generic (delete, duplicate, copy). All toolbars include delete / duplicate.

### InlineTextEditor

Adds `@tiptap/vue-3`, `@tiptap/starter-kit`, `@tiptap/extension-text-style`,
`@tiptap/extension-color`, `@tiptap/extension-underline`,
`@tiptap/extension-text-align`. Converts runs → Tiptap JSON and back (port of
the conversion in old `TiptapInlineTextEditor.tsx`). Styled with the
element's font, size, colour, line height and box from the model
(`absoluteInlineEditBox`), scaled like the overlay. Commit on close via
`elementWithInlineDraft` / `preserveInlineEditFrame`.

### Fonts

The TextToolbar font list = `presentation.fonts` (via `local-fonts`) ∪ theme
fonts, so every offered font renders.

## 3. Edge cases and errors

- **Save failure**: `applyEdit` toasts and refetches; the selection is
  revalidated against the refetched `ui`.
- **Slide change, unmount, zoom mid-edit**: an open inline editor commits
  before the slide changes or the component unmounts; a drag in progress is
  cancelled on slide change.
- **Shortcuts**: editing shortcuts (Delete/Backspace, Ctrl+C/V/D/G, arrows,
  Enter, Esc) are active only with a selection and focus outside inputs and
  Tiptap; otherwise existing `useEditorShortcuts` keep arrows for slide
  navigation. While Tiptap is open, Ctrl+Z is Tiptap's own undo.
- **Unknown fields** in `ui` are preserved: the model patches raw records.
  Text normalisation uses `normalizeMarkdownTextInUi` as before.
- **Video placeholder layers** are never selectable.
- **Image picker**: upload/generate/search errors show inline in the dialog;
  AI generation shows progress and can be cancelled; the slide changes only
  when a source is picked. Uploaded image URLs resolve through the same asset
  resolver the renderer uses.

## 4. Testing

- **Unit (Vitest)**: the ported model on fixture `ui`s — move, resize,
  delete, paste (new ids, offset), group/ungroup;
  `geometry.ts` hit-testing (topmost wins, nested drill-down, video
  placeholder skipped); `useSlideEditing` (commit → cache, history do/undo,
  lock and smart gating, external `ui` change closes inline edit);
  run ↔ Tiptap JSON round-trip.
- **Component**: SelectionOverlay drag produces the expected box and snaps
  within threshold; ContextToolbar picks the right toolbar per selection;
  TextToolbar applies style patches.
- **e2e (Playwright, mocked + live suites)**: select → drag → reload keeps
  position; inline text edit persists; image replace via upload; undo/redo of
  a move; smart slide shows no handles; editing off during generation.
