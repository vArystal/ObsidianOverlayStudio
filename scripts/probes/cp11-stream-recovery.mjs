// CP11: does the OBS source repair its own event stream?
// A fatal close used to leave a permanently dead overlay until someone reloaded the page. This drives the
// deployed runtime against the real backend, kills the stream, and watches the client bring it back.
import pw from '/tmp/node_modules/playwright/index.js'

const SITE = process.env.SITE || 'https://varystal.github.io/jubilant-octo-lamp'
const RUNTIME_KEY = process.env.RUNTIME_KEY
if (!RUNTIME_KEY) throw new Error('RUNTIME_KEY is required')

const base = { rotation: 0, opacity: 1, visible: true, locked: false, includeInOutput: true, maintainAspectRatio: false }
const overlay = {
  id: 'ov_recovery', publicId: 'pubrecovery', name: 'Recovery probe', width: 1920, height: 1080,
  settings: { showGrid: false, snap: true, showSafeArea: false, transparent: true, backgroundImage: null },
  theme: { id: 'royal-persian', accent: '#d8ad55', primary: '#0f0a14', surface: '#170f17' },
  staticMotion: false,
  live: { backendUrl: 'https://obsidian-overlay-api.pages.dev', runtimeKey: RUNTIME_KEY, connectionId: 'probe', channelName: 'arystal' },
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishedAt: null,
  elements: [{ ...base, id: 'el_chat', type: 'chat', name: 'Chat', x: 60, y: 120, width: 560, height: 320, animation: { type: 'none', exit: 'none', idle: 'none' }, decoration: { enabled: false, preset: 'none' }, props: {} }],
}

const browser = await pw.chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

let mode = 'healthy'
const attempts = []
page.route('**/api/runtime/*/events', async (route) => {
  attempts.push({ at: Date.now(), mode })
  if (mode === 'down') return route.fulfill({ status: 503, body: 'down' })
  return route.continue()
})

await page.goto(`${SITE}/#/overlays`)
await page.evaluate((data) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify([data])), overlay)
await page.goto(`${SITE}/#/overlay/pubrecovery`)
await page.waitForSelector('.runtime-element', { timeout: 10_000 })
await page.waitForTimeout(3500)
const healthyAttempts = attempts.length

// Kill the stream the way a backend deploy does: the endpoint stops answering.
mode = 'down'
await page.waitForTimeout(45_000)
const duringOutage = attempts.length - healthyAttempts
const gaps = attempts.slice(healthyAttempts + 1).map((a, i, list) => (i === 0 ? null : Math.round((a.at - list[i - 1].at) / 100) / 10)).filter(Boolean)

// Bring it back. No reload: the page must recover on its own.
mode = 'healthy'
const beforeRecovery = attempts.length
await page.waitForTimeout(45_000)
const afterRecovery = attempts.length - beforeRecovery
const recovered = await page.evaluate(() => {
  const chat = document.querySelector('.runtime-element .element-content')?.textContent || ''
  return { chatTextLength: chat.trim().length, streams: performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/events')).length }
})

await browser.close()
console.log(JSON.stringify({
  healthyAttempts,
  duringOutage,
  backoffGapsSeconds: gaps,
  attemptsAfterRecovery: afterRecovery,
  recovered,
  errors,
  verdict: {
    retriedDuringOutage: duringOutage >= 2,
    backoffGrows: gaps.length >= 2 && Math.max(...gaps) > Math.min(...gaps),
    recoveredWithoutReload: afterRecovery >= 1,
  },
}, null, 1))
