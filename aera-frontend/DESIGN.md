---
name: Aera Studio
description: A dark presentation studio with pale blue controls and an editorial slide canvas.
colors:
  accent: "#bee3f3"
  accent-ink: "#1b333e"
  accent-hover: "#d4eef9"
  rail: "#101213"
  shell: "#151819"
  canvas: "#181c1e"
  storyboard: "#1b1e20"
  inspector: "#1d2123"
  text: "#e9ebec"
  muted: "#989fa5"
  secondary: "#2c3236"
  secondary-text: "#e5eaec"
  secondary-hover: "#363e43"
  field: "#272d30"
  dialog: "#22292d"
  glacier-paper: "#f0f2ee"
  glacier-ink: "#203332"
  glacier-accent: "#b9dfe9"
  nocturne-paper: "#242a35"
  nocturne-ink: "#f0efe8"
  nocturne-accent: "#c8c7eb"
  sage-paper: "#dbe3d8"
  sage-ink: "#243a2c"
  sage-accent: "#9ab399"
  terra-paper: "#e9ddd1"
  terra-ink: "#482e24"
  terra-accent: "#cb987e"
typography:
  display:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "calc(7.1cqw * var(--text-scale))"
    fontWeight: 500
    lineHeight: 1.035
    letterSpacing: "-.04em"
  headline:
    fontFamily: "Manrope, sans-serif"
    fontSize: "34px"
    fontWeight: 500
    lineHeight: 1.22
    letterSpacing: "-.04em"
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "19px"
    fontWeight: 500
    letterSpacing: "-.04em"
  body:
    fontFamily: "Manrope, sans-serif"
    fontSize: "11px"
    lineHeight: 1.75
  label:
    fontFamily: "Manrope, sans-serif"
    fontSize: "10px"
    fontWeight: 500
  button:
    fontFamily: "Manrope, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "-.01em"
rounded:
  control: "7px"
  button: "9px"
  card: "12px"
  toolbar: "13px"
  prompt: "14px"
  panel: "16px"
  dialog: "20px"
spacing:
  compact: "8px"
  control: "12px"
  panel: "16px"
  section: "20px"
  generous: "24px"
  dialog: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "0 14px"
    height: "37px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-text}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "0 14px"
    height: "37px"
  button-secondary-hover:
    backgroundColor: "{colors.secondary-hover}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "#d4dadd"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "0 14px"
    height: "37px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "0 14px"
    height: "37px"
  search-input:
    backgroundColor: "#242d32"
    textColor: "#d4e3eb"
    rounded: "8px"
    padding: "0 11px"
    height: "35px"
  rail-nav:
    backgroundColor: "transparent"
    textColor: "#9aa3a8"
    rounded: "11px"
    padding: "12px 0"
  suggestion-chip:
    backgroundColor: "#25323bee"
    textColor: "#c1d4df"
    rounded: "{rounded.control}"
    padding: "7px 10px"
  canvas-card:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.panel}"
  floating-tools:
    backgroundColor: "#282f32e8"
    rounded: "{rounded.toolbar}"
    padding: "6px"
  floating-prompt:
    rounded: "{rounded.prompt}"
    padding: "8px 7px 8px 12px"
    width: "min(560px, calc(100% + 12px))"
---

# Design System: Aera Studio

## Overview

**Creative North Star: "The Dark Creative Studio"**

Aera is a calm, layered editing environment shaped by the approved dark studio reference. Charcoal surfaces, rounded panels, pale blue actions, and translucent floating controls hold the interface together. The slides supply the broad fields of color, large typography, and landscape photography.

The current Vue interface uses shadcn-vue-style button, dialog, and slider wrappers over Reka UI. Manrope carries the editing controls; DM Sans carries the default slide art. The composition gives the slide a dedicated card, with a compact floating tool group inside its top edge and an optional AI prompt over it.

**Key Characteristics:**

- Charcoal tonal layers with restrained borders.
- Pale blue for primary action, focus, and selection.
- Editorial slide art that scales proportionally across views.
- Floating glass tools and an AI input that does not reflow the canvas.

This record is derived from `src/style.css`, `src/App.vue`, the shared UI components, `src/components/SlideCanvas.vue`, `src/lib/deck.ts`, and locally declared fonts. Responsive and keyboard behavior below describes the implementation; mobile and runtime QA are not asserted. The available desktop screenshot predates the latest floating toolbar and AI overlay revision.

## Colors

Cool blue controls sit above a charcoal interface; slide themes introduce pale stone, night blue, sage, and clay.

### Primary

- **Studio ice** (`accent`): primary buttons, selected thumbnails, theme selection, and keyboard focus.
- **Deep blue ink** (`accent-ink`): text on pale primary controls. Slide closing cards compute their own contrasting ink from the selected accent.
- **Hover ice** (`accent-hover`): the primary action hover surface.

