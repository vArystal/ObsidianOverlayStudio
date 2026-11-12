import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import pw from '/tmp/node_modules/playwright/index.js'
const { chromium } = pw
const ROOT = new URL('../../dist/', import.meta.url).pathname
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  const f = p === '/' || !extname(p) ? join(ROOT, 'index.html') : join(ROOT, p)
  try { const b = await readFile(f); res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(b) }
  catch { res.writeHead(200, { 'content-type': 'text/html' }); res.end(await readFile(join(ROOT, 'index.html'))) }
})
await new Promise((r) => server.listen(4177, r))

const el = (id, x, y, locked = false) => ({
  id, type: 'text', name: id, x, y, width: 300, height: 90, rotation: 0, opacity: 1, visible: true,
  locked, includeInOutput: true, maintainAspectRatio: false,
  animation: { type: 'none', exit: 'none', idle: 'none' }, decoration: { enabled: false, preset: 'none' },
  props: { text: id, fontSize: 32 },
})
const overlay = {
  id: 'ov_guard', publicId: 'pubguard', name: 'Guard probe', width: 1920, height: 1080,
  settings: { showGrid: false, snap: false, showSafeArea: false, transparent: true, backgroundImage: null },
  theme: { id: 'royal-persian' }, staticMotion: true, live: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishedAt: null,
  elements: [el('free', 300, 300), el('locked', 800, 300, true)],
}
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []; page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://localhost:4177/#/overlays')
await page.evaluate((o) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify([o])), overlay)
await page.goto('http://localhost:4177/#/overlays/editor/ov_guard')
await page.waitForSelector('.canvas-element')

const count = () => page.locator('.canvas-element').count()
const out = {}

// 1. Typing in the overlay name must not trigger element shortcuts
await page.click('.canvas-element >> nth=0')
const beforeCount = await count()
await page.click('input[aria-label="Overlay name"]')
await page.keyboard.type(' Renamed')
await page.keyboard.press('Delete')
await page.keyboard.press('Backspace')
out.typingDoesNotDelete = { before: beforeCount, after: await count(), name: await page.inputValue('input[aria-label="Overlay name"]') }

// 2. Clicking empty canvas deselects (aim at the stage's own empty corner, not the chrome)
await page.click('.canvas-element >> nth=0')
await page.waitForTimeout(120)
const stage = await page.locator('.canvas-stage').boundingBox()
await page.mouse.click(stage.x + stage.width - 30, stage.y + stage.height - 30)
await page.waitForTimeout(150)
out.deselectOnCanvasClick = (await page.locator('.canvas-element.selected').count()) === 0

// 3. Duplicate then undo
await page.click('.canvas-element >> nth=0')
await page.keyboard.press('Control+d')
await page.waitForTimeout(250)
const afterDup = await count()
await page.keyboard.press('Control+z')
await page.waitForTimeout(250)
out.duplicateAndUndo = { afterDuplicate: afterDup, afterUndo: await count() }

// 4. A locked layer must not move when dragged
const lockedBox = await page.locator('.canvas-element').nth(1).boundingBox()
const lockedBefore = await page.locator('.canvas-element').nth(1).evaluate((n) => [n.style.left, n.style.top])
if (lockedBox) {
  await page.mouse.move(lockedBox.x + 20, lockedBox.y + 20); await page.mouse.down()
  await page.mouse.move(lockedBox.x + 120, lockedBox.y + 100, { steps: 6 }); await page.mouse.up()
  await page.waitForTimeout(200)
}
const lockedAfter = await page.locator('.canvas-element').nth(1).evaluate((n) => [n.style.left, n.style.top])
out.lockedLayerStays = { before: lockedBefore, after: lockedAfter, unchanged: JSON.stringify(lockedBefore) === JSON.stringify(lockedAfter) }

// 5. Visibility toggle really hides
await page.locator('.left-panel button', { hasText: /Layers\s*[0-9]/ }).first().click()
await page.waitForTimeout(250)
const toggle = page.locator('[aria-label="Toggle layer visibility"]').first()
out.visibilityToggle = { found: await toggle.count() }
if (await toggle.count()) { await toggle.click(); await page.waitForTimeout(200); out.visibilityToggle.canvasCount = await count() }

await browser.close(); server.close()
console.log(JSON.stringify({ ...out, errors }, null, 1))
