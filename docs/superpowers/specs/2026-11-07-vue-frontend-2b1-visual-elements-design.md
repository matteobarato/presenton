# Vue frontend — 2b-1: visual element editing and rotation

Date: 2026-11-07. Status: approved design, awaiting spec review.

## Goal

Give every visual element type in the new Vue frontend (`/frontend`) its own
editing controls in the inspector's Element tab, plus rotation on the canvas:

- **Shapes** (closed `vector`): fill, stroke, corners, curve.
- **Lines** (open `vector`): stroke, end markers.
- **Icons** (`image` with `is_icon`): colour, change icon.
- **Lists** (`text-list`): marker style.
- **Appearance** (every single selection): rotation, flip, opacity, shadow.
- **Rotation on the canvas**: a rotate handle, and a selection overlay,
  hit-testing and resize that respect rotation.

The remaining element editing is split into two more specs, each shippable
on its own:

- **2b-1 (this spec)**: visual elements, appearance and rotation. It also
  builds the shared inspector controls the next two specs reuse.
- **2b-2**: data elements (tables, charts).
- **2b-3**: structure (infographics, containers with flex/grid).

Constraints (from `CLAUDE.md` and earlier decisions): template-based slides
only, and smart slides get no editing. Do not modify `servers/nextjs`; port
code into `/frontend` as copies. Keep Aera design fidelity (extend
additively). Element controls live in the inspector's Element tab, not in
toolbars over the canvas.

## Scope

In scope:

1. **Shape section** (closed vector):
   - Fill: on/off, colour, opacity.
   - Stroke: on/off, colour, width, dash (solid / dashed / dotted).
   - Corners: radius, offered only for closed 4-point polygons
     (rectangles), capped at min(128, width/2, height/2) as in the old
     toolbar.
   - Curve: sharp / smooth.
2. **Line section** (open vector):
   - Stroke: as above.
   - Start and end marker, each one of: none, arrow, stealth, filled arrow
     (`triangle`), circle, square, diamond.
   - A swap-ends button.
3. **Icon section** (image with `is_icon`/`isIcon`):
   - Colour.
   - "Change icon", which opens an icon picker dialog with a search box and a
     weight segment (bold, duotone, fill, light, regular, thin).
   - Icons no longer get the Image section.
4. **List section** (`text-list`): TextSection as today, plus a Marker
   segment (bullet / number / none).
5. **Appearance section** (any single component or element selection,
   placed above Arrange):
   - Rotation: degrees field, plus −90° and +90° buttons.
   - Flip horizontal / flip vertical.
   - Opacity slider (0–100%).
   - Shadow: on/off, colour, blur, offset X/Y, opacity.
6. **Rotate handle** on a single component selection.
7. **Rotation-aware overlay**: selection and hover boxes, handles,
   hit-testing, resize and move all follow rotation.
8. **Shared controls**: `ColorField`, `NumberField`, `SegmentedControl`,
   `ToggleRow` (§2).

Out of scope:

- Tables and charts (2b-2).
- Infographics, and container/flex/grid controls (2b-3).
- Crop handles, vector point editing, and design variables (2c).
- Rotating a multi-selection, and a rotate handle for nested element
  selections (the Appearance field still rotates a nested element).
- Applying an icon weight to the whole presentation (an old-editor option).
- Gradients and image fills.
- The old toolbar's shape-type switch (polygon ↔ ellipse), "closed path"
  toggle, and curve tension/segment sliders. Smooth uses their defaults.

## Approach

Port and trim, as in 2a and Insert. Behaviour and defaults come from the old
editor:

| From `servers/nextjs/components/slide-editor/` | Use in `/frontend` |
|---|---|
| `shapes/ShapeToolbar.tsx` | Defaults (fill `#FFFFFF`/1, stroke `#1A1A1A`/1/1.5px, shadow `#000000` blur 10 opacity 0.18 offset 6/6), marker list, patch logic for fill/stroke/radius/markers/curve/shadow/opacity. The React UI is not ported, only the logic. |
| `toolbar/numericInput.ts` | Ported verbatim into `slide-editor/model/numericInput.ts`. |
| `toolbar/DeferredColorInput.tsx` | Rewritten as `ColorField.vue`: commits on close or blur, not on every input. |
| `images/IconsEditor.tsx` | Search logic (debounced query, `limit: 40`, weight, request-id race guard, `replaceIconWeightInUrl`) ported into `IconPickerDialog.vue` and `api/icons.ts`. |
| `text/BulletsToolbar.tsx` | `readMarker` and the marker patch. |
| `selection/SelectionTransformers.tsx`, `surface/nodes.tsx` | Rotate-handle placement (bottom centre) and rotation semantics (`component.rotation`). |

The patch logic lives in plain TS (`slide-editor/elementStyle.ts`) and is
unit-tested without Vue. The sections are thin views over it.

## 1. Selection kinds

`toolbarKind.ts` grows from `text | image | video | multi | generic` to:

