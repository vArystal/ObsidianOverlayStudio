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
import { ConfirmDialog } from '../components/ConfirmDialog'
import { cloneOverlay, createEmptyOverlay } from '../lib/elements'
import { deleteOverlay, encodeOverlaySnapshot, loadOverlays, saveOverlay } from '../lib/storage'
import { snapshotBudget } from '../lib/images'
import { getPublicIntegrationConfig } from '../lib/integration'
import { buildHashUrl } from '../lib/urls'
import type { Overlay } from '../types'

export function OverlayList() {
  const navigate = useNavigate()
  const [overlays, setOverlays] = useState(() => loadOverlays())
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Overlay | null>(null)
  const liveConfig = useMemo(() => getPublicIntegrationConfig(), [])
  const [error, setError] = useState('')

  const filtered = useMemo(
    () => overlays.filter((overlay) => overlay.name.toLowerCase().includes(query.toLowerCase())),
    [overlays, query],
  )

  function createOverlay() {
    const overlay = createEmptyOverlay(`Overlay ${overlays.length + 1}`)
    overlay.live = getPublicIntegrationConfig()
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
    setPendingDelete(overlay)
    setMenu(null)
  }

  function confirmDelete() {
    if (!pendingDelete) return
    const result = deleteOverlay(pendingDelete.id)
    if (!result.ok) { setError(result.error ?? 'Could not delete overlay'); setPendingDelete(null); return }
    setOverlays((items) => items.filter((item) => item.id !== pendingDelete.id))
    setPendingDelete(null)
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

        <div className="library-stats" aria-label="Workspace summary">
          <div><small>COMPOSITIONS</small><strong>{overlays.length}</strong></div>
          <div><small>LAYERS</small><strong>{overlays.reduce((total, overlay) => total + overlay.elements.length, 0)}</strong></div>
          <div><small>PUBLISHED</small><strong>{overlays.filter((overlay) => overlay.publishedAt).length}</strong></div>
          <div><small>KICK</small><strong className={liveConfig ? 'stat-live' : 'stat-idle'}>{liveConfig ? `Connected · ${liveConfig.channelName || 'channel'}` : 'Not connected'}</strong></div>
        </div>

        <div className="library-toolbar">
          <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search overlays" /></label>
          <span>{overlays.length} {overlays.length === 1 ? 'composition' : 'compositions'} · stored on this device</span>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {filtered.length ? (
          <section className="overlay-grid" aria-label="Saved overlays">
            {filtered.map((overlay) => (
              <article className="overlay-card" key={overlay.id}>
                {/* The thumbnail is the card's edit affordance, but it contains only decorative marks,
                    so without a name a screen reader announces an unlabelled button. */}
                <button className="overlay-thumbnail" aria-label={`Edit ${overlay.name}`} onClick={() => navigate(`/overlays/editor/${overlay.id}`)}>
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
                          borderColor: element.visible ? 'rgba(216,173,85,.85)' : 'rgba(185,169,196,.28)',
                          background: element.visible ? 'rgba(216,173,85,.12)' : 'rgba(185,169,196,.06)',
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
                        {(() => {
                          // The saved composition must travel in the URL: a bare /overlay/<id> resolves
                          // only in the browser that authored it, which is useless for OBS.
                          const snapshot = encodeOverlaySnapshot(overlay)
                          const budget = snapshotBudget(snapshot.length)
                          const href = buildHashUrl(`/overlay/${overlay.publicId}?snapshot=${snapshot}`)
                          return <button
                            onClick={() => window.open(href, '_blank')}
                            title={budget.level === 'blocked' ? budget.message : 'Open this saved composition in a clean output window'}
                          ><ExternalLink /> Open output{budget.level !== 'ok' ? ` (${budget.level})` : ''}</button>
                        })()}
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
            <p>{query ? 'Try a different name.' : 'Build a 1920×1080 transparent layout, then point an OBS Browser Source at it.'}</p>
            {!query && (
              <>
                <ol className="onboarding-steps">
                  <li><b>1</b><span>Create an overlay and set its size.</span></li>
                  <li><b>2</b><span>Add widgets: chat, alerts, viewer count, ornaments.</span></li>
                  <li><b>3</b><span>Publish, then paste the output link into OBS.</span></li>
                </ol>
                <button className="primary-button" onClick={createOverlay}><Plus size={18} /> Create empty overlay</button>
              </>
            )}
          </section>
        )}

        <aside className="storage-note">
          <strong>Local-only workspace</strong>
          <span>Designs are saved in this browser. They are not synced to another device or account.</span>
        </aside>
      </main>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this overlay?"
        description={pendingDelete ? `“${pendingDelete.name}” and its ${pendingDelete.elements.length} layer${pendingDelete.elements.length === 1 ? '' : 's'} will be removed from this browser. Published links keep working until you republish.` : ''}
        confirmLabel="Delete overlay"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </AppShell>
  )
}
