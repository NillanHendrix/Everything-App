// Produktionsserver für Self-Hosting (Docker/Coolify), ohne Abhängigkeiten:
// liefert dist/ aus (SPA-Fallback auf index.html) und bindet die Funktionen aus api/ ein,
// die auf Vercel als Functions laufen. Node >= 22.18 lädt die .ts-Dateien per Type-Stripping.
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGzip } from 'node:zlib'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DIST = join(ROOT, 'dist')
const PORT = Number(process.env.PORT) || 3000

// Gleiche Routen wie auf Vercel: /api/<name> → api/<name>.ts (export GET).
const API = {
  wow: () => import('../api/wow.ts'),
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.wasm', '.webmanifest'])

async function fileAt(path) {
  try {
    const s = await stat(path)
    return s.isFile() ? s : null
  } catch {
    return null
  }
}

function sendFile(req, res, path, size, cacheControl) {
  const ext = extname(path).toLowerCase()
  const headers = {
    'Content-Type': TYPES[ext] ?? 'application/octet-stream',
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Accept-Encoding',
  }
  const gzip = COMPRESSIBLE.has(ext) && size > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')
  if (gzip) headers['Content-Encoding'] = 'gzip'
  else headers['Content-Length'] = size
  res.writeHead(200, headers)
  if (req.method === 'HEAD') return res.end()
  const stream = createReadStream(path)
  stream.on('error', () => res.destroy())
  ;(gzip ? stream.pipe(createGzip()) : stream).pipe(res)
}

async function handleApi(req, res, name, url) {
  const load = Object.hasOwn(API, name) ? API[name] : null
  if (!load) return sendJson(res, 404, { error: 'Nicht gefunden' })
  const mod = await load()
  const handler = mod[req.method === 'HEAD' ? 'GET' : req.method]
  if (typeof handler !== 'function') return sendJson(res, 405, { error: 'Methode nicht erlaubt' })

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }
  const response = await handler(new Request(url, { method: req.method, headers }))
  res.writeHead(response.status, Object.fromEntries(response.headers))
  if (req.method === 'HEAD' || !response.body) return res.end()
  res.end(Buffer.from(await response.arrayBuffer()))
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

const server = createServer(async (req, res) => {
  try {
    const proto = req.headers['x-forwarded-proto']?.split(',')[0] || 'http'
    const url = new URL(req.url ?? '/', `${proto}://${req.headers.host ?? 'localhost'}`)
    const pathname = decodeURIComponent(url.pathname)

    if (pathname === '/healthz') return sendJson(res, 200, { ok: true })

    const api = pathname.match(/^\/api\/([\w-]+)\/?$/)
    if (api) return await handleApi(req, res, api[1], url)
    if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Nicht gefunden' })

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' })
      return res.end()
    }

    // Statische Datei (Pfad-Traversal ausgeschlossen).
    const filePath = normalize(join(DIST, pathname))
    if (filePath.startsWith(DIST + '/')) {
      const s = await fileAt(filePath)
      if (s) {
        // Vite-Assets tragen einen Hash im Namen und ändern sich nie.
        const immutable = pathname.startsWith('/assets/')
        return sendFile(req, res, filePath, s.size, immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
      }
    }

    // Fehlende Assets nicht mit index.html beantworten: alte Chunks nach einem Deploy sollen
    // sauber 404 liefern, damit vite:preloadError (src/main.tsx) neu lädt.
    if (pathname.startsWith('/assets/') || extname(pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
      return res.end('Nicht gefunden')
    }

    const index = join(DIST, 'index.html')
    const s = await fileAt(index)
    if (!s) return sendJson(res, 500, { error: 'dist/index.html fehlt – vorher `npm run build` ausführen' })
    return sendFile(req, res, index, s.size, 'no-cache')
  } catch (e) {
    console.error(e)
    if (!res.headersSent) sendJson(res, 500, { error: 'Serverfehler' })
    else res.destroy()
  }
})

// Ohne Host-Angabe lauscht Node auf allen Interfaces (IPv4 und IPv6). Bewusst kein HOST aus der
// Umgebung: Plattformen setzen die Variable teils mit anderer Bedeutung.
server.listen(PORT, () => console.log(`Everything App läuft auf Port ${PORT}`))

// Coolify stoppt Container per SIGTERM: offene Verbindungen sauber beenden.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
