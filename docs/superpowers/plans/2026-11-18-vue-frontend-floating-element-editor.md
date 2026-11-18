# Floating Element Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all element-editing controls from the right inspector's Element tab to a floating context bar + panel popovers anchored to the selection, and turn the Element tab into a Layers-only tab.

**Architecture:** A screen-space host (`FloatingElementEditor`) mounted in `EditorCanvas` reads the selection from `useSlideEditingContext()`, computes the selection's axis-aligned bounds in screen space, and positions a `ContextBar` with the pure `floatingAnchor()`. Bar contents come from one `kindBars` map in `barItems.ts` (item lists per kind live in small `bars/<kind>.ts` files so kind tasks never touch the same file). Popovers reuse the existing Section components. The old Element tab stays working until Task 13 swaps it for Layers, so every commit leaves the editor usable.

**Tech Stack:** Vue 3, Pinia, Vite, Tailwind v4, shadcn-vue + reka-ui (Popover), @vueuse/core, Vitest + @vue/test-utils, Playwright (mocked e2e).

**Spec:** `docs/superpowers/specs/2026-11-18-vue-frontend-floating-element-editor-design.md`

## Global Constraints

- All work is in `frontend/` only; never touch `servers/nextjs`. Template slides only; no smart-slide UI (`ctx.enabled` false ⇒ no bar).
- No new dependencies. Keep the Aera look: use `container`, `tool`, `active`, `divider` from `components/editor/canvas/toolbars/toolbarClasses.ts`.
- No new editing capabilities and no change to ops (`slide-editor/*Ops.ts`), data model or history. Nothing available in the Element tab today may become unreachable.
- Bar and all portaled popover content carry `data-inline-edit-ignore="true"`; bar buttons use `@mousedown.prevent`; popovers must not auto-focus.
- Hidden while `ctx.gestureActive`; visible during inline text editing; popover width ~300px; Escape closes an open popover first, the next Escape deselects.
- Below 760px the bar docks at the bottom of the canvas.
- `InspectorTabId` `'element'` becomes `'layers'`; Insert, Design, Narration unchanged.
- Branch `feat/floating-element-editor`; **never stage or commit** the already-modified `frontend/src/slide-editor/geometry.ts` and `frontend/tests/unit/slide-editor/geometry.test.ts`, nor the untracked Phase 3 docs. Stage files by explicit path only (never `git add -A`/`.`). Commit messages end with the attribution lines from the session's system reminder.
- Run from `frontend/`: tests `npx vitest run <path>`, types `npx vue-tsc -b`, lint `npm run lint`, e2e `npx playwright test tests/e2e/mocked.spec.ts -g "<name>"`.

## Review Focus

1. Selection near the slide's top/left/right edge, or scrolled partly out of view at zoom > 1: the bar flips below or clamps inside the canvas and is never clipped or off-screen (Task 1, Task 2).
2. Rotated element: the bar anchors to the rotated shape's axis-aligned bounds, not the unrotated box (Task 2).
3. Applying bold/size/colour from the bar while text is selected in the inline editor keeps the text selection and the editor open (Task 4).
4. Deck `locked` (generating or chat turn running): bar controls are disabled and ops do not fire (Task 2).
5. Selection changes while a popover is open (click another element, click the canvas background, switch slide, pick a row in Layers): popover closes, no stale panel for the old element, no error after the element is deleted from the bar (Task 2, Task 13).

---

## Task 0: Branch

- [ ] **Step 1:** `git switch -c feat/floating-element-editor` (uncommitted changes carry over; leave them unstaged).
- [ ] **Step 2:** Verify `git status --short` still lists exactly the two modified geometry files and two untracked docs (plus the new spec/plan). Do not commit anything here.

## Task 1: `floatingAnchor` (pure placement)

**Files:** Create `frontend/src/components/editor/canvas/floating/floatingAnchor.ts`; Test `frontend/tests/unit/editor/floating/floatingAnchor.test.ts`.

