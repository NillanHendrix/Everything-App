import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  asset,
  CHARACTER_COLUMNS,
  CLASS_COLORS,
  cssColor,
  gameLabel,
  getAchievementIndex,
  getAchievements,
  getMedia,
  getMythic,
  getProfile,
  type Character,
  type CharacterAchievement,
  type Criteria,
  type Media,
  type MythicProfile,
  type MythicRun,
  type Profile,
} from './api'
import { profileLinks } from './links'
import { formatDuration, lastWeeklyReset, nextWeeklyReset } from './reset'

type Tab = 'mplus' | 'goals' | 'history' | 'achievements'

const TABS: { id: Tab; label: string }[] = [
  { id: 'mplus', label: 'Mythic+' },
  { id: 'goals', label: 'Checkliste' },
  { id: 'history', label: 'Verlauf' },
  { id: 'achievements', label: 'Erfolge' },
]

export default function CharacterPage() {
  const { charId } = useParams()
  const [char, setChar] = useState<Character | null>(null)
  const [profile, setProfile] = useState<Profile>()
  const [media, setMedia] = useState<Media>()
  const [mythic, setMythic] = useState<{ profile: MythicProfile; runs: MythicRun[] }>()
  const [tab, setTab] = useState<Tab>('mplus')
  const [error, setError] = useState('')
  const [snapshotKey, setSnapshotKey] = useState(0)
  const snapshotDone = useRef(false)

  useEffect(() => {
    supabase
      .from('wow_characters')
      .select(CHARACTER_COLUMNS)
      .eq('id', charId ?? '')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else if (!data) setError('Charakter nicht gefunden')
        else setChar(data as Character)
      })
  }, [charId])

  useEffect(() => {
    if (!char) return
    // Mythic+ gibt es nur in Retail.
    const mythicData =
      char.game === 'retail' ? getMythic(char) : Promise.resolve({ profile: {} as MythicProfile, runs: [] as MythicRun[] })
    Promise.all([getProfile(char), getMedia(char).catch(() => undefined), mythicData])
      .then(([p, m, mp]) => {
        setProfile(p)
        setMedia(m)
        setMythic(mp)
      })
      .catch((e: Error) => setError(e.message))
  }, [char])

  // Snapshot für den Verlauf speichern, wenn sich ilvl oder Rating seit dem letzten geändert haben.
  useEffect(() => {
    if (!char || !profile || !mythic || snapshotDone.current) return
    snapshotDone.current = true
    const itemLevel = profile.equipped_item_level ?? null
    const rating = mythic.profile.current_mythic_rating?.rating ?? null
    ;(async () => {
      const { data } = await supabase
        .from('wow_snapshots')
        .select('item_level, mplus_rating')
        .eq('character_id', char.id)
        .order('taken_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const roundedRating = rating == null ? null : Math.round(rating * 10) / 10
      if (data && data.item_level === itemLevel && (data.mplus_rating == null ? null : Number(data.mplus_rating)) === roundedRating) return
      const { error } = await supabase
        .from('wow_snapshots')
        .insert({ character_id: char.id, item_level: itemLevel, mplus_rating: roundedRating })
      if (error) setError(error.message)
      else setSnapshotKey((k) => k + 1)
    })()
  }, [char, profile, mythic])

  if (!char) return <>{error ? <p role="alert">{error}</p> : <p>Lade…</p>}</>

  const render = asset(media, 'main-raw') ?? asset(media, 'inset')
  // Classic/Forever: kein Mythic+ und kein Erfolgs-Index (versionierte static-Namespaces).
  const tabs = char.game === 'retail' ? TABS : TABS.filter((t) => t.id === 'goals' || t.id === 'history')
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id
  return (
    <>
      <p><Link to="/apps/wow">← Alle Charaktere</Link></p>
      <header className="hero" style={{ borderLeftColor: profile ? CLASS_COLORS[profile.character_class.id] : undefined }}>
        {asset(media, 'avatar') && <img src={asset(media, 'avatar')} alt="" />}
        <div>
          <h1>{profile?.name ?? char.name}</h1>
          {profile ? (
            <>
              <p>
                Stufe {profile.level} {profile.race.name} {profile.active_spec?.name} {profile.character_class.name} ·{' '}
                {profile.faction.name}
              </p>
              <p>
                {profile.guild && <>&lt;{profile.guild.name}&gt; · </>}
                {profile.realm.name} ({char.region.toUpperCase()})
                {char.game !== 'retail' && <> · {gameLabel(char.game)}</>}
              </p>
              <p>
                {profile.equipped_item_level != null && <strong>ilvl {profile.equipped_item_level}</strong>}
                {profile.achievement_points != null && <> · {profile.achievement_points} Erfolgspunkte</>}
                {mythic?.profile.current_mythic_rating && (
                  <>
                    {' · '}
                    <strong style={{ color: cssColor(mythic.profile.current_mythic_rating.color) }}>
                      M+ {Math.round(mythic.profile.current_mythic_rating.rating)}
                    </strong>
                  </>
                )}
              </p>
            </>
          ) : (
            !error && <p>Lade…</p>
          )}
        </div>
        {render && <img className="render" src={render} alt="" />}
      </header>
      <nav className="extlinks">
        {profileLinks(char).map((l) => (
          <a key={l.label} href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>
        ))}
      </nav>
      {error && <p role="alert">{error}</p>}
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={activeTab === t.id} className={activeTab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {activeTab === 'mplus' && <MythicTab data={mythic} />}
      {activeTab === 'goals' && <GoalsTab char={char} />}
      {activeTab === 'history' && <HistoryTab char={char} reloadKey={snapshotKey} />}
      {activeTab === 'achievements' && <AchievementsTab char={char} />}
    </>
  )
}

function formatTime(ms: number) {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function MythicTab({ data }: { data?: { profile: MythicProfile; runs: MythicRun[] } }) {
  if (!data) return <p>Lade…</p>
  const rating = data.profile.current_mythic_rating
  const runs = [...data.runs].sort((a, b) => (a.dungeon.name ?? '').localeCompare(b.dungeon.name ?? ''))
  return (
    <section>
      <p>
        Rating aktuelle Season:{' '}
        {rating ? <strong style={{ color: cssColor(rating.color) }}>{Math.round(rating.rating)}</strong> : 'keins'}
      </p>
      {runs.length > 0 ? (
        <table>
          <thead>
            <tr><th>Dungeon</th><th>Stufe</th><th>Zeit</th><th>Rating</th></tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={`${r.dungeon.id}-${r.completed_timestamp}`}>
                <td>{r.dungeon.name}</td>
                <td>+{r.keystone_level} {r.is_completed_within_time ? '✓' : '✗'}</td>
                <td>{formatTime(r.duration)}</td>
                <td>{r.mythic_rating ? Math.round(r.mythic_rating.rating) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>Keine Runs in dieser Season.</p>
      )}
    </section>
  )
}

interface Goal {
  id: string
  title: string
  weekly: boolean
  done_at: string | null
}

function GoalsTab({ char }: { char: Character }) {
  const [goals, setGoals] = useState<Goal[]>([])
  const [title, setTitle] = useState('')
  const [weekly, setWeekly] = useState(true)
  const [error, setError] = useState('')
  const reset = lastWeeklyReset(char.region)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('wow_goals')
      .select('id, title, weekly, done_at')
      .eq('character_id', char.id)
      .order('created_at')
    if (error) setError(error.message)
    else setGoals(data as Goal[])
  }, [char.id])

  useEffect(() => {
    load()
  }, [load])

  // Weekly-Ziele gelten nur als erledigt, wenn sie seit dem letzten Reset abgehakt wurden.
  const isDone = (g: Goal) => g.done_at != null && (!g.weekly || new Date(g.done_at) >= reset)

  async function add(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('wow_goals').insert({ character_id: char.id, title: title.trim(), weekly })
    if (error) return setError(error.message)
    setTitle('')
    load()
  }

  async function toggle(g: Goal) {
    const { error } = await supabase
      .from('wow_goals')
      .update({ done_at: isDone(g) ? null : new Date().toISOString() })
      .eq('id', g.id)
    if (error) return setError(error.message)
    load()
  }

  async function remove(id: string) {
    const { error } = await supabase.from('wow_goals').delete().eq('id', id)
    if (error) return setError(error.message)
    load()
  }

  return (
    <section>
      <p><small>Nächster Reset in {formatDuration(nextWeeklyReset(char.region).getTime() - Date.now())}</small></p>
      <form onSubmit={add} className="row">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Great Vault: 8 M+ Dungeons" required />
        <label><input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} /> wöchentlich</label>
        <button type="submit">Hinzufügen</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ul className="list">
        {goals.map((g) => (
          <li key={g.id} className={isDone(g) ? 'done' : ''}>
            <label>
              <input type="checkbox" checked={isDone(g)} onChange={() => toggle(g)} />
              {g.title}
              {g.weekly && <small>wöchentlich</small>}
            </label>
            <button onClick={() => remove(g.id)} aria-label="Löschen">✕</button>
          </li>
        ))}
      </ul>
    </section>
  )
}

