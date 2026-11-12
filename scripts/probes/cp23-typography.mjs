// CP23 Typography Studio evidence: studio UI, real font rendering, Persian/mixed text, presets, editor/runtime
// parity, accessibility and frame cost. Everything here runs against a real browser and a real build.
import pw from '/tmp/node_modules/playwright/index.js'
import { readFileSync } from 'node:fs'
const SITE = process.env.SITE || 'http://localhost:4455'
const AXE = readFileSync('/tmp/axe.min.js', 'utf8')

const base = {
  rotation: 0, opacity: 1, visible: true, includeInOutput: true, locked: false, maintainAspectRatio: false,
  animation: { type: 'none', exit: 'fade', idle: 'none', duration: 400, exitDuration: 300, delay: 0, direction: 'up', easing: 'ease-out', intensity: 0.6, holdDuration: 5000, reducedMotion: 'none' },
  decoration: { preset: 'none', enabled: false, inheritTheme: true, backgroundOpacity: 0, borderVisible: false, borderWidth: 0, borderColor: '#ffffff', radius: 0, innerBorder: false, cornerOrnaments: false, separator: false, shadow: false, glow: false, highlight: false, pattern: 'none', padding: 0 },
}
const textEl = (id, name, x, y, w, h, props) => ({ ...base, id, type: 'text', name, x, y, width: w, height: h, props })

const overlay = {
  id: 'ov_type', publicId: 'pubtype', name: 'Typography studio', width: 1920, height: 1080,
  settings: { showGrid: false, snap: false, showSafeArea: false, transparent: true, backgroundImage: null },
  theme: { id: 'obsidian' }, background: { enabled: false, kind: 'none', colors: ['#0b0b0d', '#141416'], intensity: 0.5, speed: 0.5, blur: 0, density: 0.5, opacity: 1 },
  staticMotion: true, live: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishedAt: null,
  elements: [
    textEl('t_family_a', 'Inter headline', 120, 120, 900, 150, { text: 'LIVE FROM TEHRAN', fontFamily: 'inter', fontWeight: 800, fontSize: 88, lineHeight: 1.05, letterSpacing: -2, textAlign: 'left', color: '#f6f6f4' }),
    textEl('t_family_b', 'Bebas condensed', 120, 300, 900, 120, { text: 'CINEMATIC HEADLINE', fontFamily: 'bebas-neue', fontWeight: 400, fontSize: 96, lineHeight: 0.95, letterSpacing: 4, textAlign: 'left', color: '#f6f6f4' }),
    textEl('t_persian', 'Persian display', 120, 460, 900, 170, { text: 'به استریم من خوش آمدید', fontFamily: 'vazirmatn', fontWeight: 700, fontSize: 64, lineHeight: 1.55, textAlign: 'right', direction: 'rtl', color: '#f6f6f4' }),
    textEl('t_mixed', 'Mixed script', 120, 660, 1000, 130, { text: 'Live at ۲۱:۰۰ — امشب با هم بازی می‌کنیم', fontFamily: 'noto-sans-arabic', fontWeight: 400, fontSize: 44, lineHeight: 1.6, textAlign: 'right', direction: 'rtl', color: '#f6f6f4' }),
    textEl('t_mono', 'Mono readout', 1200, 120, 620, 100, { text: 'uptime 04:12:33', fontFamily: 'jetbrains-mono', fontWeight: 400, fontSize: 36, lineHeight: 1.4, textAlign: 'left', color: '#f6f6f4' }),
    textEl('t_editorial', 'Editorial serif', 1200, 260, 620, 160, { text: 'Schedule for tonight', fontFamily: 'playfair-display', fontWeight: 700, fontSize: 50, lineHeight: 1.24, textAlign: 'left', color: '#f6f6f4' }),
    textEl('t_stroke', 'Outlined gaming', 1200, 470, 620, 150, { text: 'HYPE', fontFamily: 'archivo-black', fontWeight: 400, fontSize: 72, lineHeight: 1.02, textAlign: 'left', color: '#f6f6f4', strokeEnabled: true, strokeColor: '#000000', strokeWidth: 4, shadowEnabled: true, shadowColor: '#000000', shadowBlur: 12 }),
  ],
}

const browser = await pw.chromium.launch()
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1 })
const errors = []
const fontRequests = []
page.on('response', (response) => { if (response.url().includes('/assets/') && response.url().endsWith('.woff2')) fontRequests.push(response.url().split('/').pop()) })
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.addInitScript(([k, d]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, d) }, ['obsidian-overlays-v1', JSON.stringify([overlay])])

