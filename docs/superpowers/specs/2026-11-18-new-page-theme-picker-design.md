# Theme picker on the New presentation page

## Intent
Let the user pick a colour theme before generating, so a new deck opens already in their palette instead of being recoloured in the editor afterwards. No AI: themes are plain colour sets (user's explicit preference).

## Approaches
- **A — theme field on `/presentation/prepare`.** One request; needs a backend change.
- **B — frontend only (chosen).** After prepare succeeds, call the same `updatePresentation({ theme })` the editor's Design tab uses.
- **C — apply on editor first load via `?theme=`.** Dropped: races streaming, re-applies on refresh.

## Design
- **New page, template step:** a "Theme" row under the template selector. First swatch "Template colours" (default; nothing applied), then saved themes as `ThemeSwatch` cards (from `listThemes`).
  - Our call: no create/edit/generate controls here; theme authoring stays in the editor.
  - Selection persists as `?theme=<id>` alongside `?template=` and is carried to the Outline page.
- **Outline page:** shows the chosen theme next to the template summary; "Change" opens the same swatch grid.
  - On Generate: `preparePresentation` → if a theme is chosen, `updatePresentation({ id, theme })` → navigate to the editor.
  - If the theme update fails, still navigate, with a toast: "Couldn't apply theme — set it in Design".
- **Reuse:** `ThemeSwatch` from `components/editor/inspector/` (import as-is or move to a shared location).

## Non-goals
- AI palette generation.
- Backend changes.
- Any change to `servers/nextjs`.

## Left to the builder
- Exact spacing/visuals, following the existing Aera look on these pages.
- Unit tests for the URL param and the extra call; update the mocked e2e spec.
