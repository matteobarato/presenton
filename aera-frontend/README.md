# Aera — Presentation Studio

This export includes the Vue 3 and TypeScript source and a ready-to-serve build in `dist/`.

## Run the editor locally

Use Node.js 22 or later. From this folder:

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. Run `npm run build` to regenerate `dist/`, and `npm run preview` to preview the build after installing dependencies.

## Serve the built frontend

Serve `dist/` as the root of a static HTTP site. For a local preview without installing npm dependencies, use Python 3:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:4173. Use a web server so the browser can resolve scripts and assets.

This is an interactive frontend mockup. AI, collaboration, and connected presentation apps are simulated. Deck and profile edits are stored in the browser. Use the editor's editable deck export to transfer an existing deck to a new browser or origin.

See ASSETS.md for asset sources and public/fonts/ for the font licenses.