### Secondary

The four slide themes are independently selectable palettes from `src/lib/deck.ts`. Each has a paper, ink, and accent token family: **Glacier**, **Nocturne**, **Sage**, and **Terra**. Statement slides invert paper and ink; closing slides use the selected accent as the full surface. Image slides use their own photograph treatment and light text. These are slide content palettes, not interchangeable studio chrome.

### Neutral

- **Rail, shell, canvas, storyboard, inspector:** successive dark surfaces establish spatial regions without heavy outlines.
- **Text and muted:** foreground hierarchy for primary copy and secondary controls.
- **Secondary and field:** raised buttons and form surfaces.
- **Dialog:** the modal surface above the dimmed studio.

**The Selection Accent Rule.** Use the studio accent for primary action, keyboard focus, and selected controls. Slide theme accents belong to the slide artwork.

## Typography

**Display Font:** DM Sans with sans-serif fallback, locally provided at weights 400–700.

**Body Font:** Manrope with sans-serif fallback, locally provided at weights 400–700.

The slide is large, tightly spaced, and editorial. Interface type is compact with quiet weight changes. The font control also permits Manrope and Georgia within the authored slide; these options do not change the studio typeface.

### Hierarchy

- **Display:** the frontmatter records the default cover heading. Statement, pillar, quote, image, and closing layouts vary the container-relative size while preserving the same proportional system.
- **Headline:** workspace page headings use the headline token and become smaller at compact breakpoints.
- **Title:** the inspector introduction uses the title token; dialog titles use a separate observed size (23px) and line height (1.25).
- **Body:** the body token describes assistant prose; notes and other dense helper text have local treatments.
- **Label and button:** label tokens describe inspector section labels; button tokens describe the reusable default button.

**The Proportional Slide Rule.** Keep slide typography and artwork in container-relative units so the same composition serves thumbnails, editing, presentation, and print.

Not canonized: the implementation contains several very small helper labels and compact-breakpoint controls, including sizes below 9px. These are inherited density and legibility limitations, not a recommended new type scale. Decorative sample-slide captions and slogans are content, not a reusable eyebrow style.

## Layout

The application fills the dynamic viewport and keeps the editor's panels independently constrained. The desktop rail is 76px; the document bar is 83px; the editor grid uses 180px, a flexible center, and 260px columns with a 12px gap. At 1600px and above, the side columns become 210px and 280px and gaps become 16px. At 1279px and below, side columns narrow to 160px and 240px.

The center workspace is transparent. A centered floating button group sits inside the top of the canvas card, removing the separate toolbar row and gutter. The stage uses an 8px horizontal perimeter, with 62px of top clearance for the tools. Slide details, zoom, and options share one compact bottom row. Speaker notes start collapsed and remain available through a labeled toggle. The slide preserves a 16:9 ratio; its fit uses both container width and container height, multiplied by the user's zoom. Overflow remains scrollable when zoomed.

The inspector becomes a fixed drawer at 1050px and below. The storyboard becomes a fixed drawer at 760px and below; the rail narrows to 56px. Source logic manages drawer entry focus, tab cycling, background inertness, Escape, and focus restoration. At 450px and below, control spacing compresses further. A separate short-height rule applies at 780px and below when the viewport is at least 1051px wide. These are source-observed breakpoints, not verified mobile results.

The AI region is hidden initially and anchored 16px above the slide bottom. Its width is capped by both the canvas and viewport. It has no reserved layout height. At mobile breakpoints, its width, bottom offset, and chip spacing adapt; the toolbar remains inside the card top.

## Elevation & Depth

Depth combines tonal panels, delicate translucent borders, soft shadows, and selective backdrop blur. The stage uses a sparse dot field. The floating toolbar has an 18px blur; the AI command surface has a 20px blur; suggestion backplates have a 12px blur. Dialog overlays use a 9px blur.

### Shadow Vocabulary

- **Slide:** `0 18px 38px #0004` separates the authored slide from the work surface.
- **Floating tools:** `0 6px 18px #0003` lifts the inset tool group.
- **Floating prompt:** `0 12px 28px #0005` keeps AI input readable over slide art.
- **Suggestion chip:** `0 4px 10px #0002` gives the translucent suggestions their own backplates.
- **Dialog:** `0 30px 100px #0008` supports the modal layer.
- **Drawer:** `0 20px 50px #0005` separates responsive panels from the editor.

**The Floating Tools Rule.** Keep the tool group inside the top of the canvas card, with compact clearance and no separate gutter. Opening the AI input overlays the slide without consuming canvas layout height.

## Shapes

Controls use small rounded rectangles; panels use broader corners. The floating tool group sits between control and panel scales. Circular forms are reserved for swatches, selection marks, avatars, and a few icon affordances. Thin low-opacity strokes define form fields and selection without turning every panel into a bordered card.

