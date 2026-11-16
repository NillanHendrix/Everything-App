import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useMatch, useNavigate } from 'react-router-dom'
import { findApp } from '../registry'
import { useAppPrefs } from './AppPrefs'

export function AppMenu() {
  const navigate = useNavigate()
  const match = useMatch('/apps/:appId/*')
  const current = findApp(match?.params.appId)
  const { visible, archived } = useAppPrefs()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    // Archivierte Apps sind ausgeblendet, über die Suche aber weiter erreichbar.
    return q ? [...visible, ...archived].filter((a) => a.name.toLowerCase().includes(q) || a.id.includes(q)) : visible
  }, [query, visible, archived])
  const archivedIds = useMemo(() => new Set(archived.map((a) => a.id)), [archived])

  useEffect(() => {
    if (!open) return
    // Auf Touch-Geräten kein Autofokus: die Bildschirmtastatur würde die Liste verdecken
    if (!window.matchMedia('(pointer: coarse)').matches) inputRef.current?.focus()
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function toggle() {
    setOpen((o) => !o)
    setQuery('')
    setActive(0)
  }

  function select(id: string) {
    navigate(`/apps/${id}`)
    setOpen(false)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      select(results[active].id)
    }
  }

  return (
    <div className="appmenu" ref={rootRef} onKeyDown={onKeyDown}>
      <button type="button" className="trigger" aria-haspopup="listbox" aria-expanded={open} onClick={toggle}>
        {current ? `${current.icon} ${current.name}` : 'Apps'} <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="popover">
          <input
            ref={inputRef}
            type="search"
            placeholder="App suchen…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
          />
          <ul role="listbox">
            {results.map((app, i) => (
              <li
                key={app.id}
                role="option"
                aria-selected={app.id === current?.id}
                className={i === active ? 'active' : ''}
                onPointerEnter={() => setActive(i)}
                onClick={() => select(app.id)}
              >
                <span>{app.icon}</span> {app.name} <small>{archivedIds.has(app.id) ? 'Archiv' : `v${app.version}`}</small>
              </li>
            ))}
            {results.length === 0 && <li className="empty">Keine App gefunden</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
