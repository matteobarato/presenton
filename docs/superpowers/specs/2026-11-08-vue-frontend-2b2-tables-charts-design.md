# Vue frontend — 2b-2: table and chart editing

Date: 2026-11-08. Status: approved design, awaiting spec review.

## Goal

Give tables and charts in the new Vue frontend (`/frontend`) full editing,
on par with the old editor (`servers/nextjs/components/slide-editor/tables`
and `.../charts`):

- **Tables**: select a cell on the canvas, edit its text inline, style the
  cell, and add, delete or move rows and columns.
- **Charts**: chart type, data (in a spreadsheet dialog), series colours,
  title, axes, legend, data labels and chart colours.

This is the second of three 2b specs: 2b-1 (visual elements, merged), 2b-2
(this spec), 2b-3 (infographics and containers).

Constraints (from `CLAUDE.md` and earlier decisions): template-based slides
only, and smart slides get no editing. Do not modify `servers/nextjs`; port
code into `/frontend` as copies. Keep Aera design fidelity (extend
additively). Element controls live in the inspector's Element tab, not in
toolbars over the canvas. Reuse the 2b-1 shared controls (`ColorField`,
`NumberField`, `SegmentedControl`, `SliderField`, `ToggleRow`).

## Scope

In scope:

1. Table cell selection and inline cell editing on the canvas (§2).
2. Table section in the Element tab: structure, cell style, text (§3).
3. Chart section in the Element tab (§4).
4. The Edit data dialog for charts, with a live preview and a single commit (§5).
5. The `table` and `chart` selection kinds (§1).

Out of scope:

- Keyboard navigation between cells (Tab, arrows). This matches the old editor.
- Multi-cell range selection, merged cells and a cell border UI. Existing
  borders still render.
- CSV import and export of chart data.
- Inserting new tables or charts. Template blocks in the Insert tab already
  cover this.
- Bubble charts as a choice in the type select. An existing bubble chart
  keeps rendering, and the select shows "Bubble" only for that chart.
- Infographics and containers (2b-3).

## Approach

Port and trim, as in 2a, Insert and 2b-1. The behaviour, limits and
defaults come from the old editor. The patch logic lives in plain TS and is
unit-tested without Vue, and the inspector sections are thin views over it.

| From `servers/nextjs/components/slide-editor/` | Use in `/frontend` |
|---|---|
| `tables/TableToolbar.tsx` | Row and column ops, limits (2–8 rows including the header, 1–6 columns), and cell background and alignment patches. Logic only, into `slide-editor/tableOps.ts`. |
| `tables/table-colors.ts` | Ported verbatim into `slide-editor/tableColors.ts`. |
| `tables/useTableCellSelection.ts` | Semantics only: the cell selection is cleared when the element selection changes. |
| `tables/TableInlineEditor.tsx` | The cell box, cell font and alignment for the inline editor session. |
| `charts/ChartToolbar.tsx`, `charts/ChartEditorContent.tsx` | The type list, the customise panel (title, axes, legend, data labels, colours), `defaultChartLegendVisible`, the data grid operations and `isCompleteNumericInput`. Logic into `slide-editor/chartOps.ts`; the React UI is not ported. |
| `charts/ChartColorPalette.tsx` | The colour-target UX: one swatch per series, or per slice for pie, donut and polar area. |
| `charts/chart-data.ts` | Already ported at `render/legacy/components/slide-editor/charts/chart-data.ts`. Used as is. |
| `model/chart-model.ts` | Already ported at `slide-editor/model/chart-model.ts`. `rawChartToEditorChart` / `editorChartToRawChart` are the only path between raw and editor shape. |

## 1. Selection kinds

`ToolbarKind` gains `table` and `chart`:

```
text | list | image | icon | shape | line | video | table | chart | multi | generic
```

- An element of type `table` or `chart` takes that kind.
- A component takes the kind of its table or chart root, found by the
  existing `findFirstComponentTableElement` / `findFirstComponentChartElement`
  in `toolbarTarget.ts`. This covers chart wrapper components. Otherwise a
  component with exactly one element takes that element's kind, as today.
