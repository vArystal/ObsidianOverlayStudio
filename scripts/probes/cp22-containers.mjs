// CP22 evidence: insert a container through the real UI, apply presets, resize it, and check OBS output + frame cost.
import pw from '/tmp/node_modules/playwright/index.js'
const { chromium } = pw
import { mkdirSync } from 'node:fs'

const SITE = process.env.SITE ?? 'http://localhost:4455'
const OUT = 'artifacts'
mkdirSync(OUT, { recursive: true })

const report = { inserted: false, presets: [], resized: null, duplicated: 0, deleted: 0, order: null, runtime: {}, perf: {}, violationsPanel: [], errors: [] }

const baseOverlay = (id, extra = {}) => ({
  id, publicId: `pub${id}`, name: `CP22 ${id}`, width: 1920, height: 1080,
  settings: { showGrid: false, snap: false, showSafeArea: false, transparent: true, backgroundImage: null },
  theme: { id: 'obsidian' },
  background: { enabled: true, kind: 'aurora-flow', primary: '#061014', secondary: '#0b2430', accent: '#6fd3c7', opacity: 0.8, speed: 1, intensity: 0.5, blur: 0, density: 0.4, scale: 1, paused: false },
  staticMotion: true, live: null, elements: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishedAt: null,
  ...extra,
})

const containerEl = (id, x, y, w, h, props) => ({
  id, type: 'container', name: `Box ${id}`, x, y, width: w, height: h, rotation: 0, opacity: 1,
  visible: true, includeInOutput: true, locked: false, maintainAspectRatio: false, z: 1,
  animation: { type: 'none', duration: 400, delay: 0, easing: 'ease-out', reducedMotion: 'respect' },
  decoration: { enabled: false, preset: 'none', inheritTheme: true, borderVisible: false, borderWidth: 0, borderColor: '#ffffff', backgroundOpacity: 0, radius: 0, padding: 0, shadow: false, glow: false, highlight: false, innerBorder: false, cornerOrnaments: false, separator: false, pattern: 'none' },
  props,
})

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 940 } })
page.on('pageerror', (error) => report.errors.push(String(error)))
page.on('console', (message) => { if (message.type() === 'error') report.errors.push(message.text()) })

// 1. The insertion workflow, through the actual element library.
await page.addInitScript(([key, data]) => localStorage.setItem(key, data), ['obsidian-overlays-v1', JSON.stringify([baseOverlay('cp22edit')])])
await page.goto(`${SITE}/#/overlays/editor/cp22edit`, { waitUntil: 'load' })
await page.getByRole('button', { name: /Empty container/i }).first().click()
await page.waitForTimeout(400)
report.inserted = await page.locator('.canvas-stage .container-element').count() > 0
await page.screenshot({ path: `${OUT}/cp22-insert.png` })

// 2. Selection chrome must exist in the editor, and never in the output.
report.selectionChrome = await page.locator('.resize-handle').count()

// 3. Presets, captured on the canvas.
for (const label of ['Clean Frame', 'Glass Panel', 'Cinematic Panel', 'Neon Outline', 'Minimal Divider', 'Soft Gradient Panel', 'Dark Information Panel']) {
  const preset = page.getByRole('button', { name: new RegExp(label, 'i') }).first()
  if (!(await preset.count())) { report.presets.push({ label, applied: false }); continue }
  await preset.click()
  await page.waitForTimeout(220)
  const style = await page.evaluate(() => {
    const el = document.querySelector('.canvas-stage .container-element')
    if (!el) return null
    const cs = getComputedStyle(el)
    return { background: cs.backgroundImage === 'none' ? cs.backgroundColor : cs.backgroundImage, border: `${cs.borderTopStyle} ${cs.borderTopWidth}`, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow !== 'none' }
  })
  const slug = label.toLowerCase().replace(/[^a-z]+/g, '-')
  await page.locator('.canvas-stage').screenshot({ path: `${OUT}/cp22-preset-${slug}.png` })
  report.presets.push({ label, applied: true, style })
}

// 4. Independent resize through the south-east handle.
const before = await page.locator('.canvas-stage .container-element').first().boundingBox()
const handle = page.locator('.resize-handle.handle-se').first()
const box = await handle.boundingBox()
if (box) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 160, box.y + 90, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(350)
}
const after = await page.locator('.canvas-stage .container-element').first().boundingBox()
report.resized = before && after ? { width: [Math.round(before.width), Math.round(after.width)], height: [Math.round(before.height), Math.round(after.height)] } : null

// 5. Duplicate, then delete the copy.
await page.keyboard.press('Control+d')
await page.waitForTimeout(300)
report.duplicated = await page.locator('.canvas-stage .container-element').count()
await page.keyboard.press('Delete')
await page.waitForTimeout(300)
report.deleted = await page.locator('.canvas-stage .container-element').count()
report.persisted = await page.evaluate(() => {
  const list = JSON.parse(localStorage.getItem('obsidian-overlays-v1') || '[]')
  const element = list[0]?.elements?.find((item) => item.type === 'container')
  return element ? { type: element.type, width: element.width, fill: element.props.fill } : null
})
await page.screenshot({ path: `${OUT}/cp22-properties.png` })

