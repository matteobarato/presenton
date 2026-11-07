# Vue frontend Phase 2a — core on-slide editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select, move, resize, inline-edit text, replace images, and delete/duplicate/copy-paste/group elements directly on template slides in `/frontend`, with undo and autosave.

**Architecture:** The old editor's pure-TS model layer is copied into `frontend/src/slide-editor/model/`. The slide keeps rendering through `TemplateSlideHost` (HTML in shadow DOM); a Vue overlay hit-tests against model boxes, draws selection/handles/guides and commits new `ui` through a new `editSlideUi` in `useSlideMutations` (cache → queued PATCH → history command). Text is edited in a Tiptap editor positioned over the element.

**Tech Stack:** Vue 3.5, Pinia, TanStack Vue Query, Tailwind v4, shadcn-vue (reka-ui), Vitest + @vue/test-utils, Playwright, `@tiptap/vue-3` 2.x.

**Spec:** `docs/superpowers/specs/2026-11-07-vue-frontend-phase2a-editing-design.md`

## Global Constraints

- Never modify `servers/nextjs`. Ported files are copies; each touched copy starts with a header comment `// Ported from servers/nextjs/components/slide-editor/<path>. Changes: <list or "import paths only">.`
- Template slides only: `slideKind(slide) === 'smart'` → no overlay, no hover, no shortcuts.
- No editing while `useEditorStore().locked` is true.
- Slide geometry is in 1280×720 slide px (`STAGE_WIDTH`/`STAGE_HEIGHT` from the ported `core.ts`).
- Clipboard MIME `application/x-presenton-template-v2`, text prefix `PRESENTON_TEMPLATE_V2:`.
- Aera design fidelity: toolbars reuse the existing `glass-tools` container and the `tool` / `active` / `divider` class strings from `components/editor/FloatingToolbar.vue`; extend, never remove existing tools.
- Every commit is exactly one history entry; Ctrl+Z inside Tiptap stays Tiptap's.
- Verification for every task: `cd frontend && pnpm vue-tsc -b && pnpm vitest run <task tests> && pnpm eslint <touched files>` all clean.

## Review Focus

1. **Undo after the slide was re-id'd by chat** — undo must no-op (not write the old ui onto another slide or throw). Test in Task 4 (`undo after re-id is a no-op`).
2. **External `ui` change while text editor is open** (chat turn finishes, refetch) — the editor must close without committing the stale draft. Test in Task 4 (`external ui change drops inline edit`).
3. **Slide switch while text editor is open** — typed text must be saved, not lost. Test in Task 8 (`commits on slide change`).
4. **Paste of a payload copied from the old Next.js app** — must insert, with fresh ids. Test in Task 6 (`pastes old-app text payload`).
5. **Drag released outside the slide / on the window** — the drag must end and commit the clamped position, never leave a stuck draft. Test in Task 5 (`pointerup outside ends drag`).

---

## File Structure

```
frontend/src/slide-editor/
  model/                    Task 1 — ported model (see Task 1 table)
  geometry.ts               Task 3 — hit-testing, item → DOM layer mapping
  useSlideEditing.ts        Task 4 — per-slide editing state + commit
  ops.ts                    Task 6 — structural ops on ui (delete/duplicate/paste/group/nudge)
  useClipboard.ts           Task 6 — browser clipboard glue
  useEditingShortcuts.ts    Task 6 — keyboard shortcuts while editing
  tiptapRuns.ts             Task 8 — TextRun[] ↔ Tiptap JSON
frontend/src/components/editor/canvas/
  EditableSlide.vue         Task 5
  SelectionOverlay.vue      Task 5
  InlineTextEditor.vue      Task 8
  ImagePickerDialog.vue     Task 10
  toolbars/ContextToolbar.vue, GenericToolbar.vue, MultiToolbar.vue   Task 7
  toolbars/TextToolbar.vue  Task 9
  toolbars/ImageToolbar.vue Task 10
frontend/src/api/images.ts  Task 10
Modified: src/render/legacy/lib/template-v2-json-to-html.ts (Task 2), src/render/TemplateSlideHost.vue (Task 2),
          src/composables/useSlideMutations.ts (Task 4), src/components/editor/EditorCanvas.vue (Task 5),
          src/components/editor/FloatingToolbar.vue (Task 7), src/composables/useEditorShortcuts.ts (Task 6)
Tests:    frontend/tests/unit/slide-editor/*.test.ts, frontend/tests/unit/editor/canvas/*.test.ts,
          frontend/tests/unit/slide-editor/fixtures.ts, frontend/tests/e2e/mocked.spec.ts, live.spec.ts
```

