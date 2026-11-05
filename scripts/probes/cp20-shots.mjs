// CP20 visual evidence: every required surface, the four themes, and an audit that proves the palette rules.
import pw from '/tmp/node_modules/playwright/index.js'
const { chromium } = pw
const ORIGIN = process.env.SITE ?? 'http://localhost:4441'
const THEMES = {
  obsidian: { name: 'Obsidian', surface: '#0e0f11', raised: '#15161a', accent: '#cfd2d6', text: '#f2f3f4' },
  nocturne: { name: 'Nocturne', surface: '#14100d', raised: '#1c1713', accent: '#d8a86a', text: '#f6efe6' },
  aurora: { name: 'Aurora', surface: '#0b1416', raised: '#101d20', accent: '#6fd3c7', text: '#eef7f5' },
  monolith: { name: 'Monolith', surface: '#101112', raised: '#191a1c', accent: '#ffffff', text: '#ffffff' },
}
const OPTION = { chrome: { radius: 6, borderWidth: 1, texture: 'none', uppercaseLabels: true, innerBorder: false, cornerOrnaments: false, panelOpacity: 0.7 } }

function overlayFor(id) {
  const t = THEMES[id]
  const base = {
    id: `ov_${id}`, publicId: `pub${id}`, name: `${t.name} showcase`, width: 1280, height: 720,
    settings: { showGrid: false, snap: true, showSafeArea: false, transparent: true, backgroundImage: null },
    theme: {
      id, name: t.name, nameFa: t.name, ...OPTION,
      palette: {
        surface: { base: t.surface, raised: t.raised, sunken: t.surface, overlay: t.surface },
        accent: { base: t.accent, soft: t.accent, strong: t.accent },
        border: { hairline: t.accent, strong: t.accent, focus: t.accent },
        text: { primary: t.text, secondary: t.text, muted: t.text, inverse: t.surface },
        state: { hover: t.raised, selected: t.raised, disabled: t.text },
        depth: { raised: 'none', floating: 'none', inset: 'none', glow: t.accent },
      },
      primary: t.raised, secondary: t.surface, accent: t.accent, accentSoft: t.accent,
      surface: t.surface, surfaceAlt: t.raised, text: t.text, muted: t.text, glow: t.accent, pattern: 'none',
    },
    staticMotion: true, live: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    elements: [],
  }
  const mk = (type, name, x, y, width, height, props) => ({
    id: `el_${id}_${type}_${x}`, type, name, x, y, width, height, rotation: 0, opacity: 1, visible: true,
    includeInOutput: true, locked: false, z: 1,
    animation: { type: 'none', duration: 600, delay: 0, easing: 'ease', intensity: 1, direction: 'up', reducedMotion: 'static', idle: 'none' },
    decoration: { enabled: true, preset: 'royal-panel', inheritTheme: true, borderVisible: true, borderWidth: 1, borderColor: t.accent, borderOpacity: 1, radius: 6, innerBorder: false, innerBorderColor: t.accent, innerBorderOpacity: 0.3, cornerOrnaments: false, separator: false, backgroundColor: t.surface, backgroundOpacity: 0.7, gradient: true, pattern: 'none', shadow: true, glow: false, highlight: false, padding: 20 },
    props,
  })
  base.elements = [
    mk('text', 'Title', 90, 90, 640, 140, { text: 'LIVE NOW', color: t.text, fontSize: 62, fontWeight: 700, textAlign: 'left', lineHeight: 1.1 }),
    mk('text', 'Subtitle', 90, 240, 520, 60, { text: 'Ranked climb · road to Diamond', color: t.text, fontSize: 22, fontWeight: 400, textAlign: 'left', lineHeight: 1.4 }),
    mk('viewerCount', 'Viewers', 900, 92, 300, 130, { title: 'VIEWERS', color: t.text, accentColor: t.accent, label: 'live viewers', fontSize: 34 }),
    mk('chat', 'Chat', 90, 360, 520, 280, { title: 'chat', textColor: t.text, backgroundColor: t.surface, backgroundOpacity: 0.7, fontSize: 16, maxMessages: 5, showUsernames: true, showAvatars: false, showTimestamps: false }),
  ]
  return base
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const errors = []
const audit = {}
const overlays = Object.keys(THEMES).map(overlayFor)

const page = await browser.newPage({ viewport: { width: 1500, height: 940 } })
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.addInitScript((data) => { if (!localStorage.getItem('obsidian-overlays-v1')) localStorage.setItem('obsidian-overlays-v1', JSON.stringify(data)) }, overlays)

// 1 dashboard, 2 editor (rich overlay), 3 theme selector crop is taken from the editor inspector.
await page.goto(`${ORIGIN}/#/overlays`); await page.waitForTimeout(1200)
await page.screenshot({ path: 'artifacts/cp20-dashboard.png' })
audit.dashboard = await page.evaluate(() => ({ title: document.title, cards: document.querySelectorAll('.overlay-thumbnail, .library-card, .card').length }))

await page.goto(`${ORIGIN}/#/overlays/editor/${overlays[0].id}`); await page.waitForTimeout(1600)
await page.screenshot({ path: 'artifacts/cp20-editor.png' })
const panel = await page.$('.properties-panel, .right-panel')
if (panel) await panel.screenshot({ path: 'artifacts/cp20-properties.png' })
await page.click('#tab-layers').catch(() => {})
await page.waitForTimeout(500)
const left = await page.$('.editor-panel, .sidebar')
if (left) await left.screenshot({ path: 'artifacts/cp20-layers.png' })

// Theme selector: scroll the inspector to the theme gallery and shoot it.
const gallery = await page.$('.theme-gallery')
if (gallery) { await gallery.scrollIntoViewIfNeeded(); await gallery.screenshot({ path: 'artifacts/cp20-theme-selector.png' }) }

// 4 each theme as a published overlay.
for (const ov of overlays) {
  const out = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  out.on('pageerror', (e) => errors.push(`${ov.theme.id}: ${e}`))
  await out.addInitScript((data) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify(data)), overlays)
  await out.goto(`${ORIGIN}/#/overlay/${ov.publicId}`); await out.waitForTimeout(900)
  await out.screenshot({ path: `artifacts/cp20-runtime-${ov.theme.id}.png` })
  audit[ov.theme.id] = await out.evaluate(() => {
    const root = document.querySelector('.overlay-runtime')
    const widget = document.querySelector('.decorated-widget')
    const s = root ? getComputedStyle(root) : null
    const w = widget ? getComputedStyle(widget) : null
    return {
      accent: s?.getPropertyValue('--theme-accent').trim(),
      surface: s?.getPropertyValue('--theme-surface').trim(),
      widgetBorder: w?.borderTopWidth, widgetRadius: w?.borderTopLeftRadius,
      texture: w ? (w.backgroundImage?.slice(0, 18) || 'none') : 'no widget',
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      transparent: getComputedStyle(document.body).backgroundColor,
    }
  })
  if (ov.theme.id === 'obsidian') { await out.setViewportSize({ width: 1920, height: 1080 }); await out.waitForTimeout(500); await out.screenshot({ path: 'artifacts/cp20-1920.png' }) }
  await out.close()
}

await browser.close()
console.log(JSON.stringify({ audit, errors }, null, 1))
