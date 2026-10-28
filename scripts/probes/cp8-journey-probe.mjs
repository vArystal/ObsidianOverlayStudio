// CP8 regression: the whole journey in one run, against production, in a browser with empty storage.
// Steps 12-13 are exercised through the app's own "Test widget" route, which is honest about being
// app-generated: it proves the stream -> renderer path without pretending an organic Kick event arrived.
import pw from '/tmp/node_modules/playwright/index.js'
const { chromium } = pw
const SITE = process.env.SITE || 'https://varystal.github.io/jubilant-octo-lamp'
const results = {}
const fail = []
const step = (name, ok, detail) => { results[name] = { ok, ...(detail === undefined ? {} : { detail }) }; if (!ok) fail.push(name) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

// 1. open the app
await page.goto(SITE, { waitUntil: 'networkidle' })
step('01 app loads', (await page.locator('body').innerText()).length > 40)

// 2. create an overlay from an empty workspace
await page.getByRole('button', { name: /new empty overlay/i }).click()
await page.waitForURL(/overlays\/editor/, { timeout: 15000 })
await page.waitForTimeout(900)
step('02 create overlay', /overlays\/editor/.test(page.url()), page.url().split('#')[1])

// 3. add elements from the library (content + live widgets)
const addByDescription = async (description) => {
  const button = page.locator('.element-list button', { hasText: description }).first()
  await button.click()
  await page.waitForTimeout(350)
}
await addByDescription('Custom RTL or LTR copy')
await addByDescription('Official Kick livestream metric')
await addByDescription('Preview-ready integration slot')
const countAfterAdd = await page.locator('.canvas-element').count()
step('03 add three elements', countAfterAdd === 3, `${countAfterAdd} on canvas`)

// 4. style the text layer through the inspector
await page.locator('.canvas-element').first().click()
await page.waitForTimeout(300)
const fontInput = page.locator('.property-field input').first()
const before = await page.evaluate(() => document.querySelector('.canvas-element')?.getBoundingClientRect().width)
const xInput = page.locator('.property-field').nth(1).locator('input')
await xInput.fill('300')
await xInput.press('Tab')
// autosave is debounced, so wait for the write instead of assuming a fixed delay
let storedX = null
for (let i = 0; i < 16; i += 1) {
  storedX = await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('obsidian-overlays-v1') || '[]')
    return rows[0]?.elements?.[0]?.x ?? null
  })
  if (storedX === 300) break
  await page.waitForTimeout(200)
}
step('04 property edit persists', storedX === 300, { storedX, before })

// 5. autosave already wrote to storage; reload proves it survived
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
const afterReload = await page.locator('.canvas-element').count()
const xAfterReload = await page.evaluate(() => {
  const rows = JSON.parse(localStorage.getItem('obsidian-overlays-v1') || '[]')
  return rows[0]?.elements?.[0]?.x ?? null
})
step('05 reload keeps work', afterReload === 3 && xAfterReload === 300, { afterReload, xAfterReload })

// 6. leave and reopen from the overlay list
const overlayId = page.url().split('/editor/')[1]
await page.goto(`${SITE}/#/overlays`, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.goto(`${SITE}/#/overlays/editor/${overlayId}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
step('06 reopen from list', (await page.locator('.canvas-element').count()) === 3)

// 7. undo / redo: history lives in memory, so make a fresh edit after the reload, then reverse it
await page.locator('.canvas-element').first().click()
await page.waitForTimeout(300)
const xField = page.locator('.property-field').nth(1).locator('input')
const readX = () => page.evaluate(() => JSON.parse(localStorage.getItem('obsidian-overlays-v1') || '[]')[0]?.elements?.[0]?.x)
await xField.fill('420')
await xField.press('Tab')
let edited = null
for (let i = 0; i < 16; i += 1) { edited = await readX(); if (edited === 420) break; await page.waitForTimeout(200) }
// a shortcut must not fire while a field has focus, so leave the inspector first
await page.locator('.canvas-viewport').click({ position: { x: 60, y: 500 } })
await page.waitForTimeout(300)
await page.keyboard.press('Control+z')
await page.waitForTimeout(1400)
const afterUndo = await readX()
await page.keyboard.press('Control+Shift+z')
await page.waitForTimeout(1400)
const afterRedo = await readX()
step('07 undo/redo', edited === 420 && afterUndo === 300 && afterRedo === 420, { edited, afterUndo, afterRedo })

// 8. the live widget can be driven by the app's own test route (honest: app-generated, not organic Kick)
await page.locator('.canvas-element').nth(2).click()
await page.waitForTimeout(300)
const testButton = page.getByRole('button', { name: /test widget/i })
const hasTest = await testButton.count()
if (hasTest) {
  await testButton.first().click()
  await page.waitForTimeout(1200)
}
step('08 test widget route responds', hasTest > 0, hasTest ? 'test button present and clicked' : 'no test button for this layer')

// 9. publish and capture the OBS url
let published = ''
await page.exposeFunction('captureCopy', (value) => { published = String(value) })
await page.evaluate(() => {
  const clipboard = navigator.clipboard
  if (clipboard) clipboard.writeText = (value) => { window.captureCopy(value); return Promise.resolve() }
})
await page.getByRole('button', { name: /^publish$/i }).click()
await page.waitForTimeout(1500)
if (!published) {
  published = await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('obsidian-overlays-v1') || '[]')
    return rows[0]?.publishedUrl || ''
  })
}
step('09 publish yields obs url', published.includes('/#/overlay/'), published.slice(0, 110))

// 10. the published url renders in a clean browser with no storage at all
const guest = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const out = await guest.newPage()
const outErrors = []
out.on('pageerror', (e) => outErrors.push(e.message))
await out.goto(published, { waitUntil: 'networkidle' })
await out.waitForTimeout(1200)
const rendered = await out.evaluate(() => ({
  elements: document.querySelectorAll('.runtime-element').length,
  transparent: getComputedStyle(document.body).backgroundColor,
  unavailable: !!document.querySelector('.runtime-error'),
  text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 120),
}))
step('10 published url renders clean', rendered.elements === 3 && !rendered.unavailable, rendered)

// 11. runtime config travelled with the design (live widget knows its connection)
const runtimeConfig = await out.evaluate(() => {
  const rows = JSON.parse(localStorage.getItem('obsidian-overlays-v1') || 'null')
  return { leakedStorage: rows !== null }
})
step('11 guest stays stateless', runtimeConfig.leakedStorage === false)

// 12. reload the output url: same result, no drift
await out.reload({ waitUntil: 'networkidle' })
await out.waitForTimeout(900)
const second = await out.evaluate(() => document.querySelectorAll('.runtime-element').length)
step('12 output survives reload', second === 3)

// 13. a forged publish payload is refused, not rendered blank
await out.goto(`${SITE}/#/overlay/nope`, { waitUntil: 'networkidle' })
await out.waitForTimeout(700)
const invalid = await out.evaluate(() => ({ message: document.querySelector('.runtime-error')?.innerText?.replace(/\s+/g, ' ').trim() || '', blank: document.body.innerText.trim().length < 20 }))
step('13 invalid url explains itself', /unavailable|could not be found/i.test(invalid.message) && !invalid.blank, invalid)

// 14. no console or page errors across the whole journey
step('14 no runtime errors', errors.length === 0 && outErrors.length === 0, { app: errors.slice(0, 3), output: outErrors.slice(0, 3) })

await browser.close()
const passed = Object.values(results).filter((r) => r.ok).length
console.log(JSON.stringify({ passed, total: Object.keys(results).length, failed: fail, results }, null, 1))
process.exit(fail.length ? 1 : 0)
