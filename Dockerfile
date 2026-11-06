# Self-Hosting (z. B. Coolify): baut das Frontend und startet server/index.mjs.

# ---- Build ----
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# VITE_-Variablen werden beim Build ins Bundle eingebettet, müssen also als Build-Args
# ankommen (in Coolify: Env-Var als "Build Variable" markieren).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY . .
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY" \
    || (echo "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY fehlen als Build-Variablen" && exit 1)
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