`tests/unit/slide-editor/fixtures.ts` (created in Task 1) exports `uiWithText()` (root bg + one component at 100,80 400×120 holding a `text` element "Hello"), `uiWithImage()` (component at 600,200 300×200 holding an `image` element `src: '/static/a.png'`), `uiTwoComponents()` (both of the above in one ui) and `uiWithVideoPlaceholder()` (uiWithText plus a root video placeholder layer per `video-placeholder.ts`). Later tasks use these.

---

### Task 1: Port the editing model

**Files:**
- Create: `frontend/src/slide-editor/model/` — copies of, from `servers/nextjs/components/slide-editor/`:
  `model/model.ts, model/core.ts, model/component-resize.ts, model/element-model.ts, model/render-style.ts, model/template-v2-group.ts, model/template-v2-ungroup.ts, model/inserted-content.ts, model/chart-model.ts, layout/layoutResize.ts, layout/layoutToolbarTarget.ts, clipboard/clipboard.ts, surface/alignmentGuides.ts, selection/toolbarTarget.ts, selection/toolbarTypes.ts, text/text-runs.ts, text/template-v2-text-editing.ts` (flattened into `model/`), plus `model/guards.ts` and `model/events-types.ts` (new).
- Test: `frontend/tests/unit/slide-editor/model.test.ts`, `frontend/tests/unit/slide-editor/fixtures.ts`

**Interfaces:**
- Produces (re-exported from `frontend/src/slide-editor/model/index.ts`): types `RawUi, RawElement, Box, Point, Size, Selection, ComponentSelection, MultiComponentSelection, ElementSelection`; constants `ROOT_ELEMENTS_COMPONENT_INDEX (-1), STAGE_WIDTH, STAGE_HEIGHT`; functions `absoluteBoxForSelection, absoluteElementBox, absoluteInlineEditBox, getElementAtSelection, updateElementInUi, updateComponentInUi, setComponentPositionsInUi, deleteSelectionFromUi, resizeComponent, resizeComponentFrame, componentBox, elementWithInlineDraft, preserveInlineEditFrame, normalizeMarkdownTextInUi, rootElementsComponent, childArrayInfo, selectionForComponentIndexes, componentIndexesForSelection`, the group/ungroup entry points, `createTemplateV2ClipboardPayload, pasteTemplateV2ClipboardPayload`, the alignment-guide snap function, `toolbarTarget` resolver, and the text-run converters — each under its original name.

- [ ] **Step 1: Copy the files, rewrite imports.** `@/components/slide-editor/X` → the new local path, or to the already-ported copy under `@/render/legacy/components/slide-editor/` (`types.ts`, `layout/flowLayout.ts`, `text/template-v2-text.ts`, `text/local-fonts.ts`, `text/markdown-text.ts`, `text/text-line-height.ts`, `video/video-placeholder.ts`, `charts/chart-data.ts`, `infographics/*`) — never duplicate those. `importing/template-v2-import` types resolve to `@/render/legacy/...` if present there, otherwise copy only the type declarations into `model/events-types.ts`.
- [ ] **Step 2: Remove Konva.** In `core.ts`/`model.ts` replace `Konva.Node` parameters with `{ x(): number; y(): number } | Point` → use plain `Point` (`positionFromNodeInParent(point: Point, ...)`); `MultiComponentDragState.nodes[].node` is deleted. No `konva` import may remain (`grep -r konva frontend/src/slide-editor` empty).
- [ ] **Step 3: Extract guards.** Copy `isTemplateV2GroupElement`, `isTemplateV2LayoutElement`, `TemplateV2ToolbarElement` (from `layout/LayoutToolbar.tsx`), `isTemplateV2InfographicToolbarElement`, `TemplateV2InfographicToolbarElement` (from `layout/InfographicToolbarControls.tsx`), `ChartSlideElement`, `TableSlideElement` (from `state/state.ts`) verbatim into `model/guards.ts`; `TemplateV2SurfaceSelectedDetail` type into `model/events-types.ts`. `toolbarTarget.ts` imports from these.
- [ ] **Step 4: Write fixtures and failing tests** in `model.test.ts`:
  - `absoluteBoxForSelection(uiWithText(), {kind:'component',componentIndex:0})` equals `{x:100,y:80,width:400,height:120}`.
  - `setComponentPositionsInUi` moving component 0 to (150,90) changes only that component's `position`; input ui is not mutated (deep-equal to a pre-call clone).
  - `deleteSelectionFromUi(uiTwoComponents(), {kind:'component',componentIndex:1})` leaves 1 component.
  - `resizeComponent` to 800×240 doubles the box; the text element's font size is unchanged.
  - Clipboard: `pasteTemplateV2ClipboardPayload(ui, createTemplateV2ClipboardPayload(ui, sel))` adds a component whose position is offset from the source and whose `id` differs.
  - Group then ungroup of components 0 and 1 in `uiTwoComponents()` restores two components with the original absolute boxes (±1px).
  - Unknown field `{ customX: 1 }` on a component survives move, resize and group/ungroup.
