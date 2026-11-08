# 2b-2 Table and Chart Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full old-editor parity for editing tables (cell selection, inline cell text, cell style, row/column ops) and charts (type, data dialog, colours, title, axes, legend, data labels) in `/frontend`.

**Architecture:** Pure TS patch modules (`tableOps`, `tableGeometry`, `chartOps`) carry all behaviour and are unit-tested. The slide editing context gains a `tableCell` ref, and `InlineEditSession` gains a cell target. The Element tab gets `TableSection`, `ChartSection` and `ChartDataDialog` as thin views. The dialog previews through `draftUi` and commits once.

**Tech Stack:** Vue 3, TypeScript, Vite, shadcn-vue, Tailwind v4, Tiptap 2, Vitest + @vue/test-utils, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-08-vue-frontend-2b2-tables-charts-design.md`

## Global Constraints

- Do not modify `servers/nextjs`. Port logic into `/frontend` as copies, with a header comment naming the source file and what changed (as in `InlineTextEditor.vue`).
- Template slides only; smart slides get no editing (`editing.enabled` already gates this).
- Element controls live in the inspector Element tab; no canvas toolbars.
- Reuse `components/editor/inspector/controls/*` (`ColorField`, `NumberField`, `SegmentedControl`, `SliderField`, `ToggleRow`, `styles.ts`) and `themePalette`.
- Raw chart shape is read and written only via `rawChartToEditorChart` / `editorChartToRawChart` (`slide-editor/model/chart-model.ts`).
- Table limits: 2–8 rows including the header, 1–6 columns, narrowed by `min_rows`/`max_rows`/`min_columns`/`max_columns` when set.
- Chart type select offers exactly: `bar`, `horizontal_bar`, `stacked_bar`, `horizontal_stacked_bar`, `line`, `area`, `pie`, `donut`, `scatter`, `radar`, `polar_area`; `bubble` appears only when the chart already is one.
- One user action = one commit = one undo step. The data dialog's Done commits with label `Edit chart data`.
- Run `npm run check` (vue-tsc + vitest + eslint) from `frontend/` before each commit.

## Review Focus

1. **Undo removes the row holding the selected cell** → the cell selection is clamped into the table, no crash, no outline outside the table. Test in Task 4.
2. **Typing a partial number (`-`, `1.`, `1e`) then pressing Done** → the partial draft is dropped and the last complete value is saved; never `NaN` or a string. Test in Task 9.
3. **Ragged chart data (more categories than series values, or the reverse)** → the mini table and dialog pad missing values with 0 and do not drop categories. Test in Task 3.
4. **A table inside a rotated group or component** → a click selects the cell under the pointer, not the cell at the unrotated position. Test in Task 2.
5. **The slide changes (remote update or slide switch) while the data dialog is open** → the dialog closes, the draft is discarded, and nothing is committed. Test in Task 9.

---

## File Map

| File | Responsibility |
|---|---|
| Create `frontend/src/slide-editor/tableColors.ts` | Port of `tables/table-colors.ts` (`readableTableTextColor`, `blackOrWhiteTextColor`). |
| Create `frontend/src/slide-editor/tableOps.ts` | Pure table patches and limits over the raw element. |
| Create `frontend/src/slide-editor/tableGeometry.ts` | Cell boxes and hit-testing (rotation-aware). |
| Create `frontend/src/slide-editor/chartOps.ts` | Pure chart patches, grid ops, numeric drafts, legend default. |
| Create `frontend/src/slide-editor/dataRoot.ts` | Resolves the table or chart root element of a selection. |
| Modify `frontend/src/slide-editor/model/toolbarTarget.ts` | Export `findFirstComponentChartElement`, `findFirstComponentTableElement`. |
| Modify `frontend/src/slide-editor/toolbarKind.ts` | `table` and `chart` kinds, labels. |
| Modify `frontend/src/slide-editor/useSlideEditing.ts` | `tableCell` ref, clear/clamp watcher, `requestCellEdit`. |
| Modify `frontend/src/slide-editor/tiptapRuns.ts` | Cell target in `InlineEditSession`, `startCellEdit`, cell branch in `inlineEditUi`, `blankTableCellAt`. |
| Modify `frontend/src/components/editor/canvas/SelectionOverlay.vue` | Click-to-select-cell, cell outline, double-click into a cell. |
| Modify `frontend/src/components/editor/canvas/EditableSlide.vue` | Blank the edited cell under the editor. |
| Modify `frontend/src/slide-editor/useEditingShortcuts.ts` | Enter with a selected cell opens the cell editor. |
| Create `frontend/src/components/editor/inspector/element/TableSection.vue` | Structure, Cell, and retargeted Text groups. |
| Modify `frontend/src/components/editor/inspector/element/TextSection.vue` | Patch target: element, table base font, or a cell. |
| Create `frontend/src/components/editor/inspector/element/ChartSection.vue` | Chart controls and mini data table. |
| Create `frontend/src/components/editor/inspector/element/ChartColorSwatches.vue` | Colour targets: swatches, add, remove. |
| Create `frontend/src/components/editor/inspector/element/ChartDataDialog.vue` | Data grid dialog with draft preview and a single commit. |
| Modify `frontend/src/components/editor/inspector/element/ElementTab.vue` | Mount TableSection and ChartSection. |
| Create `frontend/tests/e2e/fixtures/data-presentation.json` | Deck with one table slide and one chart slide. |

---

### Task 1: Table ops and colours

**Files:**
- Create: `frontend/src/slide-editor/tableColors.ts`, `frontend/src/slide-editor/tableOps.ts`
- Test: `frontend/tests/unit/slide-editor/tableOps.test.ts`

**Interfaces:**
- Produces (all pure, never mutate input; `RawElement` from `@/slide-editor/model`; `cell` is `{ row: number; col: number }`, row 0 = header `columns`, row r>0 = `rows[r-1]`):
  - `tableSize(el: RawElement): { rows: number; cols: number }`
  - `tableLimits(el: RawElement): { minRows: number; maxRows: number; minCols: number; maxCols: number }`
  - `tableCellAt(el: RawElement, cell: TableCellRef): RawRecord | null`
  - `addRow(el, afterRow: number | null): RawElement` / `addColumn(el, afterCol: number | null): RawElement`
  - `deleteRow(el, row: number): RawElement` / `deleteColumn(el, col: number): RawElement`
  - `moveColumn(el, col: number, dir: -1 | 1): RawElement`
  - `canAddRow / canAddColumn (el) : boolean`, `canDeleteRow(el, row: number | null)`, `canDeleteColumn(el, col: number | null)`, `canMoveColumn(el, col: number | null, dir)` (all boolean)
  - `setCellFill(el, cell, color: string | null): RawElement`
  - `setCellAlignment(el, cell, a: 'left' | 'center' | 'right'): RawElement`
  - `setCellFont(el, cell, patch: Record<string, unknown>): RawElement` (merges into `cell.font` and every run's `font`)
  - `clampCell(el, cell: TableCellRef): TableCellRef | null` (null when the table has no cells)
  - `export type TableCellRef = { row: number; col: number }`

- [ ] **Step 1: Write failing tests** in `tableOps.test.ts` with a fixture `table(rows: string[][], extra?)` that builds a raw table (`columns` = first row, `rows` = rest, each cell `{ runs: [{ text }] }`):
  - `tableLimits` → `{2,8,1,6}` by default; `{min_rows:3,max_rows:5,max_columns:4}` → `{3,5,1,4}`; a template `max_rows: 12` does not widen past 8.
  - `addRow(t, 1)` inserts after row 1 with the same `color`/`font`/`alignment`/`borders` as row 1 and `runs: [{ text: '' }]`; `addRow(t, null)` appends.
  - `addColumn(t, 0)` inserts at index 1 in the header and every row, style copied per row from column 0.
  - `canAddRow` false at 8 rows; `canDeleteRow(t, 0)` false (header); `canDeleteRow` false at 2 rows; `canDeleteColumn` false at 1 column; `canMoveColumn(t, 0, -1)` false.
  - `moveColumn(t, 0, 1)` swaps columns 0 and 1 in header and every row.
  - `setCellFill(t, {row:1,col:0}, '#112233')` sets `color` on that cell and sets its `font.color` to `readableTableTextColor('#112233')`; when the cell already has `font.color`, it is kept. `setCellFill(..., null)` removes `color` and `fill`.
  - `setCellAlignment` sets `alignment: 'center'` on only that cell.
  - `setCellFont(t, {row:0,col:1}, { bold: true })` sets `font.bold` on the cell and every run.
  - `clampCell(t2x2, {row:5,col:3})` → `{row:1,col:1}`; empty table → `null`.
  - Every op leaves the input deep-equal to its snapshot.

- [ ] **Step 2: Run** `cd frontend && npx vitest run tests/unit/slide-editor/tableOps.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** `tableColors.ts` as a copy of `servers/nextjs/components/slide-editor/tables/table-colors.ts` and `tableOps.ts` per the Interfaces. Limits: `max(2, min_rows ?? 2)`, `min(8, max_rows ?? 8)`, same shape for columns with 1/6. Short rows are padded to the column count with `{ runs: [{ text: '' }] }` before any op.

- [ ] **Step 4: Run** the test → PASS. Run `npm run check` → clean.

- [ ] **Step 5: Commit** `feat(frontend): table ops and cell colours for 2b-2`

---

### Task 2: Table cell geometry

**Files:**
- Create: `frontend/src/slide-editor/tableGeometry.ts`
- Test: `frontend/tests/unit/slide-editor/tableGeometry.test.ts`

**Interfaces:**
- Consumes: `Frame`, `rotatePoint` from `@/slide-editor/rotation`; `Box`, `Point` from `@/slide-editor/model`; `TableCellRef` (Task 1).
- Produces:
  - `cellBox(box: Box, rows: number, cols: number, cell: TableCellRef): Box`
  - `cellAtPoint(frame: Frame, rows: number, cols: number, p: Point): TableCellRef | null` (unrotates `p` about the frame centre by `-frame.rotation`, then splits evenly; null outside)
  - `cellFrame(frame: Frame, rows: number, cols: number, cell: TableCellRef): Frame` (the cell box positioned in the rotated frame: its centre rotated about the table centre, same rotation)

- [ ] **Step 1: Write failing tests:**
  - `cellBox({x:0,y:0,width:300,height:200}, 2, 3, {row:1,col:2})` → `{x:200,y:100,width:100,height:100}`.
  - `cellAtPoint` unrotated: `(250,150)` → `{row:1,col:2}`; `(301,10)` → `null`.
  - Rotated 90° frame (box 300×200 at 0,0): the point that `cellFrame(..., {row:0,col:0})` centre maps to returns `{row:0,col:0}`, and the unrotated centre of cell (0,0) (`50,50`) does not.
  - Edges: a point exactly on the right/bottom edge returns the last row/column, not null.

- [ ] **Step 2: Run** `npx vitest run tests/unit/slide-editor/tableGeometry.test.ts` → FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** → PASS; `npm run check` clean.
- [ ] **Step 5: Commit** `feat(frontend): rotation-aware table cell geometry`

---

### Task 3: Chart ops

**Files:**
- Create: `frontend/src/slide-editor/chartOps.ts`
- Test: `frontend/tests/unit/slide-editor/chartOps.test.ts`

**Interfaces:**
- Consumes: `ChartElement`, `ChartType`, `DataLabelPosition` from `@/render/legacy/components/slide-editor/types`; helpers from `@/render/legacy/components/slide-editor/charts/chart-data` (`resolvedChartCategories`, `resolvedChartDatasets`, `chartSupportsMultipleSeries`, `readChartDataLabelPosition`, `limitChartText`, `chartDataFromSeriesWithColors`); `rawChartToEditorChart`, `editorChartToRawChart`.
- Produces:
  - `CHART_TYPE_OPTIONS: { value: ChartType; label: string }[]` (labels from old `ChartToolbar.tsx`: "Bar Chart", "Horizontal Bar", "Stacked Bar", "Horizontal Stack Bar", "Line Chart", "Area Chart", "Pie Chart", "Donut Chart", "Scatter Chart", "Radar Chart", "Polar Area"); `chartTypeOptions(current: ChartType)` adds `{ value: 'bubble', label: 'Bubble Chart' }` only when `current === 'bubble'`.
  - `readChart(raw: RawElement): ChartElement` / `writeChart(raw: RawElement, chart: ChartElement): RawElement` (thin wrappers over chart-model).
  - `type ChartGrid = { categories: string[]; series: { name: string; values: number[] }[] }`
  - `chartGrid(chart: ChartElement): ChartGrid` (pads ragged values with 0 to `categories.length`; at least 1 category and 1 series)
  - `withGrid(chart: ChartElement, grid: ChartGrid): ChartElement` (single-series types write `data` via `chartDataFromSeriesWithColors`; multi-series write `categories` + `series`)
  - Grid ops, all `(grid, …) => ChartGrid`: `setCategory(i, text)`, `setSeriesName(i, text)`, `setValue(row, series, n)`, `addCategory()`, `deleteCategory(i)`, `addSeries()`, `deleteSeries(i)`, `moveSeries(i, dir: -1|1)`. Deletes never go below 1. Text through `limitChartText`.
  - `isCompleteNumericInput(s: string): boolean` (port from `ChartEditorContent.tsx`)
  - `axesApply(type: ChartType): boolean` (false for pie, donut); `isRadial(type): boolean` (radar, polar_area)
  - `defaultLegendVisible(chart: ChartElement): boolean` (port of `defaultChartLegendVisible`)
  - `setChartType(chart, t)`, `setChartField<K extends keyof ChartElement>(chart, key: K, value: ChartElement[K])`, `setDataLabels(chart, p: DataLabelPosition | null)` (null → `data_labels: false`)

- [ ] **Step 1: Write failing tests:**
  - `chartTypeOptions('bar')` has 11 entries without bubble; `chartTypeOptions('bubble')` has 12.
  - `chartGrid` on `{categories:['a','b','c'], series:[{name:'S',values:[1]}]}` → values `[1,0,0]`; on a pie with `data:[{label:'x',value:2}]` → `{categories:['x'], series:[{name:…, values:[2]}]}`; on an empty chart → 1 category, 1 series.
  - `withGrid(chartGrid(c), …)` round-trips; for a pie it writes `data` with labels and values.
  - `deleteCategory` on a 1-category grid is a no-op; `moveSeries(g, 0, 1)` swaps.
  - `isCompleteNumericInput`: `'12'`, `'-3.5'`, `'0'` true; `''`, `'-'`, `'1.'`, `'1e'`, `'abc'` false.
  - `axesApply('pie')` false; `isRadial('radar')` true.
  - `setDataLabels(c, null).data_labels === false`; `setDataLabels(c, 'top').data_labels === 'top'`.
  - `writeChart(raw, readChart(raw))` equals `raw` for the bar and pie fixtures in the test file (round trip).

- [ ] **Step 2: Run** `npx vitest run tests/unit/slide-editor/chartOps.test.ts` → FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** → PASS; `npm run check` clean.
- [ ] **Step 5: Commit** `feat(frontend): chart ops and data grid model`

---

### Task 4: Selection kinds, data root, and cell selection state

**Files:**
- Create: `frontend/src/slide-editor/dataRoot.ts`
- Modify: `frontend/src/slide-editor/model/toolbarTarget.ts` (export the two finders), `frontend/src/slide-editor/toolbarKind.ts`, `frontend/src/slide-editor/useSlideEditing.ts`
- Test: `frontend/tests/unit/slide-editor/toolbarKind.test.ts`, `frontend/tests/unit/slide-editor/dataRoot.test.ts`, `frontend/tests/unit/slide-editor/useSlideEditing.test.ts`

**Interfaces:**
- Produces:
  - `dataRoot(ui: RawUi | null, sel: Selection, type: 'table' | 'chart'): ElementSelection | null`. An element selection of that type → itself. A component → the path found by `findFirstComponentTableElement` / `findFirstComponentChartElement`. Otherwise null.
  - `ToolbarKind` adds `'table' | 'chart'`. A component whose `dataRoot` exists takes that kind (checked before the lone-element rule).
  - `selectionLabel(ui, sel, cell?: TableCellRef | null)` → "Table", "Chart", or "Cell" when kind is table and `cell` is set.
  - In `SlideEditing`: `tableCell: Ref<{ root: ElementSelection; row: number; col: number } | null>` and `requestCellEdit(root: ElementSelection, cell: TableCellRef): void` (stubbed here; implemented in Task 6).
  - Watcher in `useSlideEditing`: when `dataRoot(ui, selection, 'table')` is not `sameSelection` with `tableCell.root`, set `tableCell` to null. When `ui` changes, replace the cell with `clampCell` (Task 1), or null.

- [ ] **Step 1: Write failing tests:**
  - toolbarKind: element of type `table` → `'table'`; component with a chart nested in a wrapper group → `'chart'`; labels "Table", "Chart", "Cell".
  - dataRoot: component → `{kind:'element', componentIndex, elementPath:[…path to chart]}`; text selection → null.
  - useSlideEditing: with a cell set, selecting another component clears it; committing a UI that deletes the last row clamps `tableCell.row` (Review Focus 1); undo to a 2-column table from 3 columns with `col: 2` clamps to 1.
- [ ] **Step 2: Run** these three test files → FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** → PASS; `npm run check` clean.
- [ ] **Step 5: Commit** `feat(frontend): table and chart selection kinds and cell selection state`

---

### Task 5: Cell selection on the canvas

**Files:**
- Modify: `frontend/src/components/editor/canvas/SelectionOverlay.vue`
- Test: `frontend/tests/unit/editor/SelectionOverlay.cells.test.ts`

**Interfaces:**
- Consumes: `dataRoot` (Task 4), `cellAtPoint` and `cellFrame` (Task 2), `tableSize` (Task 1), `selectionFrame`.
- Produces: an outline element `data-table-cell-outline` with `data-row` and `data-col`. In `onPointerDown`, record whether the pressed table was already the selected table root. In `finish`, a move gesture that never `started` on that table sets `editing.tableCell` from `cellAtPoint(selectionFrame(ui, root), …)`. A first click on an unselected table only selects it (`tableCell` stays null).

- [ ] **Step 1: Write failing component tests** (mount the overlay with a context fixture holding one table component of 3×2 at a known box, same harness as existing overlay tests):
  - First click on the table: selection = component, `tableCell` null.
  - Second click (no movement) at row 1, col 1 → `tableCell` `{row:1,col:1}`, and `[data-table-cell-outline][data-row="1"][data-col="1"]` is rendered.
  - Second press with a drag past the threshold moves the table and leaves `tableCell` unchanged.
  - With the table's component rotated 90°, the click at the rotated centre of cell (0,0) selects (0,0) (Review Focus 4).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** The outline uses the selection accent colour, 2px, positioned and rotated from `cellFrame`.
- [ ] **Step 4: Run** → PASS; `npm run check` clean.
- [ ] **Step 5: Commit** `feat(frontend): select table cells on the canvas`

---

### Task 6: Inline cell editing

**Files:**
- Modify: `frontend/src/slide-editor/tiptapRuns.ts`, `frontend/src/slide-editor/useSlideEditing.ts`, `frontend/src/components/editor/canvas/InlineTextEditor.vue`, `frontend/src/components/editor/canvas/EditableSlide.vue`, `frontend/src/components/editor/canvas/SelectionOverlay.vue`, `frontend/src/slide-editor/useEditingShortcuts.ts`
- Test: `frontend/tests/unit/slide-editor/tiptapRuns.test.ts`, `frontend/tests/unit/slide-editor/useEditingShortcuts.test.ts`

**Interfaces:**
- Consumes: `rawTableCellForEditor`, `editorTableCellToRaw` (model), `cellBox` (Task 2), `tableCellAt` (Task 1).
- Produces:
  - `InlineEditSession.target: { kind: 'element' } | { kind: 'cell'; row: number; col: number }`. Existing sessions get `{ kind: 'element' }`. For a cell, `kind` is `'text'`, `frame` is the cell box in element-local coordinates, `style` is the cell font over the table font (header row bold unless the cell sets `bold: false`), and the alignment is the cell's.
  - `startCellEdit(ui: RawUi, root: ElementSelection, cell: TableCellRef, slideId: string): InlineEditSession | null`
  - `inlineEditUi`: a cell target writes `docToRuns(...)` into that cell's `runs` (via `editorTableCellToRaw`) and the alignment into `cell.alignment`. No auto-size, and no change to the table frame.
  - `blankTableCellAt(ui, root, cell): RawUi` empties that cell's runs. `EditableSlide.renderUi` uses it for cell sessions.
  - `requestCellEdit` (Task 4 stub) opens `startCellEdit`. On commit or Escape, `tableCell` is kept.
  - Double-click in SelectionOverlay on a table: sets `tableCell` from the point, then `requestCellEdit`. Enter in `useEditingShortcuts` with `tableCell` set → `requestCellEdit`.
- `InlineTextEditor` positions with the session frame plus `cellFrame` rotation for cell targets.

- [ ] **Step 1: Write failing tests:**
  - tiptapRuns: `startCellEdit` on header cell (0,1) → `style.bold === true`, `target` `{kind:'cell',row:0,col:1}`; `inlineEditUi` with a doc "Hello" writes `runs[0].text === 'Hello'` into `columns[1]` only, and leaves every other cell and the element size unchanged; an unchanged doc → `null`.
  - `blankTableCellAt` empties only that cell.
  - useEditingShortcuts: Enter with `tableCell` set calls `requestCellEdit(root, {row, col})`; Enter on a table with no cell does nothing.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** → PASS; `npm run check` clean. Manually: in the dev stack (`docker compose -f docker-compose.frontend.yml up`), double-click a cell, type, then press Esc; the text persists after a reload.
- [ ] **Step 5: Commit** `feat(frontend): edit table cell text inline`

---

### Task 7: Table section

**Files:**
- Create: `frontend/src/components/editor/inspector/element/TableSection.vue`
- Modify: `frontend/src/components/editor/inspector/element/TextSection.vue`, `frontend/src/components/editor/inspector/element/ElementTab.vue`
- Test: `frontend/tests/unit/editor/inspector/TableSection.test.ts`, `frontend/tests/unit/editor/inspector/TextSection.test.ts`

**Interfaces:**
- Consumes: Task 1 ops, `dataRoot`, `editing.tableCell`, `useSelectedElement.patch(label, fn, at)` with `at = dataRoot(...)`.
- Produces:
  - `TableSection` (prop `presentation: Presentation`), shown by ElementTab when `kind === 'table'`, above Appearance. It has three groups:
    - **Structure:** icon buttons with aria-labels "Add row", "Add column", "Delete row", "Delete column", "Move column left", "Move column right". Each disabled state comes from the `can*` functions, with a tooltip stating the limit ("Tables have at most 8 rows", "Tables need at least 2 rows", "The header row can't be deleted", "Tables have at most 6 columns", "Tables need at least 1 column").
    - **Cell:** only with `tableCell`. A `ColorField` labelled "Cell background", with the theme palette and a "None" option, plus a `SegmentedControl` labelled "Cell alignment".
    - **Text:** `<TextSection :target="textTarget" />`.
  - `TextSection` gains an optional prop `target?: { kind: 'table'; root: ElementSelection; cell: TableCellRef | null }`. When the inline editor is open, Tiptap drives the text, unchanged. With a cell and no editor, it patches via `setCellFont`. With no cell, it patches the table's `font`. Without the prop, behaviour is unchanged.
  - Commit labels: "Add row", "Add column", "Delete row", "Delete column", "Move column", "Cell background", "Cell alignment", "Text style".

- [ ] **Step 1: Write failing tests:**
  - With an 8-row table, "Add row" is disabled. With a header cell selected, "Delete row" is disabled. With no cell, the Cell group is absent.
  - Clicking "Add row" with cell (1,0) commits one UI where row 2 is new and empty.
  - The "Cell background" palette swatch commits `color` on that cell only.
  - TextSection with a `table` target and a cell, toggling Bold → that cell's `font.bold` is true; with no cell → the table `font.bold` is true.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** After "Delete row" or "Delete column", the cell selection is clamped by the Task 4 watcher.
- [ ] **Step 4: Run** → PASS; `npm run check` clean.
- [ ] **Step 5: Commit** `feat(frontend): Table section in the Element tab`

---

### Task 8: Chart section

**Files:**
- Create: `frontend/src/components/editor/inspector/element/ChartSection.vue`, `frontend/src/components/editor/inspector/element/ChartColorSwatches.vue`
- Modify: `frontend/src/components/editor/inspector/element/ElementTab.vue`
- Test: `frontend/tests/unit/editor/inspector/ChartSection.test.ts`

**Interfaces:**
- Consumes: Task 3 `readChart`, `writeChart`, `chartTypeOptions`, `chartGrid`, `axesApply`, `isRadial`, `defaultLegendVisible`, `setChartType`, `setChartField`, `setDataLabels`. From chart-data: `resolvedChartColorTargets`, `updateChartColorTarget`, `appendChartColorTarget`, `removeChartColorTarget`, `CHART_SYSTEM_COLORS`, `CHART_TEXT_MAX_LENGTH`. Root via `dataRoot(…,'chart')`.
- Produces:
  - `ChartSection` (prop `presentation`), shown when `kind === 'chart'`, with the groups in spec §4 order: Type (select, aria-label "Chart type"); Data (mini table `data-chart-mini`, max 4 rows × 3 series, "+N more", and an "Edit data" button that emits/opens `ChartDataDialog` from Task 9); Colours (`ChartColorSwatches`); Title (text field and "Title colour"); Axes (absent when `!axesApply`; radial labels "Category labels"/"Spokes", "Value labels"/"Rings"); Legend ("Show legend", default `defaultLegendVisible`, "Legend colour"); Data labels (segment Off/Base/Middle/Top/Outside); "Axis colour" and "Grid colour" (only when axes apply).
  - `ChartColorSwatches` props `chart: ChartElement`, `palette: string[]`; emits `change(next: ChartElement)`. Swatches have aria-label "Chart colour N", plus "Add chart colour" and "Remove chart colour".
  - Each change → `patch(label, (raw) => writeChart(raw, next), root)`. Text fields commit on blur or Enter.

- [ ] **Step 1: Write failing tests:**
  - Pie chart: no "Show axis" control; radar: "Spokes" label is present.
  - Changing the type select to `line` commits `chart_type: 'line'` in raw.
  - A bubble chart's select contains "Bubble Chart"; a bar chart's does not.
  - The mini table shows "+2 more" for 6 categories, and "No data" for a chart with no categories or data.
  - Data labels "Top" commits `data_labels: 'top'`; "Off" commits `false`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run check` clean.
- [ ] **Step 5: Commit** `feat(frontend): Chart section in the Element tab`

---

### Task 9: Chart data dialog

**Files:**
- Create: `frontend/src/components/editor/inspector/element/ChartDataDialog.vue`
- Modify: `frontend/src/components/editor/inspector/element/ChartSection.vue` (mount it)
- Test: `frontend/tests/unit/editor/inspector/ChartDataDialog.test.ts`

**Interfaces:**
- Consumes: Task 3 grid ops, `isCompleteNumericInput`, `withGrid`, `writeChart`, `updateElementInUi`; `editing.draftUi`, `editing.cancelDraft`, `editing.commit`, `editing.slideId`.
- Produces: `ChartDataDialog` props `open: boolean`, `root: ElementSelection`; emits `update:open`.
  - On open it snapshots `editing.ui.value` and the slide id. Each edit computes `updateElementInUi(snapshotUi, root, raw => writeChart(raw, withGrid(chart, grid)))` and assigns it to `editing.draftUi.value`.
  - Grid inputs: category inputs (aria-label "Category N"), series name inputs ("Series N name"), and value inputs ("Value R,S"). Values keep a string draft per cell; a complete number updates the grid; blur reverts an incomplete draft.
  - Buttons: "Add row", "Delete row N", "Add series"; a per-series menu with "Delete series", "Move left", "Move right". Series actions are hidden for single-series types (`!chartSupportsMultipleSeries`).
  - **Done:** if the grid changed, `editing.commit(draft, 'Edit chart data')`, otherwise `cancelDraft()`; then close. **Cancel**, Escape, or close → `cancelDraft()`.
  - A watcher on `editing.slideId` and on the slide's committed `ui` identity: on change while open → `cancelDraft()` and close without committing.
  - Width `max-w-[880px]`, scrollable grid body.

- [ ] **Step 1: Write failing tests:**
  - Typing `42` into "Value 1,1" sets `draftUi` with value 42, and `commit` has not been called.
  - Done → `commit` called once with label "Edit chart data".
  - Cancel → `cancelDraft` called, `commit` not called.
  - In "Value 1,1" (original 10) type `-` and press Done without blurring → the committed value is 10, and no value in the saved chart is NaN or a string (Review Focus 2).
  - Changing `editing.slideId` while open → dialog closes, `cancelDraft` called, no commit (Review Focus 5).
  - A pie chart has no "Add series" button.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run check` clean.
- [ ] **Step 5: Commit** `feat(frontend): chart data dialog with live preview and single commit`

---

### Task 10: End-to-end

**Files:**
- Create: `frontend/tests/e2e/fixtures/data-presentation.json` (two template slides: slide 1 has a 3×3 table component at a known box; slide 2 has a bar chart component with 3 categories × 2 series; modelled on `visual-presentation.json`)
- Modify: `frontend/tests/e2e/mocked.spec.ts` (new `describe('table and chart editing (mocked)')`, reusing `editableApi`, `slidePoint`, `select` patterns), `frontend/tests/e2e/live.spec.ts` (one live test: table cell edit persists)

- [ ] **Step 1: Write the e2e tests:**
  - Click the table twice at cell (1,1), then double-click; type "Edited"; press Escape. After a reload the cell text is "Edited".
  - Select cell (1,0); in the Element tab click "Add row" (4 rows), then "Delete row" (3 rows); Ctrl+Z restores 4 rows.
  - On slide 2, select the chart and set "Chart type" to Line; the saved PATCH body has `chart_type: 'line'`.
  - "Edit data" → set "Value 1,1" to 99 → Done. Exactly one PATCH is sent. Ctrl+Z restores the original value in one step.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/mocked.spec.ts -g "table and chart"` → PASS (fix the implementation, not the test, if it fails).
- [ ] **Step 3: Run** `npm run check` and the full `npx playwright test tests/e2e/mocked.spec.ts` → all pass.
- [ ] **Step 4: Commit** `test(frontend): e2e for table and chart editing`