**Interfaces — Produces:**
```ts
export interface Rect { x: number; y: number; width: number; height: number }
export interface AnchorInput {
  /** Selection AABB in canvas-viewport px (already scaled). */
  target: Rect
  viewport: { width: number; height: number }
  bar: { width: number; height: number }
  /** Gap between bar and target when above (default 10). */
  gapAbove?: number
  /** Gap when below; must clear the rotate handle (24px stem + 6px handle radius + 8px air; default 44). */
  gapBelow?: number
  /** Viewport inset the bar is kept within (default 8). */
  margin?: number
}
export interface AnchorResult { x: number; y: number; placement: 'above' | 'below' | 'pinned' }
/** Top-left of the bar in viewport px. */
export function floatingAnchor(input: AnchorInput): AnchorResult
```

- [ ] **Step 1: Failing tests** (`floatingAnchor.test.ts`), viewport 1000×600, bar 300×36, margin 8:
  - centred above: target `{x:400,y:200,width:200,height:100}` ⇒ `{ x: 350, y: 154, placement: 'above' }` (y = 200 − 10 − 36).
  - flips below when above does not fit: target y 20 ⇒ `placement: 'below'`, `y === target.y + target.height + 44`.
  - clamps horizontally: target at x 0 width 40 ⇒ `x === 8`; target at right edge ⇒ `x + 300 === 992`.
  - neither above nor below fits (target spans the full height): `placement: 'pinned'`, `y === 8`.
  - target partly scrolled off the top (negative y) still returns finite, in-viewport x/y.
  - bar wider than viewport ⇒ `x === margin` (no NaN).
- [ ] **Step 2:** `npx vitest run tests/unit/editor/floating/floatingAnchor.test.ts` ⇒ FAIL (module missing).
- [ ] **Step 3:** Implement `floatingAnchor`: prefer above; else below; else pinned to `margin`; clamp x to `[margin, viewport.width - bar.width - margin]` (min wins when the range is empty); clamp y into the viewport the same way.
- [ ] **Step 4:** Run the test ⇒ PASS.
- [ ] **Step 5:** Commit `feat(frontend): floating editor anchor placement` (add the two files by path).

## Task 2: Floating host, bar shell, popover, safety rules (common tail only)

**Files:**
- Create under `frontend/src/components/editor/canvas/floating/`: `FloatingElementEditor.vue`, `ContextBar.vue`, `PanelPopover.vue`, `barItems.ts`, `bars/{text,list,image,icon,shape,line,table,chart,infographic,layout,video,multi,generic}.ts` (each `export const <name>Bar: BarItem[] = []`), `tail.ts`.
- Modify: `frontend/src/components/editor/EditorCanvas.vue` (mount host in the canvas `<section>`), `frontend/src/stores/editor.ts` (`panelEscapeGuard`), `frontend/src/slide-editor/useEditingShortcuts.ts:135-139` (Escape branch).
- Test: `frontend/tests/unit/editor/floating/FloatingElementEditor.test.ts`, `frontend/tests/unit/editor/floating/harness.ts` (extends `tests/unit/editor/canvas/harness.ts`).

**Interfaces — Produces** (`barItems.ts`):
```ts
export interface BarContext { ctx: SlideEditing; presentation: Presentation; presentationId: string; slide: Slide | null; locked: boolean }
export type BarItem =
  | { type: 'button'; id: string; label: string; title?: string; icon: Component; run: (c: BarContext) => void; active?: (c: BarContext) => boolean; disabled?: (c: BarContext) => boolean }
  | { type: 'custom'; id: string; component: Component; props?: (c: BarContext) => Record<string, unknown> }
  | { type: 'panel'; id: string; label: string; icon: Component; component: Component; props?: (c: BarContext) => Record<string, unknown> }
export const kindBars: Record<ToolbarKind, BarItem[]>   // one entry per ToolbarKind, from bars/*.ts
export function barFor(kind: ToolbarKind): BarItem[]     // kindBars[kind] followed by the common tail
```
`tail.ts` exports `commonTail(kind): BarItem[]`: panel `appearance` (`AppearanceSection`, omitted for `multi`), panel `arrange` (`ArrangeSection` + `OrderSection` + `LayerChildren` in one small wrapper component `ArrangePanel.vue`), buttons `duplicate` and `delete` (call `useEditingActions(ctx).run('Duplicate'|'Delete', …)` with `duplicateSelection` / `deleteSelection`). Also `editor.panelEscapeGuard: boolean` in the store.

