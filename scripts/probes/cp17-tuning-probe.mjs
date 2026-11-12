// CP17: the botanical tuning is real data. Does a choice reach the CSS variables, the geometry budget,
// storage, a reload, and the published runtime?
import pw from '/tmp/node_modules/playwright/index.js'
const { chromium } = pw

const PORT = Number(process.env.PORT || 4341)
const SITE = process.env.SITE ? process.env.SITE.replace(/\/$/, '') : ''
const ORIGIN = SITE || `http://localhost:${PORT}`
const PUBLIC_ID = 'pubcp17'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const overlay = {
  id: 'ov_cp17', publicId: PUBLIC_ID, name: 'Tuning',
  width: 1280, height: 720,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  staticMotion: false, live: null, background: null,
  theme: {
    id: 'thorn-rose', name: 'Thorn & Rose', nameFa: 'خار و گل سرخ',
    primary: '#1b3a2c', secondary: '#08110c', accent: '#c9a24a', accentSoft: '#f4efe4',
    surface: '#0b1410', surfaceAlt: '#12211a', text: '#f4efe4', muted: '#a9b9ad', glow: '#2f7a5f', pattern: 'none',
  },
  thorn: { rose: 'crimson', foliage: 'full', motion: 'subtle' },
  settings: { showGrid: false, snap: false, showSafeArea: false, transparent: true, backgroundImage: null },
  elements: [
    { id: 'el_chat', type: 'chat', name: 'Chat', x: 40, y: 60, width: 420, height: 380, rotation: 0, opacity: 1, locked: false, visible: true, includeInOutput: true, animation: { type: 'fade', duration: 600, delay: 0, easing: 'ease-out', intensity: 1, idle: 'none', reducedMotion: 'none', direction: 'up' }, decoration: { enabled: true, preset: 'thorn-vine', inheritTheme: true, borderVisible: true, borderWidth: 2, borderColor: '#c9a24a', borderOpacity: 0.9, radius: 16, innerBorder: true, innerBorderColor: '#e6c77a', innerBorderOpacity: 0.3, cornerOrnaments: false, shadow: true, shadowOpacity: 0.4, glow: false, glowOpacity: 0.2, highlight: true, highlightOpacity: 0.2, pattern: 'none', backgroundColor: '#0b1210', backgroundOpacity: 0.6, padding: 24, separator: false }, props: {} },
    { id: 'el_cam', type: 'webcam', name: 'Camera', x: 520, y: 60, width: 700, height: 380, rotation: 0, opacity: 1, locked: false, visible: true, includeInOutput: true, animation: { type: 'fade', duration: 600, delay: 0, easing: 'ease-out', intensity: 1, idle: 'none', reducedMotion: 'none', direction: 'up' }, decoration: { enabled: true, preset: 'thorn-vine', inheritTheme: true, borderVisible: true, borderWidth: 2, borderColor: '#c9a24a', borderOpacity: 0.9, radius: 16, innerBorder: true, innerBorderColor: '#e6c77a', innerBorderOpacity: 0.3, cornerOrnaments: false, shadow: true, shadowOpacity: 0.4, glow: false, glowOpacity: 0.2, highlight: false, highlightOpacity: 0.2, pattern: 'none', backgroundColor: '#0b1210', backgroundOpacity: 0, padding: 24, separator: false }, props: { captureMode: 'frame' } },
    { id: 'el_count', type: 'counter', name: 'Followers', x: 40, y: 480, width: 420, height: 150, rotation: 0, opacity: 1, locked: false, visible: true, includeInOutput: true, animation: { type: 'fade', duration: 600, delay: 0, easing: 'ease-out', intensity: 1, idle: 'none', reducedMotion: 'none', direction: 'up' }, decoration: { enabled: true, preset: 'thorn-vine', inheritTheme: true, borderVisible: true, borderWidth: 2, borderColor: '#c9a24a', borderOpacity: 0.9, radius: 16, innerBorder: true, innerBorderColor: '#e6c77a', innerBorderOpacity: 0.3, cornerOrnaments: false, shadow: true, shadowOpacity: 0.4, glow: false, glowOpacity: 0.2, highlight: true, highlightOpacity: 0.2, pattern: 'none', backgroundColor: '#0b1210', backgroundOpacity: 0.6, padding: 24, separator: false }, props: { label: 'Followers', value: '1284' } },
  ],
}

