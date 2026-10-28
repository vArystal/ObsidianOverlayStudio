import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Copy, Info, Layers3, PanelLeft, PanelRight, X } from 'lucide-react'
import { AppShell } from '../components/AppShell'
import { Canvas } from '../components/editor/Canvas'
import { CanvasControls } from '../components/editor/CanvasControls'
import { EditorToolbar } from '../components/editor/EditorToolbar'
import { ElementsPanel } from '../components/editor/ElementsPanel'
import { PropertiesPanel } from '../components/editor/PropertiesPanel'
import { clampElement } from '../lib/geometry'
import { createElement, duplicateElement } from '../lib/elements'
import { encodeOverlaySnapshot, getOverlay, saveOverlay } from '../lib/storage'
import { getPublicIntegrationConfig, integrationRequest } from '../lib/integration'
import { getTheme } from '../lib/themes'
import { buildHashUrl } from '../lib/urls'
import type { ElementType, Overlay, OverlayElement } from '../types'

const MAX_HISTORY = 60
const VALID_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsDataURL(file)
  })
}

export function OverlayEditor() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const initial = useMemo(() => getOverlay(id), [id])
  const [overlay, setOverlay] = useState<Overlay | null>(initial ?? null)
  const overlayRef = useRef(overlay)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [past, setPast] = useState<Overlay[]>([])
  const [future, setFuture] = useState<Overlay[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState(false)
  const [zoom, setZoom] = useState<number | null>(null)
  const [actualScale, setActualScale] = useState(0.5)
  const [testAlertNonce, setTestAlertNonce] = useState(0)
  const [publishUrl, setPublishUrl] = useState('')
  const [mobilePanel, setMobilePanel] = useState<'left' | 'right' | null>(null)
  const interactionStart = useRef<Overlay | null>(null)

  useEffect(() => { overlayRef.current = overlay }, [overlay])

  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', listener)
    return () => window.removeEventListener('beforeunload', listener)
  }, [dirty])

  const commit = useCallback((transform: (value: Overlay) => Overlay) => {
    setOverlay((current) => {
      if (!current) return current
      const next = transform(current)
      if (next === current || JSON.stringify(next) === JSON.stringify(current)) return current
      setPast((items) => [...items.slice(-(MAX_HISTORY - 1)), structuredClone(current)])
      setFuture([])
      setDirty(true)
      setSaveError('')
      overlayRef.current = next
      return next
    })
  }, [])

  const undo = useCallback(() => {
    setPast((items) => {
      const previous = items[items.length - 1]
      if (!previous) return items
      setOverlay((current) => {
        if (current) setFuture((values) => [structuredClone(current), ...values].slice(0, MAX_HISTORY))
        return structuredClone(previous)
      })
      setDirty(true)
      return items.slice(0, -1)
    })
  }, [])

  const redo = useCallback(() => {
    setFuture((items) => {
      const next = items[0]
      if (!next) return items
      setOverlay((current) => {
        if (current) setPast((values) => [...values.slice(-(MAX_HISTORY - 1)), structuredClone(current)])
        return structuredClone(next)
      })
      setDirty(true)
      return items.slice(1)
    })
  }, [])

  const save = useCallback((options: { quiet?: boolean } = {}) => {
    const current = overlayRef.current
    if (!current) return false
    if (!options.quiet) setSaving(true)
    const result = saveOverlay(current)
    if (!options.quiet) setSaving(false)
    if (!result.ok || !result.value) {
      // Keep `dirty` set: the edit is still only in memory, so the toolbar keeps warning and
      // the autosave loop retries on the next change instead of reporting a false success.
      setSaveError(result.error ?? 'Save failed')
      return false
    }
    // A quiet save must not replace the live overlay object: the user may be mid-drag, and a
    // fresh identity would interrupt the pointer session. The stored copy already has the data.
    if (!options.quiet) setOverlay(result.value)
    setDirty(false)
    setSaveError('')
    if (!options.quiet) {
      setNotice('Overlay saved to this browser')
      window.setTimeout(() => setNotice(''), 2200)
    }
    return true
  }, [])

  /**
   * Autosave. Every edit marks the overlay dirty; 700 ms after the user stops, it is written to
   * storage. Without this, leaving the editor with the nav link unmounted the page and silently
   * dropped the change, because only the explicit Save button and Ctrl+S persisted anything.
   */
  useEffect(() => {
    if (!dirty || !overlay) return
    const timer = window.setTimeout(() => { save({ quiet: true }) }, 700)
    return () => window.clearTimeout(timer)
  }, [dirty, overlay, save])

  // Route changes and tab closes do not always fire beforeunload, so flush synchronously on unmount.
  useEffect(() => () => {
    const current = overlayRef.current
    if (!current) return
    const stored = getOverlay(current.id)
    if (!stored || JSON.stringify(stored) !== JSON.stringify(current)) saveOverlay(current)
  }, [])


  const selected = overlay?.elements.find((element) => element.id === selectedId) ?? null

  const patchElementById = useCallback((elementId: string, patch: Partial<OverlayElement>) => {
    commit((current) => ({
      ...current,
      elements: current.elements.map((element) => element.id === elementId
        ? clampElement({ ...element, ...patch }, current.width, current.height)
        : element),
    }))
  }, [commit])

  const addElement = useCallback((type: ElementType) => {
    if (!overlayRef.current) return
    const fresh = clampElement(createElement(type, overlayRef.current.elements.length), overlayRef.current.width, overlayRef.current.height)
    commit((current) => ({ ...current, elements: [...current.elements, fresh] }))
    setSelectedId(fresh.id)
    setPreview(false)
    setMobilePanel(type === 'image' ? 'right' : null)
  }, [commit])

  const deleteElement = useCallback((elementId: string) => {
    commit((current) => ({ ...current, elements: current.elements.filter((element) => element.id !== elementId) }))
    if (selectedId === elementId) setSelectedId(null)
  }, [commit, selectedId])

  const duplicate = useCallback((elementId: string) => {
    const current = overlayRef.current
    const source = current?.elements.find((element) => element.id === elementId)
    if (!source || !current) return
    const copy = clampElement(duplicateElement(source, current.elements.length), current.width, current.height)
    commit((value) => ({ ...value, elements: [...value.elements, copy] }))
    setSelectedId(copy.id)
  }, [commit])

  const moveLayer = useCallback((elementId: string, direction: 'up' | 'down') => {
    commit((current) => {
      const index = current.elements.findIndex((element) => element.id === elementId)
      const target = direction === 'up' ? index + 1 : index - 1
      if (index < 0 || target < 0 || target >= current.elements.length) return current
      const elements = [...current.elements]
      ;[elements[index], elements[target]] = [elements[target], elements[index]]
      return { ...current, elements }
    })
  }, [commit])

  const moveLayerEdge = useCallback((elementId: string, edge: 'front' | 'back') => {
    commit((current) => {
      const item = current.elements.find((element) => element.id === elementId)
      if (!item) return current
      const rest = current.elements.filter((element) => element.id !== elementId)
      return { ...current, elements: edge === 'front' ? [...rest, item] : [item, ...rest] }
    })
  }, [commit])

  const renameLayer = useCallback((elementId: string) => {
    const element = overlayRef.current?.elements.find((item) => item.id === elementId)
    if (!element) return
    const name = window.prompt('Layer name', element.name)?.trim()
    if (name) patchElementById(elementId, { name })
  }, [patchElementById])

  const alignSelected = useCallback((horizontal?: 'left' | 'center' | 'right', vertical?: 'top' | 'center' | 'bottom') => {
    if (!selectedId) return
    commit((current) => ({
      ...current,
      elements: current.elements.map((element) => {
        if (element.id !== selectedId) return element
        let { x, y } = element
        if (horizontal === 'left') x = 0
        if (horizontal === 'center') x = (current.width - element.width) / 2
        if (horizontal === 'right') x = current.width - element.width
        if (vertical === 'top') y = 0
        if (vertical === 'center') y = (current.height - element.height) / 2
        if (vertical === 'bottom') y = current.height - element.height
        return { ...element, x: Math.round(x), y: Math.round(y) }
      }),
    }))
  }, [commit, selectedId])

  function beginInteraction() {
    interactionStart.current = overlayRef.current ? structuredClone(overlayRef.current) : null
  }

  function liveElement(next: OverlayElement) {
    setOverlay((current) => {
      if (!current) return current
      const updated = { ...current, elements: current.elements.map((item) => item.id === next.id ? next : item) }
      overlayRef.current = updated
      return updated
    })
  }

  function endInteraction() {
    if (!interactionStart.current) return
    const original = interactionStart.current
    interactionStart.current = null
    if (JSON.stringify(original) !== JSON.stringify(overlayRef.current)) {
      setPast((items) => [...items.slice(-(MAX_HISTORY - 1)), original])
      setFuture([])
      setDirty(true)
    }
  }

  const handleScaleChange = useCallback((scale: number) => setActualScale(scale), [])

  async function upload(file: File, target: 'image' | 'alert-image' | 'alert-sound', elementId = selectedId) {
    const audio = target === 'alert-sound'
    const valid = audio ? ['audio/mpeg', 'audio/wav', 'audio/ogg'].includes(file.type) : VALID_IMAGE_TYPES.includes(file.type)
    if (!valid) return setNotice(audio ? 'Use MP3, WAV, or OGG audio.' : 'Use PNG, JPEG, or WebP images.')
    if (file.size > 2 * 1024 * 1024) return setNotice('File is too large. Maximum size is 2 MB.')
    try {
      const data = await readFile(file)
      if (!elementId) return
      if (target === 'image') {
        const image = new Image()
        image.onload = () => {
          const current = overlayRef.current?.elements.find((item) => item.id === elementId)
          const ratio = image.naturalWidth / image.naturalHeight
          patchElementById(elementId, { width: current?.width ?? 360, height: (current?.width ?? 360) / ratio, maintainAspectRatio: true, props: { ...(current?.props ?? {}), src: data, alt: file.name } })
        }
        image.src = data
      } else {
        const current = overlayRef.current?.elements.find((item) => item.id === elementId)
        patchElementById(elementId, { props: { ...(current?.props ?? {}), [target === 'alert-image' ? 'imageSrc' : 'soundSrc']: data, ...(audio ? { soundName: file.name } : {}) } })
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Upload failed')
    }
  }

  async function uploadAsset(file: File) {
    if (!VALID_IMAGE_TYPES.includes(file.type)) return setNotice('Use PNG, JPEG, or WebP images.')
    if (file.size > 2 * 1024 * 1024) return setNotice('File is too large. Maximum size is 2 MB.')
    const current = overlayRef.current
    if (!current) return
    try {
      const data = await readFile(file)
      const image = new Image()
      image.onload = () => {
        const element = createElement('image', current.elements.length)
        element.name = file.name.replace(/\.[^.]+$/, '') || 'Image'
        element.props = { ...element.props, src: data, alt: file.name }
        element.height = element.width / (image.naturalWidth / image.naturalHeight)
        const next = clampElement(element, current.width, current.height)
        commit((value) => ({ ...value, elements: [...value.elements, next] }))
        setSelectedId(next.id)
        setMobilePanel('right')
      }
      image.src = data
    } catch { setNotice('Could not read that image.') }
  }

  async function uploadBackground(file: File) {
    if (!VALID_IMAGE_TYPES.includes(file.type) || file.size > 2 * 1024 * 1024) return setNotice('Planning backgrounds must be PNG, JPEG, or WebP under 2 MB.')
    try {
      const data = await readFile(file)
      commit((current) => ({ ...current, settings: { ...current.settings, backgroundImage: data } }))
    } catch { setNotice('Could not read that background.') }
  }

  function testWidget() {
    if (!selected) return
    setTestAlertNonce((value) => value + 1)
    if (selected.type === 'alert' && selected.props.soundEnabled && selected.props.soundSrc) {
      const audio = new Audio(String(selected.props.soundSrc))
      audio.volume = 0.65
      void audio.play().catch(() => setNotice('The browser blocked audio playback.'))
    }
    setNotice(selected.type === 'alert' ? 'Preview alert triggered — no real event was sent' : 'Widget preview refreshed')
    window.setTimeout(() => setNotice(''), 2600)
  }

  function changeResolution(value: string) {
    if (value === 'custom') {
      const current = overlayRef.current
      if (!current) return
      const width = Number(window.prompt('Canvas width (320–7680)', String(current.width)))
      const height = Number(window.prompt('Canvas height (240–4320)', String(current.height)))
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 320 || height < 240 || width > 7680 || height > 4320) return setNotice('Enter a valid canvas size between 320 × 240 and 7680 × 4320.')
      commit((item) => ({ ...item, width: Math.round(width), height: Math.round(height) }))
    } else {
      const [width, height] = value.split('x').map(Number)
      commit((item) => ({ ...item, width, height }))
    }
    setZoom(null)
  }

  function setCanvasSize(width: number, height: number) {
    if (width < 320 || height < 240 || width > 7680 || height > 4320) return
    commit((current) => ({ ...current, width: Math.round(width), height: Math.round(height) }))
    setZoom(null)
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      const input = document.createElement('textarea')
      input.value = value
      document.body.appendChild(input)
      input.select()
      const copied = document.execCommand('copy')
      input.remove()
      return copied
    }
  }

  async function publish() {
    const current = overlayRef.current
    if (!current) return
    let published: Overlay = { ...current, publishedAt: new Date().toISOString() }
    let liveRegistration = ''
    if (published.live) {
      try {
        const registration = await integrationRequest<{ publicationId: string; runtimeKey: string }>('/api/overlays/publish', { method: 'POST', body: JSON.stringify({ overlayId: published.publicId }) })
        published = { ...published, live: { ...published.live, runtimeKey: registration.runtimeKey } }
        liveRegistration = ` · live ID ${registration.publicationId.slice(0, 8)}`
      } catch {
        setNotice('Static snapshot published; live registration needs an active Integrations session')
      }
    }
    const result = saveOverlay(published)
    if (!result.ok || !result.value) {
      setSaveError(result.error ?? 'Could not publish this overlay')
      return
    }
    setOverlay(result.value)
    setDirty(false)
    const snapshot = encodeOverlaySnapshot(result.value)
    const url = buildHashUrl(`/overlay/${result.value.publicId}?snapshot=${snapshot}`)
    setPublishUrl(url)
    await copyText(url)
    if (liveRegistration) setNotice(`Published with stable server-backed live runtime${liveRegistration}`)
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.key.toLowerCase() === 's') { event.preventDefault(); save(); return }
      if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return }
      if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return }
      if (editing || !selectedId) return
      if (modifier && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicate(selectedId); return }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteElement(selectedId); return }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault()
        const amount = event.shiftKey ? 10 : 1
        commit((current) => ({
          ...current,
          elements: current.elements.map((element) => element.id === selectedId && !element.locked
            ? clampElement({ ...element, x: element.x + (event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0), y: element.y + (event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0) }, current.width, current.height)
            : element),
        }))
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [commit, deleteElement, duplicate, redo, save, selectedId, undo])

  if (!overlay) {
    return <AppShell><main className="not-found"><Layers3 /><h1>Overlay not found</h1><p>It may have been deleted, or this browser does not have the local design.</p><Link className="primary-button" to="/overlays"><ChevronLeft /> Return to overlays</Link></main></AppShell>
  }

  const resolution = ['1920x1080', '1280x720', '2560x1440'].includes(`${overlay.width}x${overlay.height}`) ? `${overlay.width}x${overlay.height}` : 'custom'

  return (
    <AppShell>
      <main className={`editor-page ${preview ? 'is-previewing' : ''} ${mobilePanel ? `show-${mobilePanel}` : ''}`}>
        <EditorToolbar
          name={overlay.name} dirty={dirty} saving={saving} saveError={saveError}
          canUndo={past.length > 0} canRedo={future.length > 0} preview={preview}
          resolution={resolution} themeId={overlay.theme.id} zoomPercent={Math.round(actualScale * 100)}
          selectedIsTestable={Boolean(selected)}
          onNameChange={(name) => commit((item) => ({ ...item, name }))}
          onSave={save} onUndo={undo} onRedo={redo} onPreview={() => { setPreview((value) => !value); setSelectedId(null) }}
          onResolution={changeResolution}
          onTheme={(themeId) => commit((item) => ({ ...item, theme: structuredClone(getTheme(themeId)) }))}
          onZoomIn={() => setZoom(Math.min(2, (zoom ?? actualScale) + 0.1))}
          onZoomOut={() => setZoom(Math.max(0.05, (zoom ?? actualScale) - 0.1))}
          onFit={() => setZoom(null)} onCopyUrl={publish} onTest={testWidget}
        />
        <div className="mobile-editor-tabs">
          <button onClick={() => setMobilePanel(mobilePanel === 'left' ? null : 'left')}><PanelLeft /> Elements & layers</button>
          <button onClick={() => setMobilePanel(mobilePanel === 'right' ? null : 'right')}><PanelRight /> Properties</button>
        </div>
        <div className="editor-workspace">
          <ElementsPanel
            elements={overlay.elements} selectedId={selectedId} onAdd={addElement} onSelect={(value) => { setSelectedId(value); setPreview(false) }}
            onToggleVisible={(elementId) => { const item = overlay.elements.find((element) => element.id === elementId); if (item) patchElementById(elementId, { visible: !item.visible }) }}
            onToggleLock={(elementId) => { const item = overlay.elements.find((element) => element.id === elementId); if (item) patchElementById(elementId, { locked: !item.locked }) }}
            onRename={renameLayer} onMoveLayer={moveLayer} onDuplicate={duplicate} onDelete={deleteElement}
            onUploadAsset={uploadAsset} onUploadBackground={uploadBackground}
          />
          <section className="canvas-column">
            <Canvas
              overlay={overlay} selectedId={selectedId} preview={preview} zoom={zoom} testAlertNonce={testAlertNonce}
              onSelect={setSelectedId} onLiveElement={liveElement} onInteractionStart={beginInteraction} onInteractionEnd={endInteraction}
              onScaleChange={handleScaleChange}
            />
            {!preview && <CanvasControls
              grid={overlay.settings.showGrid} snap={overlay.settings.snap} safe={overlay.settings.showSafeArea} transparent={overlay.settings.transparent}
              onGrid={() => commit((item) => ({ ...item, settings: { ...item.settings, showGrid: !item.settings.showGrid } }))}
              onSnap={() => commit((item) => ({ ...item, settings: { ...item.settings, snap: !item.settings.snap } }))}
              onSafe={() => commit((item) => ({ ...item, settings: { ...item.settings, showSafeArea: !item.settings.showSafeArea } }))}
              onTransparent={() => commit((item) => ({ ...item, settings: { ...item.settings, transparent: !item.settings.transparent } }))}
              onFit={() => setZoom(null)}
            />}
          </section>
          <PropertiesPanel
            overlay={overlay} element={selected}
            onPatch={(patch) => selectedId && patchElementById(selectedId, patch)}
            onProp={(key, value) => selectedId && patchElementById(selectedId, { props: { ...(selected?.props ?? {}), [key]: value } })}
            onAlign={alignSelected} onLayerEdge={(edge) => selectedId && moveLayerEdge(selectedId, edge)}
            onDuplicate={() => selectedId && duplicate(selectedId)} onDelete={() => selectedId && deleteElement(selectedId)}
            onUpload={upload} onTest={testWidget} onCanvasSize={setCanvasSize}
            onTheme={(themeId) => commit((item) => ({ ...item, theme: structuredClone(getTheme(themeId)) }))}
            onStaticMotion={(staticMotion) => commit((item) => ({ ...item, staticMotion }))}
            onAttachLive={() => { const live = getPublicIntegrationConfig(); if (!live) { setNotice('Connect Kick from Integrations first'); return } commit((item) => ({ ...item, live })); setNotice(`Kick channel ${live.channelName} attached`) }}
          />
        </div>
        {mobilePanel && <button className="mobile-panel-scrim" aria-label="Close panel" onClick={() => setMobilePanel(null)} />}
        {notice && <div className="toast">{notice}</div>}
        {publishUrl && (
          <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPublishUrl('') }}>
            <section className="publish-modal" role="dialog" aria-modal="true" aria-labelledby="publish-title">
              <button className="modal-close" onClick={() => setPublishUrl('')}><X /></button>
              <div className="modal-icon"><Copy /></div>
              <h2 id="publish-title">OBS snapshot URL copied</h2>
              <p>This transparent output contains your current saved composition. Use these exact Browser Source dimensions:</p>
              <div className="resolution-recommendation"><span>Width <strong>{overlay.width}</strong></span><span>Height <strong>{overlay.height}</strong></span></div>
              <label className="url-field"><span>Browser Source URL</span><textarea readOnly value={publishUrl} onFocus={(event) => event.target.select()} /></label>
              <button className="primary-button full" onClick={async () => { await copyText(publishUrl); setNotice('URL copied') }}><Copy /> Copy URL again</button>
              <div className="publish-warning"><Info /><p><strong>Transparent OBS output:</strong> the secret-sanitized composition is embedded as a static fallback. With an attached, authenticated integration, Publish also registers this overlay’s stable server-backed live ID. A localhost URL works only while this machine’s dev server is running; production OAuth, webhooks, and remote OBS clients require public HTTPS. Snapshot URLs and embedded media cannot be revoked.</p></div>
            </section>
          </div>
        )}
      </main>
    </AppShell>
  )
}
