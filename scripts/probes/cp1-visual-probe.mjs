import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import pw from '/tmp/node_modules/playwright/index.js'
const { chromium } = pw

const ROOT = new URL('../../dist/', import.meta.url).pathname
const OUT = new URL('../../artifacts/cp1/', import.meta.url).pathname
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  const file = path === '/' || !extname(path) ? join(ROOT, 'index.html') : join(ROOT, path)
  try { const body = await readFile(file); res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(body) }
  catch { const body = await readFile(join(ROOT, 'index.html')); res.writeHead(200, { 'content-type': 'text/html' }); res.end(body) }
})
await new Promise((r) => server.listen(4174, r))
await mkdir(OUT, { recursive: true })

const element = (type, x, y, w, h, props = {}) => ({
  id: `el_${type}`, type, name: type, x, y, width: w, height: h, rotation: 0, opacity: 1, visible: true,
  locked: false, includeInOutput: true, maintainAspectRatio: false,
  animation: { type: 'fade', exit: 'fade', idle: 'none', duration: 500, exitDuration: 400, delay: 0, direction: 'up', easing: 'ease-out', intensity: .6, holdDuration: 5000, reducedMotion: 'respect' },
  decoration: { enabled: true, preset: 'royal-panel' }, props,
})
const base = (id, publicId, name, elements) => ({
  id, publicId, name, width: 1920, height: 1080,
  settings: { showGrid: false, snap: true, showSafeArea: false, transparent: true, backgroundImage: null },
  theme: { id: 'royal-persian' }, staticMotion: false, live: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishedAt: null, elements,
})
const overlays = [
  base('ov_one', 'pubone', 'Persian Gold Stream Layout', [
    element('chat', 80, 300, 460, 560, { maxMessages: 6, fontSize: 20 }),
    element('viewerCount', 1540, 90, 300, 126, { label: 'Live viewers' }),
    element('frame', 600, 120, 720, 420, { label: 'Webcam frame' }),
    element('latestFollower', 90, 90, 430, 108, { label: 'Latest follower' }),
  ]),
  base('ov_two', 'pubtwo', 'Grand Finale Alerts', [element('alert', 700, 100, 560, 280, { title: 'New follower' })]),
]

// WCAG relative luminance / contrast, computed from the token values in use
const hex = (h) => h.replace('#', '').match(/../g).map((v) => parseInt(v, 16))
const lum = (rgb) => rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0)
const ratio = (a, b) => { const [l1, l2] = [lum(hex(a)), lum(hex(b))].sort((x, y) => y - x); return Number(((l1 + 0.05) / (l2 + 0.05)).toFixed(2)) }
const contrast = {
  'ivory on ink-900': ratio('#FBF3E4', '#0A0510'),
  'muted on ink-900': ratio('#B9A9C4', '#0A0510'),
  'ivory-300 on ink-800': ratio('#D9C9B4', '#150C20'),
  'gold-300 on ink-900': ratio('#F0D9A6', '#0A0510'),
  'button text on gold': ratio('#2A1608', '#D8AD55'),
}

const browser = await chromium.launch()
const report = { routes: [], fonts: {}, overflow: [], errors: [], screens: [] }
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => report.errors.push(e.message))
await page.goto('http://localhost:4174/#/overlays')
await page.evaluate((data) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify(data)), overlays)
await page.reload()

async function visit(route, name) {
  await page.goto(`http://localhost:4174/#/${route}`)
  await page.waitForTimeout(700)
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false })
  const m = await page.evaluate(() => {
    const pick = (sel) => document.querySelector(sel)
    const cs = (el) => el ? getComputedStyle(el) : null
    const header = pick('.app-header')
    return {
      scrollOverflow: document.documentElement.scrollWidth - window.innerWidth,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      bodyFont: getComputedStyle(document.body).fontFamily,
      h1Font: cs(pick('h1'))?.fontFamily ?? null,
      headerBg: cs(header)?.backgroundImage?.slice(0, 60) ?? null,
      primaryBg: cs(pick('.primary-button'))?.backgroundImage?.slice(0, 80) ?? null,
      cards: document.querySelectorAll('.overlay-card').length,
    }
  })
  report.routes.push({ route, ...m, statTiles: await page.locator('.library-stats > div').count() })
}

await visit('overlays', 'library')
await visit('integrations', 'integrations')
await visit('overlays/editor/ov_one', 'editor')
await visit('overlay/pubone', 'runtime')

const fonts = await page.evaluate(async () => {
  await document.fonts.ready
  return {
    vazirmatn: document.fonts.check('16px Vazirmatn'),
    display: document.fonts.check('16px "Studio Display"'),
    loaded: [...document.fonts].map((f) => `${f.family}:${f.weight}:${f.status}`),
  }
})
report.fonts = fonts

// delete confirmation surface
await page.goto('http://localhost:4174/#/overlays')
await page.waitForTimeout(500)
await page.click('.icon-button[aria-label="Overlay menu"]')
await page.waitForTimeout(200)
await page.click('.card-menu button.danger')
await page.waitForTimeout(300)
report.dialogOpen = await page.locator('[role="dialog"]').count()
report.dialogFocused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? null)
await page.screenshot({ path: join(OUT, 'dialog.png') })
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
report.dialogClosedByEscape = (await page.locator('[role="dialog"]').count()) === 0
report.overlaySurvivedEscape = await page.evaluate(() => JSON.parse(localStorage.getItem('obsidian-overlays-v1')).length)

await page.goto('http://localhost:4174/#/overlay/pubone')
await page.waitForTimeout(600)
report.runtimeTransparent = await page.evaluate(() => ({
  body: getComputedStyle(document.body).backgroundColor,
  bodyImage: getComputedStyle(document.body).backgroundImage,
  overflow: document.documentElement.scrollWidth - window.innerWidth,
}))

await page.close()
report.contrast = contrast
// narrow viewport pass
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
await mobile.goto('http://localhost:4174/#/overlays')
await mobile.evaluate((data) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify(data)), overlays)
await mobile.reload(); await mobile.waitForTimeout(600)
report.mobile = { overflow: await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), tiles: await mobile.locator('.library-stats > div').count() }
await mobile.screenshot({ path: join(OUT, 'library-390.png') })
await mobile.close()

await browser.close(); server.close()
console.log(JSON.stringify(report, null, 1))
