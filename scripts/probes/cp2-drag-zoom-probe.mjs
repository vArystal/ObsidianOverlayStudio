import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import pw from '/tmp/node_modules/playwright/index.js'
const { chromium } = pw

const ROOT = new URL('../../dist/', import.meta.url).pathname
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' }
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  const file = path === '/' || !extname(path) ? join(ROOT, 'index.html') : join(ROOT, path)
  try { const b = await readFile(file); res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(b) }
  catch { const b = await readFile(join(ROOT, 'index.html')); res.writeHead(200, { 'content-type': 'text/html' }); res.end(b) }
})
await new Promise((r) => server.listen(4175, r))

const overlay = {
  id: 'ov_drag', publicId: 'pubdrag', name: 'Drag probe', width: 1920, height: 1080,
  settings: { showGrid: false, snap: true, showSafeArea: false, transparent: true, backgroundImage: null },
  theme: { id: 'royal-persian' }, staticMotion: true, live: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishedAt: null,
  elements: [{
    id: 'el_drag', type: 'text', name: 'Drag me', x: 200, y: 200, width: 400, height: 100, rotation: 0,
    opacity: 1, visible: true, locked: false, includeInOutput: true, maintainAspectRatio: false,
    animation: { type: 'none', exit: 'none', idle: 'none', duration: 0, exitDuration: 0, delay: 0, direction: 'up', easing: 'linear', intensity: 0, holdDuration: 0, reducedMotion: 'respect' },
    decoration: { enabled: false, preset: 'none' },
    props: { text: 'Drag me', fontSize: 40, color: '#ffffff', direction: 'ltr' },
  }],
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://localhost:4175/#/overlays')
await page.evaluate((o) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify([o])), overlay)
await page.goto('http://localhost:4175/#/overlays/editor/ov_drag')
await page.waitForSelector('.canvas-element', { timeout: 5000 })
await page.click('[title="Snap to canvas edges and center"]')
await page.waitForTimeout(150)

async function scaleNow() {
  return page.evaluate(() => {
    const wrap = document.querySelector('.canvas-size-wrap')
    return Number((wrap.getBoundingClientRect().width / 1920).toFixed(4))
  })
}
async function pos() {
  return page.evaluate(() => {
    const el = document.querySelector('.canvas-element')
    return { x: Math.round(parseFloat(el.style.left)), y: Math.round(parseFloat(el.style.top)) }
  })
}
async function dragBy(dx, dy) {
  const box = await page.locator('.canvas-element').first().boundingBox()
  const cx = box.x + Math.min(30, box.width / 2), cy = box.y + Math.min(30, box.height / 2)
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + dx / 2, cy + dy / 2, { steps: 4 })
  await page.mouse.move(cx + dx, cy + dy, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(150)
}
async function zoomIn(times) { for (let i = 0; i < times; i++) { await page.click('[title="Zoom in"]'); await page.waitForTimeout(80) } }

const results = []
// Pass 1 — fit zoom
let s = await scaleNow(); let before = await pos()
await dragBy(120, 80)
let after = await pos()
results.push({ label: 'fit', scale: s, screen: [120, 80], logical: [after.x - before.x, after.y - before.y], expected: [Math.round(120 / s), Math.round(80 / s)] })

// Pass 2 — zoom in to a different scale
await zoomIn(4)
s = await scaleNow(); before = await pos()
await dragBy(120, 80)
after = await pos()
results.push({ label: 'zoomed', scale: s, screen: [120, 80], logical: [after.x - before.x, after.y - before.y], expected: [Math.round(120 / s), Math.round(80 / s)] })

// Pass 3 — undo restores the pre-drag position
const preUndo = await pos()
await page.keyboard.press('Control+z')
await page.waitForTimeout(200)
const undone = await pos()

// Pass 4 — resize handle keeps aspect/coords sane
const box = await page.locator('.canvas-element').first().boundingBox()
await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(100)
const handles = await page.locator('.resize-handle').count()
const sizeBefore = await page.evaluate(() => ({ w: Math.round(parseFloat(document.querySelector('.canvas-element').style.width)), h: Math.round(parseFloat(document.querySelector('.canvas-element').style.height)) }))
const handle = await page.locator('.handle-se').boundingBox()
if (handle) {
  await page.mouse.move(handle.x + 4, handle.y + 4); await page.mouse.down()
  await page.mouse.move(handle.x + 60, handle.y + 30, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(150)
}
const sizeAfter = await page.evaluate(() => ({ w: Math.round(parseFloat(document.querySelector('.canvas-element').style.width)), h: Math.round(parseFloat(document.querySelector('.canvas-element').style.height)) }))

// Autosave: a quiet moment after the edit must reach storage without pressing Save
const onScreen = await pos()
await page.waitForTimeout(1100)
const storedAfterAutosave = await page.evaluate(() => { const el = JSON.parse(localStorage.getItem('obsidian-overlays-v1'))[0].elements[0]; return { x: Math.round(el.x), y: Math.round(el.y) } })
await page.reload()
await page.waitForSelector('.canvas-element', { timeout: 5000 })
await page.waitForTimeout(400)
const afterReload = await pos()

// Leaving through the nav link flushes synchronously instead of dropping the edit
const box2 = await page.locator('.canvas-element').first().boundingBox()
await page.mouse.move(box2.x + 25, box2.y + 25); await page.mouse.down()
await page.mouse.move(box2.x + 85, box2.y + 65, { steps: 5 }); await page.mouse.up()
const beforeNav = await pos()
await page.waitForTimeout(60)
await page.click('nav a[href="/overlays"], nav a[href="#/overlays"]')
await page.waitForTimeout(400)
const storedAfterNav = await page.evaluate(() => { const el = JSON.parse(localStorage.getItem('obsidian-overlays-v1'))[0].elements[0]; return { x: Math.round(el.x), y: Math.round(el.y) } })

await browser.close(); server.close()
console.log(JSON.stringify({ results, undo: { before: preUndo, afterUndo: undone }, handles, sizeBefore, sizeAfter, persistence: { onScreen, storedAfterAutosave, afterReload, beforeNav, storedAfterNav }, errors }, null, 1))
