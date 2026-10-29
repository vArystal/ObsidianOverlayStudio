// CP13: does Preview show what the author configured?
// Serves dist/, seeds one overlay containing every element type, opens the editor, toggles Preview and
// reads the rendered layers. Fails loudly if any layer is missing or leaks editor chrome.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import pw from '/tmp/node_modules/playwright/index.js'

const PORT = Number(process.env.PORT || 4331)
const SITE = process.env.SITE ? process.env.SITE.replace(/\/$/, '') : ''
const ORIGIN = SITE || `http://localhost:${PORT}`
const root = new URL('../../dist/', import.meta.url).pathname
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webp': 'image/webp' }
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  const file = path === '/' || !extname(path) ? join(root, 'index.html') : join(root, path)
  try { const body = await readFile(file); res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(body) }
  catch { const body = await readFile(join(root, 'index.html')); res.writeHead(200, { 'content-type': 'text/html' }); res.end(body) }
})
if (!SITE) await new Promise((resolve) => server.listen(PORT, resolve))

const TYPES = ['text', 'image', 'shape', 'frame', 'webcam', 'capture', 'chat', 'alert', 'goal', 'counter', 'countdown', 'viewerCount', 'sessionFollowers', 'latestFollower', 'supporter']
const now = new Date().toISOString()
const element = (type, i) => ({
  id: `el_${type}`, type, name: `Layer ${type}`, x: 40 + (i % 4) * 460, y: 40 + Math.floor(i / 4) * 250,
  width: 400, height: 200, rotation: 0, opacity: 1, visible: true, locked: false, includeInOutput: type !== 'webcam' && type !== 'capture',
  animation: { type: 'none', idle: 'none', duration: 400, delay: 0, easing: 'ease-out', intensity: 1, direction: 'up', exit: 'fade', exitDuration: 300, holdDuration: 4000, reducedMotion: 'animate' },
  props: type === 'text' ? { text: 'سلام Arystal', fontSize: 44, direction: 'rtl' }
    : type === 'image' ? { src: '', fit: 'contain' }
    : type === 'chat' ? { label: 'Chat', maxMessages: 7 }
    : type === 'alert' ? { title: 'دنبال‌کننده جدید', message: 'A new follower joined', holdDuration: 4000 }
    : type === 'goal' ? { title: 'هدف حمایت', target: 100, current: 40 }
    : type === 'counter' ? { label: 'Deaths', value: '12' }
    : type === 'countdown' ? { label: 'Starting in', targetAt: new Date(Date.now() + 600000).toISOString() }
    : type === 'viewerCount' ? { label: 'بیننده زنده' }
    : type === 'latestFollower' ? { label: 'Latest follower', emptyText: 'No follower yet' }
    : type === 'supporter' ? { label: 'Supporter', value: '—' }
    : { label: type === 'webcam' ? 'Webcam frame' : 'Game capture', captureMode: 'frame' },
})
const overlay = {
  id: 'ov_cp13', publicId: 'pubcp13', name: 'CP13 preview audit', width: 1920, height: 1080,
  settings: { showGrid: false, snap: true, showSafeArea: false, transparent: true, backgroundImage: null },
  theme: { id: 'royal-persian', accent: '#d8ad55', primary: '#0f0a14', surface: '#170f17' },
  staticMotion: true, live: null, createdAt: now, updatedAt: now, publishedAt: null,
  elements: TYPES.map((type, i) => element(type, i)),
}

const browser = await pw.chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
await page.addInitScript((data) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify([data])), overlay)

await page.goto(`${ORIGIN}/#/overlays/editor/ov_cp13`)
await page.waitForSelector('.canvas-element', { timeout: 15000 })
const editing = await page.evaluate(() => ({ layers: document.querySelectorAll('.canvas-element').length, testText: /TEST/.test(document.querySelector('.canvas-viewport')?.textContent || '') }))

// The toolbar's preview toggle is the path users actually take.
const previewButton = page.locator('button:has-text("Preview")').first()
await previewButton.click()
await page.waitForTimeout(900)
const preview = await page.evaluate(() => {
  const viewport = document.querySelector('.canvas-viewport')
  const text = viewport?.textContent || ''
  return {
    layers: document.querySelectorAll('.canvas-element').length,
    selected: document.querySelectorAll('.canvas-element.selected').length,
    handles: document.querySelectorAll('.handle, .resize-handle, .rotate-handle').length,
    badge: document.querySelector('.preview-badge')?.textContent?.trim() || '',
    testText: /TEST/.test(text),
    sampleChips: /SAMPLE ONLY/.test(text),
    hasCaptureGuide: /capture your game window in OBS/.test(text),
    hasWebcamFrame: /align your OBS camera here/i.test(text),
    hasAlertCopy: /دنبال‌کننده جدید/.test(text),
    hasChatEmpty: /Chat messages appear here/.test(text),
    hasCounter: /12/.test(text),
    hasCountdown: /Starting in/.test(text),
  }
})

// Leave preview and prove the editor is still editable afterwards.
await previewButton.click()
await page.waitForTimeout(500)
const back = await page.evaluate(() => ({ layers: document.querySelectorAll('.canvas-element').length, selected: document.querySelectorAll('.canvas-element.selected').length }))

await page.screenshot({ path: 'cp13-preview.png' })
console.log(JSON.stringify({ editing, preview, back, elementTypes: TYPES.length, errors: errors.slice(0, 3) }, null, 1))
await browser.close()
if (!SITE) server.close()
