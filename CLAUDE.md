# Presenton — project notes for Claude

## Frontend

- `frontend/` is the new Vue 3 + Vite + shadcn-vue + Tailwind v4 app that replaces `servers/nextjs` in phases. The phase 1 spec is `docs/superpowers/specs/2026-11-06-vue-frontend-phase1-design.md`. Do not modify `servers/nextjs` (the old frontend) as part of new-frontend work.
- **Template-based generation only.** The new frontend supports template-based presentation generation (outline → template → slides). Smart presentations (`generation_mode: "smart"`, `/api/v2/ppt/presentation/generate/smart*`, `slide/edit-html`) are out of scope: do not build UI or features for them. All future work is based on templates only.
- Existing smart slides in old decks may still render through `SlideView` (already built), but they get no smart-specific features or fixes.
- Dev: run the backend stack (`docker compose up production`), then `docker compose -f docker-compose.frontend.yml up` (Vite on :5173, proxied to the stack on :5001).
