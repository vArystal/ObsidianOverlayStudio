// CP27 evidence shots: the published runtime mid-motion, and the studio's motion panel.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import pw from '/tmp/node_modules/playwright/index.js'

const ROOT = new URL('../../dist/', import.meta.url).pathname
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  const file = path === '/' || !extname(path) ? join(ROOT, 'index.html') : join(ROOT, path)
  try { res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(await readFile(file)) }
  catch { res.writeHead(200, { 'content-type': 'text/html' }); res.end(await readFile(join(ROOT, 'index.html'))) }
})
await new Promise((resolve) => server.listen(4183, resolve))
const ORIGIN = 'http://localhost:4183'
const now = new Date().toISOString()
const clip = { id: 'c1', label: 'Floating', preset: 'floating', trigger: 'load', delay: 0, duration: 2600, repeat: -1, repeatDelay: 0, alternate: true, enabled: true,
  tracks: [{ property: 'y', enabled: true, keyframes: [{ t: 0, value: 0 }, { t: 2600, value: -18 }] }, { property: 'rotate', enabled: true, keyframes: [{ t: 0, value: -2 }, { t: 2600, value: 2 }] }] }
const base = { rotation: 0, opacity: 1, visible: true, locked: false, includeInOutput: true, maintainAspectRatio: false }
const el = (i, name) => ({ ...base, id: `el_${i}`, type: 'text', name, x: 120, y: 120 + i * 190, width: 760, height: 140,
  animation: { type: 'none', exit: 'none', idle: 'none', duration: 500, exitDuration: 400, delay: 0, direction: 'up', easing: 'ease-out', intensity: 0.5, holdDuration: 4000, reducedMotion: 'respect' },
  decoration: { enabled: true, preset: 'royal-panel' }, props: { text: name, fontSize: 46, color: '#f6f6f4', fontFamily: 'inter' },
  motion: { version: 2, origin: 'center center', timelineDuration: 4000, clips: [clip],
    effects: { shadow: { enabled: true, color: '#000000', opacity: 0.55, blur: 26, x: 0, y: 16 }, glow: { enabled: true, color: '#f6f6f4', intensity: 0.28, blur: 30, spread: 2 }, neon: { enabled: false, intensity: 0, color: '#f6f6f4' }, blur: { enabled: false, amount: 0 }, gradient: { enabled: false, angle: 135, from: 0, to: 0, opacity: 1 }, mask: { mode: 'none', softness: 20, scale: 100 }, clip: { shape: 'none' } } } })
const overlay = { id: 'ov_shots', publicId: 'pubshots', name: 'Motion shots', width: 1920, height: 1080,
  settings: { showGrid: false, snap: true, showSafeArea: false, transparent: true, backgroundImage: null },
  theme: { id: 'obsidian', accent: '#f6f6f4', primary: '#101012', surface: '#141416' }, staticMotion: false, live: null,
  createdAt: now, updatedAt: now, publishedAt: null, elements: [el(0, 'دنبال‌کننده جدید'), el(1, 'اشتراک تازه'), el(2, 'هدیه KICKs')] }

const browser = await pw.chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto(`${ORIGIN}/#/overlays`)
await page.evaluate((data) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify([data])), overlay)
await page.goto(`${ORIGIN}/#/overlay/pubshots`)
await page.waitForSelector('.motion-host')
await page.waitForTimeout(700)
await page.screenshot({ path: 'artifacts/cp27-runtime-motion.png' })
await page.goto(`${ORIGIN}/#/editor/ov_shots`)
await page.waitForSelector('.canvas-element')
await page.click('.canvas-element')
await page.waitForTimeout(600)
const studio = await page.evaluate(() => Boolean(document.querySelector('[data-testid="motion-studio"]')))
const moved = await page.evaluate(() => [...document.querySelectorAll('.motion-host')].filter((node) => node.style.transform).length)
await page.screenshot({ path: 'artifacts/cp27-studio.png' })
await browser.close(); server.close()
console.log(JSON.stringify({ studio, moved }))