- [ ] **Step 5: Run** `pnpm vitest run tests/unit/slide-editor/model.test.ts` — fix port errors until PASS; `pnpm vue-tsc -b` clean.
- [ ] **Step 6: Commit** `feat(frontend): port slide-editor model layer`

---

### Task 2: Renderer hooks for editing

**Files:**
- Modify: `frontend/src/render/legacy/lib/template-v2-json-to-html.ts`, `frontend/src/render/TemplateSlideHost.vue`
- Test: `frontend/tests/unit/render/templateItemSources.test.ts`, `frontend/tests/unit/render/TemplateSlideHost.test.ts` (extend if it exists)

**Interfaces:**
- Produces: `export type TemplateV2ItemSource = { kind: 'element' | 'component'; index: number }` and `export function templateV2ItemSources(ui: unknown): TemplateV2ItemSource[]` — the source of each `payload.items[i]`, i.e. the item behind annotation id `e<i>`, honouring `liftRootVideoPlaceholder`. `TemplateSlideHost` exposes via `defineExpose`: `layerFor(source: TemplateV2ItemSource): HTMLElement | null` (the `[data-hf-el="e<i>"]` node in its shadow root).

- [ ] **Step 1: Failing tests:** for `uiWithText()` plus one root element, `templateV2ItemSources` returns `[{kind:'element',index:0},{kind:'component',index:0}]`; for `uiWithVideoPlaceholder()` the placeholder's source is listed where `templateV2RenderPayload` puts it (assert by comparing to `templateV2AnimationTargets` order). Mounting `TemplateSlideHost` with `annotate` and `uiWithText()`, `layerFor({kind:'component',index:0})` returns an element with `data-hf-el`.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.** Build sources alongside `items` in `templateV2RenderPayload` (tag each record before lifting, read the tags after; do not leave tags in rendered output). Export the function next to `templateV2AnimationTargets`.
- [ ] **Step 4: Run, verify PASS;** run existing render/golden tests `pnpm test:golden` — unchanged output.
- [ ] **Step 5: Commit** `feat(frontend): expose template item sources and layers for editing`

---

### Task 3: Hit-testing geometry

**Files:**
- Create: `frontend/src/slide-editor/geometry.ts`
- Test: `frontend/tests/unit/slide-editor/geometry.test.ts`

**Interfaces:**
- Consumes: Task 1 model.
- Produces:
  - `hitComponent(ui: RawUi, p: Point): Selection` — topmost (last-drawn: components after root elements, later index wins) item whose box contains `p`; a component → `{kind:'component',componentIndex}`; a root element → `{kind:'element',componentIndex:-1,elementPath:[i]}`; video placeholder layers and `decorative: true` full-slide root vectors are skipped; nothing → `null`.
  - `hitDeepest(ui: RawUi, p: Point): ElementSelection | null` — deepest element under `p` walking `childArrayInfo` children with `absoluteElementBox`.
  - `selectionBoxes(ui: RawUi, sel: Selection): Box[]` — one per selected component, or the element box.
  - `toSlidePoint(clientX: number, clientY: number, rect: DOMRect): Point` — `(client - rect.origin) * 1280 / rect.width`.

- [ ] **Step 1: Failing tests:** point (150,100) on `uiTwoComponents()` → component 0; (700,250) → component 1; (5,5) → null (background vector skipped); overlapping components → the later index; `hitDeepest` at (150,100) → `{kind:'element',componentIndex:0,elementPath:[0]}`; video placeholder area → not hit; `toSlidePoint(740, 460, {left:100,top:100,width:640,height:360})` → `{x:1280,y:720}`.
- [ ] **Step 2: Run, FAIL. Step 3: Implement. Step 4: Run, PASS.**
- [ ] **Step 5: Commit** `feat(frontend): slide-editor hit-testing`

---

### Task 4: Slide ui commits and editing state

