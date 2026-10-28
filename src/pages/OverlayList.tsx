import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Clock3,
  Copy,
  ExternalLink,
  Layers3,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { AppShell } from '../components/AppShell'
import { cloneOverlay, createEmptyOverlay } from '../lib/elements'
import { deleteOverlay, loadOverlays, saveOverlay } from '../lib/storage'
import { buildHashUrl } from '../lib/urls'
import type { Overlay } from '../types'

export function OverlayList() {
  const navigate = useNavigate()
  const [overlays, setOverlays] = useState(() => loadOverlays())
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [error, setError] = useState('')

  const filtered = useMemo(
    () => overlays.filter((overlay) => overlay.name.toLowerCase().includes(query.toLowerCase())),
    [overlays, query],
  )

  function createOverlay() {
    const overlay = createEmptyOverlay(`Overlay ${overlays.length + 1}`)
    const result = saveOverlay(overlay)
    if (!result.ok || !result.value) return setError(result.error ?? 'Could not create overlay')
    setOverlays((items) => [...items, result.value!])
    navigate(`/overlays/editor/${overlay.id}`)
  }

  function duplicate(source: Overlay) {
    const overlay = cloneOverlay(source)
    const result = saveOverlay(overlay)
    if (!result.ok || !result.value) return setError(result.error ?? 'Could not duplicate overlay')
    setOverlays((items) => [...items, result.value!])
    setMenu(null)
  }

  function remove(overlay: Overlay) {
    if (!window.confirm(`Delete “${overlay.name}”? This cannot be undone.`)) return
    const result = deleteOverlay(overlay.id)
    if (!result.ok) return setError(result.error ?? 'Could not delete overlay')
    setOverlays((items) => items.filter((item) => item.id !== overlay.id))
    setMenu(null)
  }

  return (
    <AppShell>
      <main className="library-page">
        <section className="library-hero">
          <div>
            <div className="eyebrow"><Layers3 size={14} /> COMPOSITION WORKSPACE</div>
            <h1>Your overlays</h1>
            <p>Build precise, transparent layouts for OBS — one element at a time.</p>
          </div>
          <button className="primary-button" onClick={createOverlay}><Plus size={18} /> New empty overlay</button>
        </section>

        <div className="library-toolbar">
          <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search overlays" /></label>
          <span>{overlays.length} {overlays.length === 1 ? 'composition' : 'compositions'} · stored on this device</span>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {filtered.length ? (
          <section className="overlay-grid" aria-label="Saved overlays">
            {filtered.map((overlay) => (
              <article className="overlay-card" key={overlay.id}>
                <button className="overlay-thumbnail" onClick={() => navigate(`/overlays/editor/${overlay.id}`)}>
                  <div className="thumbnail-stage" style={{ aspectRatio: `${overlay.width}/${overlay.height}` }}>
                    <div className="thumbnail-grid" />
                    {overlay.elements.slice(-6).map((element) => (
                      <span
                        key={element.id}
                        style={{
                          left: `${(element.x / overlay.width) * 100}%`,
                          top: `${(element.y / overlay.height) * 100}%`,
                          width: `${(element.width / overlay.width) * 100}%`,
                          height: `${(element.height / overlay.height) * 100}%`,
                          borderColor: element.visible ? '#8b5cf6' : '#373744',
                        }}
                      />
                    ))}
                    {!overlay.elements.length && <div className="empty-thumb"><Layers3 /><small>EMPTY CANVAS</small></div>}
                  </div>
                </button>
                <div className="overlay-card-info">
                  <div><h2>{overlay.name}</h2><p><Clock3 size={13} /> Updated {new Date(overlay.updatedAt).toLocaleDateString()}</p></div>
                  <div className="card-menu-wrap">
                    <button className="icon-button" aria-label="Overlay menu" onClick={() => setMenu(menu === overlay.id ? null : overlay.id)}><MoreHorizontal /></button>
                    {menu === overlay.id && (
                      <div className="card-menu">
                        <button onClick={() => navigate(`/overlays/editor/${overlay.id}`)}><ArrowRight /> Open editor</button>
                        <button onClick={() => window.open(buildHashUrl(`/overlay/${overlay.publicId}`), '_blank')}><ExternalLink /> Open output</button>
                        <button onClick={() => duplicate(overlay)}><Copy /> Duplicate</button>
                        <button className="danger" onClick={() => remove(overlay)}><Trash2 /> Delete</button>
                      </div>
                    )}
                  </div>
                </div>
                <footer><span>{overlay.width} × {overlay.height}</span><span>{overlay.elements.length} layers</span><span className={overlay.publishedAt ? 'published' : ''}>{overlay.publishedAt ? 'Published' : 'Draft'}</span></footer>
              </article>
            ))}
          </section>
        ) : (
          <section className="empty-library">
            <div className="empty-library-icon"><Layers3 /></div>
            <h2>{query ? 'No overlays match your search' : 'Start with an empty canvas'}</h2>
            <p>{query ? 'Try a different name.' : 'Nothing is added automatically. Choose every widget, frame, and visual yourself.'}</p>
            {!query && <button className="primary-button" onClick={createOverlay}><Plus size={18} /> Create empty overlay</button>}
          </section>
        )}

        <aside className="storage-note">
          <strong>Local-only workspace</strong>
          <span>Designs are saved in this browser. They are not synced to another device or account.</span>
        </aside>
      </main>
    </AppShell>
  )
}
