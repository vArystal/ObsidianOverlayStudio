import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import pw from '/tmp/node_modules/playwright/index.js'
const { chromium } = pw

const ROOT = new URL('../../dist/', import.meta.url).pathname
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  const file = path === '/' || !extname(path) ? join(ROOT, 'index.html') : join(ROOT, path)
  try { const body = await readFile(file); res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(body) }
  catch { const body = await readFile(join(ROOT, 'index.html')); res.writeHead(200, { 'content-type': 'text/html' }); res.end(body) }
})
await new Promise((resolve) => server.listen(4173, resolve))

const overlay = {
  id: 'ov_probe', publicId: 'pubprobe', name: 'Probe overlay', width: 1920, height: 1080,
  settings: { showGrid: false, snap: true, showSafeArea: false, transparent: true, backgroundImage: null },
  theme: { id: 'royal-persian' }, staticMotion: true, live: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishedAt: null,
  elements: [{
    id: 'el_text', type: 'text', name: 'Text', x: 100, y: 100, width: 400, height: 100, rotation: 0,
    opacity: 1, visible: true, locked: false, includeInOutput: true, maintainAspectRatio: false,
    animation: { type: 'none', exit: 'none', idle: 'none' }, decoration: { enabled: false, preset: 'none' },
    props: { text: 'Probe', fontSize: 40, color: '#ffffff', direction: 'ltr' },
  }],
}

const browser = await chromium.launch()
const results = []
for (const [w, h] of [[1920, 1080], [1280, 720], [1000, 1000]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('http://localhost:4173/#/overlays')
  await page.evaluate((data) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify([data])), overlay)
  await page.goto('http://localhost:4173/#/overlay/pubprobe')
  await page.waitForSelector('.runtime-element', { timeout: 5000 })
  const m = await page.evaluate(() => {
    const stage = document.querySelector('.runtime-stage')
    const el = document.querySelector('.runtime-element')
    const s = stage.getBoundingClientRect(); const e = el.getBoundingClientRect()
    const html = getComputedStyle(document.documentElement); const body = getComputedStyle(document.body)
    return {
      stage: { w: Math.round(s.width), h: Math.round(s.height), left: Math.round(s.left), top: Math.round(s.top) },
      element: { w: Math.round(e.width), h: Math.round(e.height), left: Math.round(e.left), top: Math.round(e.top) },
      scroll: { sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight },
      bg: { html: html.backgroundColor, body: body.backgroundColor },
      scale: getComputedStyle(stage).transform,
      textProbe: document.querySelector('.runtime-element') !== null,
    }
  })
  const expectedScale = Math.min(w / 1920, h / 1080)
  const rect = { w: Math.round(400 * expectedScale), h: Math.round(100 * expectedScale), left: Math.round(100 * expectedScale), top: Math.round(100 * expectedScale) }
  results.push({ viewport: `${w}x${h}`, expectedScale: Number(expectedScale.toFixed(3)), measured: m, expectedElement: rect, errors })
  await page.close()
}
await browser.close(); server.close()
console.log(JSON.stringify(results, null, 1))
