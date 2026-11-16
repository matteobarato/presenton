# 2b-3 Infographic and Container Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Layout (flex, grid, container) and Infographic sections to the Element tab of the Vue frontend, plus an Edit items dialog for funnel and maturity-model infographics.

**Architecture:** Port-and-trim, as in 2b-2. Patch logic is plain TS in `frontend/src/slide-editor` (`layoutOps.ts`, `infographicOps.ts`), unit-tested without Vue. `LayoutSection.vue`, `InfographicSection.vue` and `InfographicItemsDialog.vue` are thin views that commit through the existing `useSelectedElement().patch` / `EditingActions.run`. The dialog previews through `draftUi`, like `ChartDataDialog.vue`.

**Tech Stack:** Vue 3, TypeScript, Vitest, Playwright, shadcn-vue, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-11-16-vue-frontend-2b3-infographics-containers-design.md`

## Global Constraints

- Work only inside `frontend/`. Never modify `servers/nextjs`; ported files are copies with a first-line comment `// Ported from servers/nextjs/components/slide-editor/<path>. Changes: import paths only.`
- Template slides only. No smart-slide features.
- Aera design fidelity: extend additively. Use the shared controls in `frontend/src/components/editor/inspector/controls/` (`ColorField`, `NumberField`, `SegmentedControl`, `SliderField`, `ToggleRow`, `styles.ts`). Copy markup patterns from `ShapeSection.vue` and `ChartSection.vue`.
- Element controls live in the Element tab, not in canvas toolbars.
- Every inspector change is one undo step and goes through `patch` or `actions.run` with a builder, so an open inline edit commits first.
- Value shapes written to the slide JSON match the old editor exactly (they are listed per task).
- British spelling in UI copy ("Colour").
- Commands run from `frontend/`: `npx vitest run <file>`, `npx vue-tsc -b`, `npm run check`.
- Commit after each task. End commit messages with the attribution lines the session specifies.

## Review Focus

1. **Root-level layout** (`componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX`): a layout patch must update `ui.elements`, not `ui.components[-1]`. Test in Task 3.
2. **Colours stored without `#`** (`"FFFFFF"` from inserts, `"#EAF3F2"` from templates): both must show correctly in the swatches and stay valid after one swatch is edited. Test in Task 5.
3. **Legacy-only meter** (top-level `infographic_type`, `value`, `min_value`, `max_value`, no `data`): reads correctly, and the first edit migrates it into `data`. Test in Task 5.
4. **Degenerate meter range** (`min === max`, or a stored value outside the range): no NaN, no crash; the value field shows the stored value and clamps on the next edit. Test in Task 5.
5. **Missing or non-array `data.items`** on a funnel or maturity model: the section shows count 0, Add works, and the dialog opens with no rows. Tests in Tasks 5 and 7.

---

### Task 1: Ports and root resolution

**Files:**
- Create: `frontend/src/slide-editor/model/layoutItems.ts` (copy of `servers/nextjs/components/slide-editor/layout/layoutItems.ts`)
- Create: `frontend/src/slide-editor/model/infographic-sizing.ts` (copy of `.../infographics/infographic-sizing.ts`)
- Modify: `frontend/src/slide-editor/model/index.ts` (export both)
- Modify: `frontend/src/slide-editor/model/toolbarTarget.ts` (export `findFirstComponentInfographicElement`)
- Modify: `frontend/src/slide-editor/dataRoot.ts`
- Test: `frontend/tests/unit/slide-editor/dataRoot.test.ts`, `frontend/tests/unit/slide-editor/ports-2b3.test.ts`

**Interfaces:**
- Produces:
  - `layoutItemStats(element): { canAdd; canRemove; children }`, `addLayoutItemChanges(element): RawRecord`, `removeLastLayoutItemChanges(element): RawRecord | null`
  - `resizedInfographicFrame(element, nextData): { size?; position? }`
  - `type DataRootKind = 'table' | 'chart' | 'infographic' | 'layout'`
  - `dataRoot(ui, sel, kind: DataRootKind): ElementSelection | null`
  - `type LayoutType = 'flex' | 'grid' | 'container'`

- [ ] **Step 1: Write the failing tests**

In `dataRoot.test.ts` add (the `ui(...)` helper already exists):

