# Everything App

Shell mit Header, der zwischen Mini-Apps wechselt, ohne die Seite neu zu laden. React + Vite + Supabase, deploybar auf Vercel oder selbst gehostet (Docker/Coolify).

## Setup

1. `npm install`
2. `.env.example` nach `.env` kopieren und Supabase-URL und Anon-Key eintragen.
3. Migrationen aus `supabase/migrations/` im Supabase SQL-Editor ausführen.
4. `npm run dev`

## Neue App hinzufügen

Lege einen Ordner `src/apps/<id>/` an, mit zwei Dateien. Die Shell erkennt ihn automatisch, sie muss nicht geändert werden.

`manifest.ts`:

```ts
import { lazy } from 'react'
import type { AppManifest } from '../../registry/types'

const manifest: AppManifest = {
  id: '<id>', // = Ordnername, wird zu /apps/<id>
  name: 'Meine App',
  icon: '🚀',
  version: '1.0.0',
  order: 30,
  component: lazy(() => import('./App')),
}
export default manifest
```

`App.tsx`: `export default function App() { ... }`

Datenbanktabellen bekommen das Präfix `<id>_`, eine `user_id uuid default auth.uid()`-Spalte und eine RLS-Policy (siehe `supabase/migrations/0001_notes.sql`). Migration als neue Datei `supabase/migrations/000N_<id>.sql` ablegen.

## Neue Version ausliefern

`version` im Manifest erhöhen, committen, pushen. Vercel bzw. Coolify baut und deployt automatisch. Jede App ist ein eigener Chunk. Offene Tabs laden nach einem Deploy einmalig neu, falls ein Chunk nicht mehr existiert (`vite:preloadError` in `src/main.tsx`).

## Deployment auf Vercel

Repo importieren (Framework: Vite), Env-Vars `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` setzen. `vercel.json` leitet alle Routen außer `/api/*` auf `index.html` um.

Für die WoW-App (`wow`) zusätzlich `BLIZZARD_CLIENT_ID` und `BLIZZARD_CLIENT_SECRET` setzen (API-Client unter https://develop.battle.net anlegen). Die Blizzard API läuft über die Vercel Function `api/wow.ts`; lokal entweder `npx vercel dev` nutzen oder in `.env` `API_PROXY_TARGET` auf ein Deployment setzen.

## Deployment auf Coolify (Self-Hosting)

Das `Dockerfile` baut das Frontend und startet `server/index.mjs`: einen abhängigkeitsfreien Node-Server, der `dist/` mit SPA-Fallback ausliefert und `/api/<name>` auf die Funktionen in `api/` abbildet (wie auf Vercel). `vercel.json` wird dabei nicht gebraucht.

1. In Coolify: *New Resource* → Git-Repository → Build Pack **Dockerfile**.
2. *Ports Exposes*: `3000`. Domain eintragen (HTTPS übernimmt Coolify/Traefik).
3. Environment Variables:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`: normale Laufzeit-Variablen. Der Server setzt sie beim Ausliefern in `index.html` ein (`window.__ENV__`), der Build braucht sie nicht.
   - `BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`: nur Laufzeit (für die WoW-App).
4. Healthcheck: `GET /healthz` (ist auch im `Dockerfile` hinterlegt).
5. In Supabase unter *Authentication → URL Configuration* die neue Domain als Site-URL bzw. Redirect-URL eintragen.

Nach Änderungen an Variablen reicht ein Neustart, ein neuer Build ist nicht nötig.

Lokal testen: `npm run build && npm start` (Port über `PORT`, Standard 3000; braucht Node ≥ 22.18 für die `.ts`-Dateien in `api/`). Oder mit Docker:

```sh
docker build -t everything-app .
docker run -p 3000:3000 --env-file .env everything-app
```