```
text | list | image | icon | shape | line | video | multi | generic
```

- `list`: element type `text-list`. It still renders TextSection; the List
  section is added below it.
- `icon`: an image with `is_icon` or `isIcon`.
- `shape` / `line`: type `vector`. It is a `line` when it is a polygon
  (`shape` is not `ellipse`) with `closed === false`, as the old toolbar's
  `canUseLineMarkers`; see `isOpenVector` in §3. Otherwise it is a `shape`
  (`closed` defaults to true).
- A component with exactly one element takes that element's kind, as today.

`selectionLabel` gains "List", "Icon", "Shape" and "Line".

## 2. Shared inspector controls

Path: `frontend/src/components/editor/inspector/controls/`. They follow the
Aera inspector patterns already used by TextSection (`section`/`label`
classes, `bg-field`, `rounded-control`).

- **`ColorField.vue`**: a swatch button that opens a popover with the theme
  colours (from the deck theme, as TextSection does today), recent colours
  for this session, and a native colour input with a hex field. Props:
  `modelValue: string | null`, `allowNone?: boolean`. It emits `commit`
  only on pick or close, so one change is one undo step.
- **`NumberField.vue`**: a label, a numeric input and an optional unit,
  using the ported `numericInput` sanitising. It commits on Enter or blur,
  and on ArrowUp/ArrowDown (±1, or ±10 with Shift). Props: `min`, `max`,
  `step`, `unit`.
- **`SegmentedControl.vue`**: icon or text options, one pressed, with
  `aria-pressed`. It generalises the segment buttons in ImageSection.
- **`ToggleRow.vue`**: a section sub-header with an on/off switch. When off,
  the rows below it are hidden.
- **`SliderField.vue`**: a range input plus a NumberField, for opacity
  (0–100%). It commits on pointer up, not on every move.

TextSection and ImageSection are not rewritten onto these controls in this
spec. That waits until a later change touches them.

## 3. Style model: `slide-editor/elementStyle.ts`

These are pure functions over raw element records. Each returns the patched
element and preserves unknown fields.

- `readShapeStyle(el)` → `{ fill, stroke, radius, curve, shadow, opacity }`,
  with defaults applied and `fillEnabled`/`strokeEnabled` flags.
- `setFill(el, fill | null)`, `setStroke(el, stroke | null)`.
- `setDash(el, 'solid' | 'dashed' | 'dotted')`: new in this spec (the old
  toolbar had no dash control; `stroke.dash` is in the type and the renderer
  draws it as `stroke-dasharray`). Solid writes `dash: null`, dashed
  `[w*3, w*2]`, dotted `[w, w*1.5]` with `line_cap: 'round'`, where `w` is the
  stroke width; changing the width rescales an existing dash pattern.
- `setCornerRadius(el, r)`: writes `corner_radii: [r, r, r, r]`, as the old
  toolbar does.
- `setCurve(el, 'none' | 'smooth')`: smooth writes the old `curveForMode`
  result (`{ type: 'smooth', tension, segments }` with its normalised
  defaults); none writes `curve: null`.
- `setMarkers(el, start, end)` and `swapMarkers(el)`: the element's
  top-level `start_marker` / `end_marker` (`VectorMarker`), not the stroke's
  `StrokeMarker` fields.
- `isOpenVector(el)`.
- `setShadow(el, shadow | null)`, `setOpacity(el, 0..1)`.
- `setRotation(target, deg)`: normalised to (−180, 180]. `setFlip(target,
  axis)`.
- `readListMarker(el)` / `setListMarker(el, marker)`.
- `setIconColor(el, color)` and `setIcon(el, url, weight)`: writes `data` and
  `icon_type`, and keeps `color`.

**Where appearance writes:** for a component selection, rotation goes to
`component.rotation` (as the old editor and the ported `component-resize`
do). Opacity, flip and shadow go to the component's single element when it
has one, else to the component. For an element selection, everything goes
to the element.

## 4. Sections

Path: `frontend/src/components/editor/inspector/element/`.

| File | Shown for | Contents |
|---|---|---|
| `ShapeSection.vue` | `shape` | Fill toggle → ColorField + opacity; Stroke toggle → ColorField, width, dash segment; Corners NumberField (rectangles); Curve segment |
| `LineSection.vue` | `line` | Stroke ColorField, width, dash; Start / End marker selects with marker glyphs; swap-ends button |
| `IconSection.vue` | `icon` | Preview, ColorField, "Change icon" button → `IconPickerDialog` |
| `IconPickerDialog.vue` | | Search input (debounced 300ms), weight segment, grid of results (`limit: 40`), Replace button. Shows loading, empty and error states inline. |
| `ListSection.vue` | `list` | Marker segment (bullet / number / none) |
| `AppearanceSection.vue` | any single selection | Rotation NumberField (°) with −90/+90 buttons; flip H/V toggles; opacity SliderField; Shadow toggle → colour, blur, X, Y, opacity |

