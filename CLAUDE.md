# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"Everything App": a single-page shell (React 19 + Vite + TypeScript + Supabase, deployable on Vercel or self-hosted via Docker/Coolify) that hosts multiple independent mini-apps under `/apps/<id>` and switches between them without a page reload. UI strings and code comments are in German.

## Commands

- `npm install`
- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b && vite build` (the type check is the only static check; there is no linter or test suite)
- `npm run preview` — serve the production build (static only, no `/api`)
- `npm start` — `server/index.mjs`: production server for self-hosting (serves `dist/` + `/api`); needs a prior build and Node ≥ 22.18

Setup: copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. `src/lib/supabase.ts` throws at startup if they are missing. Database migrations in `supabase/migrations/` are run manually in the Supabase SQL editor (no CLI tooling).

## Architecture

**Auto-discovered app registry.** `src/registry/index.ts` uses `import.meta.glob('../apps/*/manifest.ts', { eager: true })` to collect every app's `AppManifest` (`src/registry/types.ts`), sorted by `order` then name. The shell never imports apps by name, so adding an app requires no shell changes. Manifests are loaded eagerly, but each `manifest.component` is `lazy(() => import('./App'))`, so every app is its own chunk.

**Shell and routing.** `src/App.tsx`: `AuthProvider` → `BrowserRouter`; `/login` is public, everything else sits under `RequireAuth` → `Layout` (header with `AppMenu` dropdown) with `/` = `Home` and `apps/:appId/*` = `AppHost`. `AppHost` looks up the manifest by URL param (unknown id redirects to `/`) and renders the lazy component inside an `ErrorBoundary` (keyed by app id) and `Suspense`. Apps may use their own nested routes under `apps/:appId/*`. `AppHost` also sets the tab favicon (the manifest `icon` emoji as an SVG data URL) and `document.title` for the active app, restoring `public/favicon.svg` and "Everything App" on leave.

**Header menu.** `Header` (brand link, `AppMenu`, user email + sign-out) is rendered by `Layout`. `AppMenu` is a searchable dropdown over `apps` from the registry (keyboard navigable, highlights the current app via `useMatch('/apps/:appId/*')`).

**Auth.** Supabase auth session lives in `AuthProvider` context (`useAuth()` → `{ session, loading }`). Apps use the shared client from `src/lib/supabase.ts`.

**Deploy/chunk handling.** `src/main.tsx` handles `vite:preloadError` by reloading once (guarded by a `sessionStorage` flag), since old chunks vanish after a Vercel deploy. `vercel.json` rewrites all routes except `/api/*` to `index.html`.

**Serverless API.** `api/` holds Vercel Functions (Web-standard `export async function GET(request: Request)`). They are outside the `tsconfig` `include`, so `tsc -b` doesn't check them; Vercel compiles them. `api/wow.ts` proxies the Blizzard API: it verifies the caller's Supabase access token (`Authorization: Bearer`, checked via `/auth/v1/user`), only allows whitelisted regions/namespaces/paths, and caches the OAuth client-credentials token in module scope. Server-only env vars: `BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`. `npm run dev` has no functions; set `API_PROXY_TARGET` in `.env` (Vite proxies `/api` there, e.g. to a deployment or a local `npm start`) or use `npx vercel dev`.

**Self-hosting (Coolify).** `Dockerfile` (multi-stage, `node:24-alpine`) builds with `VITE_SUPABASE_*` passed as build args (mark them "Build Variable" in Coolify) and runs `server/index.mjs`, a dependency-free `node:http` server: static `dist/` with SPA fallback (missing `/assets/*` or files with an extension return 404 so `vite:preloadError` still triggers; `/assets/*` cached immutable, everything else `no-cache`; gzip), `/healthz`, and `/api/<name>` mapped through the explicit `API` table in the server to `api/<name>.ts`'s exported `GET`, imported directly via Node's built-in type stripping (so `api/` files must stay erasable-syntax TS: no enums/namespaces/parameter properties). A new API function must be added to that table. Listens on `PORT` (default 3000).

## Adding or changing an app

1. Create `src/apps/<id>/manifest.ts` (`id` must equal the folder name, and becomes the URL segment) and `src/apps/<id>/App.tsx` with a default-exported component. Copy an existing manifest for the shape.
2. Bump `version` in the manifest when shipping a change to that app (release convention from the README).
3. Data tables: prefix `<id>_`, include `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`, enable RLS with an own-rows policy for `all` (see `supabase/migrations/0003_monitor.sql`). Add as a new numbered file `supabase/migrations/000N_<id>.sql`.

Note: the `monitor` app runs checks client-side in the browser (`checks.ts`): websites via a `no-cors` fetch (only reachability, no status code) and Minecraft via the public mcsrvstat.us API, since browsers can't open TCP connections.

## Conventions

- Apps talk to Supabase directly from `App.tsx` via `supabase.from('<id>_<table>')` (no shared data layer); RLS scopes rows to the user, and `user_id` is filled by its DB default, so inserts don't send it.
- Styling is one global stylesheet, `src/index.css`, with per-app root class selectors (e.g. `.notes`); there is no CSS-in-JS or component library. It follows the system light/dark scheme (`color-scheme: light dark`, `Canvas`).
- TypeScript is `strict`; `tsc -b` runs before `vite build`, so type errors fail the build (and the Vercel deploy).
- Existing apps: `notes` (order 10), `links` (15), `counter` (20, no DB table), `clock` (22) (clock, countdown timer, alarms with weekday repeat and snooze; timer state in `localStorage`, alarms in `clock_alarms`, `0008_clock.sql`; sound via Web Audio in `sound.ts`; it only rings while the app is mounted), `monitor` (25), `todo` (30) (gamified to-do list: quests with difficulty-based points, a level curve and streak in `gamification.ts`, and a rewards shop backed by a redemption log; tables `todo_items`, `todo_rewards`, `todo_redemptions`, `0005_todo.sql`, `0007_todo_due_date.sql`), `wow` (35) (WoW companion: characters, Mythic+, weekly checklist, ilvl/rating history, tracked achievements via `api/wow.ts`; nested routes `apps/wow/:charId`; tables `wow_characters`, `wow_snapshots`, `wow_goals`, `wow_achievements`, `0006_wow.sql`), `about` (40) (a wiki-style Markdown editor with `[[wikilinks]]`, autosave, and a small self-written renderer in `markdown.ts` that escapes HTML first; table `about_pages`, `0004_about.sql`), and `receipts` (50) (photograph a Kassenzettel, OCR it client-side with `tesseract.js` in `ocr.ts`, parse line items with a heuristic price-line parser in `receiptParser.ts`, review/correct them before saving; the same `ReceiptForm.tsx` also powers manual entry (no photo) from the Scannen tab and editing a saved receipt from the Verlauf tab, where saving replaces that receipt's items wholesale rather than diffing them; a pure `analytics.ts` compares the current vs. previous calendar month to generate spend trends and German-language savings tips; no image is ever persisted, only the extracted data; tables `receipts_receipts`, `receipts_items`, `0009_receipts.sql`), and `asteroids` (55) (a Space Invaders clone, "Asteroiden Ballern": a title screen with a looping self-composed chiptune title melody (`music.ts`, Web Audio like `clock/sound.ts`, mutable while the title phase is active), a canvas-based game (`game.ts` is the pure, mutated-in-place game state/step logic with no DOM access; `GameCanvas.tsx` owns the `requestAnimationFrame` loop, keyboard + on-screen touch controls, and drawing), and a game-over screen; high score lives only in `localStorage`, no DB table). Migrations are `0001_notes` through `0009_receipts` (`0005` is `todo`, `0006` is `wow`, `0007` adds `todo_items.due_date`, `0008` is `clock`), and the next number is `0010`.
- `.claude` and `.env` are gitignored; `dist/` is build output.