```ts
it('finds an infographic and a layout root inside a component', () => {
  const u = ui({ type: 'flex', children: [{ type: 'text' }, { type: 'infographic' }] })
  const sel: Selection = { kind: 'component', componentIndex: 0 }
  expect(dataRoot(u, sel, 'infographic')).toEqual({ kind: 'element', componentIndex: 0, elementPath: [0, 1] })
  expect(dataRoot(u, sel, 'layout')).toEqual({ kind: 'element', componentIndex: 0, elementPath: [0] })
})
it('prefers a flex or grid over an enclosing container', () => {
  const u = ui({ type: 'container', child: { type: 'grid', children: [] } })
  expect(dataRoot(u, { kind: 'component', componentIndex: 0 }, 'layout')?.elementPath).toEqual([0, 0])
})
it('layout matches only flex, grid and container elements', () => {
  const at = (type: string) => dataRoot(ui({ type }), { kind: 'element', componentIndex: 0, elementPath: [0] }, 'layout')
  expect(at('flex')).not.toBeNull()
  expect(at('grid')).not.toBeNull()
  expect(at('container')).not.toBeNull()
  expect(at('group')).toBeNull()
  expect(at('list-view')).toBeNull()
  expect(dataRoot(ui({ type: 'group', children: [{ type: 'text' }] }), { kind: 'component', componentIndex: 0 }, 'layout')).toBeNull()
})
```

In `ports-2b3.test.ts`:

```ts
it('adds and removes a flex item', () => {
  const flex = { type: 'flex', children: [{ type: 'text', name: 'a' }] }
  expect((addLayoutItemChanges(flex).children as unknown[]).length).toBe(2)
  expect((removeLastLayoutItemChanges(flex)!.children as unknown[]).length).toBe(0)
  expect(removeLastLayoutItemChanges({ type: 'flex', children: [] })).toBeNull()
})
it('resizedInfographicFrame is empty when the natural size is unchanged', () => {
  const el = { type: 'infographic', position: { x: 0, y: 0 }, size: { width: 400, height: 300 }, data: { type: 'vertical_funnel', items: [{ value: 1 }] } }
  expect(resizedInfographicFrame(el, el.data)).toEqual({})
})
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/slide-editor/dataRoot.test.ts tests/unit/slide-editor/ports-2b3.test.ts` — expected: FAIL (missing modules, `'layout'` not assignable).

- [ ] **Step 3: Implement**

Copy the two files and fix imports. `infographic-sizing.ts` needs `EDITOR_STAGE_WIDTH` / `EDITOR_STAGE_HEIGHT` and types; find where the ported `core.ts` / `render/legacy/.../types.ts` export them and import from there.

Extend `dataRoot`: for `'infographic'` use `findFirstComponentInfographicElement`; for `'layout'` use `findFirstComponentLayoutElement`, and return `null` unless the found (or selected) element's `type` is `flex`, `grid` or `container`.

- [ ] **Step 4: Run the same command** — expected: PASS. Run `npx vue-tsc -b` — expected: no errors.

- [ ] **Step 5: Commit** — `feat(frontend): port layout items and infographic sizing; layout and infographic roots`

---

### Task 2: Selection kinds, labels and the appearance target

**Files:**
- Modify: `frontend/src/slide-editor/toolbarKind.ts`
- Modify: `frontend/src/slide-editor/appearanceTarget.ts`
- Test: `frontend/tests/unit/slide-editor/toolbarKind.test.ts`, `frontend/tests/unit/slide-editor/appearanceTarget.test.ts`

**Interfaces:**
- Consumes: `dataRoot(ui, sel, kind)` from Task 1.
- Produces: `ToolbarKind` now includes `'layout' | 'infographic'`.

- [ ] **Step 1: Write the failing tests**

`toolbarKind.test.ts` (build `ui` as `{ components: [{ elements: [...] }] }`):

```ts
const comp: Selection = { kind: 'component', componentIndex: 0 }
const el = (path: number[]): Selection => ({ kind: 'element', componentIndex: 0, elementPath: path })

it('resolves a component in the order table, chart, infographic, layout', () => {
  expect(toolbarKind(ui({ type: 'flex', children: [{ type: 'infographic' }] }), comp)).toBe('infographic')
  expect(toolbarKind(ui({ type: 'flex', children: [{ type: 'chart' }, { type: 'infographic' }] }), comp)).toBe('chart')
  expect(toolbarKind(ui({ type: 'flex', children: [{ type: 'text' }] }), comp)).toBe('layout')
})
it('gives a selected child its own kind, not the parent layout', () => {
  expect(toolbarKind(ui({ type: 'flex', children: [{ type: 'text' }] }), el([0, 0]))).toBe('text')
})
it('labels layouts and infographics', () => {
  expect(selectionLabel(ui({ type: 'container' }), el([0]))).toBe('Container')
  expect(selectionLabel(ui({ type: 'flex', children: [] }), el([0]))).toBe('Flex layout')
  expect(selectionLabel(ui({ type: 'grid', children: [] }), el([0]))).toBe('Grid layout')
  expect(selectionLabel(ui({ type: 'infographic' }), el([0]))).toBe('Infographic')
})
it('keeps a group a Group', () => {
  expect(selectionLabel(ui({ type: 'text' }, { type: 'text' }), comp)).toBe('Group')
})
```