- [ ] **Step 1: Failing tests** in `FloatingElementEditor.test.ts` (use the harness to mount the host with a fake slide ui, a stage rect and a selection):
  - renders `role="toolbar"` named "Element tools" with Appearance, Arrange, Duplicate, Delete buttons for a selected text component; renders nothing for no selection, `ctx.enabled=false`, and while `ctx.gestureActive=true` (reappears when false).
  - rotated element (rotation 45) anchors using the AABB: the bar's computed `left/top` equals `floatingAnchor` of `aabb(frame)` scaled (assert top is above the rotated bounds' top, not the unrotated box's top).
  - near the slide top: `data-placement="below"`.
  - clicking Appearance opens a popover containing `AppearanceSection`; the popover and the bar have `data-inline-edit-ignore="true"` ancestors; `mousedown` on bar buttons is default-prevented.
  - locked deck (`useEditorStore().generating = true`): Duplicate and Delete are `disabled`, clicking runs no op.
  - open popover then `ctx.select(otherSelection)` ⇒ popover closed; select(null) ⇒ bar gone; delete via bar ⇒ bar gone, no console error.
  - Escape with a popover open closes it and keeps the selection; the next Escape clears the selection (dispatch `keydown` on `window`).
- [ ] **Step 2:** `npx vitest run tests/unit/editor/floating/FloatingElementEditor.test.ts` ⇒ FAIL.
- [ ] **Step 3: Implement.** Host: `defineProps<{ stage: HTMLElement | null; scroller: HTMLElement | null; presentation: Presentation; presentationId: string; slide: Slide | null }>()`; absolute `inset-0 z-20 pointer-events-none` layer in the canvas section; the bar is `pointer-events-auto`. Compute target = union of `aabb(frame)` for `selectionFrames(ui, selection)` (slide units) × `stage.width / STAGE_WIDTH`, offset by stage rect minus section rect; recompute on stage/section resize (`useElementBounding`/`ResizeObserver`), `scroller` scroll, zoom and `ui` changes. Measure the bar with `useElementSize`. `ContextBar` renders items from `barFor(toolbarKind(ui, selection))`: button ⇒ `tool` class button with `aria-label`, `:aria-pressed` from `active`; custom ⇒ its component; panel ⇒ `PanelPopover`; roving tabindex + ArrowLeft/Right. `PanelPopover`: shadcn `Popover` non-modal, content `w-[300px] max-h-[min(70vh,520px)] overflow-y-auto`, `data-inline-edit-ignore="true"`, `@open-auto-focus.prevent`, `@close-auto-focus.prevent`; the host keeps one open panel id and clears it on any selection change. Escape: a window **capture**-phase keydown listener in the host sets `editor.panelEscapeGuard = true` (cleared with `setTimeout(0)`) when a panel is open and the key is Escape; the Escape branch in `useEditingShortcuts.ts` returns without deselecting when the guard is set.
- [ ] **Step 4:** Mount `<FloatingElementEditor>` in `EditorCanvas.vue` (pass the existing slide wrapper div and the scroll container as refs, plus presentation/slide props from existing computeds). Run the new test file ⇒ PASS, then `npx vitest run tests/unit/editor` ⇒ PASS (old Element tab untouched), `npx vue-tsc -b` ⇒ clean.
- [ ] **Step 5:** Commit `feat(frontend): floating element editor shell` (explicit paths).

