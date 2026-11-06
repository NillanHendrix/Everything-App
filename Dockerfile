# Self-Hosting (z. B. Coolify): baut das Frontend und startet server/index.mjs.

# ---- Build ----
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
# npm install statt npm ci: toleriert einen Lockfile, der nicht ganz zu package.json passt
# (wie Vercel). Den Lockfile trotzdem aktuell halten (lokal `npm install` und committen).
RUN npm install --no-audit --no-fund

# Der Build braucht keine Variablen: VITE_SUPABASE_URL/-ANON_KEY setzt der Server zur
# Laufzeit in index.html ein (window.__ENV__, siehe server/index.mjs und src/lib/supabase.ts).
COPY . .
RUN npm run build

# ---- Runtime ----
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

# Der Server hat keine npm-Abhängigkeiten; package.json wird nur für "type": "module" gebraucht.
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node api ./api
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1

CMD ["node", "server/index.mjs"]