`appearanceTarget.test.ts`:

```ts
it('styles the layout root of a component, and rotates the component', () => {
  const u = ui({ type: 'shape' }, { type: 'container', child: { type: 'text' } })
  const t = appearanceTargets(u, { kind: 'component', componentIndex: 0 })!
  expect(t.rotation).toEqual({ kind: 'component', componentIndex: 0 })
  expect(t.style).toEqual({ kind: 'element', componentIndex: 0, elementPath: [1] })
})
it('styles the infographic root of a component', () => {
  const u = ui({ type: 'flex', children: [{ type: 'infographic' }] })
  expect(appearanceTargets(u, { kind: 'component', componentIndex: 0 })!.style).toEqual({ kind: 'element', componentIndex: 0, elementPath: [0, 0] })
})
```

- [ ] **Step 2: Run both test files** — expected: FAIL.

- [ ] **Step 3: Implement**

`toolbarKind`: `elementKind` maps `flex`/`grid`/`container` → `'layout'` and `infographic` → `'infographic'`. For a component, after the table and chart checks, check `dataRoot(..., 'infographic')` then `dataRoot(..., 'layout')`. `selectionLabel`: for `'layout'` read the root element's `type` to choose the label.

`appearanceTargets`: for a component selection, the style target is `dataRoot(ui, sel, 'infographic') ?? dataRoot(ui, sel, 'layout')` when present; otherwise today's logic. Existing tests must still pass unchanged.

