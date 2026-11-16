import { useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAppPrefs } from './AppPrefs'

export function Home() {
  const { visible, archived, move, setArchived, error } = useAppPrefs()
  const [editing, setEditing] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  function endDrag() {
    setDragId(null)
    setOverId(null)
  }

  // Ablageziel: vor einer App (id), ans Ende ('end') oder ins Archiv ('archive').
  function dropTarget(target: string) {
    return {
      onDragOver: (e: DragEvent) => {
        if (!dragId) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        setOverId(target)
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (dragId) {
          if (target === 'archive') setArchived(dragId, true)
          else move(dragId, target === 'end' ? null : target)
        }
        endDrag()
      },
    }
  }

  return (
    <div className="home">
      <div className="home-head">
        <h1>Deine Apps</h1>
        <button type="button" onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
          {editing ? 'Fertig' : 'Anordnen'}
        </button>
      </div>
      {editing && <p className="hint">Apps per Drag &amp; Drop oder mit ◀ ▶ sortieren, mit 📦 archivieren.</p>}
      {error && <p role="alert">{error}</p>}

      <div className={`grid${editing ? ' editing' : ''}`} {...dropTarget('end')}>
        {visible.map((app, i) => (
          <div
            key={app.id}
            className={`card-slot${dragId === app.id ? ' dragging' : ''}${overId === app.id && dragId !== app.id ? ' over' : ''}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', app.id)
              e.dataTransfer.effectAllowed = 'move'
              setDragId(app.id)
            }}
            onDragEnd={endDrag}
            {...dropTarget(app.id)}
          >
            <Link
              to={`/apps/${app.id}`}
              className="card"
              draggable={false}
              onClick={(e) => editing && e.preventDefault()}
            >
              <div className="icon">{app.icon}</div>
              <strong>{app.name}</strong>
              <small>v{app.version}</small>
            </Link>
            {editing && (
              <div className="card-tools">
                <button type="button" aria-label={`${app.name} nach vorne`} disabled={i === 0} onClick={() => move(app.id, visible[i - 1].id)}>◀</button>
                <button type="button" aria-label={`${app.name} nach hinten`} disabled={i === visible.length - 1} onClick={() => move(app.id, visible[i + 2]?.id ?? null)}>▶</button>
                <button type="button" aria-label={`${app.name} archivieren`} title="Archivieren" onClick={() => setArchived(app.id, true)}>📦</button>
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && <p className="hint">Alle Apps sind archiviert.</p>}
      </div>

      {dragId && (
        <div className={`archive-drop${overId === 'archive' ? ' over' : ''}`} {...dropTarget('archive')}>
          📦 Hierher ziehen zum Archivieren
        </div>
      )}

      {archived.length > 0 && (
        <details className="archive">
          <summary>Archiv ({archived.length})</summary>
          <ul>
            {archived.map((app) => (
              <li key={app.id}>
                <Link to={`/apps/${app.id}`}>
                  <span>{app.icon}</span> {app.name}
                </Link>
                <button type="button" onClick={() => setArchived(app.id, false)}>Wiederherstellen</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
