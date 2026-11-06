// CP25 production evidence: the alert studio and the published stage.
// It cannot mint a management token, so it never claims a live Kick delivery; it proves the studio renders,
// the template shows as a design state, and the published stage stays empty until an event exists.
import pw from '/tmp/node_modules/playwright/index.js'
const SITE = (process.env.SITE || 'https://varystal.github.io/ObsidianOverlayStudio').replace(/\/$/, '')
const browser = await pw.chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
const out = { site: SITE, errors, checks: {} }
try {
  await page.goto(`${SITE}/#/`, { waitUntil: 'networkidle' })
  await page.click('text=New empty overlay')
  await page.waitForSelector('[data-widget-type="alert"]')
  await page.click('[data-widget-type="alert"]')
  await page.waitForSelector('.alert-stage', { timeout: 15000 })
  out.checks.studio = await page.evaluate(() => ({
    kinds: [...document.querySelectorAll('[data-alert-kind]')].map((n) => n.dataset.alertKind),
    headline: document.querySelector('.alert-headline')?.textContent ?? null,
    sections: [...document.querySelectorAll('.alert-studio .property-section summary')].map((n) => n.textContent.trim()),
    tests: [...document.querySelectorAll('[data-alert-test]')].map((n) => n.dataset.alertTest),
  }))
  await page.screenshot({ path: 'artifacts/cp25-alert-studio.png' })
  const testButton = page.locator('[data-alert-test="subscribe"]')
  if (await testButton.count()) { await testButton.first().click(); await page.waitForTimeout(900) }
  out.checks.afterTest = await page.evaluate(() => ({
    text: document.querySelector('.alert-stage')?.textContent?.slice(0, 140) ?? null,
    badge: Boolean(document.querySelector('.alert-test-note')),
  }))
  await page.screenshot({ path: 'artifacts/cp25-alert-test.png' })
  const overlay = await page.evaluate(() => JSON.parse(localStorage.getItem('obsidian-overlays-v1') || '[]')[0])
  const runtime = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  const runtimeErrors = []
  runtime.on('pageerror', (e) => runtimeErrors.push(String(e)))
  await runtime.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: 'obsidian-overlays-v1', value: [overlay] })
  await runtime.goto(`${SITE}/#/overlay/${overlay.publicId}`, { waitUntil: 'networkidle' })
  await runtime.waitForTimeout(2500)
  out.checks.runtime = await runtime.evaluate(() => ({
    stages: document.querySelectorAll('.alert-stage').length,
    text: document.querySelector('.alert-stage')?.textContent ?? '',
    scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight,
    transparent: getComputedStyle(document.body).backgroundColor,
  }))
  out.checks.runtimeErrors = runtimeErrors
  await runtime.screenshot({ path: 'artifacts/cp25-alert-runtime.png' })
} catch (error) {
  out.failure = String(error)
}
await browser.close()
console.log(JSON.stringify(out, null, 1))