const report = { errors }
const shot = async (name) => { await page.screenshot({ path: `artifacts/cp23-${name}.png` }); return name }
const styleOf = (selector) => page.evaluate((sel) => {
  const node = document.querySelector(sel)
  if (!node) return null
  const s = getComputedStyle(node)
  return {
    fontFamily: s.fontFamily, fontWeight: s.fontWeight, fontSize: s.fontSize, lineHeight: s.lineHeight,
    letterSpacing: s.letterSpacing, textAlign: s.textAlign, direction: s.direction, color: s.color,
    textShadow: s.textShadow, strokeWidth: s.webkitTextStrokeWidth, strokeColor: s.webkitTextStrokeColor,
    whiteSpace: s.whiteSpace, dir: node.getAttribute('dir'), rect: [Math.round(node.getBoundingClientRect().width), Math.round(node.getBoundingClientRect().height)],
  }
}, selector)

// ---- Editor: studio UI, library, presets ----
await page.goto(`${SITE}/#/overlays/editor/ov_type`, { waitUntil: 'load' })
await page.waitForTimeout(1400)
await page.locator('.canvas-element', { hasText: 'LIVE FROM TEHRAN' }).first().click()
await page.waitForTimeout(500)
report.studioVisible = await page.locator('.typography-studio').count()
report.fontRequestsOnLoad = [...new Set(fontRequests)].length
await shot('studio')
await page.locator('#font-search').click()
await page.waitForTimeout(600)
report.fontListOptions = await page.locator('.type-list .type-option').count()
await shot('font-library')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// Fonts actually downloadable: every family in the list must resolve to a loaded face after warm-up.
report.fontsResolved = await page.evaluate(async () => {
  const names = ['Inter', 'Manrope', 'Space Grotesk', 'Bebas Neue', 'Anton', 'Oswald', 'Archivo Black', 'Playfair Display', 'JetBrains Mono', 'Vazirmatn', 'Estedad', 'Noto Sans Arabic', 'Cairo']
  const out = {}
  for (const name of names) {
    await document.fonts.load(`400 16px '${name}'`, 'Aa آ')
    out[name] = document.fonts.check(`400 16px '${name}'`, 'Aa')
  }
  return out
})

// ---- Persian, English, mixed ----
await page.locator('.canvas-element', { hasText: 'به استریم' }).first().click()
await page.waitForTimeout(400)
await shot('persian')
await page.locator('.canvas-element', { hasText: 'LIVE FROM TEHRAN' }).first().click()
await page.waitForTimeout(300)
await shot('english')
await page.locator('.canvas-element', { hasText: 'Live at' }).first().click()
await page.waitForTimeout(300)
await shot('mixed')
await page.locator('.canvas-element', { hasText: 'HYPE' }).first().click()
await page.waitForTimeout(300)
await shot('multiple-families')

// ---- Presets: apply and prove geometry does not move ----
const before = await page.evaluate(() => {
  const stored = JSON.parse(localStorage.getItem('obsidian-overlays-v1'))[0]
  const el = stored.elements.find((e) => e.id === 't_family_a')
  return { x: el.x, y: el.y, w: el.width, h: el.height, text: el.props.text }
})
// Presets act on the selected element, so select the headline we are about to restyle.
await page.locator('.canvas-element', { hasText: 'LIVE FROM TEHRAN' }).first().click()
await page.waitForTimeout(400)
await page.locator('.type-preset', { hasText: 'Cinematic Headline' }).click()
await page.waitForTimeout(1200)
await shot('preset-cinematic')
const afterCinematic = await page.evaluate(() => {
  const stored = JSON.parse(localStorage.getItem('obsidian-overlays-v1'))[0]
  const el = stored.elements.find((e) => e.id === 't_family_a')
  // DOM is the live truth while typing; storage confirms the same change after the debounce.
  const node = [...document.querySelectorAll('.canvas-element')].find((n) => n.textContent.includes('LIVE FROM TEHRAN'))
  const run = node?.querySelector('.text-element')
  const s = run ? getComputedStyle(run) : null
  return {
    x: el.x, y: el.y, w: el.width, h: el.height, text: el.props.text, font: el.props.fontFamily, size: el.props.fontSize,
    domFont: s?.fontFamily, domSize: s?.fontSize, domTransform: s?.textTransform, domShadow: Boolean(s?.textShadow && s.textShadow !== 'none'),
  }
})
await page.locator('.canvas-element', { hasText: 'به استریم' }).first().click()
await page.waitForTimeout(400)
await page.locator('.type-preset', { hasText: 'Persian Display' }).click()
await page.waitForTimeout(1200)
await shot('preset-persian')
report.presetGeometry = { before, afterCinematic, moved: before.x !== afterCinematic.x || before.w !== afterCinematic.w || before.text !== afterCinematic.text }

