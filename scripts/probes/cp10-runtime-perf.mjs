// CP10: what does a heavy composition cost the OBS browser source?
// A stream drops frames when the source page cannot hold frame time, so measure the runtime itself:
// frames per second with requestAnimationFrame, long tasks over 50ms, and the delta between a static
// composition and the same composition with idle animations, since those are pure decoration.
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
if (!FROM_PRODUCTION) await new Promise((resolve) => server.listen(4180, resolve))
const ORIGIN = FROM_PRODUCTION ? 'https://varystal.github.io/jubilant-octo-lamp' : 'http://localhost:4180'

const base = { rotation: 0, opacity: 1, visible: true, locked: false, includeInOutput: true, maintainAspectRatio: false }
const text = (i, idle) => ({
  ...base, id: `el_t${i}`, type: 'text', name: `Text ${i}`, x: (i % 5) * 360 + 40, y: Math.floor(i / 5) * 120 + 40,
  width: 340, height: 90, animation: { type: 'none', exit: 'none', idle: idle ? 'glow' : 'none' },
  decoration: { enabled: idle, preset: idle ? 'ornate-frame' : 'none' },
  props: { text: `Layer ${i} سلام دنیا`, fontSize: 34, color: '#f5e6c8', direction: 'rtl' },
})
const makeOverlay = (staticMotion, idle) => ({
  id: 'ov_perf', publicId: 'pubperf', name: 'Perf overlay', width: 1920, height: 1080,
  settings: { showGrid: false, snap: true, showSafeArea: false, transparent: true, backgroundImage: null },
  theme: { id: 'royal-persian', accent: '#d8ad55', primary: '#0f0a14', surface: '#170f17' }, staticMotion, live: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishedAt: null,
  elements: [
    ...Array.from({ length: 30 }, (_, i) => text(i, idle)),
    { ...base, id: 'el_chat', type: 'chat', name: 'Chat', x: 40, y: 780, width: 520, height: 260, animation: { type: 'none', exit: 'none', idle: 'none' }, decoration: { enabled: false, preset: 'none' }, props: {} },
    { ...base, id: 'el_cd', type: 'countdown', name: 'Countdown', x: 1400, y: 40, width: 440, height: 120, animation: { type: 'none', exit: 'none', idle: 'none' }, decoration: { enabled: false, preset: 'none' }, props: { targetAt: new Date(Date.now() + 3600_000).toISOString(), label: 'Starting in' } },
    { ...base, id: 'el_vc', type: 'viewerCount', name: 'Viewers', x: 1400, y: 200, width: 380, height: 110, animation: { type: 'none', exit: 'none', idle: 'none' }, decoration: { enabled: false, preset: 'none' }, props: { label: 'Viewers' } },
  ],
})

async function measure(browser, { staticMotion, idle, label }) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${ORIGIN}/#/overlays`)
  await page.evaluate((data) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify([data])), makeOverlay(staticMotion, idle))
  await page.goto(`${ORIGIN}/#/overlay/pubperf`)
  try { await page.waitForSelector('.runtime-element', { timeout: 8000 }) }
  catch { console.log(JSON.stringify({ label, failed: true, errors, html: await page.evaluate(() => document.querySelector('main')?.className || document.body.innerHTML.slice(0, 300)) })); await page.close(); return null }
  await page.waitForTimeout(1200)
  const sample = await page.evaluate(async () => {
    const longTasks = []
    const observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) longTasks.push(Math.round(entry.duration)) })
    try { observer.observe({ entryTypes: ['longtask'] }) } catch { /* not supported */ }
    const frames = []
    const start = performance.now()
    let last = start
    await new Promise((resolve) => {
      const tick = (now) => { frames.push(now - last); last = now; if (now - start < 5000) requestAnimationFrame(tick); else resolve() }
      requestAnimationFrame(tick)
    })
    observer.disconnect()
    frames.shift()
    const sorted = [...frames].sort((a, b) => a - b)
    const p = (q) => Math.round(sorted[Math.floor(sorted.length * q)] * 10) / 10
    return {
      frames: frames.length,
      fps: Math.round((frames.length / 5) * 10) / 10,
      frameMs: { median: p(0.5), p95: p(0.95), worst: Math.round(sorted[sorted.length - 1]) },
      jankyFrames: frames.filter((d) => d > 20).length,
      longTasks: { count: longTasks.length, totalMs: longTasks.reduce((a, b) => a + b, 0), worst: Math.max(0, ...longTasks) },
      animatedNodes: document.getAnimations({ subtree: true }).length,
      elements: document.querySelectorAll('.runtime-element').length,
    }
  })
  await page.close()
  return { label, ...sample, errors }
}

const browser = await pw.chromium.launch()
const staticRun = await measure(browser, { staticMotion: true, idle: false, label: 'static (40 elements, no idle animation)' })
const animatedRun = await measure(browser, { staticMotion: false, idle: true, label: 'animated (40 elements, glow + ornate frame)' })
await browser.close(); if (!FROM_PRODUCTION) server.close()

const verdict = {
  animatedKeeps60: animatedRun?.fps >= 55,
  idleAnimationCost: { fpsDelta: Math.round((staticRun.fps - animatedRun.fps) * 10) / 10, longTaskMs: animatedRun.longTasks.totalMs - staticRun.longTasks.totalMs },
}
console.log(JSON.stringify({ staticRun, animatedRun, verdict }, null, 1))
