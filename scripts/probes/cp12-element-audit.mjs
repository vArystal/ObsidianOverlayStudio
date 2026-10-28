// CP12: element truthfulness in the published output.
// Serves the built app, then drives the real runtime with a stubbed EventSource so each element can be
// checked against synthetic and genuine frames without waiting for Kick to send something.
import pw from '/tmp/node_modules/playwright/index.js'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { extname, join } from 'node:path'

const PORT = Number(process.env.PORT || 4327)
const root = new URL('../../dist/', import.meta.url).pathname
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url || '/').split('?')[0])
  const file = join(root, path === '/' ? 'index.html' : path)
  if (existsSync(file) && !file.endsWith('/')) { res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }); res.end(readFileSync(file)); return }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end(readFileSync(join(root, 'index.html')))
})
await new Promise((resolve) => server.listen(PORT, resolve))

const base = { rotation: 0, opacity: 1, visible: true, locked: false, includeInOutput: true, maintainAspectRatio: false }
const element = (id, type, extra = {}) => ({ ...base, id, type, name: type, x: 40, y: 40 + Math.random() * 40, width: 420, height: 150, animation: { type: 'none', exit: 'none', idle: 'none', duration: 300, delay: 0, holdDuration: 600, exitDuration: 200, easing: 'ease', intensity: 1, direction: 'left', reducedMotion: 'respect' }, decoration: { enabled: false, preset: 'none' }, props: {}, ...extra })
const overlay = {
  id: 'ov_cp12', publicId: 'pubcp12', name: 'CP12 audit', width: 1920, height: 1080,
  settings: { showGrid: false, snap: true, showSafeArea: false, transparent: true, backgroundImage: null },
  theme: { id: 'royal-persian', accent: '#d8ad55', primary: '#0f0a14', surface: '#170f17' }, staticMotion: false,
  live: { backendUrl: 'https://obsidian-overlay-api.pages.dev', runtimeKey: 'stub-runtime-key', connectionId: 'stub', channelName: 'arystal' },
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishedAt: null,
  elements: [
    element('el_chat', 'chat', { width: 520, height: 260, props: { maxMessages: 5, messageDuration: 60 } }),
    element('el_alert', 'alert', { width: 520, height: 120 }),
    element('el_followers', 'sessionFollowers', { props: { label: 'Session follows' } }),
    element('el_image', 'image', { props: {} }),
    element('el_webcam', 'webcam', { name: 'Webcam frame', props: { captureMode: 'frame', borderRadius: 24 } }),
    element('el_capture', 'capture', { props: { label: 'Game capture' } }),
    element('el_camera', 'webcam', { name: 'Webcam camera', props: { captureMode: 'camera', borderRadius: 24 } }),
  ],
}

const browser = await pw.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['camera'] })
const results = {}

async function openRuntime(page, query = '', seed = true) {
  // A stub transport keeps this probe deterministic; the frame shape is the one the backend emits.
  await page.addInitScript(() => {
    class StubStream extends EventTarget {
      static CLOSED = 2
      static open = []
      readyState = 1
      onopen = null
      onerror = null
      constructor() { super(); StubStream.open.push(this); setTimeout(() => this.onopen?.(), 0) }
      close() { this.readyState = 2 }
      emit(frame) { this.dispatchEvent(Object.assign(new Event('overlay-event'), { data: JSON.stringify(frame) })) }
    }
    // Seed before the app boots: navigating twice to the same hash route does not remount the page.
    window.__seedOverlay = window.__seedOverlay || null
    window.EventSource = StubStream
    window.__emit = (frame) => StubStream.open.forEach((stream) => stream.emit(frame))
    const original = window.fetch
    window.fetch = (input, init) => String(input).includes('/state')
      ? Promise.resolve(new Response(JSON.stringify({ connected: true, viewer: { status: 'offline', count: null, updatedAt: null }, latestFollower: null, sessionFollowerCount: 9, lastEventAt: null }), { status: 200, headers: { 'content-type': 'application/json' } }))
      : original(input, init)
  })
  if (seed) await page.addInitScript((data) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify([data])), overlay)
  await page.goto(`http://localhost:${PORT}/#/overlay/pubcp12${query}`)
  await page.waitForTimeout(1500)
}

const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

