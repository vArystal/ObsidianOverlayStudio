import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { deflateSync } from 'node:zlib'
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
await new Promise((r) => server.listen(4181, r))

// --- a photo-like PNG: gradient + blocks + light noise, large on purpose ---
function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = c ^ (crc >>> 8) }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function makePng(width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  let seed = 12345
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1)
    raw[row] = 0
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 3
      const band = Math.floor(x / 180) % 3
      const noise = rnd() * 26
      raw[i] = Math.min(255, 40 + (y / height) * 150 + band * 30 + noise)
      raw[i + 1] = Math.min(255, 20 + (x / width) * 120 + noise)
      raw[i + 2] = Math.min(255, 90 + band * 60 + noise)
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))])
}
const png = makePng(2600, 1700)

const mk = (id, type, x, y, props, w = 520, h = 300) => ({ id, type, name: id, x, y, width: w, height: h, rotation: 0, opacity: 1, visible: true, locked: false, includeInOutput: true, maintainAspectRatio: false, animation: { type: 'none', exit: 'none', idle: 'none' }, decoration: { enabled: false, preset: 'none' }, props })
const base = (elements) => ({ id: 'ov_img', publicId: 'pubimg', name: 'Image budget', width: 1920, height: 1080, settings: { showGrid: false, snap: false, showSafeArea: false, transparent: true, backgroundImage: null }, theme: { id: 'royal-persian' }, staticMotion: true, live: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishedAt: null, elements })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []; page.on('pageerror', (e) => errors.push(e.message))
const out = { originalBytes: png.length }

// --- 1. upload through the Assets panel ---------------------------------------------------
await page.goto('http://localhost:4181/#/overlays')
await page.evaluate((o) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify([o])), base([]))
await page.goto('http://localhost:4181/#/overlays/editor/ov_img')
await page.waitForSelector('.canvas-stage')
await page.locator('.left-panel button', { hasText: /Assets/ }).first().click()
await page.waitForTimeout(300)
const fileInput = page.locator('input[type="file"]').first()
await fileInput.setInputFiles({ name: 'big-photo.png', mimeType: 'image/png', buffer: png })
await page.waitForTimeout(2500)
out.uploaded = await page.evaluate(() => {
  const el = JSON.parse(localStorage.getItem('obsidian-overlays-v1'))[0].elements[0]
  if (!el) return null
  const payload = el.props.src.split(',')[1] ?? ''
  return { bytes: Math.floor(payload.length * 3 / 4), width: el.width, height: el.height, type: el.props.src.slice(5, el.props.src.indexOf(';')) }
})
out.notice = await page.locator('[role="status"], .notice, .toast').first().textContent().catch(() => null)

// --- 2. publish: the modal must report an honest size verdict -----------------------------
await page.locator(".toolbar-button", { hasText: "Publish" }).first().click()
await page.waitForSelector('.publish-modal', { timeout: 8000 })
out.publish = await page.evaluate(() => {
  const v = document.querySelector('.publish-size')
  const url = document.querySelector('.publish-modal textarea')?.value ?? ''
  return { verdictClass: v?.className ?? null, verdict: v?.textContent?.trim() ?? null, urlLength: url.length }
})

// --- 3. an image that cannot fit must be refused, not copied -------------------------------
await page.locator('.modal-close').click().catch(() => {})
await page.evaluate(() => {
  const list = JSON.parse(localStorage.getItem('obsidian-overlays-v1'))
  const huge = 'data:image/png;base64,' + 'A'.repeat(0) ;
  // Incompressible payload: a repeating pattern would be squashed by the snapshot's LZ codec and
  // would not represent a real photo, which is what actually blows the URL budget.
  const bytes = new Uint8Array(1_600_000)
  const seed = new Uint32Array(1); let state = 0x9e3779b9
  for (let i = 0; i < bytes.length; i++) { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; bytes[i] = state & 0xff }
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192))
  const src = 'data:image/png;base64,' + btoa(binary)
  list[0].elements = [{ ...list[0].elements[0], props: { ...list[0].elements[0].props, src } }]
  localStorage.setItem('obsidian-overlays-v1', JSON.stringify(list))
})
await page.reload()
await page.waitForSelector('.canvas-stage')
await page.waitForTimeout(600)
await page.locator(".toolbar-button", { hasText: "Publish" }).first().click()
await page.waitForTimeout(2500)
out.blocked = {
  modalOpen: await page.locator('.publish-modal').count(),
  notice: (await page.locator('[role="status"], .notice, .toast').first().textContent().catch(() => ''))?.trim() ?? '',
}

await browser.close(); server.close()
console.log(JSON.stringify({ ...out, errors }, null, 1))
