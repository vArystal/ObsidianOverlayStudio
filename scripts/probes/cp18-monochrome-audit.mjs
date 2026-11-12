// Monochrome audit: proves the chrome carries no purple, no pure black, and keeps text legible.
import pw from '/tmp/node_modules/playwright/index.js'
const { chromium } = pw
const ORIGIN = process.env.SITE || 'http://localhost:4421'
const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))

function audit() {
  const parse = (value) => {
    const m = String(value).match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const parts = m[1].split(',').map((n) => parseFloat(n))
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 }
  }
  const purple = []; const black = []
  for (const node of document.querySelectorAll('*')) {
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    for (const prop of ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'outlineColor']) {
      const c = parse(style[prop])
      if (!c || c.a === 0) continue
      const max = Math.max(c.r, c.g, c.b); const min = Math.min(c.r, c.g, c.b)
      const sat = max === 0 ? 0 : (max - min) / max
      const hue = (() => {
        if (max === min) return 0
        const d = max - min
        if (max === c.r) return (60 * ((c.g - c.b) / d) + 360) % 360
        if (max === c.g) return 60 * ((c.b - c.r) / d) + 120
        return 60 * ((c.r - c.g) / d) + 240
      })()
      if (sat > 0.14 && hue >= 235 && hue <= 325) purple.push({ tag: node.tagName, cls: String(node.className).slice(0, 40), prop, value: style[prop] })
      if (prop === 'backgroundColor' && max <= 14) black.push({ tag: node.tagName, cls: String(node.className).slice(0, 40), value: style[prop] })
    }
  }
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b) }
  const contrast = []
  for (const node of document.querySelectorAll('h1, h2, h3, p, small, strong, button, label, select, input')) {
    const text = (node.textContent || '').trim()
    if (!text || text.length < 3) continue
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.4) continue
    if (style.webkitBackgroundClip === 'text' || style.backgroundClip === 'text') continue
    const fg = parse(style.color)
    let bgNode = node; let bg = null
    while (bgNode && !bg) { const st = getComputedStyle(bgNode); if (st.backgroundImage && st.backgroundImage.includes('gradient')) {
        const stops = [...st.backgroundImage.matchAll(/rgba?\(([^)]+)\)/g)].map((m) => m[1].split(',').map(Number))
        if (stops.length) { bg = { r: stops.reduce((a, c) => a + c[0], 0) / stops.length, g: stops.reduce((a, c) => a + c[1], 0) / stops.length, b: stops.reduce((a, c) => a + c[2], 0) / stops.length, a: 1 }; break }
      } const c = parse(st.backgroundColor); if (c && c.a > 0.6) bg = c; bgNode = bgNode.parentElement }
    if (!fg || fg.a < 0.5 || !bg) continue
    const ratio = (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05)
    if (ratio < 4.5) contrast.push({ tag: node.tagName, cls: String(node.className).slice(0, 30), text: text.slice(0, 24), ratio: Number(ratio.toFixed(2)) })
  }
  return { purple: purple.slice(0, 8), purpleCount: purple.length, black: black.slice(0, 5), blackCount: black.length, contrast: contrast.slice(0, 10), contrastCount: contrast.length }
}

const report = {}
await page.goto(`${ORIGIN}/#/library`); await page.waitForTimeout(1200)
report.library = await page.evaluate(audit)
await page.screenshot({ path: 'artifacts/cp18-library.png' })

await page.goto(`${ORIGIN}/#/integrations`); await page.waitForTimeout(1000)
report.integrations = await page.evaluate(audit)
await page.screenshot({ path: 'artifacts/cp18-integrations.png' })

const overlay = { id: 'ov_cp18', publicId: 'pubcp18', name: 'Monochrome check', width: 1920, height: 1080, settings: { showGrid: false, snap: true, showSafeArea: false, transparent: true, backgroundImage: null }, theme: { id: 'royal-persian' }, thorn: { rose: 'crimson', foliage: 'full', motion: 'subtle' }, staticMotion: false, live: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), elements: [] }
await page.addInitScript((data) => { if (!localStorage.getItem('obsidian-overlays-v1')) localStorage.setItem('obsidian-overlays-v1', JSON.stringify([data])) }, overlay)
await page.goto(`${ORIGIN}/#/overlays/editor/ov_cp18`); await page.waitForTimeout(1600)
report.editor = await page.evaluate(audit)
await page.screenshot({ path: 'artifacts/cp18-editor.png' })

report.errors = errors
console.log(JSON.stringify(report, null, 1))
await browser.close()