// 1. A live source: static element honesty first.
await openRuntime(page)
results.staticOutput = await page.evaluate(() => {
  const webcam = document.querySelectorAll('.webcam-placeholder')
  const capture = document.querySelector('.capture-placeholder')
  const image = document.querySelector('.runtime-element .image-element')
  return {
    testModeBadge: Boolean(document.querySelector('.runtime-test-mode')),
    imageWithNoSourcePublished: Boolean(image),
    webcamBackgrounds: [...webcam].map((node) => getComputedStyle(node).backgroundColor),
    captureBackground: capture ? getComputedStyle(capture).backgroundColor : null,
    placeholderTextInOutput: (document.querySelector('.overlay-runtime')?.textContent || '').replace(/\s+/g, ' ').trim(),
    sessionCaption: document.querySelector('.metric-widget em')?.textContent || '',
  }
})

// 2. A synthetic frame must change nothing on air.
await page.evaluate(() => window.__emit({ id: 'test-1', type: 'channel.followed', receivedAt: new Date().toISOString(), test: true, data: { follower: { username: 'TEST EVENT' } } }))
await page.evaluate(() => window.__emit({ id: 'test-2', type: 'chat.message.sent', receivedAt: new Date().toISOString(), test: true, data: { messageId: 'tm', content: 'TEST EVENT', sender: { username: 'TEST EVENT' } } }))
await page.waitForTimeout(600)
results.syntheticOnLiveSource = await page.evaluate(() => ({
  bodyText: (document.querySelector('.runtime-stage')?.textContent || '').replace(/\s+/g, ' ').trim(),
  hasTestMarker: Boolean(document.querySelector('.test-event-mark')),
  alertPresent: Boolean(document.querySelector('.alert-widget')),
  chatPresent: Boolean(document.querySelector('.chat-widget')),
  sessionCount: [...document.querySelectorAll('.metric-widget strong')].map((node) => node.textContent),
}))

// 3. A genuine frame must reach the right element.
await page.evaluate(() => window.__emit({ id: 'real-1', type: 'channel.followed', receivedAt: new Date().toISOString(), test: false, data: { follower: { username: 'real_viewer_42' } } }))
await page.waitForTimeout(400)
results.genuineFollow = await page.evaluate(() => ({
  alertText: document.querySelector('.alert-widget')?.textContent?.replace(/\s+/g, ' ').trim() || '',
  sessionCount: [...document.querySelectorAll('.metric-widget strong')].map((node) => node.textContent),
  testMarker: Boolean(document.querySelector('.test-event-mark')),
}))

// 4. The same source opened in explicit test mode labels what it shows.
const testPage = await context.newPage()
testPage.on('pageerror', (error) => errors.push(error.message))
await openRuntime(testPage, '?test=1')
await testPage.evaluate(() => window.__emit({ id: 'test-3', type: 'channel.followed', receivedAt: new Date().toISOString(), test: true, data: { follower: { username: 'TEST EVENT' } } }))
await testPage.waitForTimeout(500)
results.testMode = await testPage.evaluate(() => ({
  badge: document.querySelector('.runtime-test-mode')?.textContent || '',
  alertText: document.querySelector('.alert-widget')?.textContent?.replace(/\s+/g, ' ').trim() || '',
  sessionCount: [...document.querySelectorAll('.metric-widget strong')].map((node) => node.textContent),
}))

