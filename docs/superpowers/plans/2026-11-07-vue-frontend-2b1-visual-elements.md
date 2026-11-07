# 2b-1 Visual Element Editing and Rotation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Element-tab sections for shapes, lines, icons, lists and per-element appearance, plus a rotate handle and a rotation-aware selection overlay, in `/frontend`.

**Architecture:** All style logic is pure TS over raw `ui` records (`slide-editor/elementStyle.ts`, `slide-editor/rotation.ts`), unit-tested without Vue. Inspector sections are thin views that patch through the existing `useEditingActions(ctx).run(label, { ui, selection })` path (one undo step per change). The overlay keeps using model boxes; rotation is added as a frame `{ box, rotation }` computed from the `ui`, matching the renderer's `transform: rotate() …; transform-origin: center`.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Tailwind v4, shadcn-vue (`Popover`, `Dialog`), lucide-vue-next, @tanstack/vue-query, Vitest + @vue/test-utils, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-vue-frontend-2b1-visual-elements-design.md`

## Global Constraints

- Work only in `/frontend` (plus this plan). Never modify `servers/nextjs`; ported code is copied with a header comment `// Ported from servers/nextjs/components/slide-editor/<path>. Changes: …`.
- Template slides only; smart slides and `editor.locked` get no sections and no rotate handle (the existing `ctx.enabled` gate).
- Element controls go in the inspector's Element tab, never in a toolbar over the canvas.
- Keep Aera look: reuse the classes already in `ImageSection.vue` / `TextSection.vue` (`section`, `label`, `segment`, `bg-field`, `rounded-control`, text colours `#d0d7dc` / `#9aa9b0`). Extend, never remove.
- Every change commits through `useEditingActions(ctx).run(label, result)`; one gesture = one commit. Labels exactly: "Fill", "Stroke", "Corner radius", "Curve", "Line ends", "Icon colour", "Change icon", "List marker", "Rotate", "Flip", "Opacity", "Shadow".
- Old-editor defaults: fill `{ color: '#FFFFFF', opacity: 1 }`; stroke `{ color: '#1A1A1A', opacity: 1, width: 1.5 }`; shadow `{ color: '#000000', blur: 10, opacity: 0.18, offset_x: 6, offset_y: 6 }`.
- Unknown fields on elements and components are preserved by every patch.
- Run `npm run check` (vue-tsc + vitest + eslint) green before each commit. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work on branch `feat/vue-frontend-2b1` off `main`.

## Review Focus

