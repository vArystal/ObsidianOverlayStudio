// CP24: browser evidence for the registry-driven widget system.
// Every element here is added through the real palette, so the overlay the probe measures is one the studio built
// itself. SITE=<url> runs the identical checks against the deployed build.
import pw from '/tmp/node_modules/playwright/index.js'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { extname, join } from 'node:path'

const PORT = Number(process.env.PORT || 4341)
const SITE = process.env.SITE ? process.env.SITE.replace(/\/$/, '') : ''
const ORIGIN = SITE || `http://localhost:${PORT}`
const root = new URL('../../dist/', import.meta.url).pathname
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url || '/').split('?')[0])
  const file = join(root, path === '/' ? 'index.html' : path)
  if (existsSync(file) && !file.endsWith('/')) { res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }); res.end(readFileSync(file)); return }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end(readFileSync(join(root, 'index.html')))
})
if (!SITE) await new Promise((resolve) => server.listen(PORT, resolve))

const AXE = readFileSync('/tmp/axe.min.js', 'utf8')
const STORAGE = 'obsidian-overlays-v1'
const WIDGETS = ['streamTitle', 'liveStatus', 'streamCategory', 'streamDuration', 'subscriberCount', 'recentFollowers', 'recentSubscribers', 'activityFeed', 'clock', 'socialLinks']
const report = { site: ORIGIN, checks: {}, screenshots: [] }

const browser = await pw.chromium.launch({ args: ['--force-color-profile=srgb'] })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))

const readOverlays = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), STORAGE)

