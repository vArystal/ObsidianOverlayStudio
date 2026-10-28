/**
 * CP6: drive the real OBS path against production.
 *
 * Loads a published snapshot URL (the exact string a user pastes into OBS) with the live runtime
 * key of the real backend, so SSE, the viewer metric and the font all come from production.
 * RUNTIME_KEY is passed through the environment so the capability never lands in the repo.
 */
import pw from '/tmp/node_modules/playwright/index.js'
import lz from 'lz-string'
const { compressToEncodedURIComponent } = lz
const { chromium } = pw

const SITE = process.env.SITE || 'https://varystal.github.io/jubilant-octo-lamp'
const BACKEND = process.env.BACKEND || 'https://obsidian-overlay-api.pages.dev'
const KEY = process.env.RUNTIME_KEY
if (!KEY) { console.error('RUNTIME_KEY missing'); process.exit(2) }

const el = (id, type, x, y, w, h, props) => ({ id, type, name: type, x, y, width: w, height: h, rotation: 0, opacity: 1, visible: true, locked: false, includeInOutput: true, maintainAspectRatio: false, animation: { type: 'none', exit: 'none', idle: 'none', duration: 600, delay: 0, easing: 'ease', intensity: 1, direction: 'up', reducedMotion: 'static' }, decoration: { enabled: false, preset: 'none', color: '#d8ad55', width: 0, radius: 0 }, props })
const overlay = {
  id: 'ov_cp6', publicId: 'cp6', name: 'CP6 runtime', width: 1920, height: 1080,
  settings: { showGrid: false, snap: false, showSafeArea: false, transparent: true, backgroundImage: null },
  theme: { id: 'royal-persian', accent: '#d8ad55', primary: '#2b1238', surface: '#160a12' },
  staticMotion: true,
  live: { backendUrl: BACKEND, runtimeKey: KEY, connectionId: 'con_6swqGvz0Dluf', channelName: 'arystal' },
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishedAt: null,
  elements: [
    el('v1', 'viewerCount', 80, 80, 360, 120, { label: 'VIEWERS' }),
    el('f1', 'latestFollower', 80, 220, 420, 110, { label: 'LATEST FOLLOWER', emptyText: 'No follower yet' }),
    el('c1', 'chat', 80, 420, 700, 520, { fontFamily: 'Vazirmatn', fontSize: 22, maxMessages: 5, showTimestamps: true, showBadges: true, scrolling: true }),
  ],
}
const snapshot = compressToEncodedURIComponent(JSON.stringify(overlay))
const url = `${SITE}/#/overlay/cp6?snapshot=${snapshot}`

const browser = await chromium.launch()
const out = { urlLength: url.length, sizes: {}, invalid: {}, sse: {}, fonts: null, errors: [] }

async function load(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const sse = []
  page.on('response', (r) => { if (r.url().includes('/api/runtime/') && r.url().includes('/events')) sse.push(r.status()) })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const measured = await page.evaluate(() => {
    const stage = document.querySelector('.runtime-stage')
    const main = document.querySelector('.overlay-runtime')
    const viewer = document.querySelector('.live-metric')
    const scrollW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    return {
      stageTransform: stage ? getComputedStyle(stage).transform : null,
      stageWidth: stage?.getBoundingClientRect().width ?? null,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      mainBackground: main ? getComputedStyle(main).backgroundColor : null,
      overflowX: scrollW > window.innerWidth,
      overflowY: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > window.innerHeight,
      viewerText: viewer?.querySelector('strong')?.textContent ?? null,
      viewerCaption: viewer?.querySelector('em')?.textContent ?? null,
      followerText: document.querySelector('.supporter-widget strong')?.textContent ?? null,
      chatCount: document.querySelectorAll('.chat-row, .chat-message').length,
      vazirLoaded: document.fonts.check('16px Vazirmatn'),
    }
  })
  out.errors.push(...errors)
  out.sse[`${w}x${h}`] = sse
  await page.close()
  return measured
}

out.sizes['1920x1080'] = await load(1920, 1080)
out.sizes['1280x720'] = await load(1280, 720)
out.sizes['900x1600'] = await load(900, 1600)

const bad = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await bad.goto(`${SITE}/#/overlay/cp6?snapshot=not-a-real-snapshot`, { waitUntil: 'networkidle' })
await bad.waitForTimeout(800)
out.invalid = {
  message: (await bad.locator('.runtime-error').textContent().catch(() => null))?.trim() ?? null,
  blank: (await bad.evaluate(() => document.body.innerText.trim().length === 0)),
}
await bad.close()
await browser.close()
console.log(JSON.stringify(out, null, 1))