const results = { steps: [] }
const errors = []

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1500, height: 940 } })
page.on('pageerror', (error) => errors.push(String(error)))
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })

const vars = () => page.evaluate(() => {
  const stage = document.querySelector('.canvas-stage') || document.querySelector('.runtime-stage')
  const style = getComputedStyle(stage)
  return {
    lit: style.getPropertyValue('--thorn-rose-lit').trim(),
    motion: style.getPropertyValue('--thorn-motion').trim(),
    leaves: document.querySelectorAll('.thorn-leaf').length,
    blooms: document.querySelectorAll('.thorn-bloom-layer').length,
  }
})

try {
  await page.addInitScript((data) => { if (!localStorage.getItem('obsidian-overlays-v1')) localStorage.setItem('obsidian-overlays-v1', JSON.stringify([data])) }, overlay)

  // 1. Editor: the tuning card exists and shows the shipped look.
  await page.goto(`${ORIGIN}/#/overlays/editor/ov_cp17`)
  await page.waitForSelector('.thorn-tuning', { timeout: 15000 })
  await page.waitForSelector('.thorn-leaf')
  const initial = await vars()
  results.steps.push({ step: 'editor opens with shipped tuning', ...initial, card: await page.locator('.thorn-tuning-row').count() })

  // 2. Palette: the CSS variable that paints every petal must change.
  await page.getByRole('radio', { name: 'Blush' }).click()
  await sleep(400)
  const blush = await vars()
  results.steps.push({ step: 'rose palette applied', ...blush })

  // 3. Foliage: geometry budget changes the number of leaves.
  await page.getByRole('radio', { name: 'light', exact: true }).click()
  await sleep(400)
  const light = await vars()
  await page.getByRole('radio', { name: 'lush', exact: true }).click()
  await sleep(500)
  const lush = await vars()
  results.steps.push({ step: 'foliage density applied', lightLeaves: light.leaves, lushLeaves: lush.leaves })

  // 4. Motion multiplier.
  await page.getByRole('radio', { name: 'lively', exact: true }).click()
  await sleep(300)
  const lively = await vars()
  results.steps.push({ step: 'motion applied', motion: lively.motion })

  // 5. Persistence: reload the editor with the same storage and read the stored overlay.
  await sleep(900)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('obsidian-overlays-v1'))[0].thorn)
  results.stored = stored
  await page.reload()
  await page.waitForSelector('.thorn-leaf')
  await sleep(600)
  results.afterReload = { ...(await vars()), checked: await page.locator('.thorn-tuning [aria-checked="true"]').allTextContents() }

  // 6. Published runtime: the same values must reach the OBS surface.
  const runtime = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  runtime.on('pageerror', (error) => errors.push(String(error)))
  // The runtime page needs the tuned overlay, so it reuses whatever the editor session stored.
  const tunedOverlay = await page.evaluate(() => JSON.parse(localStorage.getItem('obsidian-overlays-v1'))[0])
  await runtime.addInitScript((data) => { localStorage.setItem('obsidian-overlays-v1', JSON.stringify([data])) }, tunedOverlay)
  await runtime.goto(`${ORIGIN}/#/overlay/${PUBLIC_ID}`)
  await runtime.waitForSelector('.thorn-leaf', { timeout: 15000 })
  results.runtime = await runtime.evaluate(() => {
    const stage = document.querySelector('.runtime-stage')
    const style = getComputedStyle(stage)
    return {
      lit: style.getPropertyValue('--thorn-rose-lit').trim(),
      motion: style.getPropertyValue('--thorn-motion').trim(),
      leaves: document.querySelectorAll('.thorn-leaf').length,
      page: getComputedStyle(document.documentElement).backgroundColor,
    }
  })
  await runtime.screenshot({ path: 'artifacts/cp17-runtime-blush.png' })
  await page.screenshot({ path: 'artifacts/cp17-editor-tuning.png' })
} catch (error) {
  results.failure = String(error)
}

results.errors = errors
console.log(JSON.stringify(results, null, 1))
await browser.close()
