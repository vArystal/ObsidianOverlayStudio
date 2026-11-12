// Proves the monochrome presets are actually different designs, and that Thorn & Rose draws no rectangle.
import pw from '/tmp/node_modules/playwright/index.js'
const { chromium } = pw
const ORIGIN = process.env.SITE || 'http://localhost:4423'
const b = await chromium.launch({ args: ['--no-sandbox'] })
const errors = []
const shots = {}
const border = {}

const themes = ['royal-persian', 'persian-turquoise', 'imperial-night', 'minimal-esports', 'thorn-rose']
const palette = {
  'royal-persian': { surface: '#0c0c0e', accent: '#ffffff', accentSoft: '#f7f7f5', text: '#ffffff' },
  'persian-turquoise': { surface: '#26262b', accent: '#f2f2f0', accentSoft: '#ffffff', text: '#f4f4f2' },
  'imperial-night': { surface: '#131417', accent: '#ececea', accentSoft: '#ffffff', text: '#ffffff' },
  'minimal-esports': { surface: '#1a1a1f', accent: '#ffffff', accentSoft: '#ffffff', text: '#f7f7f5' },
  'thorn-rose': { surface: '#0b1410', accent: '#c9a24a', accentSoft: '#f4efe4', text: '#f4efe4' },
}

for (const id of themes) {
  const p = await b.newPage({ viewport: { width: 640, height: 400 } })
  p.on('pageerror', (e) => errors.push(`${id}: ${e}`))
  const overlay = {
    id: `ov_${id}`, publicId: `pub${id.replace(/-/g, '')}`, name: id, width: 560, height: 320,
    settings: { showGrid: false, snap: false, showSafeArea: false, transparent: true, backgroundImage: null },
    theme: { id, ...palette[id], primary: palette[id].accent, secondary: palette[id].surface, surfaceAlt: palette[id].surface, muted: '#a0a0a6', glow: palette[id].accent, pattern: 'none' },
    thorn: { rose: 'crimson', foliage: 'full', motion: 'subtle' },
    staticMotion: false, live: null, createdAt: '', updatedAt: '',
    elements: [{
      id: `el_${id}`, type: 'text', name: 'Title', x: 20, y: 20, width: 520, height: 280, rotation: 0, opacity: 1,
      visible: true, locked: false, includeInOutput: true,
      decoration: { enabled: true, preset: 'royal-panel', inheritTheme: true, borderVisible: true, borderWidth: 3, borderColor: palette[id].accent, borderOpacity: .9, radius: 18, innerBorder: true, innerBorderColor: palette[id].accentSoft, innerBorderOpacity: .3, cornerOrnaments: true, separator: false, backgroundColor: palette[id].surface, backgroundOpacity: .85, gradient: true, pattern: 'girih', shadow: true, glow: true, highlight: true, padding: 18 },
      props: { text: 'MONOCHROME', color: palette[id].text, fontSize: 34, fontWeight: 700, textAlign: 'center', lineHeight: 1.2 },
      animation: { type: 'fade', duration: 400, delay: 0, easing: 'ease-out', intensity: .6, direction: 'auto', idle: 'none', reducedMotion: 'static' },
    }],
  }
  await p.addInitScript((data) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify([data])), overlay)
  await p.goto(`${ORIGIN}/#/overlay/${overlay.publicId}`)
  await p.waitForTimeout(1200)
  const widget = p.locator('.runtime-element .decorated-widget').first()
  border[id] = await widget.evaluate((n) => {
    const s = getComputedStyle(n)
    return { borderWidth: s.borderTopWidth, radius: s.borderTopLeftRadius, before: getComputedStyle(n, '::before').backgroundImage.slice(0, 40) }
  })
  shots[id] = `artifacts/cp19-${id}.png`
  await widget.screenshot({ path: shots[id] })
  await p.close()
}

console.log(JSON.stringify({ shots, border, errors }, null, 1))
await b.close()