## Task 3: Mobile dock and position tracking

**Files:** Modify `FloatingElementEditor.vue`, `PanelPopover.vue`; Test `FloatingElementEditor.test.ts` (add cases).

- [ ] **Step 1: Failing tests:** with `matchMedia('(max-width: 760px)')` true the bar has `data-placement="dock"`, is positioned at the bottom edge of the section, and popovers use `side="top"`; with zoom 2 and the scroller scrolled by 100px, the bar's top shifts by 100px (tracking scroll).
- [ ] **Step 2:** Run ⇒ FAIL. **Step 3:** Implement using `useMediaQuery('(max-width: 760px)')`; dock skips `floatingAnchor`. **Step 4:** Run ⇒ PASS. **Step 5:** Commit `feat(frontend): dock the element bar on narrow screens`.

## Kind tasks 4–12 and 12b — contract

Each kind task migrates one `ToolbarKind` (Sonnet subagent, one task each; tasks are independent and each edits only its own `bars/<kind>.ts`, optional new quick-control components in `canvas/floating/controls/`, and extracted composables). Steps for every kind task:

- [ ] **Step 1: Failing test** `frontend/tests/unit/editor/floating/<Kind>Bar.test.ts` using the Task 2 harness: select the kind's fixture (reuse the fixture used by the existing `tests/unit/editor/inspector/<Kind>Section.test.ts`); assert each quick control listed below is rendered by `aria-label`; trigger it and assert the **same patch** the Section's test asserts for the equivalent control; assert the panel button opens a popover containing the Section; assert every control the Section offers is still reachable (bar or panel).
- [ ] **Step 2:** Run it ⇒ FAIL.
- [ ] **Step 3: Implement** the `<kind>Bar: BarItem[]` list. Quick controls and the Section must share logic: if the Section computes style/ops inline, extract a composable `components/editor/inspector/element/use<Kind>Controls.ts` used by both (no duplicated op code). Dialogs (`ChartDataDialog`, `IconPickerDialog`, `InfographicItemsDialog`) are opened from the bar button by the same mechanism the Section uses.
- [ ] **Step 4:** Run the kind test and the existing `tests/unit/editor/inspector/<Kind>Section.test.ts` ⇒ PASS; `npx vue-tsc -b` ⇒ clean.
- [ ] **Step 5:** Commit `feat(frontend): <kind> controls in the floating editor`.

| Task | Kind (`bars/<kind>.ts`) | Quick controls on the bar | Panel(s) |
|---|---|---|---|
| 4 | `text` and `list` | font family, size, Bold/Italic/Underline, colour, align (list adds list-style) | `TextSection` (+ `ListSection` for list) |
| 5 | `image` | Replace (opens `ImagePickerDialog`), fit/crop | `ImageSection` |
| 6 | `icon` | Change icon (`IconPickerDialog`), colour | `IconSection` |
| 7 | `shape` | fill, stroke | `ShapeSection` |
| 8 | `line` | stroke colour, weight | `LineSection` |
| 9 | `table` | row/column add & delete, cell fill | `TableSection` |
| 10 | `chart` | chart type, Edit data (`ChartDataDialog`) | `ChartSection` |
| 11 | `infographic` | Edit items (`InfographicItemsDialog`) | `InfographicSection` |
| 12 | `layout` | direction and gap, as `LayoutSection` offers today | `LayoutSection` |
| 12b | `video` | as `VideoSection` offers today (needs `presentationId` and `slide` via `props`) | `VideoSection` |
| 12c | `multi` | Group, Duplicate, Delete (no Appearance) | none |

Kind-specific additions to Step 1:
- **Task 4:** with an inline text edit open and a text range selected (use the Tiptap instance on `ctx.inlineEditor`), clicking Bold/size/colour on the bar applies the mark to the range, the editor stays open and the range stays selected (Review Focus 3). Also assert a whole-element (not editing) bold click patches the element font as `TextSection` does.
- **Task 9:** table with a picked cell ⇒ bar label/targets the cell (matches `selectionLabel` "Cell"); no cell ⇒ whole table.
- **Task 12c:** multi-selection of two components shows Group/Duplicate/Delete only.

