// CP14: Thorn & Rose in a real browser, at four widget shapes, in the editor and in published output.
import pw from '/tmp/node_modules/playwright/index.js'
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const PORT = 4331
const SITE = process.env.SITE ? process.env.SITE.replace(/\/$/, '') : ''
const ORIGIN = SITE || `http://localhost:${PORT}`
const root = new URL('../../dist/', import.meta.url).pathname
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }

const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent((req.url || '/').split('?')[0])
  const file = path === '/' ? 'index.html' : normalize(path).replace(/^\/+/, '')
  try {
    const body = await readFile(join(root, file))
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' })
    res.end(body)
  } catch {
    const body = await readFile(join(root, 'index.html'))
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(body)
  }
})
if (!SITE) await new Promise((resolve) => server.listen(PORT, resolve))

const decoration = {
  enabled: true, preset: 'thorn-vine', inheritTheme: true, borderVisible: true, borderWidth: 2,
  borderColor: '#c9a24a', borderOpacity: 0.92, radius: 16, innerBorder: true, innerBorderColor: '#f4efe4',
  innerBorderOpacity: 0.22, cornerOrnaments: false, highlight: true, shadow: true, glow: false,
  backgroundOpacity: 0.72, pattern: 'none', padding: 24,
}

const base = { rotation: 0, opacity: 1, visible: true, locked: false, includeInOutput: true, decoration, animation: { entrance: 'fade', exit: 'fade', idle: 'none', holdDuration: 4000, enterDuration: 400, exitDuration: 400, reducedMotion: 'auto' } }
const el = (id, type, name, x, y, width, height, props) => ({ ...base, id, type, name, x, y, width, height, props })

const overlay = {
  id: 'ov_cp14', publicId: 'pubcp14', name: 'Thorn & Rose', width: 1600, height: 900, updatedAt: new Date().toISOString(),
  theme: { id: 'thorn-rose', name: 'Thorn & Rose', nameFa: 'خار و گل سرخ', primary: '#1b3a2c', secondary: '#08110c', accent: '#c9a24a', accentSoft: '#f4efe4', surface: '#0b1410', surfaceAlt: '#12211a', text: '#f4efe4', muted: '#a9b9ad', glow: '#2f7a5f', pattern: 'none' },
  settings: { transparent: true, showGrid: false, showSafeArea: false, snapToGrid: false },
  staticMotion: false,
  elements: [
    el('e1', 'webcam', 'Wide webcam', 60, 60, 900, 380, { label: 'CAM', captureMode: 'frame', shape: 'rounded', borderRadius: 18 }),
    el('e2', 'chat', 'Chat box', 60, 470, 460, 370, { maxMessages: 5, fontSize: 18, emptyText: 'Chat messages appear here' }),
    el('e3', 'counter', 'Compact counter', 1010, 470, 300, 120, { label: 'Followers', value: 1284 }),
    el('e4', 'alert', 'Alert panel', 1010, 620, 520, 160, { title: 'دنبال‌کننده جدید', message: 'به جمع ما پیوست' }),
  ],
}

const browser = await pw.chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 940 } })
const errors = []
page.on('pageerror', (message) => errors.push(String(message)))
await page.addInitScript((data) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify([data])), overlay)

await page.goto(`${ORIGIN}/#/overlays/editor/ov_cp14`)
await page.waitForTimeout(1600)
const activeTheme = await page.locator('.theme-thumb.active .theme-thumb-name').textContent().catch(() => null)
const galleryCount = await page.locator('.theme-thumb').count()
await page.screenshot({ path: 'artifacts/cp14-editor.png', fullPage: false })

// Preview mode must show the botanical frame on all four shapes.
await page.getByRole('button', { name: /^Preview$/ }).click()
await page.waitForTimeout(900)
const preview = await page.evaluate(() => {
  const widgets = [...document.querySelectorAll('.decorated-widget')]
  return {
    widgets: widgets.length,
    thornFramed: widgets.filter((node) => node.classList.contains('thorn-framed')).length,
    roseSprigs: document.querySelectorAll('.thorn-bloom').length,
    corners: document.querySelectorAll('.thorn-corner').length,
    artResolved: widgets[0] ? getComputedStyle(document.documentElement).getPropertyValue('--thorn-corner-rose').trim().slice(0, 30) : '',
    vineEdge: widgets[0] ? getComputedStyle(widgets[0]).backgroundImage.slice(0, 60) : '',
    badges: [...document.querySelectorAll('.preview-badge')].map((node) => node.textContent),
  }
})
await page.screenshot({ path: 'artifacts/cp14-editor-preview.png' })

// Published output is its own surface.
const output = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await output.addInitScript((data) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify([data])), overlay)
await output.goto(`${ORIGIN}/#/overlay/pubcp14`)
await output.waitForTimeout(1400)
await output.screenshot({ path: 'artifacts/cp14-runtime.png' })
const runtime = await output.evaluate(() => {
  const body = getComputedStyle(document.body).backgroundColor
  const widgets = [...document.querySelectorAll('.decorated-widget')]
  return {
    pageBackground: body,
    widgets: widgets.length,
    thornFramed: widgets.filter((node) => node.classList.contains('thorn-framed')).length,
    roses: document.querySelectorAll('.thorn-bloom').length,
    edges: widgets.map((node) => getComputedStyle(node).backgroundImage.includes('data:image/webp')),
    textVisible: document.body.innerText.trim().slice(0, 60),
  }
})

// Switching themes must not disturb the saved theme or the other presets.
const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('obsidian-overlays-v1') || '[]')[0].theme.id)

console.log(JSON.stringify({ activeTheme, galleryCount, preview, runtime, persisted, errors }, null, 2))
await browser.close()
if (!SITE) server.close()
