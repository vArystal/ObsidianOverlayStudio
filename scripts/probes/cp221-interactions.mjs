// CP22.1: real pointer interaction evidence for selection, eight handles, and layer-row delete.
import pw from '/tmp/node_modules/playwright/index.js'
const SITE = process.env.SITE || 'http://localhost:4455'
const b = await pw.chromium.launch()
const page = await b.newPage({ viewport: { width: 1680, height: 1000 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

const el = (id, type, name, x, y, w, h, extra = {}) => ({
  id, type, name, x, y, width: w, height: h, rotation: 0, opacity: 1, visible: true, includeInOutput: true,
  locked: false, maintainAspectRatio: false, animation: { type: 'none', duration: 400, delay: 0, easing: 'ease-out', idle: 'none', reducedMotion: 'none' },
  decoration: { preset: 'none', enabled: false, inheritTheme: true, backgroundOpacity: 0, borderVisible: false, borderWidth: 0, borderColor: '#ffffff', radius: 0, innerBorder: false, cornerOrnaments: false, separator: false, shadow: false, glow: false, highlight: false, pattern: 'none', padding: 0 },
  props: {}, ...extra,
})
const overlay = {
  id: 'ov_int', publicId: 'pubint', name: 'Interaction lab', width: 1920, height: 1080,
  settings: { showGrid: false, snap: false, showSafeArea: false, transparent: true, backgroundImage: null },
  theme: { id: 'obsidian' }, background: { enabled: false, kind: 'none' },
  staticMotion: false, live: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishedAt: null,
  elements: [
    el('c_container', 'container', 'Container', 200, 200, 520, 300, { props: { fill: 'solid', fillColor: '#ffffff', fillOpacity: 0.12, borderStyle: 'solid', borderWidth: 2, borderColor: '#ffffff', borderOpacity: 0.6, radius: 12 } }),
    el('c_shape', 'shape', 'Shape', 900, 200, 320, 220, { props: { shape: 'rectangle', fillColor: '#ffffff', fillOpacity: 0.2, borderColor: '#ffffff', borderWidth: 2, borderRadius: 8 } }),
    el('c_text', 'text', 'Text', 200, 700, 520, 120, { props: { text: 'Interaction', fontFamily: 'sans-serif', fontSize: 48, color: '#ffffff' } }),
    el('c_locked', 'text', 'Locked note', 900, 700, 320, 100, { locked: true, props: { text: 'locked', fontFamily: 'sans-serif', fontSize: 40, color: '#ffffff' } }),
    el('c_hidden', 'text', 'Hidden note', 1300, 700, 320, 100, { visible: false, props: { text: 'hidden', fontFamily: 'sans-serif', fontSize: 40, color: '#ffffff' } }),
    el('c_over1', 'container', 'Overlap A', 1400, 200, 300, 260, { props: { fill: 'gradient', fillColor: '#7f8a99', fillColor2: '#1a1c22', fillOpacity: 0.5, borderStyle: 'dashed', borderWidth: 2, borderColor: '#ffffff', borderOpacity: 0.5, radius: 8 } }),
    el('c_over2', 'container', 'Overlap B', 1480, 260, 300, 260, { props: { fill: 'solid', fillColor: '#ffffff', fillOpacity: 0.3, borderStyle: 'solid', borderWidth: 1, borderColor: '#ffffff', borderOpacity: 0.9, radius: 4 } }),
  ],
}
await page.addInitScript(([k, d]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, d) }, ['obsidian-overlays-v1', JSON.stringify([overlay])])

const report = { select: {}, overlap: {}, handles: {}, locked: {}, hidden: {}, del: {}, undo: {}, reload: {}, errors }
const openEditor = async () => {
  await page.goto(`${SITE}/#/overlays/editor/ov_int`, { waitUntil: 'load' })
  await page.waitForTimeout(1200)
}
const state = () => page.evaluate(() => {
  const stored = JSON.parse(localStorage.getItem('obsidian-overlays-v1') || '[]')[0]
  const handles = [...document.querySelectorAll('.resize-handle')]
  return {
    selected: [...document.querySelectorAll('.canvas-element.selected')].map((n) => n.querySelector('.layer-copy strong')?.textContent ?? ''),
    selectedCount: document.querySelectorAll('.canvas-element.selected').length,
    handles: handles.length,
    handleClasses: handles.map((h) => h.className.replace('resize-handle ', '')),
    size: document.querySelector('.size-readout')?.textContent ?? null,
    rows: document.querySelectorAll('.layer-row').length,
    canvasCount: document.querySelectorAll('.canvas-element').length,
    domSize: (() => {
      const box = document.querySelector('.canvas-element.selected')
      if (!box) return null
      const style = box.getAttribute('style') || ''
      return { w: Math.round(box.getBoundingClientRect().width), h: Math.round(box.getBoundingClientRect().height), style: style.slice(0, 120) }
    })(),
    elements: stored ? stored.elements.map((e) => `${e.name}:${Math.round(e.width)}x${Math.round(e.height)}@${Math.round(e.x)},${Math.round(e.y)}`) : [],
  }
})
const center = async (selector, index = 0) => {
  const box = await page.locator(selector).nth(index).boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }
}

try {
await openEditor()

// 1. Click a container on the canvas. Record what element is actually under the point first.
const containerPoint = await center('.canvas-element')
report.select.hit = await page.evaluate(({ x, y }) => {
  const node = document.elementFromPoint(x, y)
  return node ? `${node.tagName.toLowerCase()}.${(node.className || '').toString().split(' ').slice(0, 3).join('.')}` : 'none'
}, containerPoint)
await page.mouse.click(containerPoint.x, containerPoint.y)
await page.waitForTimeout(350)
report.select.afterClick = await state()

// 2. Overlap: click the shared area, then click the lower box on a non-overlapping edge.
const overPoint = await center('.canvas-element', 5)
await page.mouse.click(overPoint.x - 100, overPoint.y - 90)
await page.waitForTimeout(250)
report.overlap.top = await state()

// 3. Eight handles: select the container, then drag each handle by (+24, +24) and record geometry.
await page.mouse.click(containerPoint.x, containerPoint.y)
await page.waitForTimeout(300)
for (const dir of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
  const before = await state()
  const handle = page.locator(`.resize-handle.handle-${dir}`)
  if (!(await handle.count())) { report.handles[dir] = { missing: true }; continue }
  const box = await handle.boundingBox()
  const sx = box.x + box.width / 2
  const sy = box.y + box.height / 2
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + 26, sy + 26, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(250)
  const after = await state()
  report.handles[dir] = { before: before.domSize, after: after.domSize, storageAfter: after.elements[0], handlesAfter: after.handles }
  // Put it back so each handle starts from the same box.
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(200)
}

// 4. Locked element: clicking it must not move or resize it.
const lockedPoint = await center('.canvas-element', 3)
await page.mouse.move(lockedPoint.x, lockedPoint.y)
await page.mouse.down()
await page.mouse.move(lockedPoint.x + 60, lockedPoint.y + 40, { steps: 5 })
await page.mouse.up()
await page.waitForTimeout(250)
report.locked.after = await state()

// 5. Hidden element must not be on the canvas at all.
report.hidden.canvasElements = await page.locator('.canvas-element').count()
report.hidden.rows = (await state()).rows

// 6. Layer-row delete: select the shape row, click its Delete action.
await page.getByRole('tab', { name: 'Layers' }).click()
await page.waitForTimeout(300)
await page.locator('.layer-row', { hasText: 'Shape' }).first().click()
await page.waitForTimeout(300)
report.del.before = await state()
const delButton = page.locator('.layer-row.selected [title="Delete"]').first()
report.del.found = await delButton.count()
if (report.del.found) { await delButton.click(); await page.waitForTimeout(1400) }
report.del.after = await state()

// 7. Undo the deletion.
await page.keyboard.press('Control+z')
await page.waitForTimeout(1500)
report.undo.after = await state()
await page.screenshot({ path: 'artifacts/cp221-selection.png' })

// 8. Save and reload after a geometry change. Select on the canvas (the path just proven), then drag the
// south-east handle far enough that the change cannot be confused with rounding.
await page.mouse.click(containerPoint.x, containerPoint.y)
await page.waitForTimeout(300)
const seBox = await page.locator('.resize-handle.handle-se').boundingBox()
report.reload.dragFound = seBox ? 1 : 0
if (seBox) {
  await page.mouse.move(seBox.x + seBox.width / 2, seBox.y + seBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(seBox.x + 140, seBox.y + 110, { steps: 10 })
  await page.mouse.up()
}
await page.waitForTimeout(1600)
report.reload.before = await state()
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(1500)
report.reload.after = await state()
} catch (error) { report.fatal = String(error).slice(0, 200) }

report.errors = errors.slice(0, 4)
console.log(JSON.stringify(report, null, 1))
await b.close()