try {
  // ---------------------------------------------------------------- library
  // The overlay is created through the dashboard, so every field the editor reads is the app's own shape.
  await page.goto(`${ORIGIN}/#/`, { waitUntil: 'networkidle' })
  await page.click('text=New empty overlay')
  await page.waitForSelector('[data-widget-type]')
  const overlayId = page.url().match(/editor\/([^/?#]+)/)?.[1]
  const library = await page.evaluate(() => ({
    count: document.querySelectorAll('[data-widget-type]').length,
    groups: [...document.querySelectorAll('.element-library h3')].map((n) => n.textContent),
    badges: [...document.querySelectorAll('.widget-badge')].map((n) => n.textContent),
  }))
  await page.fill('#widget-search', 'clock')
  await page.waitForTimeout(150)
  const searchClock = await page.locator('[data-widget-type]').count()
  await page.fill('#widget-search', 'follower')
  await page.waitForTimeout(150)
  const searchFollower = await page.locator('[data-widget-type]').count()
  await page.fill('#widget-search', 'zzzz')
  await page.waitForTimeout(150)
  const searchNone = await page.locator('[data-widget-type]').count()
  await page.fill('#widget-search', '')
  await page.waitForTimeout(150)
  report.checks.library = { ...library, searchClock, searchFollower, searchNone }

  // ------------------------------------------------------------- add widgets
  for (const type of WIDGETS) await page.click(`[data-widget-type="${type}"]`)
  await page.waitForTimeout(500)
  const canvas = () => page.evaluate(() => ({
    layers: document.querySelectorAll('.layer-row').length,
    shells: document.querySelectorAll('.canvas-element .widget-shell').length,
    texts: [...document.querySelectorAll('.canvas-element .widget-shell')].map((n) => n.textContent.replace(/\s+/g, ' ').trim()),
    states: [...document.querySelectorAll('.widget-state')].map((n) => n.getAttribute('data-phase') + ':' + n.textContent),
  }))
  report.checks.canvas = await canvas()
  await page.screenshot({ path: 'artifacts/cp24-editor.png' })
  report.screenshots.push('artifacts/cp24-editor.png')

  // ------------------------------------------------------------- inspector
  await page.click('#tab-layers')
  await page.waitForSelector('.layer-row', { timeout: 10000 })
  await page.click('.layer-row:has-text("Recent followers")')
  await page.waitForTimeout(200)
  const inspectorTitle = await page.evaluate(() => [...document.querySelectorAll('.property-section summary')].map((n) => n.textContent).find((t) => t.startsWith('Widget')))
  const limit = page.locator('input[type="number"]').nth(5)
  const storedProps = async () => page.evaluate(() => JSON.parse(localStorage.getItem('obsidian-overlays-v1'))[0].elements.find((e) => e.type === 'recentFollowers')?.props)
  const before = await storedProps()
  const rowsField = page.locator('.property-field:has-text("Rows shown") input')
  await rowsField.fill('19')
  await rowsField.blur()
  // Autosave commits about 765ms after the last edit, so wait past it before reading storage.
  await page.waitForTimeout(1400)
  const edited = await storedProps()
  await page.click('button:has-text("Reset recent followers settings")')
  await page.waitForTimeout(1400)
  const reset = await storedProps()
  report.checks.inspector = { title: inspectorTitle, limitFieldVisible: await limit.count() > 0, before: before?.maxItems, edited: edited?.maxItems, reset: reset?.maxItems }

  // --------------------------------------------------------------- runtime
  const [saved] = await readOverlays()
  report.checks.savedLayers = saved.elements.length
  await page.goto(`${ORIGIN}/#/overlay/${saved.publicId}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  report.checks.runtime = await page.evaluate(() => ({
    shells: document.querySelectorAll('.widget-shell').length,
    states: [...document.querySelectorAll('.widget-state')].map((n) => n.getAttribute('data-phase') + ':' + n.textContent),
    controls: document.querySelectorAll('.runtime-stage button, .runtime-stage input').length,
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
    transparent: getComputedStyle(document.body).backgroundColor,
  }))
  const editorText = [...report.checks.canvas.texts]
  const runtimeText = await page.evaluate(() => [...document.querySelectorAll('.widget-shell')].map((n) => n.textContent.replace(/\s+/g, ' ').trim()))
  const normalise = (rows) => rows.map((row) => row.replace(/\d{1,2}:\d{2}:\d{2}/g, '<clock>'))
  report.checks.parity = {
    editor: editorText,
    runtime: runtimeText,
    // The clock is a live local value; everything else must be byte-identical between the two surfaces.
    identical: JSON.stringify(normalise(editorText)) === JSON.stringify(normalise(runtimeText)),
  }
  await page.screenshot({ path: 'artifacts/cp24-runtime.png' })
  report.screenshots.push('artifacts/cp24-runtime.png')

  // ------------------------------------------------------------ performance
  // Performance: replicate the widgets the studio already built (own geometry and props) up to N layers.
  const perf = {}
  for (const count of [5, 10, 20]) {
    await page.evaluate(({ key, n }) => {
      const [base] = JSON.parse(localStorage.getItem(key))
      const pool = base.elements
      const elements = Array.from({ length: n }, (_, i) => {
        const source = pool[i % pool.length]
        return { ...source, id: `perf_${i}`, x: 60 + (i % 4) * 460, y: 40 + Math.floor(i / 4) * 250, name: `${source.name} ${i}` }
      })
      const perfOverlay = { ...base, id: 'ov_perf', publicId: 'pubperf', name: `perf ${n}`, elements }
      localStorage.setItem(key, JSON.stringify([perfOverlay]))
    }, { key: STORAGE, n: count })
    await page.goto(`${ORIGIN}/#/overlay/pubperf`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(700)
    perf[count] = await page.evaluate(() => new Promise((resolve) => {
      let frames = 0
      const start = performance.now()
      const tick = () => { frames += 1; if (performance.now() - start < 3000) requestAnimationFrame(tick); else resolve(Number((frames / ((performance.now() - start) / 1000)).toFixed(1))) }
      requestAnimationFrame(tick)
    }))
  }
  report.checks.perf = perf

  // ------------------------------------------- rendering with real-shaped frames
  // LIMIT: this browser profile has no Kick management token, so a genuine connection cannot be opened here. The
  // frames below copy the documented Kick payload shape to prove the widgets render data; they are NOT a claim of
  // a live connection, which /state proves separately.
  const fixturePage = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  const fixtureErrors = []
  fixturePage.on('pageerror', (error) => fixtureErrors.push(String(error)))
  await fixturePage.addInitScript(() => {
    class FakeEventSource {
      constructor(url) {
        this.url = url; this.readyState = 1; this.listeners = {}
        setTimeout(() => {
          this.onopen?.({})
          const frames = [
            { id: 'f1', type: 'livestream.status.updated', receivedAt: new Date().toISOString(), test: false, data: { is_live: true, title: 'Late night ranked', started_at: new Date(Date.now() - 3723000).toISOString() } },
            { id: 'f2', type: 'livestream.metadata.updated', receivedAt: new Date().toISOString(), test: false, data: { metadata: { title: 'Late night ranked', category: { name: 'Valorant' } } } },
            { id: 'f3', type: 'channel.followed', receivedAt: new Date().toISOString(), test: false, data: { follower: { username: 'greasea' } } },
            { id: 'f4', type: 'channel.subscription.new', receivedAt: new Date().toISOString(), test: false, data: { subscriber: { username: 'nova' } } },
            { id: 'f5', type: 'kicks.gifted', receivedAt: new Date().toISOString(), test: false, data: { sender: { username: 'kage' }, gift: { amount: 5, name: 'KICKs' } } },
            { id: 'f6', type: 'chat.message.sent', receivedAt: new Date().toISOString(), test: false, data: { messageId: 'm1', content: 'GG', sender: { username: 'nova' } } },
          ]
          frames.forEach((frame, i) => setTimeout(() => this.dispatch('overlay-event', frame), 150 * (i + 1)))
        }, 120)
      }
      addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn) }
      dispatch(name, payload) { (this.listeners[name] || []).forEach((fn) => fn({ data: JSON.stringify(payload) })) }
      close() { this.readyState = 2 }
    }
    window.EventSource = FakeEventSource
  })
  await fixturePage.route('**/api/runtime/**/state', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      connected: true, viewer: { status: 'live', count: 41, updatedAt: new Date().toISOString() },
      latestFollower: { username: 'greasea' }, sessionFollowerCount: 1,
      channel: { slug: 'arystal', activeSubscribers: 12 },
      stream: { title: 'Late night ranked', category: 'Valorant', isLive: true, startedAt: new Date(Date.now() - 3723000).toISOString(), updatedAt: new Date().toISOString() },
      lastEventAt: new Date().toISOString(),
    }),
  }))
  // A new page gets its own context and storage, so the fixture overlay is seeded from the composition the
  // studio already built above rather than re-fetched from this page's localStorage.
  const fixtureOverlay = {
    ...JSON.parse(JSON.stringify(saved)),
    id: 'ov_fixture', publicId: 'pubfixture', name: 'CP24 live frames',
    live: { backendUrl: 'https://obsidian-overlay-api.pages.dev', runtimeKey: 'fixture', connectionId: 'fixture', channelName: 'arystal' },
  }
  await fixturePage.addInitScript(({ key, overlay }) => localStorage.setItem(key, JSON.stringify([overlay])), { key: STORAGE, overlay: fixtureOverlay })
  await fixturePage.goto(`${ORIGIN}/#/overlay/pubfixture`, { waitUntil: 'networkidle' })
  await fixturePage.waitForTimeout(2200)
  report.checks.fixtureRender = await fixturePage.evaluate(() => ({
    text: [...document.querySelectorAll('.widget-shell')].map((n) => n.textContent.replace(/\s+/g, ' ').trim()),
    states: [...document.querySelectorAll('.widget-state')].map((n) => n.textContent),
  }))
  report.checks.fixtureRender.errors = fixtureErrors
  await fixturePage.screenshot({ path: 'artifacts/cp24-runtime-frames.png' })
  report.screenshots.push('artifacts/cp24-runtime-frames.png')
  await fixturePage.close()

  // ------------------------------------------------------------------- axe
  await page.evaluate(({ key, publicId, id }) => {
    const [base] = JSON.parse(localStorage.getItem(key))
    localStorage.setItem(key, JSON.stringify([{ ...base, id, publicId }]))
  }, { key: STORAGE, publicId: 'pubcp24', id: 'ov_cp24' })
  await page.goto(`${ORIGIN}/#/overlays/editor/ov_cp24`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.canvas-element')
  await page.addScriptTag({ content: AXE })
  report.checks.axe = await page.evaluate(async () => {
    const out = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2aa'] } })
    return { violations: out.violations.map((v) => `${v.id} (${v.nodes.length})`), passes: out.passes.length }
  })
  await page.screenshot({ path: 'artifacts/cp24-editor-axe.png' })
  report.screenshots.push('artifacts/cp24-editor-axe.png')
  report.pageErrors = errors
} catch (error) {
  report.failure = String(error)
  report.pageErrors = errors
  await page.screenshot({ path: 'artifacts/cp24-failure.png' }).catch(() => {})
} finally {
  await browser.close()
  if (!SITE) server.close()
  console.log(JSON.stringify(report, null, 2))
}