interface Snapshot {
  item_level: number | null
  mplus_rating: number | null
  taken_at: string
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const w = 300
  const h = 60
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - 4 - ((v - min) / (max - min || 1)) * (h - 8)}`)
    .join(' ')
  return (
    <figure className="spark">
      <figcaption>{label}: {min} → {values[values.length - 1]}</figcaption>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}>
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </figure>
  )
}

function HistoryTab({ char, reloadKey }: { char: Character; reloadKey: number }) {
  const [snaps, setSnaps] = useState<Snapshot[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('wow_snapshots')
      .select('item_level, mplus_rating, taken_at')
      .eq('character_id', char.id)
      .order('taken_at')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setSnaps(data as Snapshot[])
      })
  }, [char.id, reloadKey])

  const ilvl = snaps.map((s) => s.item_level).filter((v): v is number => v != null)
  const rating = snaps.map((s) => s.mplus_rating).filter((v): v is number => v != null).map(Number)
  return (
    <section>
      {error && <p role="alert">{error}</p>}
      <p><small>Ein Eintrag wird gespeichert, wenn sich Itemlevel oder Rating beim Öffnen des Charakters geändert haben.</small></p>
      <Sparkline values={ilvl} label="Itemlevel" />
      <Sparkline values={rating.map(Math.round)} label="M+ Rating" />
      <table>
        <thead>
          <tr><th>Datum</th><th>ilvl</th><th>M+ Rating</th></tr>
        </thead>
        <tbody>
          {[...snaps].reverse().map((s) => (
            <tr key={s.taken_at}>
              <td>{new Date(s.taken_at).toLocaleString('de-DE')}</td>
              <td>{s.item_level ?? '–'}</td>
              <td>{s.mplus_rating != null ? Math.round(Number(s.mplus_rating)) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

interface Tracked {
  id: string
  achievement_id: number
  name: string
}

function criteriaProgress(c?: Criteria) {
  if (!c?.child_criteria?.length) return c?.amount != null ? `Fortschritt: ${c.amount}` : 'In Arbeit'
  const done = c.child_criteria.filter((x) => x.is_completed).length
  return `${done}/${c.child_criteria.length} Kriterien`
}

function AchievementsTab({ char }: { char: Character }) {
  const [tracked, setTracked] = useState<Tracked[]>([])
  const [status, setStatus] = useState<Map<number, CharacterAchievement>>()
  const [index, setIndex] = useState<{ id: number; name: string }[]>()
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('wow_achievements')
      .select('id, achievement_id, name')
      .eq('character_id', char.id)
      .order('created_at')
    if (error) setError(error.message)
    else setTracked(data as Tracked[])
  }, [char.id])

  useEffect(() => {
    load()
    getAchievements(char)
      .then((d) => setStatus(new Map(d.achievements.map((a) => [a.id, a]))))
      .catch((e: Error) => setError(e.message))
  }, [char, load])

  // Der Index ist groß: erst laden, wenn gesucht wird.
  useEffect(() => {
    if (query.length < 3 || index) return
    getAchievementIndex(char.region)
      .then((d) => setIndex(d.achievements))
      .catch((e: Error) => setError(e.message))
  }, [query, index, char.region])

  const matches = useMemo(() => {
    if (!index || query.length < 3) return []
    const q = query.toLowerCase()
    const ids = new Set(tracked.map((t) => t.achievement_id))
    return index.filter((a) => !ids.has(a.id) && a.name.toLowerCase().includes(q)).slice(0, 15)
  }, [index, query, tracked])

  async function add(a: { id: number; name: string }) {
    const { error } = await supabase
      .from('wow_achievements')
      .insert({ character_id: char.id, achievement_id: a.id, name: a.name })
    if (error) return setError(error.message)
    setQuery('')
    load()
  }

  async function remove(id: string) {
    const { error } = await supabase.from('wow_achievements').delete().eq('id', id)
    if (error) return setError(error.message)
    load()
  }

  return (
    <section>
      <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Erfolg suchen (mind. 3 Zeichen)" />
      {query.length >= 3 && (
        <ul className="list matches">
          {!index && <li>Lade Erfolge…</li>}
          {index && matches.length === 0 && <li>Keine Treffer</li>}
          {matches.map((a) => (
            <li key={a.id}>
              <span>{a.name}</span>
              <button onClick={() => add(a)}>Verfolgen</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
      <ul className="list">
        {tracked.map((t) => {
          const s = status?.get(t.achievement_id)
          const text = !status
            ? 'Lade…'
            : s?.completed_timestamp
              ? `✓ Abgeschlossen am ${new Date(s.completed_timestamp).toLocaleDateString('de-DE')}`
              : s
                ? criteriaProgress(s.criteria)
                : 'Noch kein Fortschritt'
          return (
            <li key={t.id} className={s?.completed_timestamp ? 'done' : ''}>
              <div>
                <a href={`https://www.wowhead.com/de/achievement=${t.achievement_id}`} target="_blank" rel="noreferrer">{t.name}</a>
                <small>{text}</small>
              </div>
              <button onClick={() => remove(t.id)} aria-label="Entfernen">✕</button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
