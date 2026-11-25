# syntax=docker/dockerfile:1.7
# Vue app served as static files. Build from the repository root.

FROM node:22-alpine AS builder

WORKDIR /app

# pnpm lockfile: `npm ci` rejects this dependency tree on a peer conflict.
RUN npm install -g pnpm@12.15.0

COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend ./
# Bundle only: type checking (`npm run check`) belongs to development, not the
# image. BACKEND_URL is empty so backend links stay relative to the page origin.
RUN BACKEND_URL= pnpm exec vite build


FROM nginx:1.28-alpine

COPY docker/prod/frontend.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
