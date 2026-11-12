// CP20.1 runtime parity: the same theme must resolve to the same tokens in the editor and in OBS output.
import pw from '/tmp/node_modules/playwright/index.js'

const { chromium } = pw
const SITE = process.env.SITE || 'http://localhost:4421'

const THEMES = {
  obsidian: { surface: '#0e0f11', raised: '#15161a', accent: '#cfd2d6', text: '#f2f3f4', radius: 6, border: 1 },
  nocturne: { surface: '#14100d', raised: '#1c1713', accent: '#d8a86a', text: '#f6efe6', radius: 18, border: 1 },
  aurora: { surface: '#0b1416', raised: '#101d20', accent: '#6fd3c7', text: '#eef7f5', radius: 26, border: 1 },
  monolith: { surface: '#101112', raised: '#191a1c', accent: '#ffffff', text: '#ffffff', radius: 0, border: 2 },
}

const deco = (t) => ({ enabled: true, preset: 'royal-panel', inheritTheme: true, borderVisible: true, borderWidth: t.border, borderColor: t.accent, borderOpacity: 1, radius: t.radius, innerBorder: false, innerBorderColor: t.accent, innerBorderOpacity: 0.3, cornerOrnaments: false, separator: false, backgroundColor: t.surface, backgroundOpacity: 0.72, gradient: true, pattern: 'none', shadow: true, glow: false, highlight: false, padding: 18 })
const anim = { type: 'fade', duration: 600, delay: 0, easing: 'ease', intensity: 1, direction: 'up', reducedMotion: 'static', idle: 'none' }

const overlayFor = (id) => {
  const t = THEMES[id]
  const theme = {
    id, name: id, nameFa: id,
    chrome: { radius: t.radius, borderWidth: t.border, texture: 'none', uppercaseLabels: true, innerBorder: false, cornerOrnaments: false, panelOpacity: 0.72 },
    palette: {
      surface: { base: t.surface, raised: t.raised, sunken: t.surface, overlay: t.surface },
      accent: { base: t.accent, soft: t.accent, strong: t.accent },
      border: { hairline: t.accent, strong: t.accent, focus: '#ffffff' },
      text: { primary: t.text, secondary: t.text, muted: t.text, inverse: t.surface },
      state: { hover: t.raised, selected: t.raised, disabled: t.text },
      depth: { raised: 'none', floating: 'none', inset: 'none', glow: t.accent },
    },
    primary: t.raised, secondary: t.surface, accent: t.accent, accentSoft: t.accent,
    surface: t.surface, surfaceAlt: t.raised, text: t.text, muted: t.text, glow: t.accent, pattern: 'none',
  }
  const mk = (id2, type, name, x, y, w, h, props) => ({ id: id2, type, name, x, y, width: w, height: h, rotation: 0, opacity: 1, visible: true, includeInOutput: true, locked: false, z: 1, animation: anim, decoration: deco(t), props })
  return {
    id: `ov_${id}`, publicId: `pub${id}`, name: `${id} parity`, width: 1280, height: 720,
    settings: { showGrid: false, snap: true, showSafeArea: false, transparent: true, backgroundImage: null },
    theme, staticMotion: true, live: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    elements: [
      mk(`el_${id}_t`, 'text', 'Title', 80, 80, 620, 140, { text: 'TOKENS', color: t.text, fontSize: 60, fontWeight: 700, textAlign: 'left', lineHeight: 1.1 }),
      mk(`el_${id}_c`, 'chat', 'Chat', 80, 340, 520, 300, { title: 'chat', textColor: t.text, backgroundColor: t.surface, backgroundOpacity: 0.72, fontSize: 16, maxMessages: 5, showUsernames: true, showAvatars: false, showTimestamps: false }),
    ],
  }
}

const overlays = Object.keys(THEMES).map(overlayFor)
const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addInitScript((data) => { if (!localStorage.getItem('obsidian-overlays-v1')) localStorage.setItem('obsidian-overlays-v1', JSON.stringify(data)) }, overlays)

const errors = []
const result = {}
for (const id of Object.keys(THEMES)) {
  const read = async (url, selector) => {
    const page = await context.newPage()
    page.on('pageerror', (e) => errors.push(`${id} ${url}: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${id} ${url}: ${m.text()}`) })
    await page.goto(SITE + url)
    await page.waitForTimeout(1200)
    const value = await page.evaluate((sel) => {
      const root = document.querySelector(sel)
      if (!root) return null
      const style = getComputedStyle(root)
      const widget = document.querySelector('.decorated-widget')
      const widgetStyle = widget ? getComputedStyle(widget) : null
      return {
        accent: style.getPropertyValue('--theme-accent').trim(),
        surface: style.getPropertyValue('--theme-surface').trim(),
        text: style.getPropertyValue('--theme-text').trim(),
        radius: style.getPropertyValue('--theme-radius').trim(),
        pageBackground: getComputedStyle(document.body).backgroundColor,
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        widgetBorder: widgetStyle ? widgetStyle.borderTopWidth : null,
        widgetRadius: widgetStyle ? widgetStyle.borderTopLeftRadius : null,
      }
    }, selector)
    await page.close()
    return value
  }
  const runtime = await read(`/#/overlay/pub${id}`, 'main.overlay-runtime')
  const editor = await read(`/#/overlays/editor/ov_${id}`, '[style*="--theme-accent"]')
  result[id] = {
    runtime, editor,
    matches: runtime && editor ? ['accent', 'surface', 'text', 'radius'].every((k) => runtime[k] === editor[k]) : false,
    expected: THEMES[id],
  }
}
await browser.close()

const summary = Object.fromEntries(Object.entries(result).map(([id, v]) => [id, {
  matches: v.matches,
  runtimeAccent: v.runtime?.accent,
  editorAccent: v.editor?.accent,
  radius: v.runtime?.radius,
  transparent: v.runtime?.pageBackground === 'rgba(0, 0, 0, 0)',
  overflowX: Boolean(v.runtime?.overflowX || v.editor?.overflowX),
}]))
console.log(JSON.stringify({ summary, errors }, null, 1))