The order in ElementTab is: kind section(s) → Appearance → Arrange → Order →
Layer children. A multi-selection shows Arrange and Order only, as today.

`api/icons.ts`: `searchIcons({ query, limit, icon_weight })` →
`GET /api/v1/ppt/icons/search`, returning `string[]`.

## 5. Rotation on the canvas

### Handle

- A round handle 24 screen px below the bottom-centre of a single
  **component** selection, joined to the box by a short stem. It rotates
  with the selection. There is no handle on multi or nested element
  selections, or on smart or locked slides.
- **Drag**: the angle is `atan2` of the pointer around the box centre minus
  the angle at pointer-down, added to the start rotation. Shift snaps to
  15°. A badge next to the handle shows the angle (`37°`).
- **During the drag** the component's DOM wrapper (`data-hf-el`) gets an
  inline `transform: rotate(Δ)` about its centre on top of the rendered
  rotation, with no re-render, like the drag-move path in 2a. The overlay
  box rotates with it.
- **On release**: one commit, `component.rotation = normalised angle`,
  labelled "Rotate". Esc during the drag cancels it.
- The old editor's handle is at the bottom centre; we keep it there so the
  top edge stays free for the floating toolbar.

### Rotation-aware overlay (`geometry.ts`, `SelectionOverlay.vue`)

- **Boxes**: `selectionBoxes` returns `{ box, rotation }`. The overlay draws
  each box with `transform: rotate(rotation)` about its centre, and the
  handles sit on the rotated box. An element's effective rotation is its
  component's rotation plus its own, through every parent group.
- **Hit-testing**: before the box test, `hitTest` maps the pointer into each
  candidate's frame (an inverse rotation about the box centre). Clicks in the
  empty corners of a rotated bounding box therefore miss it.
- **Resize**: the pointer delta is rotated into the component's frame, the
  existing `component-resize` maths runs on the unrotated box, and the
  result is translated so that the handle opposite the dragged one stays
  fixed on screen. Shift keeps the aspect ratio, as before. The resize
  cursor follows the rotated handle direction (cursor chosen by the nearest
  45° step).
- **Move and guides**: moving is unchanged. Snapping uses the rotated
  component's axis-aligned bounding box (`rotatedBox`, already ported in
  `template-v2-group.ts`) against the guides.
- **Inline text editor**: on a rotated text component, the Tiptap overlay is
  rotated by the same transform, so the text stays in place while editing.

## 6. Data flow and errors

- Every control goes through the existing
  `actions.run(label, { ui, selection })` path, which gives one history
  command per change and the existing autosave. Labels: "Fill", "Stroke",
  "Corner radius", "Curve", "Line ends", "Icon colour", "Change icon",
  "List marker", "Rotate", "Flip", "Opacity", "Shadow".
- Colour, slider and number controls commit once per gesture (§2), never
  per keystroke or per pointer sample.
- Missing values show the old editor's defaults (§Approach). Turning fill or
  stroke off writes `null`; turning it on writes the default or the last
  value seen in this session.
- When the selection changes while a ColorField popover or NumberField is
  open, the pending value is committed to the element it was opened for
  (the target is captured at open), not to the new selection.
- An external `ui` change (chat, refetch) revalidates the selection, as in
  2a. An open IconPickerDialog stays open, and Replace no-ops with a toast if
  its element is gone.
- Icon search: on error, an inline message and a Retry button. Empty
  results show "No icons for "…"". Late responses are discarded with a
  request id.
- Gating: smart slides and `editor.locked` hide all sections and the rotate
  handle, as in 2a.

## 7. Testing

- **Unit (Vitest)**
  - `elementStyle.ts`: each setter on fixture elements; unknown fields kept;
    defaults when fields are absent; dash arrays scale with width; rotation
    normalisation; swap markers.
  - `toolbarKind`: every kind, including single-element components and open
    vs closed vectors.
  - `geometry.ts`: a rotated hit-test hits inside the shape and misses the
    AABB corners; nested rotation adds up.
  - Rotated resize: the opposite corner stays fixed at 0°, 30°, 90° and
    −135°.
  - Rotate drag: angle from pointer, 15° snap with Shift, Esc cancels.
  - `api/icons.ts` query building.
- **Component**: each section reads its element and emits the expected
  patch; ColorField commits once per pick; NumberField commits on
  Enter/blur only; IconPickerDialog races (a late response is ignored).
- **e2e (Playwright, mocked suite; live suite where marked)**
  - Rotate a shape with the handle, reload: the angle is kept (live).
  - Click inside a rotated shape selects it; a click in its AABB corner
    does not.
  - Resize a rotated shape: the opposite corner stays put.
  - Shape fill off/on and colour, stroke width and dash, persisted (live).
  - Line end markers and swap.
  - Icon colour; change icon via search (mocked endpoint).
  - List marker bullet → number.
  - Opacity and shadow; undo/redo of a rotation.