## Task 13: Layers tab replaces the Element tab

**Files:**
- Create: `frontend/src/components/editor/inspector/LayersTab.vue`; Test `frontend/tests/unit/editor/inspector/LayersTab.test.ts`.
- Modify: `components/editor/inspector/tabs.ts` (id `'layers'`, label "Layers", `Layers` icon from lucide, `LayersTab`), `stores/editor.ts` (`InspectorTabId`, remove `insertSelectionPending`), `components/editor/EditorHeader.vue` and any other `'element'` tab references (`grep -rn "'element'" src/components src/views src/stores` and keep only genuine `Selection.kind === 'element'` uses), insert code that sets `insertSelectionPending` (`inspector/insert/useInsert.ts` and callers), wherever `useElementTabAutoSwitch` is called (`views/EditorView.vue` or `Inspector.vue`).
- Delete: `composables/useElementTabAutoSwitch.ts`, `tests/unit/editor/inspector/elementTabAutoSwitch.test.ts`, `components/editor/inspector/element/ElementTab.vue`, `tests/unit/editor/inspector/ElementTab.test.ts`.
- Rewrite: `tests/e2e/mocked.spec.ts` cases at lines ~251 (selecting no longer opens a tab), ~284 (Layers tab lists layers and navigates), ~420 (tab names `['Layers','Insert','Design','Narration']`), ~720 (add/delete row now via the table bar), and any other case clicking the `Element` tab or Section controls: drive the bar/popover instead.

- [ ] **Step 1: Failing tests** `LayersTab.test.ts`: renders `LayerTree` for an editable slide with the selected row `aria-current="true"` (selection highlight; the tree is shown with and without a selection); row click selects; hovering a row sets `ctx.hover` (overlay sync preserved); non-editable slide shows "This slide can't be edited on the canvas."; selecting an element does **not** change `editor.inspectorTab` or open a closed inspector.
- [ ] **Step 2:** Run ⇒ FAIL.
- [ ] **Step 3:** Implement `LayersTab.vue` (reuses `LayerTree`, `layerTree()`; heading "Layers"; keep `data-inline-edit-ignore="true"`); do the renames/deletions listed above.
- [ ] **Step 4:** `npx vitest run` (whole unit suite) ⇒ PASS; `npx vue-tsc -b` and `npm run lint` ⇒ clean; `grep -rn "ElementTab\|useElementTabAutoSwitch\|insertSelectionPending" src tests` ⇒ no results.
- [ ] **Step 5:** `npx playwright test tests/e2e/mocked.spec.ts` ⇒ PASS.
- [ ] **Step 6:** Commit `feat(frontend): Layers tab replaces the Element tab`.

## Task 14: Cleanup, visual check, notes

- [ ] **Step 1:** Remove sidebar-only chrome that popovers no longer need (`LayerChildren` heading padding etc.) only where unused after Tasks 4–13; keep Section components used by popovers. `npx vitest run`, `npx vue-tsc -b`, `npm run lint` ⇒ clean.
- [ ] **Step 2:** Run the dev stack per CLAUDE.md and check in the browser at 1440px and 700px: select each kind, open its panel, edit, drag (bar hides and returns), rotate, inline-edit text with bold, zoom 200% and scroll, Escape order, Layers tab highlight. Report anything off rather than claiming success.
- [ ] **Step 3:** Update memory: rewrite `element-editing-in-inspector.md` as "element editing is a floating bar + popovers; sidebar tab is Layers (reversal on 2026-11-18)", and add one line to `aera-design-fidelity.md` that removing the Element tab was explicitly sanctioned; keep `MEMORY.md` pointers accurate.
- [ ] **Step 4:** Commit `chore(frontend): floating editor cleanup`.