The main slide clips to gently rounded corners. The slide artwork itself also uses circles, elliptical orbit lines, and the arched photograph in the quote layout; these are valid materials of the slide world, not general prohibitions on decorative geometry.

## Components

### Buttons

The reusable button wrapper exposes primary, secondary, outline, ghost, and destructive variants, plus default, small, and icon sizes. The primary, secondary, outline, and ghost variants are used in current flows. Primary hover lightens and adds a diffuse shadow; pressing it moves it down by 1px. Other variants use tonal hover changes. Global focus is an accent outline (2px) offset by 3px; disabled controls use reduced opacity.

### Chips

AI suggestions are action buttons on individual translucent dark backplates. They wrap, retain a rounded control shape, and brighten on hover. They appear with the optional AI region rather than as a permanent row under the slide.

### Cards / Containers

The canvas card and side panels have the broad panel radius. Reusable deck previews clip the shared slide artwork with the card radius and rise slightly on hover. Modal cards use the dialog radius, a thin blue-tinted stroke, and a constrained scrollable height.

### Inputs / Fields

Search is a compact raised field with a leading SVG icon. Select controls use a dark field surface and a thin translucent border. The new-presentation textarea is a larger rounded field. The floating prompt combines input, submit, and close controls in one glass surface; focus-within strengthens the frame. Text editing on the slide uses local hover and focus outlines.

### Navigation

The left rail groups SVG icons with text. Its active state uses a blue charcoal surface and pale blue foreground. The inspector uses Reka UI tabs with a raised active tab. Responsive drawers preserve the same component language rather than creating a different navigation theme.

### Floating tools and AI input

Text, image, shape, and Ask Aera controls share a compact floating group inside the canvas card. Ask Aera exposes its expanded state, opens and focuses the prompt, and restores focus when closed. The prompt closes with its close control, Escape, or submission. Submitted actions are simulated AI previews, as labeled in the interface.

The AI panel enters and exits through opacity (180ms), vertical movement (220ms), and blur (180ms), using the shared easing curve. Slide changes use a small rise and fade; presentation changes use a larger rise and restrained blur. Buttons generally transition over 180ms. The operating-system reduced-motion rule disables transitions and animations; the presentation motion switch also disables its local effects.

### Slide artwork

One shared component drives all slide views. Theme, font, scale, accent, and layout are data-controlled. The cover combines an editorial heading with a landscape crop; other built-in slide kinds use statement, pillars, photograph, quote, and closing arrangements. Closing-slide foreground is selected dynamically for contrast with the custom accent.

## Do's and Don'ts

### Do:

- **Do** keep the inset floating toolbar and optional AI overlay in the editor composition.
- **Do** use the shared slide component for canvas, thumbnails, overview, presentation, and print.
- **Do** pair dark surface layers with visible focus and selected states.
- **Do** preserve system reduced-motion preferences and the presentation motion switch.
- **Do** distinguish the fixed studio palette from the four editable slide themes.

### Don't:

- **Don't** add permanent vertical space for the optional AI input.
- **Don't** use a slide theme accent as a replacement for the studio accent.
- **Don't** claim mobile or interactive runtime verification from source inspection.

## Motion studio

The right sidebar’s Motion tab contains the show/hide timeline control. Design's “Open motion studio” action or Cmd/Ctrl+K also opens the motion workspace. The central toolbar has no separate motion toggle. The dock now contains only playback, tracks, and scrubbing. Element authoring lives in the right sidebar’s Motion tab. Selecting a track or clip synchronizes the selected element and entrance/exit phase with that tab, and opens the inspector when collapsed. The searchable sidebar palette has separate entrance and exit phases, with dissolve, rise, drift, scale, wipe, turn, and no effect. Presets set a complete eight-second sequence; four tracks address the headline, supporting text, visual group, and brand mark. Blue entrance clips and lavender exit clips retain text labels. Dragging or arrow keys adjust start time; numeric fields control timing and duration, with linear, smooth, or snappy easing. Timing constraints prevent exits preceding entrances.

Play, pause, reset, loop, and scrubbing preview animation directly on the editor slide. Closing the dock restores the idle slide and its full editing space; the right sidebar remains independently collapsible. Timing, duration, easing, and sequence presets are also in the sidebar. These are browser-local mockup previews, not PowerPoint/Slides animation export or live AI generation. Motion settings are persisted with each slide and participate in undo, redo, duplication, and local deck import/export. Idle slides and thumbnails remain static. Reduced-motion preferences retain opacity feedback while removing translation, scale, rotation, and masks. Playback pauses when the document becomes hidden. Build, data-boundary, and Vue render checks passed; browser interaction and responsive visual QA remain unverified because the managed preview daemon is unavailable.