- `selectionLabel` gains "Table" and "Chart". With a cell selected, the
  label is "Cell".

Both kinds keep the Appearance, Arrange and Order sections.

## 2. Table cells on the canvas

**State.** The slide editing context gets a `tableCell` ref:
`{ elementKey: string; row: number; col: number } | null`. Row 0 is the
header row (`columns`), and row r > 0 is `rows[r - 1]`. `elementKey`
identifies the table's selection (the same key the layer tree uses). A
watcher clears `tableCell` whenever the selection no longer resolves to that
table, and clamps it after structure changes (deleted row or column).

**Geometry.** The renderer lays a table out as an even CSS grid
(`renderTable` in `template-v2-json-to-html.ts`). So the box of cell (r, c)
is the table's box split into `rowCount × colCount` equal parts.
`tableCellBox(box, rowCount, colCount, row, col)` and the reverse
`tableCellAt(box, rowCount, colCount, point)` live in
`slide-editor/tableGeometry.ts`. Under rotation, the point is unrotated
into the frame from `selectionFrame` before the lookup, and the outline is
drawn with that frame's rotation.

**Pointer.**
- A click on an unselected table selects the table, as now.
- A click on a table that is already selected selects the cell under the
  pointer. A drag still moves the table; a cell is only selected on a click
  without movement (the existing gesture threshold).
- `SelectionOverlay` draws a cell outline (the selection accent, 2px) over
  the selected cell, in addition to the table's selection frame.

**Inline cell editing.**
- Double-click a cell, or press Enter with a cell selected, to open
  `InlineTextEditor` on that cell. A double-click on a table with no cell
  selected selects the cell and opens it.
- `InlineEditSession` gets a `target`: `{ kind: 'element' }` (today) or
  `{ kind: 'cell', row, col }`. For a cell, the session takes the cell box
  as its box, the cell font merged over the table font as its style (the
  header row is bold unless the cell sets bold, as the renderer does), and
  the cell alignment. On commit it writes the Tiptap runs back to that
  cell's `runs` via `rawTableCellForEditor` / `editorTableCellToRaw`.
- Escape and blur commit, as for text. After the commit the cell stays
  selected.

## 3. Table section

`components/editor/inspector/element/TableSection.vue`, shown for kind
`table`. Three groups:

**Structure.** Icon buttons: add row (below the selected row, or at the
end), add column (right of the selected column, or at the end), delete row,
delete column, move column left, move column right.
- Limits: 2–8 rows including the header, and 1–6 columns, as in the old
  toolbar. When the element sets `min_rows`, `max_rows`, `min_columns` or
  `max_columns`, those narrow the limits further. A button that would break
  a limit is disabled, and a tooltip says why ("Tables have at most 8
  rows").
- Delete and move need a selected cell; the header row cannot be deleted.
- A new row copies the style (colour, font, alignment, borders) of the
  selected row with empty runs. A new column does the same from the
  selected column.

**Cell** (only with a selected cell).
- Background: `ColorField` with the theme palette, plus a "none" option.
  Setting a background also sets the cell text colour to
  `readableTableTextColor(background)`, unless the cell or its runs set an
  explicit colour.
- Alignment: `SegmentedControl` with left, centre and right.

**Text.** The existing `TextSection`, retargeted:
- While a cell is being edited, it drives the Tiptap editor, as for text
  elements.
- With a cell selected but not open, it patches that cell's `font` and the
  `font` of each of its runs.
- With no cell selected, it patches the table's base `font`. Run-level
  values in cells still win, as the renderer does today.

All patches are pure functions in `slide-editor/tableOps.ts`
(`addRow`, `addColumn`, `deleteRow`, `deleteColumn`, `moveColumn`,
`setCellFill`, `setCellAlignment`, `setCellFont`, `tableLimits`) over the
raw element. Each user action is one commit and one undo step.

## 4. Chart section

`components/editor/inspector/element/ChartSection.vue`, shown for kind
`chart`. It reads the chart through `rawChartToEditorChart` and writes
through `editorChartToRawChart`, so the raw shape that the backend and the
PPTX/PDF export read does not change.

Groups, from top to bottom:

1. **Type.** A select with bar, horizontal bar, stacked bar, horizontal
   stacked bar, line, area, pie, donut, scatter, radar and polar area.
2. **Data.** A read-only mini table (up to 4 categories × 3 series, then
   "+N more") and an **Edit data** button that opens the dialog (§5).
3. **Colours.** One swatch per colour target from
   `resolvedChartColorTargets`: per series for multi-series types, and per
   slice for pie, donut and polar area. Click a swatch to edit it in
   `ColorField` (theme palette plus `CHART_SYSTEM_COLORS`). Add and remove
   use `appendChartColorTarget` / `removeChartColorTarget`.
4. **Title.** A text field (limited by `CHART_TEXT_MAX_LENGTH`, committed on
   blur or Enter) and a title colour.
5. **Axes.** Hidden for pie and donut. X and Y each have Show axis, Title
   and Show grid. For radar and polar area the labels change to Category
   labels / Spokes and Value labels / Rings, as in the old customise panel.
6. **Legend.** Show (the default per type comes from the ported
   `defaultChartLegendVisible`) and a legend colour. An existing
   `legend_position` is kept as is; there is no position control, as in the
   old panel.
7. **Data labels.** A segment: off, base, middle, top, outside, read through
   `readChartDataLabelPosition`.
8. **Colours of the chart frame.** Axis colour and grid colour (only when
   axes show).

Patches are pure functions in `slide-editor/chartOps.ts` over the editor
chart. Each control change is one commit; text fields commit on blur.

## 5. Edit data dialog

`components/editor/inspector/element/ChartDataDialog.vue`, a wide shadcn
dialog (up to 880px, scrollable grid).

- **Grid.** The first column holds the categories (editable). The header
  row holds the series names (editable). The body holds the values. Single-
  series types (pie, donut, polar area) show one value column and no series
  header actions.
- **Values.** Typing keeps a per-cell draft while the input is not a
  complete number (`isCompleteNumericInput`). A complete number goes to the
  chart; an invalid draft is reverted on blur.
- **Actions.** Add row, delete row (the trash button on each row), add
  series, delete series, move series left and right (from a column menu).
  The old modal had no upper limits and neither does this one; the grid
  always keeps at least one category and one series.
- **Live preview, one commit.** On open, the dialog snapshots the chart.
  Each edit writes the full slide UI into the editing context's `draftUi`,
  so the slide re-renders the chart live with no save. **Done** commits the
  draft once, with the label "Edit chart data": one save, one undo step.
  **Cancel**, Escape, or closing the dialog calls `cancelDraft()` and the
  chart returns to the snapshot.
- If the slide changes under the dialog (a remote update, or the active
  slide changes), the dialog closes and the draft is discarded.

## 6. Error handling

- A commit refused by the server rolls back through the existing
  `commit` path (the draft is dropped and the cache keeps the saved UI).
- Cell coordinates outside the table (after a concurrent structure change)
  are clamped. When the table has no cells, the cell selection is cleared.
- A chart whose raw data cannot be read (`rawChartToEditorChart` gives no
  categories) shows "No data" in the mini table, and the dialog opens with
  one empty category and one series.

## 7. Testing

Unit tests (Vitest):
- `tableOps.ts`: every op, limits including template min/max, style copying
  for new rows and columns, header protection, and clamping.
- `tableGeometry.ts`: cell boxes and hit-testing, including a rotated table.
- `chartOps.ts`: type change, axis, legend and data-label patches, the grid
  ops, numeric drafts, and the raw round trip through `chart-model.ts`.
- `toolbarKind`: table and chart kinds, including a chart wrapper component.

Component tests:
- TableSection: button enablement at the limits, and cell controls only with
  a selected cell.
- ChartSection: axes hidden for pie, radar labels.
- ChartDataDialog: edit → draft set; Done → one commit; Cancel → draft
  cleared.

Playwright e2e (against the dev stack):
- Select a table cell, edit its text, check that the slide shows it after
  reload.
- Add and delete a row; undo restores it.
- Change a chart type.
- Edit a value in the dialog, press Done, and check that one undo reverts
  the whole dialog edit.