// 5. Chat, text, counter, countdown, goal and a real image in one source.
const rich = {
  ...overlay, id: 'ov_cp12b', publicId: 'pubcp12b',
  elements: [
    element('r_chat', 'chat', { width: 520, height: 300, props: { maxMessages: 5, messageDuration: 90 } }),
    element('r_text', 'text', { props: { text: 'سلام Arystal', direction: 'rtl', fontSize: 48 } }),
    element('r_counter', 'counter', { props: { label: 'Wins', value: 12 } }),
    element('r_countdown', 'countdown', { props: { label: 'شروع', targetAt: new Date(Date.now() + 90_000).toISOString() } }),
    element('r_goal', 'goal', { props: { title: 'هدف', current: 40, target: 100, includePreviewOutput: true } }),
    element('r_viewer', 'viewerCount', {}),
    element('r_pixel', 'image', { props: { src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' } }),
  ],
}
const richPage = await context.newPage()
richPage.on('pageerror', (error) => errors.push(error.message))
await richPage.addInitScript((data) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify([data])), rich)
await richPage.addInitScript(() => {
  class StubStream extends EventTarget {
    static CLOSED = 2; static open = []
    readyState = 1; onopen = null; onerror = null
    constructor() { super(); StubStream.open.push(this); setTimeout(() => this.onopen?.(), 0) }
    close() { this.readyState = 2 }
    emit(frame) { this.dispatchEvent(Object.assign(new Event('overlay-event'), { data: JSON.stringify(frame) })) }
  }
  window.EventSource = StubStream
  window.__emit = (frame) => StubStream.open.forEach((stream) => stream.emit(frame))
  const original = window.fetch
  window.fetch = (input, init) => String(input).includes('/state')
    ? Promise.resolve(new Response(JSON.stringify({ connected: true, viewer: { status: 'live', count: 137, updatedAt: new Date().toISOString() }, latestFollower: null, sessionFollowerCount: 0, lastEventAt: null }), { status: 200, headers: { 'content-type': 'application/json' } }))
    : original(input, init)
})
await richPage.goto(`http://localhost:${PORT}/#/overlay/pubcp12b`)
await richPage.waitForTimeout(1500)
await richPage.evaluate(() => {
  window.__emit({ id: 'rc1', type: 'chat.message.sent', receivedAt: new Date().toISOString(), test: false, data: { messageId: 'rc1', content: 'سلام از چت واقعی', createdAt: new Date().toISOString(), sender: { username: 'arystal', usernameColor: '#f1d89a', badges: [] } } })
  window.__emit({ id: 'tc1', type: 'chat.message.sent', receivedAt: new Date().toISOString(), test: true, data: { messageId: 'tc1', content: 'TEST EVENT', createdAt: new Date().toISOString(), sender: { username: 'TEST EVENT' } } })
})
await richPage.waitForTimeout(700)
results.richSource = await richPage.evaluate(() => ({
  chatText: document.querySelector('.chat-widget')?.textContent?.replace(/\s+/g, ' ').trim() || '',
  chatMentionsTestEvent: (document.querySelector('.chat-widget')?.textContent || '').includes('TEST EVENT'),
  text: document.querySelector('.text-element')?.textContent || '',
  textDirection: document.querySelector('.text-element')?.getAttribute('dir') || '',
  counter: document.querySelector('.metric-widget strong')?.textContent || '',
  countdown: document.querySelector('.countdown-widget strong')?.textContent || '',
  goal: document.querySelector('.goal-widget')?.textContent?.replace(/\s+/g, ' ').trim() || '',
  viewer: document.querySelector('.viewer-live, .live-metric')?.textContent?.replace(/\s+/g, ' ').trim() || '',
  imageLoaded: Boolean(document.querySelector('.image-element')),
}))

// 6. Camera capture is real or says why not.
results.camera = await page.evaluate(() => {
  const camera = [...document.querySelectorAll('.camera-source')][0]
  const video = camera?.querySelector('video')
  const state = camera?.querySelector('.camera-state span')?.textContent || ''
  return { hasVideo: Boolean(video), hasLiveStream: Boolean(video?.srcObject), stateText: state }
})

// 7. The new inspector control has to persist, or it is decoration.
const editorPage = await context.newPage()
editorPage.on('pageerror', (error) => errors.push(error.message))
await editorPage.addInitScript((data) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify([data])), overlay)
await editorPage.goto(`http://localhost:${PORT}/#/overlays/editor/ov_cp12`)
await editorPage.waitForTimeout(1500)
// Layer rows live behind the Layers tab of the left panel.
await editorPage.locator('#tab-layers').click()
await editorPage.waitForTimeout(300)
const layer = editorPage.locator('.layer-row').filter({ hasText: /Webcam frame/ }).first()
if (await layer.count()) await layer.click()
await editorPage.waitForTimeout(400)
const cameraSelect = editorPage.locator('select').filter({ has: editorPage.locator('option[value="camera"]') }).first()
const editorControls = { foundLayerRow: Boolean(await layer.count()), foundCameraSelect: Boolean(await cameraSelect.count()) }
if (editorControls.foundCameraSelect) {
  await cameraSelect.selectOption('camera')
  await editorPage.waitForTimeout(1400)
}
results.editorPersistence = await editorPage.evaluate((controls) => {
  const saved = JSON.parse(localStorage.getItem('obsidian-overlays-v1') || '[]')[0]
  const webcams = (saved?.elements || []).filter((el) => el.type === 'webcam').map((el) => el.props.captureMode)
  return { ...controls, savedCaptureModes: webcams }
}, editorControls)

await browser.close()
server.close()
console.log(JSON.stringify({ results, pageErrors: errors }, null, 1))
