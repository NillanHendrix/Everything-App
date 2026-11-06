import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { asset, CLASS_COLORS, getMedia, getProfile, getRealms, type Character, type Media, type Profile, type Region } from './api'
import CharacterPage from './Character'

export default function WowApp() {
  return (
    <div className="wow">
      <Routes>
        <Route index element={<Overview />} />
        <Route path=":charId" element={<CharacterPage />} />
      </Routes>
    </div>
  )
}

interface Summary {
  profile?: Profile
  media?: Media
  error?: string
}

function Overview() {
  const [chars, setChars] = useState<Character[]>([])
  const [summaries, setSummaries] = useState<Record<string, Summary>>({})
  const [region, setRegion] = useState<Region>('eu')
  const [realms, setRealms] = useState<{ name: string; slug: string }[]>([])
  const [realm, setRealm] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('wow_characters')
      .select('id, region, realm, name')
      .order('created_at')
    if (error) return setError(error.message)
    const list = data as Character[]
    setChars(list)
    list.forEach(async (c) => {
      try {
        const [profile, media] = await Promise.all([getProfile(c), getMedia(c).catch(() => undefined)])
        setSummaries((prev) => ({ ...prev, [c.id]: { profile, media } }))
      } catch (e) {
        setSummaries((prev) => ({ ...prev, [c.id]: { error: (e as Error).message } }))
      }
    })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setRealms([])
    getRealms(region)
      .then((data) =>
        setRealms(
          data.realms
            // Blizzard liefert für manche Realms keinen deutschen Namen (null): Slug als Ersatz.
            .map((r) => ({ name: r.name ?? r.slug, slug: r.slug }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      )
      .catch((e: Error) => setError(`Realms: ${e.message}`))
  }, [region])

  async function add(e: FormEvent) {
    e.preventDefault()
    setError('')
    // user_id wird per Default (auth.uid()) in der DB gesetzt.
    const { error } = await supabase
      .from('wow_characters')
      .insert({ region, realm, name: name.trim().toLowerCase() })
    if (error) return setError(error.code === '23505' ? 'Charakter ist schon angelegt' : error.message)
    setName('')
    load()
  }

  async function remove(id: string) {
    if (!confirm('Charakter samt Checkliste, Verlauf und Erfolgen löschen?')) return
    const { error } = await supabase.from('wow_characters').delete().eq('id', id)
    if (error) return setError(error.message)
    load()
  }

  return (
    <>
      <h1>WoW Companion</h1>
      <form onSubmit={add}>
        <select value={region} onChange={(e) => setRegion(e.target.value as Region)}>
          <option value="eu">EU</option>
          <option value="us">US</option>
        </select>
        <select value={realm} onChange={(e) => setRealm(e.target.value)} required>
          <option value="">{realms.length ? 'Realm wählen' : 'Lade Realms…'}</option>
          {realms.map((r) => (
            <option key={r.slug} value={r.slug}>{r.name}</option>
          ))}
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Charaktername" required />
        <button type="submit">Hinzufügen</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ul className="chars">
        {chars.map((c) => {
          const s = summaries[c.id]
          const p = s?.profile
          return (
            <li key={c.id} style={{ borderLeftColor: p ? CLASS_COLORS[p.character_class.id] : undefined }}>
              <Link to={c.id}>
                {asset(s?.media, 'avatar') ? <img src={asset(s?.media, 'avatar')} alt="" /> : <span className="avatar" />}
                <div>
                  <strong>{p?.name ?? c.name}</strong>
                  <small>{p?.realm.name ?? c.realm} · {c.region.toUpperCase()}</small>
                  <small>
                    {p
                      ? `Stufe ${p.level} ${p.active_spec?.name ?? ''} ${p.character_class.name} · ilvl ${p.equipped_item_level}`
                      : (s?.error ?? 'Lade…')}
                  </small>
                </div>
              </Link>
              <button onClick={() => remove(c.id)} aria-label="Löschen">✕</button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