1. **Element inside a rotated component** — its selection box, hit-test and inline editor must sit where the renderer draws it (rotated about the component's centre, not its own). Test in Task 7: `elementFrame` of a child of a 90°-rotated component.
2. **Selection changes while a ColorField popover or NumberField is open** — the pending value must land on the element it was opened for. Test in Task 2 (ColorField captures target) and Task 4 (ShapeSection: switch selection with popover open).
3. **Rotation crossing ±180°** (dragging from 170° to −170°, typing 270, typing −90) — stored value is normalised to (−180, 180], the handle does not jump. Test in Task 1 (`normalizeRotation`) and Task 8 (drag across 180°).
4. **Rotated element on a slide with flex/grid parents** — `isLayoutManagedElement` elements must not get a rotate handle (their position is owned by layout). Test in Task 8.
5. **Icon picker response after the dialog closed or the element was deleted** — no commit, no error. Test in Task 5.

---

### Task 1: Style model (`elementStyle.ts`) and `numericInput` port

**Files:**
- Create: `frontend/src/slide-editor/elementStyle.ts`
- Create: `frontend/src/slide-editor/model/numericInput.ts` (verbatim copy of `servers/nextjs/components/slide-editor/toolbar/numericInput.ts`, header comment)
- Test: `frontend/tests/unit/slide-editor/elementStyle.test.ts`

**Interfaces:**
- Consumes: `RawElement`, `readNumber`, `readString`, `withHash` from `@/slide-editor/model`.
- Produces (all pure, return a new element, unknown fields kept):
  - `DEFAULT_FILL`, `DEFAULT_STROKE`, `DEFAULT_SHADOW` (values in Global Constraints)
  - `type ShapeStyle = { fill: {color:string;opacity:number}; fillEnabled: boolean; stroke: {color:string;opacity:number;width:number;dash:number[]|null}; strokeEnabled: boolean; dash: DashStyle; radius: number; maxRadius: number; canRoundCorners: boolean; curve: 'none'|'smooth' }`
  - `type DashStyle = 'solid'|'dashed'|'dotted'`
  - `readShapeStyle(el: RawElement): ShapeStyle`
  - `isOpenVector(el: RawElement): boolean` — `type==='vector' && shape!=='ellipse' && closed===false`
  - `setFill(el, fill: {color:string;opacity:number}|null)`, `setStroke(el, stroke: Partial<{color;opacity;width}>|null)`, `setDash(el, d: DashStyle)`, `setCornerRadius(el, r: number)`, `setCurve(el, m: 'none'|'smooth')`
  - `type VectorMarker = 'none'|'arrow'|'stealth'|'triangle'|'circle'|'square'|'diamond'`; `VECTOR_MARKERS: { label: string; value: VectorMarker }[]` (labels from old toolbar: None, Arrow, Stealth arrow, Filled arrow, Circle, Square, Diamond)
  - `readMarkers(el): { start: VectorMarker; end: VectorMarker }`, `setMarkers(el, start, end)`, `swapMarkers(el)`
  - `type Appearance = { opacity: number; flipH: boolean; flipV: boolean; shadow: Shadow; shadowEnabled: boolean }`; `readAppearance(el)`, `setOpacity(el, v)`, `setFlip(el, axis: 'h'|'v')` (toggles), `setShadow(el, shadow|null)`
  - `normalizeRotation(deg: number): number` → (−180, 180], rounded to 0.1°
  - `readListMarker(el): 'bullet'|'number'|'none'`, `setListMarker(el, m)`
  - `setIconColor(el, color: string)`, `setIcon(el, url: string, weight: IconWeight)` — writes `data` and `icon_type`, keeps `color`
  - `type IconWeight = 'bold'|'duotone'|'fill'|'light'|'regular'|'thin'`

- [ ] **Step 1: Write the failing tests**

```ts
// vector fixtures: rect = { type:'vector', points:[{x:0,y:0},{x:100,y:0},{x:100,y:50},{x:0,y:50}], keep:'x' }
it('reads old-editor defaults when fill/stroke/shadow are absent', () => {
  const s = readShapeStyle(rect)
  expect(s.fill).toEqual({ color: '#FFFFFF', opacity: 1 }); expect(s.fillEnabled).toBe(false)
  expect(s.stroke).toMatchObject({ color: '#1A1A1A', opacity: 1, width: 1.5 })
})
it('only closed 4-point polygons round corners; radius capped at min(128,w/2,h/2)', () => {
  expect(readShapeStyle(rect)).toMatchObject({ canRoundCorners: true, maxRadius: 25 })
  expect(readShapeStyle({ ...rect, closed: false }).canRoundCorners).toBe(false)
  expect(setCornerRadius(rect, 10).corner_radii).toEqual([10, 10, 10, 10])
})
it('isOpenVector: open polygon only', () => {
  expect(isOpenVector({ type: 'vector', closed: false, points: [] })).toBe(true)
  expect(isOpenVector({ type: 'vector', points: [] })).toBe(false)
  expect(isOpenVector({ type: 'vector', shape: 'ellipse', closed: false, points: [] })).toBe(false)
})
it('dash arrays scale with width; solid clears; width change rescales', () => {
  const w2 = setStroke(rect, { width: 2 })
  expect(setDash(w2, 'dashed').stroke).toMatchObject({ dash: [6, 4] })
  expect(setDash(w2, 'dotted').stroke).toMatchObject({ dash: [2, 3], line_cap: 'round' })
  expect(setDash(setDash(w2, 'dashed'), 'solid').stroke.dash).toBeNull()
  expect(setStroke(setDash(w2, 'dashed'), { width: 4 }).stroke.dash).toEqual([12, 8])
  expect(readShapeStyle(setDash(w2, 'dotted')).dash).toBe('dotted')
})
it('fill/stroke off writes null; unknown fields survive', () => {
  expect(setFill(rect, null)).toMatchObject({ fill: null, keep: 'x' })
})
it('curve smooth/none', () => {
  expect(setCurve(rect, 'smooth').curve).toMatchObject({ type: 'smooth' })
  expect(setCurve(setCurve(rect, 'smooth'), 'none').curve).toBeNull()
})
it('markers are top-level fields; swap swaps', () => {
  const line = setMarkers({ type: 'vector', closed: false, points: [] }, 'none', 'arrow')
  expect(line).toMatchObject({ start_marker: 'none', end_marker: 'arrow' })
  expect(readMarkers(swapMarkers(line))).toEqual({ start: 'arrow', end: 'none' })
})
it('normalizeRotation', () => {
  expect(normalizeRotation(270)).toBe(-90); expect(normalizeRotation(-180)).toBe(180)
  expect(normalizeRotation(540)).toBe(180); expect(normalizeRotation(12.345)).toBe(12.3)
})
it('list marker read/write', () => {
  expect(readListMarker({ type: 'text-list' })).toBe('bullet')
  expect(setListMarker({ type: 'text-list' }, 'number').marker).toBe('number')
})
it('setIcon writes data and icon_type and keeps color', () => {
  expect(setIcon({ type: 'image', is_icon: true, color: '#ff0000', data: 'a' }, '/static/icons/bold/x-bold.png', 'bold'))
    .toMatchObject({ data: '/static/icons/bold/x-bold.png', icon_type: 'bold', color: '#ff0000' })
})
it('appearance: opacity clamps 0..1, flip toggles, shadow default/null', () => {
  expect(setOpacity(rect, 1.4).opacity).toBe(1)
  expect(setFlip(setFlip(rect, 'h'), 'h').flip_h).toBe(false)
  expect(readAppearance(rect).shadow).toEqual(DEFAULT_SHADOW)
})
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/slide-editor/elementStyle.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement** `elementStyle.ts` and copy `numericInput.ts`. Port `curveForMode`, `normalizedTension`, `normalizedSegments` and the `canRoundCorners`/`maxRadius` rules from `servers/nextjs/components/slide-editor/shapes/ShapeToolbar.tsx` (lines ~120–140, 949–985). `maxRadius` uses the polygon's point bounds. Dash: dashed `[w*3, w*2]`, dotted `[w, w*1.5]` + `line_cap:'round'`; `readShapeStyle.dash` infers the style from the ratio of `dash[0]/width`.

- [ ] **Step 4: Run** the test — expect PASS.

- [ ] **Step 5: Commit** `feat(frontend): element style model for shapes, lines, icons, lists and appearance`

---

### Task 2: Shared inspector controls

**Files:**
- Create: `frontend/src/components/editor/inspector/controls/ColorField.vue`, `NumberField.vue`, `SegmentedControl.vue`, `ToggleRow.vue`, `SliderField.vue`, `styles.ts` (the shared class strings `section`, `label`, `segment`, `field`, copied from ImageSection/TextSection)
- Create: `frontend/src/slide-editor/themePalette.ts` — `themePalette(presentation: Presentation): string[]` extracted from `TextSection.vue` lines 91–95; TextSection imports it (no behaviour change)
- Test: `frontend/tests/unit/editor/inspector/controls.test.ts`

**Interfaces:**
- `ColorField` props `{ modelValue: string | null; palette: string[]; label: string; allowNone?: boolean }`, emits `commit: [value: string | null]`. Popover (shadcn `Popover`) with palette swatches, session-recent colours (module-level `ref<string[]>`, max 8), native `<input type=color>` and a hex text input. Emits `open` when the popover opens and `commit` exactly once: on swatch click, or on popover close if the native/hex value changed. Parents capture their target on `open` (`useSelectedElement().capture()`, Task 3) and patch that target on `commit`. Swatches have `aria-label` = hex.
- `NumberField` props `{ modelValue: number; label: string; min?: number; max?: number; step?: number; unit?: string }`, emits `commit: [value: number]` on Enter, blur, ArrowUp/Down (±step, ±10·step with Shift); sanitises with `numericInput`; clamps; no emit when unchanged.
- `SegmentedControl` props `{ modelValue: string; options: { value: string; label: string; icon?: Component }[]; label: string }`, emits `update:modelValue`; buttons with `aria-pressed`, group `role="group"` + `aria-label`.
- `ToggleRow` props `{ modelValue: boolean; label: string }`, emits `update:modelValue`; `role="switch"` + `aria-checked`; default slot rendered only when on.
- `SliderField` props `{ modelValue: number; label: string; min: number; max: number; unit?: string }`, emits `commit` on `change` (pointer up) of the range or on NumberField commit — never on `input`.

- [ ] **Step 1: Write failing tests**: `ColorField` swatch click emits `commit` once with that hex; editing hex then closing emits once; closing unchanged emits nothing; `NumberField` typing `12` emits nothing until Enter, then `[12]`; ArrowUp with Shift emits `+10*step`; out-of-range clamps to `max`; `SliderField` `input` events emit nothing, `change` emits once; `ToggleRow` hides slot when off.
- [ ] **Step 2: Run** `npx vitest run tests/unit/editor/inspector/controls.test.ts` — FAIL.
- [ ] **Step 3: Implement** the five controls, `styles.ts`, `themePalette.ts`; switch TextSection to `themePalette`.
- [ ] **Step 4: Run** the new test and `tests/unit/editor/inspector/TextSection.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat(frontend): shared inspector controls (colour, number, segment, toggle, slider)`

---

### Task 3: Selection kinds and `useSelectedElement`

**Files:**
- Modify: `frontend/src/slide-editor/toolbarKind.ts`
- Create: `frontend/src/slide-editor/useSelectedElement.ts`
- Modify: `frontend/src/components/editor/inspector/element/ImageSection.vue` (use `useSelectedElement` instead of its local `target`/`element`/`patch`; behaviour unchanged)
- Test: `frontend/tests/unit/slide-editor/toolbarKind.test.ts`, `frontend/tests/unit/slide-editor/useSelectedElement.test.ts`

**Interfaces:**
- `ToolbarKind = 'text' | 'list' | 'image' | 'icon' | 'shape' | 'line' | 'video' | 'multi' | 'generic'`. Element kind: `text`→text, `text-list`→list, `image`→ video (placeholder) | icon (`is_icon || isIcon`) | image, `vector`→ `isOpenVector ? 'line' : 'shape'`. A component with one element takes its kind (as today).
- `selectionLabel` adds "List", "Icon", "Shape", "Line".
- `useSelectedElement(ctx: SlideEditing)` returns `{ target: ComputedRef<ElementSelection|null>; element: ComputedRef<RawElement|null>; patch(label: string, fn: (el: RawElement) => RawElement, at?: ElementSelection): void; capture(): ElementSelection | null }`. `patch` uses `at ?? target.value`, does `updateElementInUi`, then `useEditingActions(ctx).run(label, { ui, selection: ctx.selection.value })`; no-op if the element at `at` no longer exists. `capture()` returns the current target for deferred commits.
- Callers that must care: ElementTab (Task 4+) branches on the new kinds; `TextSection` must render for both `text` and `list`.

- [ ] **Step 1: Write failing tests**: `toolbarKind` for each kind, including a one-element component with an open vector (`'line'`), a closed vector (`'shape'`), an icon image, and a `text-list` (`'list'`); `selectionLabel` returns "Line"/"Icon"; `useSelectedElement.patch` with a captured `at` patches that element even after `ctx.selection` changed to another component; patch on a deleted target does not call `commit`.
- [ ] **Step 2: Run** both test files — FAIL.
- [ ] **Step 3: Implement**; update `ElementTab.vue` so `kind === 'text' || kind === 'list'` shows TextSection and `kind === 'icon'` shows nothing yet (IconSection lands in Task 5). Refactor ImageSection onto the composable.
- [ ] **Step 4: Run** the new tests plus `tests/unit/editor/inspector/` — PASS.
- [ ] **Step 5: Commit** `feat(frontend): shape, line, icon and list selection kinds`

---

### Task 4: Shape and Line sections

**Files:**
- Create: `frontend/src/components/editor/inspector/element/ShapeSection.vue`, `LineSection.vue`, `MarkerGlyph.vue` (small inline SVG per `VectorMarker`)
- Modify: `frontend/src/components/editor/inspector/element/ElementTab.vue` (pass `presentation`; render by kind)
- Test: `frontend/tests/unit/editor/inspector/ShapeSection.test.ts`, `LineSection.test.ts`

**Interfaces:**
- Consumes: Task 1 setters/readers, Task 2 controls, Task 3 `useSelectedElement`, `themePalette`.
- Props for both: `{ presentation: Presentation }`.
- ShapeSection layout: `ToggleRow "Fill"` → ColorField + SliderField "Opacity" (0–100 %, stored 0–1); `ToggleRow "Stroke"` → ColorField, NumberField "Width" (min 0, max 40, step 0.5, unit px), SegmentedControl "Dash" (Solid/Dashed/Dotted); NumberField "Corner radius" only if `canRoundCorners` (min 0, max `maxRadius`); SegmentedControl "Curve" (Sharp/Smooth). Turning Fill on writes the last fill seen this session for this element (kept in a component-local ref) else `DEFAULT_FILL`; same for Stroke.
- LineSection: ColorField "Colour", NumberField "Width", Dash segment, two selects "Start" / "End" (listbox popovers showing `MarkerGlyph` + label), button "Swap ends" (`ArrowLeftRight` icon). Line ends commit as label "Line ends".
- Each ColorField/NumberField captures `useSelectedElement().capture()` on open/focus and patches with that `at`.

- [ ] **Step 1: Write failing tests** (mount like `ImageSection.test.ts`, new fixtures `uiWithShape()` and `uiWithLine()` added to `tests/unit/slide-editor/fixtures.ts`):
  - toggling Fill off commits `fill: null` with label "Fill" (assert `ctx.commit` called once);
  - picking a palette swatch commits that colour;
  - Width NumberField Enter `4` with dashed stroke commits `dash: [12, 8]`;
  - Corner radius field absent for a 3-point polygon;
  - LineSection: choosing End = "Filled arrow" commits `end_marker: 'triangle'`; Swap ends commits swapped markers;
  - **Review Focus 2**: open the stroke ColorField, set `ctx.selection` to another component, pick a swatch → the original shape is patched, the other is untouched.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** both sections and ElementTab wiring (`shape` → ShapeSection, `line` → LineSection).
- [ ] **Step 4: Run** — PASS; `npm run check` green.
- [ ] **Step 5: Commit** `feat(frontend): shape and line sections in the Element tab`

---

### Task 5: Icon section and icon picker

**Files:**
- Create: `frontend/src/api/icons.ts`, `frontend/src/components/editor/inspector/element/IconSection.vue`, `frontend/src/components/editor/inspector/element/IconPickerDialog.vue`
- Modify: `ElementTab.vue` (`icon` → IconSection)
- Test: `frontend/tests/unit/api/icons.test.ts`, `frontend/tests/unit/editor/inspector/IconSection.test.ts`

**Interfaces:**
- `searchIcons(params: { query: string; limit?: number; icon_weight: IconWeight }, signal?: AbortSignal): Promise<string[]>` → `GET /api/v1/ppt/icons/search?query=…&limit=40&icon_weight=…` via the existing `api/client.ts` helper (follow `api/images.ts`).
- `replaceIconWeightInUrl(url: string, weight: IconWeight): string` — port from `servers/nextjs/components/slide-editor/images/IconsEditor.tsx` into `api/icons.ts`.
- IconSection: preview (`resolveAssetUrl(element.data)` as mask with `element.color`), ColorField "Colour" (label "Icon colour"), button "Change icon" opening IconPickerDialog. Initial weight = element `icon_type` ?? `'bold'`.
- IconPickerDialog props `{ open: boolean; currentUrl: string | null; weight: IconWeight }`, emits `update:open`, `pick: [url: string, weight: IconWeight]`. Search input debounced 300 ms; weight SegmentedControl; grid of results; Replace button disabled until one is selected. States: loading, empty (`No icons for "{query}"`), error (inline message + Retry). Each search increments a request id; stale responses are dropped.
- IconSection captures the target when the dialog opens and calls `patch('Change icon', el => setIcon(el, url, weight), captured)`; if the captured element is gone, `toast.error('The icon was removed from the slide.')` (use the app's existing toast helper) and no commit.

- [ ] **Step 1: Write failing tests**: `searchIcons` builds the query string above; `replaceIconWeightInUrl('/static/icons/bold/x-bold.png','light')` → `'/static/icons/light/x-light.png'`; IconSection colour swatch commits "Icon colour"; picking an icon commits `data` + `icon_type`; **Review Focus 5**: resolve a search after the dialog closed → no state error, no commit; picking after the element was deleted (`ui` replaced without it) → no commit; two overlapping searches → only the later results render.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(frontend): icon colour and icon picker in the Element tab`

---

### Task 6: List marker and Appearance sections

**Files:**
- Create: `frontend/src/components/editor/inspector/element/ListSection.vue`, `AppearanceSection.vue`
- Create: `frontend/src/slide-editor/appearanceTarget.ts`
- Modify: `ElementTab.vue` (order: kind section(s) → Appearance (single selection only) → Arrange → Order → LayerChildren)
- Test: `frontend/tests/unit/slide-editor/appearanceTarget.test.ts`, `frontend/tests/unit/editor/inspector/AppearanceSection.test.ts`, `ListSection.test.ts`

**Interfaces:**
- `appearanceTargets(ui: RawUi, sel: Selection): { rotation: { kind: 'component'; componentIndex: number } | ElementSelection; style: { kind: 'component'; componentIndex: number } | ElementSelection } | null` — component selection: rotation → the component; style → its single element when it has exactly one, else the component. Element selection: both → the element. Multi/null → null.
- `readRotation(ui, target)`, `setRotationInUi(ui, target, deg): RawUi` (writes `normalizeRotation(deg)`), `patchAppearanceInUi(ui, target, fn): RawUi` (uses `updateComponentInUi` or `updateElementInUi`).
- ListSection: SegmentedControl "Marker" (Bullet / Number / None) → `setListMarker`, label "List marker".
- AppearanceSection: NumberField "Rotation" (unit °, step 1, no min/max — normalised on commit) with −90°/+90° buttons (`RotateCcw` / `RotateCw`); two toggle buttons Flip H / Flip V (`FlipHorizontal2` / `FlipVertical2`, `aria-pressed`); SliderField "Opacity" (0–100 %); ToggleRow "Shadow" → ColorField, NumberField Blur (0–100), X, Y (−100–100), SliderField Opacity. Commits use `run(label, { ui: next, selection })` with the Global labels.

- [ ] **Step 1: Write failing tests**: `appearanceTargets` for a one-element component (rotation→component, style→element), a two-element group (both → component for style), an element selection; AppearanceSection typing `270` + Enter commits `component.rotation === -90`; +90 button from 135 commits `-135`; Flip H commits `flip_h: true` on the element; Shadow on writes `DEFAULT_SHADOW`; multi-selection renders no Appearance section (ElementTab test); ListSection Number commits `marker: 'number'`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS; `npm run check` green.
- [ ] **Step 5: Commit** `feat(frontend): list marker and appearance sections`

---

### Task 7: Rotation geometry

**Files:**
- Create: `frontend/src/slide-editor/rotation.ts`
- Modify: `frontend/src/slide-editor/geometry.ts` (rotation-aware hit tests, `selectionFrames`)
- Modify: `frontend/src/slide-editor/model/template-v2-group.ts` — export `rotatedBox` (add to the header's change list)
- Test: `frontend/tests/unit/slide-editor/rotation.test.ts`, extend `tests/unit/slide-editor/geometry.test.ts`

**Interfaces:**
- `type Frame = { box: Box; rotation: number }` — `box` is the unrotated size placed so its centre is the on-screen centre; `rotation` in degrees.
- `rotatePoint(p: Point, center: Point, deg: number): Point`
- `selectionFrame(ui: RawUi, sel: ComponentSelection | ElementSelection): Frame | null` — matches the renderer: each level (component, then each group/container on `elementPath`, then the element) rotates about its own box centre, and `scaleX(-1)`/`scaleY(-1)` for `flip_h`/`flip_v` after the rotation, in the order of `transformStyle` in `render/legacy/lib/template-v2-json-to-html.ts`. Walk from the element outward: start with the element's absolute box centre and own rotation; for each ancestor (innermost first) map the centre through that ancestor's transform about the ancestor's centre and add (or, under an odd ancestor flip, negate) the angle. Ancestor boxes come from `absoluteBoxForSelection` on the path prefixes.
- `selectionFrames(ui, sel): Frame[]` (replaces `selectionBoxes` for the overlay; multi → one frame per component; keep `selectionBoxes` exported for existing callers).
- `pointInFrame(frame: Frame, p: Point): boolean`
- `geometry.ts`: `hitComponent` and `deepestIn` test with `pointInFrame(selectionFrame(...), p)` instead of `contains(box, p)`.
- `aabb(frame: Frame): Box` (= `rotatedBox`).
- `rotatedResizeShift(source: Box, next: Box, handle: Handle, rotation: number): Point` — the translation that keeps the handle opposite `handle` fixed on screen: with `a` = the opposite handle point of `source` (unchanged in `next` by `resizedBox`), `c = centre(source)`, `c' = centre(next)`: `shift = (c - c') - R(rotation)(c - c')`.

- [ ] **Step 1: Write failing tests**:
  - `rotatePoint({x:10,y:0},{x:0,y:0},90)` ≈ `{x:0,y:10}`;
  - a 200×100 component at (100,100) rotated 90°: `pointInFrame` is true at its centre and at (200, 60) (inside the rotated shape), false at (110, 110) (an AABB corner of the unrotated box that the rotated one leaves);
  - **Review Focus 1**: a child element at local (0,0) size 50×50 inside a 200×100 component at (0,0) rotated 90°: the frame centre equals `rotatePoint({x:25,y:25},{x:100,y:50},90)` (= `{x:125,y:-25}`), its box is 50×50, and `rotation === 90`;
  - nested angles add: element 30° in component 45° → 75°; flipped parent negates the child's angle;
  - `hitComponent` on a rotated component misses an AABB corner and hits inside;
  - `rotatedResizeShift`: for rotation 0, 30, 90, −135 and handle `se`, the screen position of the `nw` corner (via `rotatePoint` about each box's centre) is equal before and after `translate(next, shift)` within 1e-6.
- [ ] **Step 2: Run** `npx vitest run tests/unit/slide-editor/rotation.test.ts tests/unit/slide-editor/geometry.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS (existing geometry tests must stay green: unrotated frames equal the old boxes).
- [ ] **Step 5: Commit** `feat(frontend): rotation-aware selection frames and hit-testing`

---

### Task 8: Rotated overlay, resize and the rotate handle

**Files:**
- Modify: `frontend/src/components/editor/canvas/SelectionOverlay.vue`
- Modify: `frontend/src/components/editor/canvas/gestures.ts` (`applyResize` rotation correction; `planMove` snaps the AABB)
- Modify: `frontend/src/slide-editor/ops.ts` (+ `rotateSelection`)
- Modify: `frontend/src/components/editor/canvas/InlineTextEditor.vue` (rotate with its frame)
- Test: extend `tests/unit/editor/canvas/SelectionOverlay.test.ts`, `tests/unit/slide-editor/ops.test.ts`, add `tests/unit/editor/canvas/gestures.test.ts` cases (create the file if absent)

**Interfaces:**
- Consumes: Task 7 (`selectionFrame(s)`, `rotatePoint`, `aabb`, `rotatedResizeShift`), Task 6 (`appearanceTargets`, `setRotationInUi`, `normalizeRotation`).
- `rotateSelection(ui: RawUi, sel: Selection, deg: number): OpResult` — null for multi/null; else `{ ui: setRotationInUi(ui, appearanceTargets(ui, sel)!.rotation, deg), selection: sel }`.
- `canRotate(ui, sel): boolean` — single component selection, not a video placeholder layer, and (for elements) not `isLayoutManagedElement`. Handle shows only for `sel.kind === 'component'` and `canRotate`.
- `applyResize(ui, sel, handle, delta, keepRatio)` keeps its signature. When the target's own rotation `θ ≠ 0`: rotate `delta` by `−θ` before the existing maths, then translate the result's `position` by `rotatedResizeShift(sourceBox, nextBox, handle, θ)`.
- `planMove`: when a component has rotation, its snap box is `aabb(frame)`.
- Overlay rendering: each selection/hover box is drawn from its frame with `transform: rotate(<rotation>deg)` (origin centre); handles are children of the selection box element so they rotate with it; handle cursors use the rotated direction (`HANDLE_CURSOR` indexed by `(handleAngle + rotation)` rounded to 45°).
- Rotate handle: `data-rotate-handle`, `aria-label="Rotate"`, 24 screen px below the bottom-centre on a 1px stem, inside the rotated box. Gesture `{ type: 'rotate', slideId, pointerId, ui, sel, center: Point (slide px, frame centre), startAngle: number, startRotation: number, angle: number, layers: HTMLElement[] }`. Move: `angle = normalizeRotation(startRotation + atan2deg(p - center) - startAngle)`, Shift snaps to 15°; preview sets `layer.style.transform = rotate(<angle - startRotation>deg)` on the component's `canvas.layerFor(...)` layer (its transform-origin is already the item's centre) and rotates the overlay frame by the same delta; a badge `data-rotate-badge` shows `${Math.round(angle)}°`. Release commits `rotateSelection(g.ui, g.sel, angle)` via `editing.commit(result.ui, 'Rotate')` only if the angle changed. Esc (keydown on window while rotating) and pointercancel cancel and clear the preview transform. Slide change mid-gesture cancels, as for move.
- InlineTextEditor: wrap its positioned box with `transform: rotate(frame.rotation deg)`, `transform-origin: center`, using `selectionFrame` of the edited element.

- [ ] **Step 1: Write failing tests**:
  - overlay: a 30°-rotated component's `[data-selection-box]` style contains `rotate(30deg)`;
  - rotate handle visible for a component selection, absent for multi, element and layout-managed selections (**Review Focus 4**);
  - dragging the handle 90° around the centre and releasing calls `commit` once with `component.rotation ≈ 90` and label "Rotate"; Shift snaps 37°→ 30°; Escape mid-drag commits nothing and clears the layer transform;
  - **Review Focus 3**: start at 170°, drag the pointer 20° further → committed `-170`, and the badge never shows a value outside (−180, 180];
  - `applyResize` on a 45°-rotated component dragging `se` by (50, 0): the `nw` corner's screen point is unchanged (use `rotatePoint` on the before/after frames);
  - `rotateSelection` writes `component.rotation` for a component selection and `element.rotation` for an element selection.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check` — green; also `npm run test:golden` (renderer untouched, must stay green).
- [ ] **Step 5: Commit** `feat(frontend): rotate handle and rotation-aware selection overlay`

---

### Task 9: End-to-end tests

**Files:**
- Create: `frontend/tests/e2e/fixtures/visual-presentation.json` — copy of `editable-presentation.json` with one slide whose components are: `shape` (closed 4-point vector, fill `#3366FF`, at (100,100) 200×120), `arrow` (open 2-point vector, stroke, at (450,150)), `icon` (image `is_icon: true`, `data: '/static/icons/bold/star-bold.png'`, `color: '#000000'`, at (800,100) 64×64), `bullets` (`text-list`, at (100,400) 400×160, three items), `photo` as in the editable fixture.
- Modify: `frontend/tests/e2e/mocked.spec.ts` — `editableApi(page, overrides, deck = editableDeck)` gains the deck parameter; add a mock for `**/api/v1/ppt/icons/search**` returning two URLs; add `test.describe('visual element editing (mocked)')`.
- Modify: `frontend/tests/e2e/live.spec.ts` — one live test: rotate a shape with the handle, reload, angle persisted; change a shape fill, reload, persisted; restore the deck exactly afterwards as the existing live editing test does.

**Tests (mocked), each asserting the last PATCH and `unexpected` empty:**
- rotate the shape via the handle by ~90°, reload: `component(patches,'shape').rotation` ≈ 90; Ctrl+Z restores 0;
- after rotation, clicking inside the rotated shape selects it; clicking an AABB corner the rotated shape left empty does not;
- resize the rotated shape from a corner: the opposite corner's screen point (read from `[data-selection-box]` bounding rect corners) stays within 2px;
- Shape: Fill off then on and a palette colour; Stroke width 4 + Dashed → `stroke.dash` `[12, 8]`;
- Line: End = Filled arrow, Swap ends;
- Icon: colour swatch; Change icon → search "star" → pick second result → `data` is that URL;
- Bullets: Marker Number → `marker: 'number'`;
- Appearance: Opacity 50 % → `opacity: 0.5`; Shadow on → `shadow` equals the default.

- [ ] **Step 1: Write the tests and fixture.**
- [ ] **Step 2: Run** `npx playwright test tests/e2e/mocked.spec.ts -g "visual element editing"` — all PASS (features exist from Tasks 1–8; any failure is a bug to fix in the owning task's files).
- [ ] **Step 3: Run** the whole mocked suite `npx playwright test tests/e2e/mocked.spec.ts` — PASS (the deck parameter must not change earlier tests).
- [ ] **Step 4: Run** the live suite against the stack (`docker compose up production` + `docker compose -f docker-compose.frontend.yml up`): `npx playwright test tests/e2e/live.spec.ts` — PASS, or report it as not run if the stack is unavailable.
- [ ] **Step 5: Commit** `test(frontend): e2e for visual element editing and rotation`
