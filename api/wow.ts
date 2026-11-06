// Vercel Function (self-hosted über server/index.mjs): schmaler Proxy zur Blizzard API. Das Client-Secret bleibt auf dem Server.
// Aufruf: /api/wow?region=eu&namespace=profile&path=/profile/wow/character/<realm>/<name>[&game=classic]

declare const process: { env: Record<string, string | undefined> }

const REGIONS = new Set(['eu', 'us'])
const NAMESPACES = new Set(['profile', 'static', 'dynamic'])
// Spielversion → Namespace-Infix (profile-classic-eu usw.). Retail hat keinen.
const GAMES = new Map([
  ['retail', ''],
  ['classic', 'classic-'], // Classic-Progression (aktuelle Erweiterung)
  ['classic1x', 'classic1x-'], // Classic Era, Hardcore, Season of Discovery
  ['classicann', 'classicann-'], // Anniversary-Realms
  ['forever', 'forever-'], // WoW: Forever (noch undokumentiert)
])
const ALLOWED_PATH = /^\/(profile\/wow\/character\/[^?#]+|data\/wow\/(achievement\/index|realm\/index))$/

let token: { value: string; expires: number } | null = null

async function blizzardToken() {
  if (token && token.expires > Date.now()) return token.value
  const id = process.env.BLIZZARD_CLIENT_ID
  const secret = process.env.BLIZZARD_CLIENT_SECRET
  if (!id || !secret) throw new Error('BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET fehlen')
  const res = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`Blizzard-Token: HTTP ${res.status}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  // Eine Minute Puffer vor Ablauf.
  token = { value: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 }
  return token.value
}

// Prüft das Supabase-Session-Token, damit nur angemeldete Nutzer das Blizzard-Kontingent verbrauchen.
async function isSignedIn(request: Request) {
  const auth = request.headers.get('authorization')
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!auth?.startsWith('Bearer ') || !url || !key) return false
  const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey: key } })
  return res.ok
}

function json(status: number, body: unknown, cache = 'no-store') {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cache },
  })
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const region = params.get('region') ?? ''
  const namespace = params.get('namespace') ?? ''
  const path = params.get('path') ?? ''
  const game = params.get('game') ?? 'retail'
  // Statische Daten (Erfolgs-Index) nur für Retail: Classic/Forever nutzen versionierte static-Namespaces.
  const validGame = GAMES.has(game) && (game === 'retail' || namespace !== 'static')
  if (!REGIONS.has(region) || !NAMESPACES.has(namespace) || !validGame || !ALLOWED_PATH.test(path)) {
    return json(400, { error: 'Ungültige Anfrage' })
  }
  if (!(await isSignedIn(request))) return json(401, { error: 'Nicht angemeldet' })

  try {
    const target = new URL(`https://${region}.api.blizzard.com${path}`)
    target.searchParams.set('namespace', `${namespace}-${GAMES.get(game)}${region}`)
    target.searchParams.set('locale', 'de_DE')
    const res = await fetch(target, { headers: { Authorization: `Bearer ${await blizzardToken()}` } })
    const cache = namespace === 'profile' ? 'private, max-age=60' : 'public, s-maxage=86400'
    return new Response(await res.text(), {
      status: res.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': res.ok ? cache : 'no-store' },
    })
  } catch (e) {
    return json(502, { error: e instanceof Error ? e.message : String(e) })
  }
}