// ---- Accessibility on the studio and the mobile drawer ----
await page.addScriptTag({ content: AXE })
const axeRun = async () => page.evaluate(async () => {
  const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })
  return res.violations.map((v) => ({ id: v.id, impact: v.impact, target: v.nodes[0]?.target?.join(' ') }))
})
await page.locator('.type-advanced-toggle').click()
await page.waitForTimeout(400)
report.axeStudio = await axeRun()
await page.setViewportSize({ width: 430, height: 900 })
await page.waitForTimeout(600)
const drawer = page.getByRole('button', { name: /elements & layers|properties/i }).first()
if (await drawer.count()) { await drawer.click({ force: true }); await page.waitForTimeout(500) }
report.axeMobile = await axeRun()
await page.setViewportSize({ width: 1680, height: 1000 })
await page.waitForTimeout(500)

// ---- Frame cost with the whole typographic set on screen ----
report.perf = await page.evaluate(async () => {
  const frames = []
  const start = performance.now()
  let last = start
  await new Promise((resolve) => {
    const tick = (now) => {
      frames.push(now - last); last = now
      if (now - start < 2000) requestAnimationFrame(tick); else resolve()
    }
    requestAnimationFrame(tick)
  })
  const gaps = frames.slice(2).sort((a, b) => a - b)
  return { fps: Math.round(1000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)), p95: Math.round(gaps[Math.floor(gaps.length * 0.95)]) }
})

// ---- Editor geometry snapshot for parity ----
const editorStyles = {}
for (const [key, match] of Object.entries({ inter: 'LIVE FROM TEHRAN', bebas: 'CINEMATIC HEADLINE', persian: 'به استریم', mixed: 'Live at', mono: 'uptime', editorial: 'Schedule', stroke: 'HYPE' })) {
  const node = page.locator('.canvas-element', { hasText: match }).first()
  const inner = node.locator('.text-element')
  editorStyles[key] = await inner.evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      fontFamily: s.fontFamily, fontWeight: s.fontWeight, fontSize: s.fontSize, lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing, textAlign: s.textAlign, direction: s.direction, color: s.color,
      textShadow: s.textShadow, strokeWidth: s.webkitTextStrokeWidth, whiteSpace: s.whiteSpace, dir: el.getAttribute('dir'),
    }
  })
}

// ---- Runtime parity at 1920x1080 ----
const savedOverlay = await page.evaluate(() => JSON.parse(localStorage.getItem('obsidian-overlays-v1'))[0])
const rt = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
rt.on('pageerror', (e) => errors.push(`runtime: ${e}`))
rt.on('console', (m) => { if (m.type() === 'error') errors.push(`runtime: ${m.text()}`) })
await rt.addInitScript(([k, d]) => localStorage.setItem(k, d), ['obsidian-overlays-v1', JSON.stringify([savedOverlay])])
await rt.goto(`${SITE}/#/overlay/pubtype`, { waitUntil: 'load' })
await rt.waitForTimeout(1600)
await rt.screenshot({ path: 'artifacts/cp23-runtime-1920.png' })
const runtimeStyles = {}
for (const [key, match] of Object.entries({ inter: 'LIVE FROM TEHRAN', bebas: 'CINEMATIC HEADLINE', persian: 'به استریم', mixed: 'Live at', mono: 'uptime', editorial: 'Schedule', stroke: 'HYPE' })) {
  const node = rt.locator('.runtime-element', { hasText: match }).first()
  runtimeStyles[key] = await node.locator('.text-element').evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      fontFamily: s.fontFamily, fontWeight: s.fontWeight, fontSize: s.fontSize, lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing, textAlign: s.textAlign, direction: s.direction, color: s.color,
      textShadow: s.textShadow, strokeWidth: s.webkitTextStrokeWidth, whiteSpace: s.whiteSpace, dir: el.getAttribute('dir'),
    }
  })
}
report.parity = Object.fromEntries(Object.keys(editorStyles).map((key) => [key, JSON.stringify(editorStyles[key]) === JSON.stringify(runtimeStyles[key])]))
report.parityDetail = Object.fromEntries(Object.keys(editorStyles).filter((k) => report.parity[k] !== true).map((k) => [k, { editor: editorStyles[k], runtime: runtimeStyles[k] }]))
report.fontRequestsTotal = [...new Set(fontRequests)].length
report.runtime = await rt.evaluate(() => ({
  body: getComputedStyle(document.body).backgroundColor,
  scrollWidth: document.documentElement.scrollWidth,
  innerWidth: window.innerWidth,
  stage: (() => { const s = document.querySelector('.runtime-stage'); const r = s?.getBoundingClientRect(); return r ? [Math.round(r.width), Math.round(r.height)] : null })(),
  fontsReady: document.fonts.status,
}))

report.errors = errors.slice(0, 6)
console.log(JSON.stringify(report, null, 1))
await browser.close()
