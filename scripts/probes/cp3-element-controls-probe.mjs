import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import pw from '/tmp/node_modules/playwright/index.js'
const { chromium } = pw
const ROOT = new URL('../../dist/', import.meta.url).pathname
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  const f = p === '/' || !extname(p) ? join(ROOT, 'index.html') : join(ROOT, p)
  try { const b = await readFile(f); res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(b) }
  catch { res.writeHead(200, { 'content-type': 'text/html' }); res.end(await readFile(join(ROOT, 'index.html'))) }
})
await new Promise((r) => server.listen(4179, r))

const mk = (id, type, x, y, props) => ({ id, type, name: id, x, y, width: 520, height: 420, rotation: 0, opacity: 1, visible: true, locked: false, includeInOutput: true, maintainAspectRatio: false, animation: { type: 'none', exit: 'none', idle: 'none' }, decoration: { enabled: false, preset: 'none' }, props })
const overlay = {
  id: 'ov_ctrl', publicId: 'pubctrl', name: 'Controls', width: 1920, height: 1080,
  settings: { showGrid: false, snap: false, showSafeArea: false, transparent: true, backgroundImage: null },
  theme: { id: 'royal-persian' }, staticMotion: true, live: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishedAt: null,
  elements: [mk('chat1', 'chat', 80, 400, { fontFamily: 'Vazirmatn', fontSize: 20, maxMessages: 5, showTimestamps: false, showBadges: true, scrolling: true }), mk('cd1', 'countdown', 1300, 120, { label: 'Starts in', minutes: 10, targetAt: '' })],
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []; page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://localhost:4179/#/overlays')
await page.evaluate((o) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify([o])), overlay)
await page.goto('http://localhost:4179/#/overlays/editor/ov_ctrl')
await page.waitForSelector('.canvas-element')
const out = {}

const toggleByLabel = async (label) => {
  const row = page.locator('.toggle-row', { hasText: label }).first()
  await row.click()
  await page.waitForTimeout(250)
}

// Chat: timestamps off by default
await page.click('.canvas-element >> nth=0')
await page.waitForTimeout(250)
out.timestampsBefore = await page.locator('.canvas-element .chat-time').count()
await toggleByLabel('Show timestamps')
out.timestampsAfter = await page.locator('.canvas-element .chat-time').count()

// Chat: badges on by default, then off
out.badgesBefore = await page.locator('.canvas-element .chat-badge').count()
await toggleByLabel('Show Kick identity badges')
out.badgesAfter = await page.locator('.canvas-element .chat-badge').count()

// Chat: feed alignment class follows the toggle
out.feedPinned = await page.locator('.canvas-element .chat-widget').first().evaluate((n) => n.className.includes('chat-scroll'))
await toggleByLabel('Pin newest message to the bottom')
out.feedStacked = await page.locator('.canvas-element .chat-widget').first().evaluate((n) => n.className.includes('chat-stack'))

// Countdown: absolute target produces an hours-format readout
await page.click('.canvas-element >> nth=1')
await page.waitForTimeout(250)
const before = await page.locator('.canvas-element .countdown-widget strong').first().textContent()
const target = new Date(Date.now() + 3 * 3600_000)
const stamp = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}T${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`
await page.fill('input[type="datetime-local"]', stamp)
await page.waitForTimeout(400)
const after = await page.locator('.canvas-element .countdown-widget strong').first().textContent()
out.countdown = { before, after, hoursFormat: /^\d+:\d{2}:\d{2}$/.test((after || '').trim()) }

// The target survives a reload instead of restarting from the duration
await page.waitForTimeout(900)
await page.reload(); await page.waitForSelector('.canvas-element'); await page.waitForTimeout(500)
await page.click('.canvas-element >> nth=1'); await page.waitForTimeout(200)
out.countdownAfterReload = (await page.locator('.canvas-element .countdown-widget strong').first().textContent())?.trim()
out.storedTarget = await page.evaluate(() => JSON.parse(localStorage.getItem('obsidian-overlays-v1'))[0].elements[1].props.targetAt)

await browser.close(); server.close()
console.log(JSON.stringify({ ...out, errors }, null, 1))