**Files:**
- Modify: `frontend/src/composables/useSlideMutations.ts`
- Create: `frontend/src/slide-editor/useSlideEditing.ts`
- Test: `frontend/tests/unit/editor/useSlideMutations.test.ts` (extend), `frontend/tests/unit/slide-editor/useSlideEditing.test.ts`

**Interfaces:**
- Produces in `useSlideMutations`: `editSlideUi(slideId: string, next: RawUi, label: string): Promise<boolean>` — uses the existing internal `commit`; edit replaces `ui` of the slide with that id (null if absent or `ui` already deep-equal); undo writes the `ui` captured at first apply back to the slide with that id (null if absent). Added to the returned object.
- Produces `useSlideEditing(presentationId: Ref<string>, slide: Ref<Slide | null>)` returning:
  `enabled: ComputedRef<boolean>` (template slide && !editor.locked), `ui: ComputedRef<RawUi | null>` (`draftUi ?? slide.ui`), `selection: Ref<Selection>`, `draftUi: Ref<RawUi | null>`, `inlineEdit: Ref<{ selection: ElementSelection; element: RawElement } | null>`, `guides: Ref<AlignmentGuide[]>` (type from Task 1's alignmentGuides), `select(sel: Selection): void`, `commit(next: RawUi, label: string): Promise<boolean>` (clears `draftUi`, calls `editSlideUi`), `cancelDraft(): void`.
  It is provided to descendants with `provide(SLIDE_EDITING_KEY, api)`; `useSlideEditingContext()` injects it (throws if missing).

- [ ] **Step 1: Failing tests (useSlideMutations):** `editSlideUi` updates the cache slide's `ui` and PATCHes once; `history.undo()` restores the previous `ui`; **`undo after re-id is a no-op`**: replace the slide in cache with a new id, undo → cache unchanged, no throw; returns false and records nothing when `editor.locked`.
- [ ] **Step 2: Failing tests (useSlideEditing):** `enabled` false for a smart slide and while `editor.deckBusy = 1`; `commit` clears `draftUi`; selection is set to null when `slide.ui` changes so that the selected component index no longer exists; **`external ui change drops inline edit`**: with `inlineEdit` set, assigning a new `slide.ui` object sets `inlineEdit` to null and `editSlideUi` is not called; changing `slide.id` clears selection and draft.
- [ ] **Step 3: Run, FAIL. Step 4: Implement. Step 5: Run both files, PASS.**
- [ ] **Step 6: Commit** `feat(frontend): slide ui commits and editing state`

---

### Task 5: Editable canvas — select, hover, move, resize

**Files:**
- Create: `frontend/src/components/editor/canvas/EditableSlide.vue`, `frontend/src/components/editor/canvas/SelectionOverlay.vue`
- Modify: `frontend/src/components/editor/EditorCanvas.vue` (calls `useSlideEditing(presentationId, slide)`, which provides the context to everything inside the canvas, FloatingToolbar included; uses `EditableSlide` when `slideKind(slide) !== 'smart'`, keeps `SlideView` otherwise; keeps the `slide-change` transition and key)
- Test: `frontend/tests/unit/editor/canvas/SelectionOverlay.test.ts`, `frontend/tests/unit/editor/canvas/EditableSlide.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: `EditableSlide` props `{ slide: Slide; theme?: unknown; fonts?: unknown }`; it consumes the context via `useSlideEditingContext()`. Tests mount it inside a small wrapper that calls `useSlideEditing`. `SelectionOverlay` has no props (uses context), emits `open-editor(sel: ElementSelection)` on double-click.

Behaviour:
- `EditableSlide` sizes like `SlideView` (scale = width/1280, ResizeObserver), renders `TemplateSlideHost` with `annotate` and `:ui="renderUi"` (Task 8 blanks text here; for now `ui`), and `SelectionOverlay` absolutely over it. Overlay hidden when `!enabled`.
- Pointer: `pointerdown` on overlay → `hitComponent`; shift → toggle in multi-selection (`selectionForComponentIndexes`); start drag after 3 screen-px movement (pointer capture). During drag: compute snapped position with the ported alignment-guide function (threshold as in the old file), set `guides`, and apply `transform: translate(dx*scale px, dy*scale px)` to `layerFor(source)` of each dragged item (no re-render). `pointerup` (also `lostpointercapture`): clear transforms, clamp into the slide, `commit(setComponentPositionsInUi(...), 'Move')` (root elements via `updateElementInUi` position). Click on empty → select null.
- Handles: 8 handles on single selection (component or element), hidden for multi. Resize writes `draftUi` via `resizeComponent`/`resizeComponentFrame` (element: `resizeRawElementBounds`) throttled with `requestAnimationFrame`; Shift keeps ratio; release commits `'Resize'`.
- Hover: dashed outline (`#4bb3e6`) of `hitComponent` under pointer when not dragging; selection: solid 1.5px outline + 8px white square handles with `#4bb3e6` border. Guides: 1px `#ff3d8b` lines.
- Double-click → `hitDeepest` → select it, emit `open-editor`.

- [ ] **Step 1: Failing tests** (mount `EditableSlide` with a mocked `useSlideMutations.editSlideUi` and a `getBoundingClientRect` stub of 640×360): click at slide (150,100) selects component 0; shift-click component 1 → multi with `[0,1]`; drag component 0 by +100 slide px x → `editSlideUi` called once with component 0 position x 200; drag within snap threshold of the slide centre → committed x centres the box (box centre = 640); resize via the right handle +200 → width 600; **`pointerup outside ends drag`**: dispatch `pointerup` on `window` after drag → committed once, `draftUi` null; smart slide renders `SlideView` and no overlay; `editor.deckBusy=1` → no overlay.
- [ ] **Step 2: Run, FAIL. Step 3: Implement. Step 4: Run, PASS;** run `tests/unit/editor/EditorView.test.ts` — still PASS.
- [ ] **Step 5: Commit** `feat(frontend): select, move and resize on the slide canvas`

---

### Task 6: Structural ops, clipboard and shortcuts

**Files:**
- Create: `frontend/src/slide-editor/ops.ts`, `frontend/src/slide-editor/useClipboard.ts`, `frontend/src/slide-editor/useEditingShortcuts.ts`
- Modify: `frontend/src/composables/useEditorShortcuts.ts` (arrow-key slide navigation skipped when the editing context has a selection), `EditableSlide.vue` (call `useEditingShortcuts`)
- Test: `frontend/tests/unit/slide-editor/ops.test.ts`, `frontend/tests/unit/slide-editor/useEditingShortcuts.test.ts`

**Interfaces:**
- Produces in `ops.ts` (pure, return `{ ui: RawUi; selection: Selection } | null`): `deleteSelection(ui, sel)`, `duplicateSelection(ui, sel)` (via clipboard payload, no system clipboard), `pasteFromPayload(ui, payload)`, `groupSelection(ui, sel)` (multi only), `ungroupSelection(ui, sel)`, `nudge(ui, sel, dx, dy)` (clamped into the slide).
- `useClipboard()` → `copy(ui: RawUi, sel: Selection): Promise<void>` (writes MIME + prefixed text + localStorage fallback key `presenton-template-v2-clipboard`, all in try/catch), `readPayload(e?: ClipboardEvent): Promise<ClipboardPayload | null>` (MIME, then prefixed text, then localStorage).
- `useEditingShortcuts(ctx)` binds on `window` keydown, ignored when target is input/textarea/contenteditable or `ctx.inlineEdit` set or no `ctx.enabled`: Delete/Backspace → delete; Ctrl/Cmd+D → duplicate; Ctrl/Cmd+C → copy; paste via `paste` event; Ctrl/Cmd+G → group; Ctrl/Cmd+Shift+G → ungroup; arrows → nudge 1 (Shift 10); Enter on text element → open editor; Esc → select null. Each calls `ctx.commit(result.ui, label)` then `ctx.select(result.selection)`; labels `Delete`, `Duplicate`, `Paste`, `Group`, `Ungroup`, `Nudge`. `preventDefault` only when handled.

- [ ] **Step 1: Failing tests (ops):** delete removes; duplicate adds an offset copy and selects it; group of `[0,1]` yields 1 component, ungroup restores 2; nudge (−500,0) clamps x to 0; **`pastes old-app text payload`**: `readPayload` given a `text/plain` of `PRESENTON_TEMPLATE_V2:` + JSON of a payload produced by the ported `createTemplateV2ClipboardPayload` → paste adds a component with a new id.
- [ ] **Step 2: Failing tests (shortcuts):** ArrowRight with selection → nudge commit and `editor.next` not called; ArrowRight with no selection → no commit; Delete while focus in an `<input>` → no commit; Ctrl+Z is not handled here.
- [ ] **Step 3: Run, FAIL. Step 4: Implement. Step 5: Run, PASS.**
- [ ] **Step 6: Commit** `feat(frontend): delete, duplicate, clipboard, group and nudge shortcuts`

---

### Task 7: Context toolbar

**Files:**
- Create: `frontend/src/components/editor/canvas/toolbars/ContextToolbar.vue`, `GenericToolbar.vue`, `MultiToolbar.vue`
- Modify: `frontend/src/components/editor/FloatingToolbar.vue` — when the editing context (via an optional inject, `useSlideEditingContextOptional()` added to `useSlideEditing.ts`) has a selection, render `ContextToolbar` instead of the slide tools; otherwise unchanged.
- Test: `frontend/tests/unit/editor/canvas/ContextToolbar.test.ts`

**Interfaces:**
- Consumes: Task 1 `toolbarTarget`, Task 6 `ops.ts`, `useClipboard`.
- Produces: `ContextToolbar` (no props) picks by `toolbarTarget` kind: text/text-list → `TextToolbar` slot (Task 9; placeholder `GenericToolbar` until then), image → `ImageToolbar` (Task 10), multi → `MultiToolbar` (Group, Duplicate, Delete), else `GenericToolbar` (Duplicate, Copy, Delete; plus Ungroup when the target is a group). Leftmost button: "Done" (`X` icon, `aria-label="Deselect"`) → `select(null)`. Same glass container and class strings as FloatingToolbar.

- [ ] **Step 1: Failing tests:** no selection → slide tools (Undo button present); component selection → Generic (Delete, Duplicate, Copy buttons, no Undo); multi → Group button; clicking Delete calls `commit` with label `Delete`; Deselect clears selection.
- [ ] **Step 2: Run, FAIL. Step 3: Implement. Step 4: Run, PASS** (plus existing FloatingToolbar-related tests).
- [ ] **Step 5: Commit** `feat(frontend): context toolbar for slide selections`

---

### Task 8: Inline text editor

**Files:**
- Create: `frontend/src/slide-editor/tiptapRuns.ts`, `frontend/src/components/editor/canvas/InlineTextEditor.vue`
- Modify: `EditableSlide.vue` (open on `open-editor` for `text`/`text-list`; `renderUi` blanks the edited element's text), `useSlideEditing.ts` (`openInlineEdit(sel)`, `closeInlineEdit(commit: boolean)`), `package.json` (add `@tiptap/vue-3`, `@tiptap/starter-kit`, `@tiptap/extension-text-style`, `@tiptap/extension-color`, `@tiptap/extension-underline`, `@tiptap/extension-text-align`, all the same 2.x version)
- Test: `frontend/tests/unit/slide-editor/tiptapRuns.test.ts`, `frontend/tests/unit/editor/canvas/InlineTextEditor.test.ts`

**Interfaces:**
- Produces: `runsToDoc(runs: TextRun[], list: boolean): JSONContent`, `docToRuns(doc: JSONContent, list: boolean): TextRun[]` (conversion logic ported from old `text/TiptapInlineTextEditor.tsx`); `blankTextAt(ui: RawUi, sel: ElementSelection): RawUi` in `tiptapRuns.ts` (text → `''`, text-list items' text → `''`, geometry kept).
- `InlineTextEditor` (no props; context `inlineEdit`) positions at `absoluteInlineEditBox(...) × scale`, font/size/colour/line-height/alignment from the element (via `rawFont`), transparent background, autofocus with caret at end. Close: Esc, blur to outside the editor/toolbar, or slide change / unmount → `closeInlineEdit(true)`; commit uses `elementWithInlineDraft` + `preserveInlineEditFrame` + `normalizeMarkdownTextInUi`, label `Edit text`; unchanged runs → no commit.

- [ ] **Step 1: Failing tests (tiptapRuns):** runs `[{text:'Hel',bold:true},{text:'lo',color:'#ff0000'}]` round-trip deep-equal; text-list with 3 items round-trips with 3 items; empty doc → `[{text:''}]`; `blankTextAt` keeps the element's box.
- [ ] **Step 2: Failing tests (InlineTextEditor):** double-click on text opens the editor with "Hello"; typing then Esc → `editSlideUi` called once with the new text; Esc with no change → not called; **`commits on slide change`**: type, then change the `slide` prop to another slide → commit for the first slide id; external ui change while open → closes, no commit (already covered in Task 4; assert the editor DOM is gone).
- [ ] **Step 3: Run, FAIL. Step 4: Implement. Step 5: Run, PASS.**
- [ ] **Step 6: Commit** `feat(frontend): inline text editing with Tiptap`

---

### Task 7b: Element inspector tab (revision 2026-11-07, user decision; supersedes Task 7's placement)

Spec: §2 "Element inspector tab". Element editing moves out of the floating top toolbar into a dedicated **Element** tab in the inspector sidebar.

**Files:**
- Modify: `frontend/src/views/EditorView.vue` (call `useSlideEditing(id, activeSlide)` here), `frontend/src/components/editor/EditorCanvas.vue` (stop calling it; consume the context), `frontend/src/components/editor/FloatingToolbar.vue` (back to slide tools only: no ContextToolbar), `frontend/src/stores/editor.ts` (`InspectorTabId` gains `'element'`), `frontend/src/components/editor/inspector/tabs.ts` (Element tab first or after Design — place it first)
- Create: `frontend/src/components/editor/inspector/element/ElementTab.vue`, `ArrangeSection.vue`
- Move/delete: `components/editor/canvas/toolbars/ContextToolbar.vue`, `GenericToolbar.vue`, `MultiToolbar.vue` → their behaviour moves into ElementTab/ArrangeSection (keep `toolbarKind.ts`, `useEditingActions.ts`)
- Test: `frontend/tests/unit/editor/inspector/ElementTab.test.ts` (replace ContextToolbar.test.ts cases), update FloatingToolbar/EditorView tests

**Interfaces:**
- `ElementTab` gets the standard inspector tab props (`presentationId, presentation, activeSlide`) and uses `useSlideEditingContext()`. Root carries `data-inline-edit-ignore`.
- Section layout follows the Aera inspector (see `aera-frontend/src/App.vue` Design tab: `control-section`, `section-label` header row with label left and a muted value right, `select-wrap`, swatch row with a custom colour, segmented option buttons) using the existing frontend tokens/classes already used by `DesignTab.vue`.
- Exports for Tasks 9/10: ElementTab renders `<TextSection v-if="kind==='text'" />` and `<ImageSection v-if="kind==='image'" />` slots/components; until those tasks land, only Header + Arrange render.

Behaviour:
- Header: selection label (`Text`, `Image`, `Group`, `N items`, `Element`) + Deselect button (`aria-label="Deselect"`).
- Arrange: Duplicate, Copy, Delete; Group when multi; Ungroup when group. Via `useEditingActions().run`. Disabled while `inlineEdit` is set (structural ops) — same rule Task 8 added.
- Empty state when no selection or editing disabled: "Select something on the slide to edit it." + muted hint "Double-click text to type." (smart slide: "This slide can't be edited on the canvas.").
- Auto-switch: a watcher in `EditorView` (or ElementTab-independent composable): when selection goes from null to non-null → `editor.inspectorTab = 'element'`; when the inspector is docked (`min-width: 1051px`) and closed → `editor.inspectorOpen = true`. Below 1051px only the tab changes. Deselect never switches tabs.

- [ ] **Step 1: Failing tests:** FloatingToolbar shows slide tools (Undo present) even with a selection; selecting a component switches `inspectorTab` to `element` and opens a closed docked inspector; at narrow width the inspector stays closed; ElementTab with a component selection shows Duplicate/Copy/Delete; multi shows Group; Delete click commits `Delete`; no selection → empty-state text; Deselect clears selection; ElementTab root has `data-inline-edit-ignore`; Arrange buttons disabled while `inlineEdit` set.
- [ ] **Step 2: Run, FAIL. Step 3: Implement. Step 4: Run, PASS** (plus `tests/unit/editor`, `tests/unit/slide-editor`).
- [ ] **Step 5: Commit** `feat(frontend): element inspector tab replaces the selection toolbar`

---

### Task 9: Text section (Element tab)

**Files:**
- Create: `frontend/src/components/editor/inspector/element/TextSection.vue`
- Modify: `ElementTab.vue` (render it for text targets)
- Test: `frontend/tests/unit/editor/inspector/TextSection.test.ts`

**Interfaces:**
- Consumes: context, Task 1 `updateElementInUi`, `rawFont`, Task 8 editor instance (exposed by `useSlideEditing` as `inlineEditor: ShallowRef<Editor | null>`).
- Controls: font family (select; options = `localFontOptionsFromUnknown(presentation.fonts)` families ∪ theme fonts from `themeCssVars`, current first), font size (number input 8–200), Bold, Italic, Underline (toggle buttons), colour (popover with native `<input type="color">` + theme palette swatches), align left/center/right/justify, line height (select 1.0, 1.15, 1.5, 2.0).
- No inline editor open → patch the whole element (`font.*`, `align`, `lineHeight` per the ported text model field names) and every run, `commit(…, 'Text style')`. Inline editor open → apply via Tiptap commands (`toggleBold`, `setColor`, `setTextAlign`, …); committed when the editor closes. Section clicks must not close the editor (`@mousedown.prevent` on buttons; the tab is `data-inline-edit-ignore`).

- [ ] **Step 1: Failing tests:** Bold with element selected → commit where every run has `bold: true`; size 48 → element font size 48; font list contains the deck font family; with inline editor open, Bold calls the editor command and does not commit.
- [ ] **Step 2: Run, FAIL. Step 3: Implement. Step 4: Run, PASS.**
- [ ] **Step 5: Commit** `feat(frontend): text section in the element tab`

---

### Task 10: Images — API, picker, toolbar

**Files:**
- Create: `frontend/src/api/images.ts`, `frontend/src/components/editor/canvas/ImagePickerDialog.vue`, `frontend/src/components/editor/inspector/element/ImageSection.vue`
- Modify: `ElementTab.vue`
- Test: `frontend/tests/unit/api/images.test.ts`, `frontend/tests/unit/editor/canvas/ImagePickerDialog.test.ts`, `frontend/tests/unit/editor/inspector/ImageSection.test.ts`

**Interfaces:**
- `images.ts` (through the typed `api` client; regenerate `schema.d.ts` with `pnpm gen:api` if paths are missing): `uploadImage(file: File): Promise<ImageAsset>` (POST `/api/v1/ppt/images/upload`, multipart), `listUploadedImages(): Promise<ImageAsset[]>`, `listGeneratedImages(): Promise<ImageAsset[]>`, `generateImage(prompt: string, signal?: AbortSignal): Promise<string>` (GET `/api/v1/ppt/images/generate?prompt=`), `searchStockImages(query: string, signal?: AbortSignal): Promise<string[]>` (GET `/api/v1/ppt/images/search`; match params/response to the FastAPI endpoint), `type ImageAsset = { id: string; path: string }` (match schema). Query keys `['images','uploaded']`, `['images','generated']`.
- `ImagePickerDialog` props `{ open: boolean }`, emits `update:open`, `pick(src: string)`. Tabs Upload (dropzone, reuse `create/FileDropzone.vue` if its API fits, accept `image/*`), Uploaded (grid), Generate (prompt + Generate; shows a spinner and a Cancel that aborts), Stock (search box + grid). Errors render inline in the active tab (`role="alert"`). Displayed URLs resolve with the same asset resolver the renderer uses (`normalizeTemplateV2AssetUrls` logic — export a `resolveAssetUrl(src)` from the renderer module if none exists).
- `ImageSection`: Replace (opens dialog; `pick` → `commit(updateElementInUi(… src …), 'Replace image')`), fit Cover / Contain (toggle; element `fit` / `objectFit` per ported model field), crop focus (popover 3×3 grid → `focus` / `objectPosition` field per ported model). (Duplicate/Delete live in the Arrange section.)

- [ ] **Step 1: Failing tests:** `uploadImage` sends multipart to the upload path (fetch mock); picker Generate → spinner, Cancel aborts the signal, no `pick`; generate error shows alert text; picking an uploaded image emits its path; ImageSection pick → one commit with the new `src`; Contain → commit with contain fit.
- [ ] **Step 2: Run, FAIL. Step 3: Implement. Step 4: Run, PASS.**
- [ ] **Step 5: Commit** `feat(frontend): image replace picker and image section`

---

### Task 11: End-to-end coverage

**Files:**
- Modify: `frontend/tests/e2e/mocked.spec.ts`, `frontend/tests/e2e/live.spec.ts`, `frontend/tests/e2e/fixtures/*` (add a template slide fixture with a text and an image component if none fits)

- [ ] **Step 1: Mocked suite** (route PATCH `presentation/update`, assert bodies): click text component → Element tab shows Delete; drag by 100px → PATCH body has the new position; reload (fixture serves last PATCH) → position kept; double-click text, type " world", Esc → PATCH contains "Hello world"; Ctrl+Z → PATCH restores "Hello"; replace image via Upload tab (mock upload response) → PATCH has new src; smart slide fixture → no `[data-testid="selection-overlay"]`; during generation (`editor.generating`) → no overlay.
- [ ] **Step 2: Live suite** (against the stack, skipped when unavailable like the existing live tests): open a generated deck, move a component, reload, assert position persisted.
- [ ] **Step 3: Run** `pnpm e2e` — PASS; `pnpm check` — PASS.
- [ ] **Step 4: Commit** `test(frontend): e2e for on-slide editing`
