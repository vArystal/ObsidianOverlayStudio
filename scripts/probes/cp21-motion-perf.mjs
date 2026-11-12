// CP21 proof, defensive version: every measurement has a wall-clock cap so a throttled headless page can never
// hang the probe. Measures (1) that the live layer actually advances, (2) rAF cadence with a backdrop running.
import pw from '/tmp/node_modules/playwright/index.js'
const { chromium } = pw

const SITE = process.env.SITE ?? 'http://localhost:4455'
const KEY = 'obsidian-overlays-v1'

const bg = (kind) => ({
  enabled: true, kind, primary: '#08090b', secondary: '#111820', accent: '#e7e4dc',
  opacity: 0.95, speed: 2, intensity: 0.6, blur: 0, density: 0.9, scale: 1, paused: false,
})
const makeOverlay = (id, kind, extra = {}) => ({
  id: `ov_${id}`, publicId: `pub${id}`, name: `probe ${kind}`, width: 1920, height: 1080,
  settings: { showGrid: false, snap: true, showSafeArea: false, transparent: true, backgroundImage: null },
  theme: { id: 'obsidian' }, background: { ...bg(kind), ...extra }, staticMotion: false, live: null,
  elements: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishedAt: new Date().toISOString(),
})

// Counts real animation frames for `ms` and always resolves.
const countFrames = (page, ms) => page.evaluate((duration) => new Promise((resolve) => {
  let frames = 0
  const started = performance.now()
  const tick = () => {
    frames += 1
    if (performance.now() - started < duration) requestAnimationFrame(tick)
    else resolve({ fps: Math.round((frames / ((performance.now() - started) / 1000)) * 10) / 10, frames })
  }
  requestAnimationFrame(tick)
  setTimeout(() => resolve({ fps: Math.round((frames / (duration / 1000)) * 10) / 10, frames, capped: true }), duration + 1500)
}), ms)

const main = async () => {
  const browser = await chromium.launch()
  const errors = []
  const report = { motion: {}, perf: {}, errors }
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  const seed = async (overlays) => {
    await page.addInitScript(([key, data]) => localStorage.setItem(key, data), [KEY, JSON.stringify(overlays)])
  }

  // 1. Motion: sample the same node at two instants and capture both frames.
  await seed([makeOverlay('motion', 'cinematic-particles')])
  await page.goto(`${SITE}/#/overlay/pubmotion`, { waitUntil: 'load' })
  await page.waitForFunction(() => Boolean(document.querySelector('.overlay-background')), null, { timeout: 15000 })
  await page.waitForTimeout(1000)
  const sample = () => page.evaluate(() => {
    const layer = document.querySelector('.overlay-background')
    const mote = document.querySelector('.bg-mote')
    return {
      layer: getComputedStyle(layer).transform,
      mote: mote ? getComputedStyle(mote).transform : null,
      playState: getComputedStyle(layer).animationPlayState,
    }
  })
  const before = await sample()
  await page.screenshot({ path: 'artifacts/cp21-motion-a.png' })
  await page.waitForTimeout(1200)
  const after = await sample()
  await page.screenshot({ path: 'artifacts/cp21-motion-b.png' })
  report.motion = {
    layerMoved: before.layer !== after.layer,
    moteMoved: before.mote !== after.mote,
    playState: after.playState,
    before,
    after,
  }

  // 2. Frame rate with a backdrop running, and with it paused, at 1920x1080.
  for (const kind of ['aurora-flow', 'cinematic-particles', 'neon-grid', 'deep-space']) {
    await seed([makeOverlay(kind, kind)])
    await page.goto(`${SITE}/#/overlay/pub${kind}`, { waitUntil: 'load' })
    await page.waitForFunction(() => Boolean(document.querySelector('.overlay-background')), null, { timeout: 15000 })
    await page.waitForTimeout(400)
    const running = await countFrames(page, 2200)
    const nodes = await page.evaluate(() => document.querySelectorAll('*').length)
    report.perf[kind] = { fps: running.fps, nodes, capped: Boolean(running.capped) }
  }

  // 3. Paused must freeze, and the OS reduce-motion preference must freeze too.
  await seed([makeOverlay('paused', 'cinematic-particles', { paused: true })])
  await page.goto(`${SITE}/#/overlay/pubpaused`, { waitUntil: 'load' })
  await page.waitForFunction(() => Boolean(document.querySelector('.overlay-background')), null, { timeout: 15000 })
  await page.waitForTimeout(400)
  const p1 = await page.evaluate(() => getComputedStyle(document.querySelector('.bg-mote')).transform)
  await page.waitForTimeout(800)
  const p2 = await page.evaluate(() => getComputedStyle(document.querySelector('.bg-mote')).transform)
  report.pausedStops = p1 === p2
  await page.close()

  const reduced = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' })
  const rpage = await reduced.newPage()
  await rpage.addInitScript(([key, data]) => localStorage.setItem(key, data), [KEY, JSON.stringify([makeOverlay('reduced', 'aurora-flow')])])
  await rpage.goto(`${SITE}/#/overlay/pubreduced`, { waitUntil: 'load' })
  await rpage.waitForFunction(() => Boolean(document.querySelector('.overlay-background')), null, { timeout: 15000 })
  await rpage.waitForTimeout(400)
  const r1 = await rpage.evaluate(() => getComputedStyle(document.querySelector('.bg-band')).transform)
  await rpage.waitForTimeout(800)
  const r2 = await rpage.evaluate(() => getComputedStyle(document.querySelector('.bg-band')).transform)
  report.reducedMotionStops = r1 === r2
  await reduced.close()

  await browser.close()
  console.log(JSON.stringify(report, null, 1))
}

main().catch((error) => { console.error('PROBE FAILED', error.message); process.exit(1) })
