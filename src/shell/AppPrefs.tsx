import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { apps } from '../registry'
import type { AppManifest } from '../registry/types'

// Persönliche App-Anordnung und Archiv (Tabelle shell_app_prefs, 0011_shell_app_prefs.sql).

interface Pref {
  position: number | null
  archived: boolean
}

interface AppPrefsState {
  /** Sichtbare Apps in der Reihenfolge des Nutzers. */
  visible: AppManifest[]
  archived: AppManifest[]
  /** Verschiebt eine App vor beforeId (null = ans Ende). */
  move: (id: string, beforeId: string | null) => void
  setArchived: (id: string, archived: boolean) => void
  error: string
}

const manifestIndex = new Map(apps.map((a, i) => [a.id, i]))

const AppPrefsContext = createContext<AppPrefsState>({
  visible: apps,
  archived: [],
  move: () => {},
  setArchived: () => {},
  error: '',
})

export function AppPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Record<string, Pref>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('shell_app_prefs')
      .select('app_id, position, archived')
      .then(({ data, error }) => {
        // Ohne Tabelle (Migration fehlt) einfach die Standard-Reihenfolge zeigen.
        if (error) return setError(`App-Anordnung nicht ladbar: ${error.message}`)
        setPrefs(Object.fromEntries((data as ({ app_id: string } & Pref)[]).map((p) => [p.app_id, p])))
      })
  }, [])

  const sorted = useMemo(
    () =>
      [...apps].sort((a, b) => {
        const pa = prefs[a.id]?.position ?? null
        const pb = prefs[b.id]?.position ?? null
        if (pa != null && pb != null) return pa - pb
        if (pa != null) return -1
        if (pb != null) return 1
        return manifestIndex.get(a.id)! - manifestIndex.get(b.id)!
      }),
    [prefs],
  )
  const visible = useMemo(() => sorted.filter((a) => !prefs[a.id]?.archived), [sorted, prefs])
  const archived = useMemo(() => sorted.filter((a) => prefs[a.id]?.archived), [sorted, prefs])

  const save = useCallback(async (rows: Record<string, unknown>[]) => {
    // user_id setzt die DB per Default; Konflikt auf (user_id, app_id) aktualisiert nur die gesendeten Spalten.
    const { error } = await supabase.from('shell_app_prefs').upsert(rows, { onConflict: 'user_id,app_id' })
    setError(error ? `Speichern fehlgeschlagen: ${error.message}` : '')
  }, [])

  const move = useCallback(
    (id: string, beforeId: string | null) => {
      if (id === beforeId) return
      const ids = visible.map((a) => a.id).filter((x) => x !== id)
      const index = beforeId ? ids.indexOf(beforeId) : -1
      ids.splice(index < 0 ? ids.length : index, 0, id)
      setPrefs((prev) => {
        const next = { ...prev }
        ids.forEach((appId, i) => (next[appId] = { archived: prev[appId]?.archived ?? false, position: i }))
        return next
      })
      save(ids.map((appId, i) => ({ app_id: appId, position: i })))
    },
    [visible, save],
  )

  const setArchived = useCallback(
    (id: string, value: boolean) => {
      setPrefs((prev) => ({ ...prev, [id]: { position: prev[id]?.position ?? null, archived: value } }))
      save([{ app_id: id, archived: value }])
    },
    [save],
  )

  const value = useMemo(() => ({ visible, archived, move, setArchived, error }), [visible, archived, move, setArchived, error])
  return <AppPrefsContext.Provider value={value}>{children}</AppPrefsContext.Provider>
}

export const useAppPrefs = () => useContext(AppPrefsContext)
