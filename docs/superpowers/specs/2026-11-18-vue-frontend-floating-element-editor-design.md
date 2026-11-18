# Floating element editor — design

Date: 2026-11-18 · Scope: `frontend/` (Vue 3), template slides only (see CLAUDE.md). `servers/nextjs` is untouched.

## Intent and why

Today every element-editing control lives in the **Element** tab of the right inspector. The user edits a thing on the slide, then looks away from it to a sidebar to change it. They want element editing to happen **on the slide, next to what is selected**, as a floating inline editor, and the sidebar's Element tab removed. This reverses the 2026-11-07 decision recorded in memory (`element-editing-in-inspector`); the reversal is explicit and intended.

## Goals

- Selecting an element/component/multi-selection shows a **context bar** anchored to it, with the controls used most for that kind.
- Every option that exists in the Element tab today stays reachable (nothing lost): either on the bar or in a **panel popover** opened from it.
- The sidebar Element tab becomes the **Layers** tab (layer tree only). Insert, Design, Narration are unchanged.
- Keep the Aera look (`glass-tools` pill, existing control styles). Extend additively.

## Non-goals / anti-goals

- No new editing capabilities (no align/distribute, no new properties). This is a relocation + redesign of access, not a feature expansion.
- No smart-slide UI (CLAUDE.md). When `ctx.enabled` is false, no bar.
- No change to the data model, ops (`slide-editor/*Ops.ts`), or undo/history behaviour.
- Anti-goal: the bar must never cover the selected element's own handles, hide the slide content being edited, or steal focus from the inline text editor (formatting a selected text range must keep the range).
- Anti-goal: not "the sidebar in a floating box". A large panel over the slide is a failure.

## Approaches considered

1. **Whole inspector floated** over the canvas. Cheapest, but covers the slide and is not a redesign. Rejected.
2. **Bar only** (all controls as bar buttons). Fine for text, impossible for chart/table/infographic option volume. Rejected.
3. **Two tiers: context bar + panel popovers (chosen).** Bar = 4–8 hot controls per kind; popovers host the existing section UI for the long tail. Reuses the existing sections, so migration is mechanical per kind.

## Design

### Components (new, `components/editor/canvas/floating/`)

- `FloatingElementEditor.vue` — host. Mounted in `EditorCanvas.vue` as a sibling of the slide stage (screen-space layer, not inside the scaled stage). Renders nothing when `!ctx.enabled`, no selection, or `ctx.gestureActive` (move/resize/rotate), and no bar below 760px floating (see Responsive).
- `ContextBar.vue` — the pill. `role="toolbar"`, roving focus, `glass-tools` container/`tool`/`active`/`divider` from `toolbarClasses.ts`.
- `PanelPopover.vue` — wrapper around the existing shadcn `popover` (reka-ui): ~300px wide, `max-height` scroll, non-modal, anchored to its bar button.
- `barItems.ts` — config map `ToolbarKind → { quick: BarItem[], panels: PanelDef[] }`. One map, not one file per kind. Kind comes from the existing `toolbarKind()` / `selectionLabel()`.
- `floatingAnchor.ts` — pure function `(frame, scale, canvasRect, barSize) → { x, y, placement }` so placement is unit-tested without DOM. Uses the axis-aligned bounds of the (possibly rotated) selection frame (`slide-editor/rotation.ts`).

### Placement