// 6. Published output at 1920x1080: several differently sized containers beside real widgets.
const scene = baseOverlay('cp22out', {
  elements: [
    containerEl('a', 60, 60, 620, 240, { fill: 'gradient', fillColor: '#1b2430', fillColor2: '#0c1014', gradientAngle: 120, fillOpacity: 0.6, borderStyle: 'solid', borderWidth: 1, borderColor: '#cfd2d6', borderOpacity: 0.2, radius: 20, shadow: 'soft', glow: 'none', inner: 'none', blur: 0 }),
    containerEl('b', 60, 330, 420, 160, { fill: 'solid', fillColor: '#0b0b0c', fillOpacity: 0.88, borderStyle: 'solid', borderWidth: 1, borderColor: '#2a2a2e', borderOpacity: 1, radius: 6, shadow: 'soft', glow: 'none', inner: 'none', blur: 0 }),
    containerEl('c', 1310, 120, 520, 300, { fill: 'transparent', fillColor: '#0e0e10', fillOpacity: 0, borderStyle: 'solid', borderWidth: 2, borderColor: '#7ce7ff', borderOpacity: 0.7, radius: 14, shadow: 'none', glow: 'subtle', inner: 'none', blur: 0 }),
    containerEl('d', 60, 1000, 1800, 3, { fill: 'solid', fillColor: '#ffffff', fillOpacity: 0.22, borderStyle: 'none', borderWidth: 0, borderColor: '#ffffff', borderOpacity: 0, radius: 1, shadow: 'none', glow: 'none', inner: 'none', blur: 0 }),
    { ...containerEl('e', 760, 120, 8, 820, { fill: 'gradient', fillColor: '#ffffff', fillColor2: '#4a4a50', gradientAngle: 180, fillOpacity: 0.24, borderStyle: 'none', borderWidth: 0, borderColor: '#ffffff', borderOpacity: 0, radius: 4, shadow: 'none', glow: 'none', inner: 'none', blur: 0 }) },
  ],
})
const outPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
outPage.on('pageerror', (error) => report.errors.push(String(error)))
await outPage.addInitScript(([key, data]) => localStorage.setItem(key, data), ['obsidian-overlays-v1', JSON.stringify([scene])])
await outPage.goto(`${SITE}/#/overlay/pubcp22out`, { waitUntil: 'load' })
await outPage.waitForTimeout(1400)
report.runtime = await outPage.evaluate(() => {
  const boxes = [...document.querySelectorAll('.runtime-stage .container-element')]
  const stage = document.querySelector('.runtime-stage')?.getBoundingClientRect()
  const first = boxes[0]?.getBoundingClientRect()
  const parent = boxes[0]?.parentElement?.getBoundingClientRect()
  return {
    count: boxes.length,
    handles: document.querySelectorAll('.resize-handle').length,
    pointerEvents: boxes[0] ? getComputedStyle(boxes[0]).pointerEvents : null,
    offsets: [...document.querySelectorAll('.runtime-element')].map((wrapper) => {
      const box = wrapper.querySelector('.container-element')
      const rect = wrapper.getBoundingClientRect()
      return { type: box ? 'container' : 'widget', dx: Math.round(rect.x), dy: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
    }),
    stage: stage ? { width: Math.round(stage.width), height: Math.round(stage.height) } : null,
    bodyTransparent: getComputedStyle(document.body).backgroundColor,
    scrollWidth: document.documentElement.scrollWidth,
  }
})
await outPage.screenshot({ path: `${OUT}/cp22-runtime-1920.png` })

// 7. Frame cost with 10, 30 and 50 containers, animation on.
for (const count of [10, 30, 50]) {
  const many = baseOverlay(`cp22perf${count}`, {
    staticMotion: false,
    background: { enabled: false, kind: 'none', primary: '#000000', secondary: '#000000', accent: '#ffffff', opacity: 0, speed: 1, intensity: 0, blur: 0, density: 0, scale: 1, paused: true },
    elements: Array.from({ length: count }, (_, index) => containerEl(`p${index}`, 40 + (index % 8) * 150, 40 + Math.floor(index / 8) * 150, 130, 120, { fill: 'gradient', fillColor: '#1b2430', fillColor2: '#0c1014', gradientAngle: 120, fillOpacity: 0.5, borderStyle: 'solid', borderWidth: 1, borderColor: '#cfd2d6', borderOpacity: 0.2, radius: 12, shadow: 'soft', glow: 'none', inner: 'none', blur: 0 })),
  })
  const perfPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  await perfPage.addInitScript(([key, data]) => localStorage.setItem(key, data), ['obsidian-overlays-v1', JSON.stringify([many])])
  await perfPage.goto(`${SITE}/#/overlay/pubcp22perf${count}`, { waitUntil: 'load' })
  await perfPage.waitForTimeout(900)
  report.perf[count] = await perfPage.evaluate(() => new Promise((resolve) => {
    let frames = 0
    const started = performance.now()
    const tick = () => {
      frames += 1
      if (performance.now() - started < 1500) requestAnimationFrame(tick)
      else resolve({ fps: Math.round((frames / (performance.now() - started)) * 1000), nodes: document.querySelectorAll('.runtime-stage .container-element').length })
    }
    requestAnimationFrame(tick)
  }))
  await perfPage.close()
}

await browser.close()
console.log(JSON.stringify(report, null, 1))
