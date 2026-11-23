# Light theme with theme selector (frontend) — short design

## Intent
Add a light version of the Aera look to `frontend/` and a Dark / Light / System selector. Same style (pale-blue accent, layered surfaces, soft borders, glass), lightness inverted. Dark must stay pixel-identical.

## Goals / non-goals / anti-goals
- Goals: light palette; selector; no flash on load; Sonner follows theme.
- Non-goals: backend/account-synced preference; changing slide rendering (`src/render`, `slide-editor`); smart-slide features.
- Anti-goals: any visual change in dark; filter-based inversion; per-class `light:` duplication.

## Approaches
1. **Tokens + codemod (chosen).** Hex values in `.vue`/CSS map to semantic tokens; `:root` = dark, `.light` overrides. 2. `light:` variants on every class (rejected: doubles markup, drifts). 3. CSS filter invert (rejected: distorts accent/images).

## Design
- `tokens.css`: add missing tokens for one-off hexes; `.light` block overrides surface/text/line/accent-ink tokens; `color-scheme` per theme.
- `base.css`/glass utilities/kbd/scrollbar/`::selection` read tokens.
- Codemod script maps known hex → token classes across `src/` (excluding `render/`, `slide-editor/`); leftovers grouped into new tokens by hand.
- `useTheme` composable: `theme` ∈ dark|light|system, `localStorage` (try/catch), `matchMedia` listener, toggles `.light`/`.dark` on `<html>`; inline script in `index.html` applies it before paint.
- Settings: segmented Dark/Light/System control. Optional quick toggle in shell (builder's call).
- `Sonner.vue` theme bound to resolved theme.
- Verify: typecheck/build + screenshots of library, new wizard, editor, settings, present in both themes.

## Left to the builder
Exact light palette values (derive from accent `#bee3f3`; check contrast), token naming for leftover hexes, quick-toggle placement.
