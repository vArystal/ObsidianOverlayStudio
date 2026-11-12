import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, Check, ChevronLeft, Copy, Info, Layers3, PanelLeft, PanelRight, X } from 'lucide-react'
import { AppShell } from '../components/AppShell'
import { Canvas } from '../components/editor/Canvas'
import { CanvasControls } from '../components/editor/CanvasControls'
import { EditorToolbar } from '../components/editor/EditorToolbar'
import { ElementsPanel } from '../components/editor/ElementsPanel'
import { BackgroundSection } from '../components/editor/BackgroundSection'
import { PropertiesPanel } from '../components/editor/PropertiesPanel'
import { clampElement } from '../lib/geometry'
import { EMPTY_HISTORY, pushHistory, redoHistory, undoHistory, type HistoryState } from '../lib/history'
import { sameOverlay } from '../lib/overlayDiff'
import { createElement, duplicateElement } from '../lib/elements'
import { encodeOverlaySnapshot, getOverlay, saveOverlay } from '../lib/storage'
import { LAYER_MAX_EDGE, LAYER_TARGET_BYTES, optimizeImage, snapshotBudget } from '../lib/images'
import { deletePublication, getPublicIntegrationConfig, integrationRequest } from '../lib/integration'
import { getAlertHealth, subscribeAlertHealth } from '../lib/alertHealth'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { InputDialog } from '../components/editor/InputDialog'
import { normalizeAlertSettings, testAlertEvent, validateAlertAudio } from '../lib/alerts'
import { getTheme } from '../lib/themes'
import { buildHashUrl } from '../lib/urls'
import type { LiveOverlayEvent, ElementType, Overlay, OverlayElement } from '../types'

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
  const initial = useMemo(() => getOverlay(id), [id])
  const [overlay, setOverlay] = useState<Overlay | null>(initial ?? null)
  const overlayRef = useRef(overlay)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // CP41: history lives in a ref plus a render nonce. Nothing is pushed from inside a setState updater, so a
  // StrictMode double-invoke cannot duplicate a snapshot the way nested updaters did.
  const historyRef = useRef<HistoryState>({ ...EMPTY_HISTORY })
  const [historyNonce, bumpHistory] = useReducer((count: number) => count + 1, 0)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState(false)
  const [zoom, setZoom] = useState<number | null>(null)
  const [actualScale, setActualScale] = useState(0.5)
  const [testAlertNonce, setTestAlertNonce] = useState(0)
  // CP25: studio test plays are held here and handed to the canvas queue. They never leave this browser.
  const [alertTests, setAlertTests] = useState<LiveOverlayEvent[]>([])
  const [publishUrl, setPublishUrl] = useState('')
  // CP37: a failed alert-settings registration is a standing fact about this publication, so it lives until the
  // author re-publishes instead of fading out with the toast.
  const alertHealth = useSyncExternalStore(subscribeAlertHealth, getAlertHealth)
  const [publishIssue, setPublishIssue] = useState('')
  const [unpublishOpen, setUnpublishOpen] = useState(false)
  const [publishVerdict, setPublishVerdict] = useState<{ level: 'ok' | 'warn' | 'blocked'; message: string } | null>(null)
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
    const current = overlayRef.current
    if (!current) return
    const next = transform(current)
    // CP41: a structural compare against the same fields, not a JSON round-trip of every base64 image.
    if (next === current || sameOverlay(next, current)) return
    historyRef.current = pushHistory(historyRef.current, current)
    bumpHistory()
    overlayRef.current = next
    setOverlay(next)
    setDirty(true)
    setSaveError('')
  }, [])

  const applyHistory = useCallback((result: { state: HistoryState; overlay: Overlay } | null) => {
    if (!result) return
    historyRef.current = result.state
    bumpHistory()
    overlayRef.current = result.overlay
    setOverlay(result.overlay)
    setDirty(true)
  }, [])

  const undo = useCallback(() => applyHistory(undoHistory(historyRef.current, overlayRef.current)), [applyHistory])
  const redo = useCallback(() => applyHistory(redoHistory(historyRef.current, overlayRef.current)), [applyHistory])

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

  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null)
  const [resolutionOpen, setResolutionOpen] = useState(false)

  const submitRename = useCallback((values: Record<string, string>) => {
    const target = renameTarget
    setRenameTarget(null)
    const name = (values.name ?? '').trim()
    if (!target || !name || name.length > 80) return
    commit((current) => ({ ...current, elements: current.elements.map((element) => element.id === target.id ? { ...element, name } : element) }))
  }, [commit, renameTarget])

  const renameLayer = useCallback((elementId: string) => {
    const element = overlayRef.current?.elements.find((item) => item.id === elementId)
    if (!element) return
    setRenameTarget({ id: element.id, name: element.name })
  }, [])

  // Batched prop patch: presets set twenty keys in one click, and separate writes per key would each spread the
  // props snapshot captured at render time, so nineteen of them would be discarded.
  const patchPropsById = useCallback((elementId: string, patch: Record<string, unknown>) => {
    commit((current) => ({
      ...current,
      elements: current.elements.map((element) => element.id === elementId
        ? clampElement({ ...element, props: { ...element.props, ...patch } as OverlayElement['props'] }, current.width, current.height)
        : element),
    }))
  }, [commit])

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
      historyRef.current = pushHistory(historyRef.current, original)
      bumpHistory()
      setDirty(true)
    }
  }

  const handleScaleChange = useCallback((scale: number) => setActualScale(scale), [])

  async function upload(file: File, target: 'image' | 'alert-image' | 'alert-sound', elementId = selectedId) {
    const audio = target === 'alert-sound'
    if (audio) {
      // One validator, one limit, one message: this path used to accept 8 MB where the alert inspector allowed 600 KB.
      const verdict = validateAlertAudio(file)
      if (!verdict.ok) return setNotice(verdict.message)
    } else {
      if (!VALID_IMAGE_TYPES.includes(file.type)) return setNotice('Use PNG, JPEG, or WebP images.')
      if (file.size > 12 * 1024 * 1024) return setNotice('Image must be under 12 MB; larger files are downscaled, not stored raw.')
    }
    try {
      if (audio) {
        const data = await readFile(file)
        if (!elementId) return
        const current = overlayRef.current?.elements.find((item) => item.id === elementId)
        patchElementById(elementId, { props: { ...(current?.props ?? {}), soundSrc: data, soundName: file.name } })
        return
      }
      const optimized = await optimizeImage(file, { maxEdge: LAYER_MAX_EDGE, targetBytes: LAYER_TARGET_BYTES })
      if (!elementId) return
      if (target === 'image') {
        const current = overlayRef.current?.elements.find((item) => item.id === elementId)
        const width = current?.width ?? 360
        patchElementById(elementId, { width, height: Math.round(width / (optimized.width / optimized.height)), maintainAspectRatio: true, props: { ...(current?.props ?? {}), src: optimized.dataUrl, alt: file.name } })
      } else {
        const current = overlayRef.current?.elements.find((item) => item.id === elementId)
        patchElementById(elementId, { props: { ...(current?.props ?? {}), imageSrc: optimized.dataUrl } })
      }
      setNotice(optimized.note)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Upload failed')
    }
  }

  async function uploadAsset(file: File) {
    if (!VALID_IMAGE_TYPES.includes(file.type)) return setNotice('Use PNG, JPEG, or WebP images.')
    if (file.size > 12 * 1024 * 1024) return setNotice('Image must be under 12 MB; larger files are downscaled, not stored raw.')
    const current = overlayRef.current
    if (!current) return
    try {
      const optimized = await optimizeImage(file, { maxEdge: LAYER_MAX_EDGE, targetBytes: LAYER_TARGET_BYTES })
      const element = createElement('image', current.elements.length)
      element.name = file.name.replace(/\.[^.]+$/, '') || 'Image'
      element.props = { ...element.props, src: optimized.dataUrl, alt: file.name }
      element.height = Math.round(element.width / (optimized.width / optimized.height))
      const next = clampElement(element, current.width, current.height)
      commit((value) => ({ ...value, elements: [...value.elements, next] }))
      setSelectedId(next.id)
      setMobilePanel('right')
      setNotice(optimized.note)
    } catch { setNotice('Could not read that image.') }
  }

  async function uploadBackground(file: File) {
    if (!VALID_IMAGE_TYPES.includes(file.type) || file.size > 12 * 1024 * 1024) return setNotice('Planning backgrounds must be PNG, JPEG, or WebP under 12 MB; larger files are downscaled.')
    try {
      const optimized = await optimizeImage(file)
      commit((current) => ({ ...current, settings: { ...current.settings, backgroundImage: optimized.dataUrl } }))
      setNotice(optimized.note)
    } catch { setNotice('Could not read that background.') }
  }

  /** Alert assets are read to a data URL here, so the studio never touches File objects. */
  async function readAlertAudio(file: File): Promise<string | null> {
    const verdict = validateAlertAudio(file)
    if (!verdict.ok) { setNotice(verdict.message); return null }
    return readFile(file)
  }
  async function readAlertImage(file: File): Promise<string | null> {
    const valid = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)
    if (!valid) { setNotice('Use PNG, JPEG, WebP or GIF artwork.'); return null }
    if (file.size > 2048 * 1024) { setNotice('Alert artwork must be under 2 MB.'); return null }
    return readFile(file)
  }

  function testWidget() {
    if (!selected) return
    setTestAlertNonce((value) => value + 1)
    if (selected.type === 'alert' && selected.props.soundEnabled && selected.props.soundSrc) {
      const audio = new Audio(String(selected.props.soundSrc))
      audio.volume = 0.65
      void audio.play().catch(() => setNotice('The browser blocked audio playback.'))
    }
    if (selected.type === 'alert') {
      // CP25: the studio's test plays go through the real queue engine, so what you see here is what air shows.
      setAlertTests((queue) => [...queue, testAlertEvent('follow', { username: 'TEST VIEWER' }, `test_preview_${Date.now()}`)].slice(-30))
    }
    setNotice(selected.type === 'alert' ? 'Preview alert triggered — no real event was sent' : 'Widget preview refreshed')
    window.setTimeout(() => setNotice(''), 2600)
  }

  /** CP41: a smaller canvas used to leave layers outside it. Every element is clamped into the new bounds. */
  const applyCanvasSize = useCallback((width: number, height: number) => {
    commit((item) => ({
      ...item,
      width,
      height,
      elements: item.elements.map((element) => clampElement(element, width, height)),
    }))
    setZoom(null)
  }, [commit])

  function changeResolution(value: string) {
    if (value === 'custom') return setResolutionOpen(true)
    const [width, height] = value.split('x').map(Number)
    if (Number.isFinite(width) && Number.isFinite(height)) applyCanvasSize(width, height)
  }

  function submitResolution(values: Record<string, string>) {
    const width = Math.round(Number(values.width))
    const height = Math.round(Number(values.height))
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 320 || height < 240 || width > 7680 || height > 4320) {
      return setNotice('Enter a valid canvas size between 320 × 240 and 7680 × 4320.')
    }
    setResolutionOpen(false)
    applyCanvasSize(width, height)
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
      try {
        return document.execCommand('copy')
      } catch {
        // A browser without execCommand still publishes; the dialog shows the URL to copy by hand.
        return false
      } finally {
        input.remove()
      }
    }
  }

  /**
   * CP37: retiring a publication revokes the runtime key on the backend before the local document forgets it. A
   * failed revoke leaves the overlay published, because a local "unpublished" flag over a live key is a lie.
   */
  async function unpublish() {
    const current = overlayRef.current
    setUnpublishOpen(false)
    if (!current) return
    const runtimeKey = current.live?.runtimeKey
    if (runtimeKey) {
      const result = await deletePublication(current.publicId)
      if (!result.ok) { setPublishIssue(`Could not revoke the live output: ${result.error ?? 'unknown error'}. The publication is still active.`); return }
    }
    commit((value) => ({ ...value, publishedAt: null, live: value.live ? { ...value.live, runtimeKey: '' } : value.live }))
    setPublishIssue('')
    setNotice('Publication revoked — the runtime key no longer resolves')
  }

  async function publish() {
    const current = overlayRef.current
    if (!current) return
    let published: Overlay = { ...current, publishedAt: new Date().toISOString() }
    // Refuse before registering a live runtime: a URL the browser cannot open makes the whole
    // publish meaningless, and a silent success would send the user to OBS with a dead source.
    const preview = snapshotBudget(encodeOverlaySnapshot(published).length)
    if (preview.level === 'blocked') return setNotice(preview.message)
    let liveRegistration = ''
    if (published.live) {
      try {
        const registration = await integrationRequest<{ publicationId: string; runtimeKey: string }>('/api/overlays/publish', { method: 'POST', body: JSON.stringify({ overlayId: published.publicId }) })
        published = { ...published, live: { ...published.live, runtimeKey: registration.runtimeKey } }
        // CP25: milestone targets live on the server so a crossed target is derived during ingestion, not guessed
        // in the browser. Failing this must not block publishing, but it must be visible: without the settings row
        // there is no milestone derivation and the server cannot persist this publication's alert configuration.
        try {
          await integrationRequest(`/api/runtime/${encodeURIComponent(registration.runtimeKey)}/alert-settings`, {
            method: 'POST', body: JSON.stringify({ milestones: normalizeAlertSettings(published.alerts).milestones }),
          })
          setPublishIssue('')
        } catch (error: unknown) {
          setPublishIssue(`Alert durability is not active for this publication: ${error instanceof Error ? error.message : 'alert settings were rejected'}. Milestones will not fire until a re-publish succeeds.`)
        }
        liveRegistration = ` · live ID ${registration.publicationId.slice(0, 8)}`
      } catch (error: unknown) {
        setNotice(`Static snapshot published; live registration failed: ${error instanceof Error ? error.message : 'the integration backend did not answer'}`)
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
    const verdict = snapshotBudget(snapshot.length)
    const url = buildHashUrl(`/overlay/${result.value.publicId}?snapshot=${snapshot}`)
    setPublishVerdict(verdict)
    setPublishUrl(url)
    const copied = await copyText(url).catch(() => false)
    if (!copied) setNotice('Published. This browser blocked the clipboard: copy the URL from the dialog.')
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
          canUndo={historyNonce >= 0 && historyRef.current.past.length > 0} canRedo={historyNonce >= 0 && historyRef.current.future.length > 0} preview={preview}
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
            footer={(
              <details className="panel-drawer">
                <summary><span>Animated background</span>{overlay.background?.enabled ? <em>{overlay.background.kind}</em> : <em>off</em>}</summary>
                <div className="panel-drawer-body">
                  <BackgroundSection background={overlay.background} onChange={(background) => commit((item) => ({ ...item, background }))} />
                </div>
              </details>
            )}
          />
          <section className="canvas-column">
            <Canvas
              overlay={overlay} selectedId={selectedId} preview={preview} zoom={zoom} testAlertNonce={testAlertNonce} alertTests={alertTests}
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
            onProp={(key, value) => selectedId && patchPropsById(selectedId, { [key]: value })}
            onPropPatch={(patch) => selectedId && patchPropsById(selectedId, patch)}
            onAlign={alignSelected} onLayerEdge={(edge) => selectedId && moveLayerEdge(selectedId, edge)}
            onDuplicate={() => selectedId && duplicate(selectedId)} onDelete={() => selectedId && deleteElement(selectedId)}
            onUpload={upload} onTest={testWidget} onCanvasSize={setCanvasSize}
            onMotion={(motion) => selected && commit((item) => ({ ...item, elements: item.elements.map((entry) => entry.id === selected.id ? { ...entry, motion } : entry) }))}
            onTheme={(themeId) => commit((item) => ({ ...item, theme: structuredClone(getTheme(themeId)) }))}
            onStaticMotion={(staticMotion) => commit((item) => ({ ...item, staticMotion }))}
            onBackground={(background) => commit((item) => ({ ...item, background }))}
            onAlerts={(alerts) => commit((item) => ({ ...item, alerts }))}
            onAlertAudio={readAlertAudio}
            onAlertImage={readAlertImage}
            onAlertTest={(events) => setAlertTests((queue) => [...queue, ...events].slice(-30))}
            onAttachLive={() => { const live = getPublicIntegrationConfig(); if (!live) { setNotice('Connect Kick from Integrations first'); return } commit((item) => ({ ...item, live })); setNotice(`Kick channel ${live.channelName} attached`) }}
          />
        </div>
        {mobilePanel && <button className="mobile-panel-scrim" aria-label="Close panel" onClick={() => setMobilePanel(null)} />}
        {alertHealth.degraded && <div className="publish-issue degraded" role="status"><AlertTriangle aria-hidden="true" /><span>{alertHealth.message}</span></div>}
        {publishIssue && <div className="publish-issue" role="alert"><AlertTriangle aria-hidden="true" /><span>{publishIssue}</span></div>}
        {(overlay.publishedAt || overlay.live?.runtimeKey) && (
          <div className="publish-issue actions">
            <span>{overlay.live?.runtimeKey ? 'This overlay has a live runtime attached.' : 'This overlay is published as a snapshot.'}</span>
            <button type="button" className="secondary-button" onClick={() => setUnpublishOpen(true)}>Unpublish</button>
          </div>
        )}
        <ConfirmDialog
          open={unpublishOpen}
          title="Unpublish this overlay?"
          description="The runtime key stops resolving immediately, so OBS shows nothing until you publish again. Your local composition is not changed."
          confirmLabel="Unpublish"
          destructive
          onConfirm={unpublish}
          onCancel={() => setUnpublishOpen(false)}
        />
        <InputDialog
          open={Boolean(renameTarget)}
          title="Rename layer"
          description="A clear name is what you will read in the layer list during a live show."
          confirmLabel="Rename"
          fields={[{ name: 'name', label: 'Layer name', value: renameTarget?.name ?? '' }]}
          onSubmit={submitRename}
          onCancel={() => setRenameTarget(null)}
        />
        <InputDialog
          open={resolutionOpen}
          title="Canvas size"
          description="Layers are clamped into the new bounds, so nothing ends up off canvas."
          confirmLabel="Resize canvas"
          fields={[
            { name: 'width', label: 'Width', value: String(overlay.width), min: 320, max: 7680, suffix: 'px' },
            { name: 'height', label: 'Height', value: String(overlay.height), min: 240, max: 4320, suffix: 'px' },
          ]}
          onSubmit={submitResolution}
          onCancel={() => setResolutionOpen(false)}
        />
        {notice && <div className="toast">{notice}</div>}
        {publishUrl && (
          <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setPublishUrl(''); setPublishVerdict(null) } }}>
            <section className="publish-modal" role="dialog" aria-modal="true" aria-labelledby="publish-title">
              <button type="button" className="modal-close" aria-label="Close publish dialog" onClick={() => { setPublishUrl(''); setPublishVerdict(null) }}><X aria-hidden="true" /></button>
              <div className="modal-icon"><Copy /></div>
              <h2 id="publish-title">OBS snapshot URL copied</h2>
              <p>This transparent output contains your current saved composition. Use these exact Browser Source dimensions:</p>
              <div className="resolution-recommendation"><span>Width <strong>{overlay.width}</strong></span><span>Height <strong>{overlay.height}</strong></span></div>
              <ol className="publish-steps">
                <li>Add a <strong>Browser</strong> source and leave the URL blank until it is created.</li>
                <li>Set <strong>Width {overlay.width}</strong> and <strong>Height {overlay.height}</strong>, then paste the URL.</li>
                <li>Leave the scene item at 100% (Transform ▸ Reset). Do not scale the source itself.</li>
                <li>If the scene canvas is a different size, scale the <em>scene item</em>, not the source, and set its Scale Filtering to <strong>Lanczos</strong>.</li>
                <li>Add <code>?diag=1</code> to the URL to confirm the source reports {overlay.width}×{overlay.height} and <strong>PIXEL PERFECT</strong>, then remove it.</li>
              </ol>
              {publishVerdict && <p className={`publish-size ${publishVerdict.level}`}>{publishVerdict.level === 'warn' ? <AlertTriangle /> : publishVerdict.level === 'ok' ? <Check /> : <Info />}{publishVerdict.message}</p>}
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
