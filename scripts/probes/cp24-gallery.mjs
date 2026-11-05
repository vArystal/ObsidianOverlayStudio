// CP24 gallery evidence: one overlay holding every new widget, laid out on a grid, captured in the editor and in
// the published runtime. The composition is built through the real palette once, then seeded before load so the
// screenshot cannot race the studio's autosave.
import pw from '/tmp/node_modules/playwright/index.js'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { extname, join } from 'node:path'

const PORT = Number(process.env.PORT || 4345)
const SITE = process.env.SITE ? process.env.SITE.replace(/\/$/, '') : ''
const ORIGIN = SITE || `http://localhost:${PORT}`
const root = '/app/conversations/6ae1eb9cc19da39c608de5ec/overlay-repo/dist/'
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url || '/').split('?')[0])
  const file = join(root, path === '/' ? 'index.html' : path)
  if (existsSync(file) && !file.endsWith('/')) { res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }); res.end(readFileSync(file)); return }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end(readFileSync(join(root, 'index.html')))
})
if (!SITE) await new Promise((resolve) => server.listen(PORT, resolve))

const STORAGE = 'obsidian-overlays-v1'
const WIDGETS = ['streamTitle', 'liveStatus', 'streamCategory', 'streamDuration', 'subscriberCount', 'recentFollowers', 'recentSubscribers', 'activityFeed', 'clock', 'socialLinks']
const browser = await pw.chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
const out = { site: ORIGIN }
try {
  await page.goto(`${ORIGIN}/#/`, { waitUntil: 'networkidle' })
  await page.click('text=New empty overlay')
  await page.waitForSelector('[data-widget-type]')
  for (const type of WIDGETS) await page.click(`[data-widget-type="${type}"]`)
  await page.waitForTimeout(900)
  const [built] = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE)
  // A 3-column grid so every widget is fully visible in one frame.
  const overlay = {
    ...built,
    id: 'ov_cp24_gallery', publicId: 'pubcp24gallery', name: 'CP24 widget gallery',
    elements: built.elements.map((element, index) => ({ ...element, x: 90 + (index % 3) * 620, y: 70 + Math.floor(index / 3) * 300, width: 560, height: 240 })),
  }
  out.layers = overlay.elements.length

  const shot = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  await shot.addInitScript(({ key, doc }) => localStorage.setItem(key, JSON.stringify([doc])), { key: STORAGE, doc: overlay })
  await shot.goto(`${ORIGIN}/#/overlays/editor/ov_cp24_gallery`, { waitUntil: 'networkidle' })
  await shot.waitForTimeout(1200)
  out.editor = await shot.evaluate(() => ({
    shells: document.querySelectorAll('.canvas-element .widget-shell').length,
    boxes: [...document.querySelectorAll('.canvas-element')].map((n) => { const b = n.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] }),
  }))
  await shot.screenshot({ path: 'artifacts/cp24-widget-gallery.png' })
  await shot.goto(`${ORIGIN}/#/overlay/pubcp24gallery`, { waitUntil: 'networkidle' })
  await shot.waitForTimeout(1200)
  out.runtime = await shot.evaluate(() => ({ shells: document.querySelectorAll('.widget-shell').length, scrollW: document.documentElement.scrollWidth }))
  await shot.screenshot({ path: 'artifacts/cp24-widget-gallery-runtime.png' })
  await shot.close()
} catch (error) {
  out.failure = String(error)
} finally {
  await browser.close()
  if (!SITE) server.close()
  console.log(JSON.stringify(out, null, 2))
}
