// CP27: what does the motion engine cost at 1920x1080?
// The CP24 target is ~60fps with 20 widgets. This seeds overlays of 5, 10 and 20 elements that each carry a
// looping motion clip plus a glow effect, then measures real requestAnimationFrame throughput in a 5s sample.
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
const FROM_PRODUCTION = process.env.SITE === 'production'
if (!FROM_PRODUCTION) await new Promise((resolve) => server.listen(4182, resolve))
const ORIGIN = FROM_PRODUCTION ? 'https://varystal.github.io/ObsidianOverlayStudio' : 'http://localhost:4182'

const base = { rotation: 0, opacity: 1, visible: true, locked: false, includeInOutput: true, maintainAspectRatio: false }
const now = new Date().toISOString()

const loopClip = (i, duration) => ({
  id: `clip_${i}`, label: 'Floating', preset: 'floating', trigger: 'load', delay: 0, duration,
  repeat: -1, repeatDelay: 0, alternate: true, enabled: true,
  tracks: [
    { property: 'y', enabled: true, keyframes: [{ t: 0, value: 0 }, { t: duration, value: -16 }] },
    { property: 'opacity', enabled: true, keyframes: [{ t: 0, value: 1 }, { t: duration, value: 0.82 }] },
  ],
})

const animated = (i, kind) => ({
  ...base, id: `el_${i}`, type: 'text', name: `Animated ${i}`,
  x: (i % 5) * 370 + 30, y: Math.floor(i / 5) * 150 + 40, width: 340, height: 100,
  animation: { type: 'none', exit: 'none', idle: 'none', duration: 500, exitDuration: 400, delay: 0, direction: 'up', easing: 'ease-out', intensity: 0.5, holdDuration: 4000, reducedMotion: 'respect' },
  decoration: { enabled: false, preset: 'none' },
  props: { text: `عنصر ${i}`, fontSize: 32, color: '#f6f6f4', fontFamily: 'inter' },
  motion: {
    version: 2, origin: 'center center', timelineDuration: 4000,
    clips: kind === 'static' ? [] : [loopClip(i, 2000 + (i % 4) * 250)],
    effects: { shadow: { enabled: false, color: '#000000', opacity: 0.5, blur: 20, x: 0, y: 8 }, glow: { enabled: kind === 'animated', color: '#f6f6f4', intensity: 0.35, blur: 22, spread: 0 }, neon: { enabled: false, intensity: 0, color: '#f6f6f4' }, blur: { enabled: false, amount: 0 }, gradient: { enabled: false, angle: 135, from: 0, to: 0, opacity: 1 }, mask: { mode: 'none', softness: 20, scale: 100 }, clip: { shape: 'none' } },
  },
})

const makeOverlay = (count, kind) => ({
  id: 'ov_motion', publicId: 'pubmotion', name: 'Motion perf', width: 1920, height: 1080,
  settings: { showGrid: false, snap: true, showSafeArea: false, transparent: true, backgroundImage: null },
  theme: { id: 'obsidian', accent: '#f6f6f4', primary: '#101012', surface: '#141416' }, staticMotion: false, live: null,
  createdAt: now, updatedAt: now, publishedAt: null,
  elements: Array.from({ length: count }, (_, i) => animated(i, kind)),
})

async function measure(browser, count, kind) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${ORIGIN}/#/overlays`)
  await page.evaluate((data) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify([data])), makeOverlay(count, kind))
  await page.goto(`${ORIGIN}/#/overlay/pubmotion`)
  try { await page.waitForSelector('.motion-host', { timeout: 8000 }) }
  catch { await page.close(); return { count, kind, failed: true, errors } }
  await page.waitForTimeout(1200)
  const sample = await page.evaluate(async () => {
    const frames = []
    const start = performance.now()
    let last = start
    await new Promise((resolve) => {
      const tick = (now) => { frames.push(now - last); last = now; if (now - start < 5000) requestAnimationFrame(tick); else resolve() }
      requestAnimationFrame(tick)
    })
    frames.shift()
    const sorted = [...frames].sort((a, b) => a - b)
    const at = (q) => Math.round(sorted[Math.floor(sorted.length * q)] * 10) / 10
    return {
      fps: Math.round((frames.length / 5) * 10) / 10,
      medianMs: at(0.5), p95Ms: at(0.95), worstMs: Math.round(sorted[sorted.length - 1]),
      janky: frames.filter((ms) => ms > 20).length,
      hosts: document.querySelectorAll('.motion-host').length,
      movingHosts: [...document.querySelectorAll('.motion-host')].filter((node) => node.style.transform && node.style.transform !== 'none').length,
    }
  })
  await page.close()
  return { count, kind, ...sample, errors }
}

const browser = await pw.chromium.launch({ args: ['--force-device-scale-factor=1'] })
const results = []
for (const count of [5, 10, 20]) {
  results.push(await measure(browser, count, 'animated'))
}
results.push(await measure(browser, 20, 'static'))
await browser.close()
if (!FROM_PRODUCTION) server.close()
console.log(JSON.stringify({ origin: ORIGIN, results }, null, 1))