Above the selection frame, centered, with a gap that clears the rotate handle. Flips below when there is no room above; clamps horizontally and vertically to the canvas viewport. Follows the selection during zoom, scroll and slide resize; hidden while a gesture is active and reappears on release. During inline text editing it stays visible (anchored to the edited element's frame).

### Bar contents (my call; builder may adjust within the rule below)

Rule: bar = quick controls for that kind, then a common tail. Every control on the bar or in a popover must call the **same op/composable** the Section used — quick controls and popover sections share logic (extract composables from Sections as needed; no duplicated style/op code).

| Kind | Quick (bar) | Panels |
|---|---|---|
| text, list | font family, size, B/I/U, color, align (list: list-style) | Text (full `TextSection` + `ListSection`) |
| image | Replace, fit/crop | Image |
| icon | Change icon (opens `IconPickerDialog`), color | Icon |
| shape | fill, stroke | Shape |
| line | stroke color, weight | Line |
| table | row/column add/delete, cell fill | Table |
| chart | chart type, Edit data (opens `ChartDataDialog`) | Chart |
| infographic | Edit items (opens `InfographicItemsDialog`) | Infographic |
| layout | direction/gap as present today | Layout |
| video | as present today | Video |
| multi | Group, Duplicate, Delete | — |

Common tail (all kinds): **Appearance** panel (`AppearanceSection`, single selection only), **Arrange & order** panel (`ArrangeSection`, `OrderSection`, `LayerChildren`), plus quick Duplicate and Delete.
Existing dialogs (`ChartDataDialog`, `IconPickerDialog`, `InfographicItemsDialog`, `ThemeEditorDialog`) remain dialogs, opened from the bar/popover.

### Behaviour rules

- **Focus/selection safety:** the bar and all popover content (portaled) carry `data-inline-edit-ignore="true"`; buttons use `@mousedown.prevent`; popovers do not auto-focus (`onOpenAutoFocus` prevented). Interacting with them neither closes the inline editor nor deselects the element. Clicks inside popover portals must not count as "outside" for deselect.
- **Escape:** closes an open popover first; next Escape deselects (adjust `useEditingShortcuts.ts`).
- One popover open at a time; switching selection closes it.
- Keyboard: arrow keys move within the bar (roving tabindex); Tab leaves it; popover controls are normal tab order.
- Tooltips/aria-labels as today's section buttons; selection announcer unchanged.
- Locked deck (`editor.locked`): controls disabled the same way the sections disable today.

### Responsive

≥761px: floating at the selection. ≤760px: the bar docks to the bottom edge of the canvas (floating over a small slide would cover it); popovers open upward from the dock. Existing breakpoint tiers in `toolbarClasses.ts` apply.

### Inspector changes

- `InspectorTabId` `'element'` → `'layers'`; tab label "Layers" (icon: a layers icon). `tabs.ts`, `EditorHeader.vue`, `stores/editor.ts` updated.
- New `LayersTab.vue`: `LayerTree` always shown (selected row highlighted, hover sync with the overlay preserved). "This slide can't be edited on the canvas." message for non-editable slides moves here.
- **Delete** `useElementTabAutoSwitch` and its test, and the `insertSelectionPending` flag (selecting no longer switches tabs, so inserts no longer need to protect the Insert tab). Selecting an element never opens or changes the inspector.
- After migration, delete the old per-kind section chrome only if unused; sections reused inside popovers stay (their sidebar-specific padding/headers are adapted for popover width).

## Constraints

- Template slides only; Aera look; Tailwind v4 + shadcn-vue + reka-ui already installed (no new dependency).
- Works with the existing `useSlideEditingContext` (selection, ui, gestureActive, inlineEdit, inlineEditor). Do not modify `geometry.ts` work-in-progress changes already uncommitted on `main`; do the work on a new branch and keep those files out of commits.
- Tests: unit tests for `floatingAnchor`, `barItems`, ContextBar/PanelPopover behaviour; existing `tests/unit/editor/inspector/*Section.test.ts` keep passing (sections still exist); e2e in `tests/e2e/mocked.spec.ts` that click the `Element` tab are **rewritten** against the bar/popover and the Layers tab, not deleted.

## Delivery

1. **Foundation** (one task): Layers tab rename + removal of auto-switch, floating host/anchor/bar/popover shell, safety rules, Escape order, responsive dock, with a stub for the common tail.
2. **Per-kind migration** (one task per kind row above, run by Sonnet subagents after plan approval): bar quick controls + popover wiring + tests for that kind.
3. **Cleanup**: remove dead Element-tab code, full unit + mocked e2e run, visual check in the browser.

## Left to the builder

Exact pixel gap and icons; exact quick-control set per kind within the rule (nothing lost; hot controls on the bar); how Sections are adapted for popover width; whether `useTextStyle`-style composables are extracted per kind or per section.
