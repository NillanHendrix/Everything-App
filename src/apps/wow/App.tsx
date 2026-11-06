import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  asset,
  CHARACTER_COLUMNS,
  CLASS_COLORS,
  gameLabel,
  GAMES,
  getMedia,
  getProfile,
  getRealms,
  type Character,
  type Game,
  type Media,
  type Profile,
  type Region,
} from './api'
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

interface Group {
  id: string
  name: string
  position: number
}

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position

function Overview() {
  const [chars, setChars] = useState<Character[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [summaries, setSummaries] = useState<Record<string, Summary>>({})
  const [game, setGame] = useState<Game>('retail')
  const [region, setRegion] = useState<Region>('eu')
  const [realms, setRealms] = useState<{ name: string; slug: string }[]>([])
  const [realmError, setRealmError] = useState('')
  const [realm, setRealm] = useState('')
  const [name, setName] = useState('')
  const [groupName, setGroupName] = useState('')
  const [error, setError] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  // Ablageziel unter dem Mauszeiger: Gruppen-ID ('' = ohne Gruppe) für die Hervorhebung.
  const [dropGroup, setDropGroup] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [charRes, groupRes] = await Promise.all([
      supabase.from('wow_characters').select(CHARACTER_COLUMNS).order('position').order('created_at'),
      supabase.from('wow_groups').select('id, name, position').order('position').order('created_at'),
    ])
    if (charRes.error) return setError(charRes.error.message)
    if (groupRes.error) return setError(groupRes.error.message)
    const list = charRes.data as Character[]
    setChars(list)
    setGroups(groupRes.data as Group[])
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
    setRealm('')
    setRealmError('')
    getRealms(region, game)
      .then((data) =>
        setRealms(
          data.realms
            // Blizzard liefert für manche Realms keinen deutschen Namen (null): Slug als Ersatz.
            .map((r) => ({ name: r.name ?? r.slug, slug: r.slug }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      )
      .catch((e: Error) => setRealmError(`Realms für ${gameLabel(game)} nicht abrufbar (${e.message}). Realm-Slug bitte selbst eintippen.`))
  }, [region, game])

  const inGroup = (groupId: string | null) => chars.filter((c) => c.group_id === groupId).sort(byPosition)

  async function add(e: FormEvent) {
    e.preventDefault()
    setError('')
    const ungrouped = inGroup(null)
    const position = ungrouped.length ? ungrouped[ungrouped.length - 1].position + 1 : 0
    // user_id wird per Default (auth.uid()) in der DB gesetzt.
    const { error } = await supabase.from('wow_characters').insert({
      game,
      region,
      realm: realm.trim().toLowerCase(),
      name: name.trim().toLowerCase(),
      position,
    })
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

  async function addGroup(e: FormEvent) {
    e.preventDefault()
    const position = groups.length ? Math.max(...groups.map((g) => g.position)) + 1 : 0
    const { error } = await supabase.from('wow_groups').insert({ name: groupName.trim(), position })
    if (error) return setError(error.message)
    setGroupName('')
    load()
  }

  async function renameGroup(id: string, newName: string) {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name: newName } : g)))
    const { error } = await supabase.from('wow_groups').update({ name: newName }).eq('id', id)
    if (error) {
      setError(error.message)
      load()
    }
  }

  async function removeGroup(g: Group) {
    if (!confirm(`Gruppe „${g.name}“ löschen? Die Charaktere bleiben erhalten (ohne Gruppe).`)) return
    const { error } = await supabase.from('wow_groups').delete().eq('id', g.id)
    if (error) return setError(error.message)
    load()
  }

  // Verschiebt einen Charakter in eine Gruppe (null = ohne Gruppe), vor beforeId oder ans Ende.
  async function move(id: string, groupId: string | null, beforeId: string | null) {
    const moving = chars.find((c) => c.id === id)
    if (!moving || id === beforeId) return
    const target = chars.filter((c) => c.group_id === groupId && c.id !== id).sort(byPosition)
    const index = beforeId ? target.findIndex((c) => c.id === beforeId) : -1
    target.splice(index < 0 ? target.length : index, 0, { ...moving, group_id: groupId })
    const updated = target.map((c, i) => ({ ...c, position: i }))
    const changed = updated.filter((u) => {
      const old = chars.find((c) => c.id === u.id)!
      return old.group_id !== u.group_id || old.position !== u.position
    })
    if (!changed.length) return

    setChars((prev) => prev.map((c) => updated.find((u) => u.id === c.id) ?? c))
    const results = await Promise.all(
      changed.map((u) =>
        supabase.from('wow_characters').update({ group_id: u.group_id, position: u.position }).eq('id', u.id),
      ),
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) {
      setError(failed.error.message)
      load()
    }
  }

  function endDrag() {
    setDragId(null)
    setDropGroup(null)
  }

  // Ablage auf einer Gruppe (ans Ende) oder auf einem Charakter (davor).
  function dropHandlers(groupId: string | null, beforeId: string | null = null) {
    return {
      onDragOver: (e: DragEvent) => {
        if (!dragId) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDropGroup(groupId ?? '')
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (dragId) move(dragId, groupId, beforeId)
        endDrag()
      },
    }
  }

  function renderChar(c: Character) {
    const s = summaries[c.id]
    const p = s?.profile
    return (
      <li
        key={c.id}
        draggable
        className={dragId === c.id ? 'dragging' : ''}
        style={{ borderLeftColor: p ? CLASS_COLORS[p.character_class.id] : undefined }}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', c.id)
          e.dataTransfer.effectAllowed = 'move'
          setDragId(c.id)
        }}
        onDragEnd={endDrag}
        {...dropHandlers(c.group_id, c.id)}
      >
        <Link to={c.id} draggable={false}>
          {asset(s?.media, 'avatar') ? (
            <img src={asset(s?.media, 'avatar')} alt="" draggable={false} />
          ) : (
            <span className="avatar" />
          )}
          <div>
            <strong>{p?.name ?? c.name}</strong>
            <small>
              {p?.realm.name ?? c.realm} · {c.region.toUpperCase()}
              {c.game !== 'retail' && <> · <span className="game">{gameLabel(c.game)}</span></>}
            </small>
            <small>
              {p
                ? `Stufe ${p.level} ${p.active_spec?.name ?? ''} ${p.character_class.name}` +
                  (p.equipped_item_level ? ` · ilvl ${p.equipped_item_level}` : '')
                : (s?.error ?? 'Lade…')}
            </small>
          </div>
        </Link>
        {groups.length > 0 && (
          // Ersatz für Drag & Drop auf Touch-Geräten (dort per CSS sichtbar).
          <select
            className="move"
            value={c.group_id ?? ''}
            onChange={(e) => move(c.id, e.target.value || null, null)}
            aria-label="In Gruppe verschieben"
          >
            <option value="">Ohne Gruppe</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}
        <button onClick={() => remove(c.id)} aria-label="Löschen">✕</button>
      </li>
    )
  }

  function renderSection(group: Group | null) {
    const list = inGroup(group?.id ?? null)
    const key = group?.id ?? ''
    // Ohne Gruppen gibt es nur die schlichte Liste, ohne Überschrift.
    if (!group && groups.length === 0) return <ul className="chars">{list.map(renderChar)}</ul>
    if (!group && list.length === 0 && !dragId) return null
    return (
      <section
        key={key}
        className={`group${dropGroup === key ? ' over' : ''}`}
        {...dropHandlers(group?.id ?? null)}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropGroup(null)
        }}
      >
        {group ? (
          <GroupHeader group={group} count={list.length} onRename={(n) => renameGroup(group.id, n)} onRemove={() => removeGroup(group)} />
        ) : (
          <h2>Ohne Gruppe</h2>
        )}
        {list.length > 0 ? <ul className="chars">{list.map(renderChar)}</ul> : <p className="empty">Charaktere hierher ziehen</p>}
      </section>
    )
  }

  return (
    <>
      <h1>WoW Companion</h1>
      <form onSubmit={add}>
        <select value={game} onChange={(e) => setGame(e.target.value as Game)} aria-label="Spielversion">
          {GAMES.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
        <select value={region} onChange={(e) => setRegion(e.target.value as Region)} aria-label="Region">
          <option value="eu">EU</option>
          <option value="us">US</option>
        </select>
        {realmError ? (
          <input value={realm} onChange={(e) => setRealm(e.target.value)} placeholder="Realm-Slug, z. B. thunderstrike" required />
        ) : (
          <select value={realm} onChange={(e) => setRealm(e.target.value)} required aria-label="Realm">
            <option value="">{realms.length ? 'Realm wählen' : 'Lade Realms…'}</option>
            {realms.map((r) => (
              <option key={r.slug} value={r.slug}>{r.name}</option>
            ))}
          </select>
        )}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Charaktername" required />
        <button type="submit">Hinzufügen</button>
      </form>
      {realmError && <p><small>{realmError}</small></p>}
      <form onSubmit={addGroup}>
        <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Neue Gruppe, z. B. Mains" required />
        <button type="submit">Gruppe anlegen</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {groups.length > 0 && <p><small>Charaktere per Drag &amp; Drop in Gruppen ziehen und sortieren.</small></p>}
      {[...groups].sort(byPosition).map((g) => renderSection(g))}
      {renderSection(null)}
    </>
  )
}

function GroupHeader({
  group,
  count,
  onRename,
  onRemove,
}: {
  group: Group
  count: number
  onRename: (name: string) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(group.name)

  function save() {
    setEditing(false)
    const trimmed = value.trim()
    if (trimmed && trimmed !== group.name) onRename(trimmed)
    else setValue(group.name)
  }

  return (
    <div className="group-head">
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') {
              setValue(group.name)
              setEditing(false)
            }
          }}
          aria-label="Gruppenname"
        />
      ) : (
        <h2 onDoubleClick={() => setEditing(true)} title="Doppelklick zum Umbenennen">
          {group.name} <small>({count})</small>
        </h2>
      )}
      <button onClick={() => setEditing(true)} aria-label="Gruppe umbenennen">✎</button>
      <button onClick={onRemove} aria-label="Gruppe löschen">✕</button>
    </div>
  )
}