- [ ] **Step 4: Run** `npx vitest run tests/unit/slide-editor tests/unit/editor/inspector` — expected: PASS (fix any existing test whose fixture now resolves to `layout`; a changed expectation must be justified by the spec's resolution order).

- [ ] **Step 5: Commit** — `feat(frontend): layout and infographic selection kinds`

---

### Task 3: `layoutOps.ts`

**Files:**
- Create: `frontend/src/slide-editor/layoutOps.ts`
- Test: `frontend/tests/unit/slide-editor/layoutOps.test.ts`

**Interfaces:**
- Consumes: `layoutItemStats`, `addLayoutItemChanges`, `removeLastLayoutItemChanges`, `updateComponentLayoutElement`, `absoluteBoxForSelection`, `updateComponentInUi`, `rootElementsComponent`, `ROOT_ELEMENTS_COMPONENT_INDEX`, `childrenBounds`, `elementBox`, `elementSize`, `isManualPositioned`, `elementWithNormalizedLayoutChildren` (all from `@/slide-editor/model`).
- Produces:

```ts
export type LayoutType = 'flex' | 'grid' | 'container'
export type Horizontal = 'left' | 'center' | 'right'
export type Vertical = 'top' | 'middle' | 'bottom'
export interface ContainerControls {
  fillColor: string; fillOpacity: number          // '#rrggbb', 0..1
  strokeColor: string; strokeWidth: number; strokeOpacity: number
  radius: number; maxRadius: number
  horizontal: Horizontal; vertical: Vertical
  paddingX: number; paddingY: number
}
export function layoutType(el: RawElement | null): LayoutType | null
export function readGap(el: RawElement): number
export function readContainer(el: RawElement, box: { width: number; height: number }): ContainerControls
// Each returns the `changes` record to merge into the element:
export function gapChanges(value: number): Rec
export function fillChanges(el: RawElement, patch: { color?: string; opacity?: number }): Rec
export function strokeChanges(el: RawElement, patch: { color?: string; width?: number; opacity?: number }): Rec
export function radiusChanges(value: number, maxRadius: number): Rec
export function alignmentChanges(el: RawElement, horizontal: Horizontal, vertical: Vertical): Rec
export function paddingChanges(el: RawElement, axis: 'x' | 'y', value: number): Rec
/** Applies changes to the layout at `root`, resizing its component when the item count changed. Null when root is not a layout. */
export function applyLayoutChanges(ui: RawUi, root: ElementSelection, changes: Rec): RawUi | null
export function addLayoutItem(ui: RawUi, root: ElementSelection): RawUi | null
export function removeLastLayoutItem(ui: RawUi, root: ElementSelection): RawUi | null
```

- [ ] **Step 1: Write the failing tests** — `layoutOps.test.ts`, with these assertions:

```ts
// gap
expect(gapChanges(12.34)).toEqual({ gap: 12.3, column_gap: 12.3, row_gap: 12.3 })
expect(gapChanges(-5)).toEqual({ gap: 0, column_gap: 0, row_gap: 0 })
expect(readGap({ type: 'flex', column_gap: 8 })).toBe(8)
expect(readGap({ type: 'flex', gap: 4, column_gap: 8 })).toBe(4)
expect(readGap({ type: 'flex' })).toBe(0)

// container read defaults
const c = readContainer({ type: 'container' }, { width: 200, height: 100 })
expect(c).toMatchObject({ fillColor: '#4a6ff3', fillOpacity: 1, strokeColor: '#1a1f36', strokeWidth: 0, strokeOpacity: 1, radius: 0, maxRadius: 50, horizontal: 'left', vertical: 'top', paddingX: 0, paddingY: 0 })
// radius read: number, {radius}, {tl}
expect(readContainer({ type: 'container', border_radius: 6 }, box).radius).toBe(6)
expect(readContainer({ type: 'container', border_radius: { radius: 7 } }, box).radius).toBe(7)
expect(readContainer({ type: 'container', border_radius: { tl: 8 } }, box).radius).toBe(8)
// padding read: x wins, else mean of left/right
expect(readContainer({ type: 'container', padding: { left: 4, right: 8 } }, box).paddingX).toBe(6)
// a no-hash colour reads with a hash
expect(readContainer({ type: 'container', fill: { color: 'FFAA00' } }, box).fillColor).toBe('#ffaa00')

// write shapes (keep sibling keys)
expect(fillChanges({ type: 'container', fill: { color: '#111111', opacity: 0.5 } }, { color: '#222222' })).toEqual({ fill: { color: '#222222', opacity: 0.5 } })
expect(strokeChanges({ type: 'container' }, { width: 40 })).toEqual({ stroke: { width: 32 } })     // width clamps 0..32
expect(fillChanges({ type: 'container' }, { opacity: 1.4 })).toEqual({ fill: { opacity: 1 } })      // opacity clamps 0..1
expect(radiusChanges(80, 50)).toEqual({ border_radius: { tl: 50, tr: 50, br: 50, bl: 50 } })
expect(alignmentChanges({ type: 'container', alignment: { foo: 1 } }, 'center', 'middle')).toEqual({ alignment: { foo: 1, horizontal: 'center', vertical: 'middle' } })
expect(paddingChanges({ type: 'container', padding: { top: 3 } }, 'x', 10)).toEqual({ padding: { top: 3, x: 10, left: 10, right: 10 } })
expect(paddingChanges({ type: 'container' }, 'y', -2)).toEqual({ padding: { y: 0, top: 0, bottom: 0 } })
```

Plus three `applyLayoutChanges` tests on a real fixture (a component at `position {x:100,y:100}` holding a row flex of two 100×50 text children with `gap: 10`):

- `addLayoutItem` gives the flex three children, and both the flex's and the component's `size.width` grow.
- `removeLastLayoutItem` on an empty flex returns `null`.
- **Root-level (Review Focus 1):** with the same flex in `ui.elements` and `root = { kind: 'element', componentIndex: ROOT_ELEMENTS_COMPONENT_INDEX, elementPath: [0] }`, `applyLayoutChanges(ui, root, gapChanges(20))` returns a ui whose `elements[0].gap === 20` and whose `components` array is the same reference.
- `applyLayoutChanges` on a `text` root returns `null`.

- [ ] **Step 2: Run** `npx vitest run tests/unit/slide-editor/layoutOps.test.ts` — expected: FAIL.

- [ ] **Step 3: Implement `layoutOps.ts`.** `applyLayoutChanges` mirrors `applyLayoutElementChange` in `servers/nextjs/components/slide-editor/surface/TemplateV2KonvaSlide.tsx:2098-2155`: get the box with `absoluteBoxForSelection(ui, root)`, call `updateComponentLayoutElement(component, root.elementPath, changes, box, deps)` with `deps = { childrenBounds, elementBox, elementSize, isManualPositioned, normalizeLayoutChildren: elementWithNormalizedLayoutChildren }`; for the root index use `rootElementsComponent(ui)` and write back `{ ...ui, elements }`. Colours are written as the caller passes them (`#rrggbb`).

- [ ] **Step 4: Run the test file** — expected: PASS.

- [ ] **Step 5: Commit** — `feat(frontend): layout ops for gap, items and container style`

---

### Task 4: `LayoutSection.vue`

**Files:**
- Create: `frontend/src/components/editor/inspector/element/LayoutSection.vue`
- Modify: `frontend/src/components/editor/inspector/element/ElementTab.vue` (add `<LayoutSection v-else-if="kind === 'layout'" :presentation="props.presentation" />` after the chart branch)
- Test: `frontend/tests/unit/editor/inspector/LayoutSection.test.ts` (model the mount helper on `ShapeSection.test.ts`)

**Interfaces:**
- Consumes: everything Task 3 produces; `dataRoot(ui, sel, 'layout')`; `useSlideEditingContext`, `useEditingActions`, `themePalette`.
- Produces: the component; props `{ presentation: Presentation }`.

Behaviour decisions:
- `root = dataRoot(ctx.ui, ctx.selection, 'layout')`. Every commit is `actions.run(label, (ui) => { const next = fn(ui, root); return next ? { ui: next, selection: ctx.selection.value } : null })`.
- Colour fields anchor the root at picker open (`@open="hold"`, `@close="anchor = null"`), as `ChartSection.vue:91-95` does.
- Flex/grid controls: `NumberField` "Gap" (min 0, step 1); a row "Items" showing the count; buttons "Add item" and "Remove last item" (disabled when `!canRemove`).
- Container controls: `ColorField` "Fill colour"; `SliderField` "Fill opacity" (0–100 %); `ColorField` "Stroke colour"; `NumberField` "Stroke width" (0–32, step 0.25); `SliderField` "Stroke opacity"; `NumberField` "Corner radius" (0–`maxRadius`, step 0.5); a 3×3 `role="group" aria-label="Alignment"` of buttons named `"<Horizontal> <Vertical>"` capitalised ("Center Middle"), with `aria-pressed`; `NumberField` "Padding X" and "Padding Y" (min 0, step 0.5).
- Undo labels: "Gap", "Add item", "Remove item", "Fill", "Stroke", "Corner radius", "Alignment", "Padding".

- [ ] **Step 1: Write the failing tests**

```ts
it('shows gap and item controls for a flex, and no container controls', ...)
// getByLabelText('Gap'), getByRole('button', { name: 'Add item' }); queryByLabelText('Fill colour') is null
it('shows container controls for a container, and no gap', ...)
it('Add item commits one op that adds a child', ...)          // commit spy called once; ui flex children length +1
it('Remove last item is disabled on an empty flex', ...)
it('an alignment button writes both axes and becomes pressed', ...)  // click 'Center Middle' → alignment { horizontal:'center', vertical:'middle' }
it('corner radius cannot exceed half the shorter side', ...)   // 200x100 container, enter 80 → border_radius.tl === 50
it('edits the layout root when a component is selected', ...)  // component selection; gap change lands on elementPath [0]
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/editor/inspector/LayoutSection.test.ts` — expected: FAIL.
- [ ] **Step 3: Implement the component and wire `ElementTab.vue`.**
- [ ] **Step 4: Run** `npx vitest run tests/unit/editor/inspector` and `npx vue-tsc -b` — expected: PASS, no errors.
- [ ] **Step 5: Commit** — `feat(frontend): Layout section in the Element tab`

---

### Task 5: `infographicOps.ts`

**Files:**
- Create: `frontend/src/slide-editor/infographicOps.ts`
- Test: `frontend/tests/unit/slide-editor/infographicOps.test.ts`

**Interfaces:**
- Consumes: `normalizeInfographicColors`, `infographicToolbarItemStats`, `addInfographicToolbarItem`, `removeLastInfographicToolbarItem` from `@/render/legacy/components/slide-editor/infographics/infographic-editing`; `resizedInfographicFrame` from Task 1.
- Produces:

```ts
export type InfographicGroup = 'meter' | 'items' | 'other'
export type ItemType = 'vertical_funnel' | 'maturity_model'
export interface Meter { value: number; min: number; max: number }
export interface DraftItem { [key: string]: unknown; heading: string; description: string; value?: string }  // value is the typed text
export function infographicType(el: RawElement): string | null          // data.type ?? infographic_type
export function infographicGroup(el: RawElement): InfographicGroup       // gauge|progress_bar → meter; vertical_funnel|maturity_model → items
export function readMeter(el: RawElement): Meter
/** Null when the patch is invalid (min > max, or a non-finite number). */
export function setMeter(el: RawElement, patch: Partial<Meter>): RawElement | null
export function readColors(el: RawElement): string[]                     // '#rrggbb', normalised per type
export function setColor(el: RawElement, index: number, color: string): RawElement
export function readTextColor(el: RawElement): string | null             // '#rrggbb' or null
export function setTextColor(el: RawElement, color: string): RawElement
export function itemLimits(type: ItemType): { min: number; max: number } // funnel 1..8, maturity 1..7
export function itemStats(el: RawElement): { count: number; canAdd: boolean; canRemove: boolean }
export function addItem(el: RawElement): RawElement                      // unchanged at the max
export function removeLastItem(el: RawElement): RawElement               // unchanged at the min
export function toDraftItems(el: RawElement): DraftItem[]
export function newDraftItem(type: ItemType, items: DraftItem[]): DraftItem
export function draftComplete(type: ItemType, items: DraftItem[]): boolean
/** Writes data.items from the draft and refits the frame. */
export function writeItems(el: RawElement, items: DraftItem[]): RawElement
```

- [ ] **Step 1: Write the failing tests**, with these assertions:

```ts
// meters
const gauge = { type: 'infographic', data: { type: 'gauge', min_value: 0, max_value: 100, value: 84 }, infographic_type: 'gauge', value: 84, min_value: 0, max_value: 100, base_color: '#1D242D', highlight_color: '#448BCA' }
const next = setMeter(gauge, { value: 150 })!
expect(next.data).toEqual({ type: 'gauge', min_value: 0, max_value: 100, value: 100 })           // clamped
for (const k of ['infographic_type', 'value', 'min_value', 'max_value']) expect(k in next).toBe(false)
expect(next.base_color).toBe('#1D242D')                                                         // colours untouched by a meter edit
expect(setMeter(gauge, { min: 200 })).toBeNull()                                                // min > max
expect(setMeter(gauge, { value: NaN })).toBeNull()
expect((setMeter(gauge, { max: 50 })!.data as Rec).value).toBe(50)                              // value follows a shrunk range

// Review Focus 3: legacy-only
const legacy = { type: 'infographic', infographic_type: 'progress_bar', value: 30, max_value: 60 }
expect(infographicGroup(legacy)).toBe('meter')
expect(readMeter(legacy)).toEqual({ value: 30, min: 0, max: 60 })
expect(setMeter(legacy, { value: 40 })!.data).toEqual({ type: 'progress_bar', min_value: 0, max_value: 60, value: 40 })

// Review Focus 4: degenerate range, stored value out of range
expect(readMeter({ type: 'infographic', data: { type: 'gauge', min_value: 5, max_value: 5, value: 9 } })).toEqual({ value: 9, min: 5, max: 5 })
expect((setMeter({ type: 'infographic', data: { type: 'gauge', min_value: 5, max_value: 5, value: 9 } }, { value: 9 })!.data as Rec).value).toBe(5)

// Review Focus 2: colours
expect(readColors({ type: 'infographic', data: { type: 'gauge' }, colors: ['FFFFFF'] })).toEqual(['#ffffff', '#2563eb'])   // padded to two
const col = setColor({ type: 'infographic', data: { type: 'vertical_funnel', items: [] }, colors: ['CFDAC9', '#285E1D'], base_color: '#000000', highlight_color: '#111111' }, 0, '#aabbcc')
expect(col.colors).toEqual(['#aabbcc', '#285E1D'])                                              // other entries keep their stored form
expect('base_color' in col || 'highlight_color' in col).toBe(false)
expect(setTextColor({ type: 'infographic' }, '#174b40').text_color).toBe('#174b40')
expect(readTextColor({ type: 'infographic', text_color: null })).toBeNull()

// items
const funnel = (n: number) => ({ type: 'infographic', position: { x: 0, y: 0 }, size: { width: 448, height: 322 }, data: { type: 'vertical_funnel', items: Array.from({ length: n }, (_, i) => ({ value: 100 - i * 10, heading: `S${i}`, description: '' })) } })
expect(itemStats(funnel(8))).toEqual({ count: 8, canAdd: false, canRemove: true })
expect(itemStats(funnel(1)).canRemove).toBe(false)
const maturity = (n: number) => ({ type: 'infographic', data: { type: 'maturity_model', items: Array.from({ length: n }, () => ({ heading: 'L', description: '', icon: { url: 'u', color: '#18324A' } })) } })
expect(itemStats(maturity(7)).canAdd).toBe(false)                                               // capped at 7
expect(addItem(maturity(7))).toBe(/* same reference */)
expect(((addItem(funnel(2)).data as Rec).items as unknown[]).length).toBe(3)

// Review Focus 5
const empty = { type: 'infographic', data: { type: 'vertical_funnel' } }
expect(itemStats(empty)).toEqual({ count: 0, canAdd: true, canRemove: false })
expect(toDraftItems(empty)).toEqual([])
expect(((addItem(empty).data as Rec).items as unknown[]).length).toBe(1)

// drafts
expect(toDraftItems(funnel(1))[0]).toMatchObject({ value: '100', heading: 'S0', description: '' })
expect(newDraftItem('vertical_funnel', toDraftItems(funnel(1)))).toMatchObject({ value: '90', heading: 'Stage 2', description: 'Add a description.' })
expect(newDraftItem('vertical_funnel', [])).toMatchObject({ value: '60', heading: 'Stage 1' })
expect(newDraftItem('maturity_model', toDraftItems(maturity(2)))).toMatchObject({ heading: 'Level 3', description: '', icon: { url: 'u', color: '#18324A' } })
expect(draftComplete('vertical_funnel', [{ heading: '', description: '', value: '' }])).toBe(false)
expect(draftComplete('vertical_funnel', [{ heading: '', description: '', value: '-' }])).toBe(false)
expect(draftComplete('vertical_funnel', [{ heading: '', description: '', value: '12.5' }])).toBe(true)
expect(draftComplete('maturity_model', [{ heading: '', description: '' }])).toBe(true)
const written = writeItems(funnel(2), [{ heading: 'A', description: 'd', value: '12.5', focus: 'kept' }])
expect((written.data as Rec).items).toEqual([{ heading: 'A', description: 'd', value: 12.5, focus: 'kept' }])   // unknown fields survive; value is a number
expect((written.data as Rec).type).toBe('vertical_funnel')
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/slide-editor/infographicOps.test.ts` — expected: FAIL.

- [ ] **Step 3: Implement.** Use `isCompleteNumericInput` from `@/slide-editor/chartOps` for `draftComplete`. `addItem` / `removeLastItem` / `writeItems` merge `resizedInfographicFrame(el, nextData)` into the element. `addItem` for an element with no `items` array first treats it as `items: []`. The maturity cap of 7 is enforced in `itemStats` and `addItem` before delegating to the ported helper.

- [ ] **Step 4: Run the test file** — expected: PASS.
- [ ] **Step 5: Commit** — `feat(frontend): infographic ops for meters, colours and items`

---

### Task 6: `InfographicSection.vue`

**Files:**
- Create: `frontend/src/components/editor/inspector/element/InfographicSection.vue`
- Modify: `frontend/src/components/editor/inspector/element/ElementTab.vue` (add the `kind === 'infographic'` branch)
- Test: `frontend/tests/unit/editor/inspector/InfographicSection.test.ts`

**Interfaces:**
- Consumes: Task 5 exports; `dataRoot(ui, sel, 'infographic')`; `useSelectedElement(ctx).patch(label, fn, at)`.
- Produces: the component; props `{ presentation: Presentation }`; `defineExpose({ itemsOpen })` (a `ref<boolean>`); renders `<InfographicItemsDialog v-model:open="itemsOpen" :root="root" />` (Task 7 — until then, leave the dialog import out and the button toggling `itemsOpen` only).

Behaviour decisions:
- Meter: `NumberField` "Value", "Min", "Max". When `setMeter` returns `null`, nothing is committed and the field re-renders the stored value.
- Colours: one `ColorField` per `readColors` entry, labelled "Colour 1", "Colour 2", …; `ColorField` "Text colour" (its value falls back to the first colour when `readTextColor` is `null`). Palette: `themePalette(presentation)`. Anchor the root at picker open, as in `ChartSection.vue`.
- Items group: a row "Items" with the count, "Add item", "Remove last item" (disabled from `itemStats`), and a button "Edit items…".
- `other` group: colours only.
- Undo labels: "Infographic value", "Infographic range", "Infographic colour", "Text colour", "Add item", "Remove item".

- [ ] **Step 1: Write the failing tests**

```ts
it('gauge: shows Value, Min, Max and colours; no item controls', ...)
it('typing a value above max commits the clamped value once', ...)          // 150 → data.value 100, one commit
it('a Min above Max commits nothing and the field shows the stored Min', ...)
it('vertical_funnel: shows the count, Add, Remove and Edit items…; no Value field', ...)
it('Add item is disabled at 8 funnel items and at 7 maturity items', ...)
it('a timeline infographic shows colours only', ...)                        // data.type 'timeline'
it('edits the infographic inside a selected component', ...)                // component selection; patch lands on the nested path
it('Edit items… sets itemsOpen', ...)
```

- [ ] **Step 2: Run the test file** — expected: FAIL.
- [ ] **Step 3: Implement and wire `ElementTab.vue`.**
- [ ] **Step 4: Run** `npx vitest run tests/unit/editor/inspector` and `npx vue-tsc -b` — expected: PASS.
- [ ] **Step 5: Commit** — `feat(frontend): Infographic section in the Element tab`

---

### Task 7: `InfographicItemsDialog.vue`

**Files:**
- Create: `frontend/src/components/editor/inspector/element/InfographicItemsDialog.vue`
- Modify: `frontend/src/components/editor/inspector/element/InfographicSection.vue` (mount the dialog)
- Test: `frontend/tests/unit/editor/inspector/InfographicItemsDialog.test.ts` (model on `ChartDataDialog.test.ts`)

**Interfaces:**
- Consumes: `toDraftItems`, `newDraftItem`, `draftComplete`, `writeItems`, `itemLimits`, `infographicType` (Task 5); `updateElementInUi`; `editing.draftUi`; `useEditingActions`; `IconPickerDialog.vue` (read its props and emits before use).
- Produces: props `{ open: boolean; root: ElementSelection }`, emit `'update:open'`.

Behaviour decisions — follow `ChartDataDialog.vue` line for line for the lifecycle (`begin` on open, snapshot ui and root, `preview()` writes `draftUi`, `finished` flag so its own commit landing does not close it, close when the root element disappears or the selection moves to another element):
- Title "Edit items"; description "Changes preview on the slide. Done saves them."
- One row per draft item. Funnel: `Value` (text input, `inputmode="decimal"`, `aria-invalid` when incomplete), `Heading`, `Description`. Maturity: an icon button "Change icon" (opens `IconPickerDialog`; writes `icon.url`, keeps `icon.color`), `Heading`, `Description` (`<textarea>`, 3 rows). Inputs are labelled `"<Field> <n>"` ("Heading 2").
- Row buttons: "Move item n up" (disabled on the first), "Move item n down" (disabled on the last), "Delete item n" (disabled at `itemLimits(type).min`).
- "Add item" below the list, disabled at `itemLimits(type).max`.
- Footer: "Cancel" and "Done". Done is disabled when `!draftComplete(...)`. Done with an unchanged draft closes without committing. Otherwise it runs one op labelled "Edit items" built on the snapshot root with `writeItems`, then clears `draftUi` and closes. Cancel, Escape and the close button clear `draftUi` and close.
- While a value is incomplete the preview keeps the last complete draft.

- [ ] **Step 1: Write the failing tests**

```ts
it('opens with one row per item', ...)
it('editing a heading updates draftUi and does not commit', ...)
it('Done commits once with the edited items and clears draftUi', ...)
it('Cancel discards: no commit, draftUi null', ...)
it('Done with no changes closes without a commit', ...)
it('a blank funnel value disables Done and marks the field invalid', ...)
it('Add item appends "Stage N" and disables at 8; Delete disables at 1', ...)
it('Move down swaps two rows', ...)
it('maturity rows have no Value field and offer Change icon', ...)
it('picking an icon keeps the icon colour', ...)
it('opens with no rows when data.items is missing, and Add works', ...)     // Review Focus 5
it('closes and clears the draft when the root element disappears', ...)
```

- [ ] **Step 2: Run the test file** — expected: FAIL.
- [ ] **Step 3: Implement the dialog; mount it in `InfographicSection.vue`.**
- [ ] **Step 4: Run** `npx vitest run tests/unit/editor/inspector` and `npx vue-tsc -b` — expected: PASS.
- [ ] **Step 5: Commit** — `feat(frontend): infographic items dialog with live preview and single commit`

---

### Task 8: e2e and full check

**Files:**
- Create: `frontend/tests/e2e/fixtures/layout-presentation.json` (model on `data-presentation.json`)
- Modify: `frontend/tests/e2e/mocked.spec.ts` (a new `test.describe('layout and infographic editing (mocked)')`, using `editableApi`, `slidePoint` and the `open` helper pattern from the table and chart block at line 667)

Fixture: one deck, three slides, 1280×720, each with one component:
1. A row flex at (100,100) with `gap: 10` and two 200×100 containers (`fill.color` `#4A6FF3`), each with a text child.
2. A `gauge` infographic at (400,200), 240×240, `data: { type: 'gauge', min_value: 0, max_value: 100, value: 84 }`.
3. A `vertical_funnel` infographic at (300,150) with the four items from `templates/verdant/template.json`.

- [ ] **Step 1: Write the tests**

```ts
test('Layout: gap change saves and Ctrl+Z restores it', ...)       // click the card, fill 'Gap' with 24, expect a PATCH whose flex gap is 24; Ctrl+Z → 10
test('Layout: Add item adds a third card', ...)
test('Infographic: gauge value saves clamped', ...)                // slide 2, Value 150 → PATCH data.value 100
test('Edit items saves one PATCH and Ctrl+Z undoes it in one step', ...)  // slide 3: change Heading 1, Add item, Done → exactly one PATCH; Ctrl+Z restores four items and the old heading
```

- [ ] **Step 2: Run** `npx playwright test tests/e2e/mocked.spec.ts -g "layout and infographic"` — expected: PASS. A failure here is a product bug or a wrong selector: fix the cause, not the assertion.
- [ ] **Step 3: Run** `npm run check` — expected: `vue-tsc`, the full Vitest suite and ESLint all pass.
- [ ] **Step 4: Commit** — `test(frontend): e2e for layout and infographic editing`
