import { supabase } from '../../lib/supabase'

export type Region = 'eu' | 'us'
type Namespace = 'profile' | 'static' | 'dynamic'

// Spielversionen; der Proxy (api/wow.ts) bildet sie auf Blizzards Namespaces ab.
export type Game = 'retail' | 'classic' | 'classic1x' | 'classicann' | 'forever'

export const GAMES: { id: Game; label: string }[] = [
  { id: 'retail', label: 'Retail' },
  { id: 'classic', label: 'Classic (Progression)' },
  { id: 'classic1x', label: 'Classic Era / Hardcore / SoD' },
  { id: 'classicann', label: 'Classic Anniversary' },
  { id: 'forever', label: 'WoW: Forever' },
]

export const gameLabel = (g: Game) => GAMES.find((x) => x.id === g)?.label ?? g

export interface Character {
  id: string
  region: Region
  realm: string
  name: string
  game: Game
  group_id: string | null
  position: number
}

export const CHARACTER_COLUMNS = 'id, region, realm, name, game, group_id, position'

export class WowError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// Ruft die Blizzard API über den Proxy api/wow.ts auf (Client-Secret bleibt auf dem Server).
async function wowFetch<T>(region: Region, namespace: Namespace, path: string, game: Game = 'retail'): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const params = new URLSearchParams({ region, namespace, path })
  if (game !== 'retail') params.set('game', game)
  const res = await fetch(`/api/wow?${params}`, {
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
  })
  if (!res.ok) {
    if (res.status === 404) throw new WowError(404, 'Nicht gefunden (Charakter existiert nicht oder Profil ist privat)')
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new WowError(res.status, body?.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

interface Ref {
  id: number
  name: string
}

export interface Color {
  r: number
  g: number
  b: number
  a: number
}

export interface Profile {
  name: string
  level: number
  faction: { name: string }
  race: { name: string }
  character_class: Ref
  active_spec?: { name: string }
  realm: { name: string; slug: string }
  guild?: { name: string }
  // Fehlen je nach Spielversion (z. B. Erfolgspunkte in Classic Era).
  equipped_item_level?: number
  average_item_level?: number
  achievement_points?: number
}

export interface Media {
  assets?: { key: string; value: string }[]
}

export interface MythicProfile {
  current_mythic_rating?: { rating: number; color: Color }
  seasons?: { id: number }[]
}

export interface MythicRun {
  completed_timestamp: number
  duration: number
  keystone_level: number
  is_completed_within_time: boolean
  dungeon: Ref
  mythic_rating?: { rating: number; color: Color }
}

export interface MythicSeason {
  best_runs?: MythicRun[]
}

export interface Criteria {
  is_completed: boolean
  amount?: number
  child_criteria?: Criteria[]
}

export interface CharacterAchievement {
  id: number
  achievement: Ref
  completed_timestamp?: number
  criteria?: Criteria
}

const charPath = (c: Character, suffix = '') =>
  `/profile/wow/character/${c.realm}/${encodeURIComponent(c.name.toLowerCase())}${suffix}`

export const getProfile = (c: Character) => wowFetch<Profile>(c.region, 'profile', charPath(c), c.game)
export const getMedia = (c: Character) =>
  wowFetch<Media>(c.region, 'profile', charPath(c, '/character-media'), c.game)

export async function getMythic(c: Character) {
  let profile: MythicProfile
  try {
    profile = await wowFetch<MythicProfile>(c.region, 'profile', charPath(c, '/mythic-keystone-profile'))
  } catch (e) {
    // 404 = noch nie Mythic+ gelaufen.
    if (e instanceof WowError && e.status === 404) return { profile: {} as MythicProfile, runs: [] }
    throw e
  }
  const season = profile.seasons?.at(-1)
  if (!season) return { profile, runs: [] }
  const data = await wowFetch<MythicSeason>(
    c.region,
    'profile',
    charPath(c, `/mythic-keystone-profile/season/${season.id}`),
  ).catch(() => ({}) as MythicSeason)
  return { profile, runs: data.best_runs ?? [] }
}

export const getAchievements = (c: Character) =>
  wowFetch<{ achievements: CharacterAchievement[] }>(c.region, 'profile', charPath(c, '/achievements'))

export const getAchievementIndex = (region: Region) =>
  wowFetch<{ achievements: Ref[] }>(region, 'static', '/data/wow/achievement/index')

export const getRealms = (region: Region, game: Game) =>
  wowFetch<{ realms: { id: number; name: string | null; slug: string }[] }>(region, 'dynamic', '/data/wow/realm/index', game)

export const asset = (media: Media | undefined, key: string) => media?.assets?.find((a) => a.key === key)?.value

export const cssColor = (c: Color) => `rgb(${c.r} ${c.g} ${c.b})`

// Klassenfarben nach Klassen-ID.
export const CLASS_COLORS: Record<number, string> = {
  1: '#C69B6D', 2: '#F48CBA', 3: '#AAD372', 4: '#FFF468', 5: '#FFFFFF', 6: '#C41E3A', 7: '#0070DD',
  8: '#3FC7EB', 9: '#8788EE', 10: '#00FF98', 11: '#FF7C0A', 12: '#A330C9', 13: '#33937F',
}
