// CP21 evidence: every backdrop at 1920x1080, the selection UI, editor-over-widgets, published runtime, and proof
// that the animation actually advances rather than sitting still in a screenshot.
import pw from '/tmp/node_modules/playwright/index.js'
const { chromium } = pw
const SITE = process.env.SITE || 'http://localhost:4451'
const KINDS = ['aurora-flow', 'liquid-light', 'cinematic-particles', 'neon-grid', 'deep-space', 'ambient-gradient']
const deco = { enabled: true, preset: 'royal-panel', inheritTheme: true, borderVisible: true, borderWidth: 1, borderColor: '#e8e8e6', borderOpacity: .9, radius: 8, innerBorder: false, innerBorderColor: '#ffffff', innerBorderOpacity: .3, cornerOrnaments: false, separator: false, backgroundColor: '#121214', backgroundOpacity: .7, gradient: false, pattern: 'none', shadow: true, glow: false, highlight: false, padding: 16 }
const mk = (id, type, name, x, y, width, height, props) => ({ id, type, name, x, y, width, height, rotation: 0, opacity: 1, visible: true, includeInOutput: true, locked: false, z: 1, animation: { type: 'fade', dur: 600, delay: 0, entrance: 'fade', exit: 'fade', idle: 'none', reducedMotion: 'auto' }, decoration: { ...deco }, props })
const bg = (kind, extra = {}) => ({ enabled: true, kind, primary: '#0b0d10', secondary: '#131720', accent: '#9fb2c8', opacity: .9, speed: 1, intensity: .6, blur: 30, density: .5, scale: 1, paused: false, ...extra })
const overlay = (id, kind) => ({
  id, publicId: `bg${id}`, name: `BG ${kind}`, width: 1920, height: 1080,
  settings: { showGrid: false, snap: true, showSafeArea: false, transparent: true, backgroundImage: null },
  theme: { id: 'obsidian' }, background: bg(kind), staticMotion: false, live: null, publishedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  elements: [
    mk(`${id}-cam`, 'webcam', 'Camera frame', 80, 620, 620, 350, { shape: 'rounded', borderWidth: 0, borderColor: '#e8e8e6', borderRadius: 18, fillColor: '#121214', fillOpacity: .18, label: 'CAMERA' }),
    mk(`${id}-chat`, 'chat', 'Chat', 1240, 420, 560, 560, { showUsernames: true, showAvatars: true, maxMessages: 6, textColor: '#f4f4f2', fontSize: 16, timerEnabled: false }),
    mk(`${id}-title`, 'alert', 'Alert', 620, 120, 700, 200, { title: 'NEW FOLLOWER', message: 'Welcome aboard', textColor: '#f4f4f2', accentColor: '#cfd2d6', backgroundColor: '#121214', imageSrc: '', soundEnabled: false, provider: 'kick', eventTypes: 'channel.follow', timerEnabled: false }),
  ],
})

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.addInitScript((data) => localStorage.setItem('obsidian-overlays-v1', JSON.stringify(data)), KINDS.map((kind, i) => overlay(`k${i}`, kind)))

const shots = {}
// 1-6: each backdrop behind real widgets, at the editor's 1920x1080 stage.
for (let i = 0; i < KINDS.length; i++) {
  await page.goto(`${SITE}/#/overlays/editor/k${i}`)
  await page.waitForTimeout(1400)
  const stage = page.locator('.canvas-stage').first()
  await stage.screenshot({ path: `artifacts/cp21-bg-${KINDS[i]}.png` })
  shots[KINDS[i]] = true
}
// Motion proof: sample the animated transform twice, and diff two frames of a deliberately fast scene.
await page.goto(`${SITE}/#/overlays/editor/k0`)
await page.waitForTimeout(1200)
const stage = page.locator('.canvas-stage').first()
const readTransform = () => page.evaluate(() => {
  const band = document.querySelector('.overlay-background .bg-band')
  const layer = document.querySelector('.overlay-background')
  const mote = document.querySelector('.overlay-background .bg-mote')
  return {
    transform: band ? getComputedStyle(band).transform : null,
    playState: band ? getComputedStyle(band).animationPlayState : null,
    moteY: mote ? getComputedStyle(mote).transform : null,
    layerClass: layer?.className ?? null,
  }
})
const t1 = await readTransform()
await page.waitForTimeout(1200)
const t2 = await readTransform()

// A fast particle scene gives the screenshot diff something to see at 60fps timescales.
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('obsidian-overlays-v1'))
  raw[2].background = { ...raw[2].background, kind: 'cinematic-particles', speed: 2, density: 1, opacity: 1 }
  localStorage.setItem('obsidian-overlays-v1', JSON.stringify(raw))
})
await page.goto(`${SITE}/#/overlays/editor/k2`)
await page.waitForTimeout(1200)
const particleStage = page.locator('.canvas-stage').first()
await particleStage.screenshot({ path: 'artifacts/cp21-motion-a.png' })
await page.waitForTimeout(900)
await particleStage.screenshot({ path: 'artifacts/cp21-motion-b.png' })

// Selection + controls UI.
const panel = page.locator('.background-section').first()
await panel.scrollIntoViewIfNeeded()
await panel.screenshot({ path: 'artifacts/cp21-controls.png' })
await page.screenshot({ path: 'artifacts/cp21-editor.png' })

// Published runtime, same doc through the snapshot-free public route.
await page.goto(`${SITE}/#/overlay/bgk0`)
await page.waitForTimeout(1500)
await page.screenshot({ path: 'artifacts/cp21-runtime.png' })

const audit = await page.evaluate(() => {
  const stage = document.querySelector('.runtime-stage')
  const layer = document.querySelector('.overlay-background')
  const firstEl = document.querySelector('.runtime-element')
  const cs = layer ? getComputedStyle(layer) : null
  return {
    layerExists: Boolean(layer),
    layerZ: cs?.zIndex,
    pointerEvents: cs?.pointerEvents,
    firstElementZ: firstEl ? getComputedStyle(firstEl).zIndex : null,
    layerCoversStage: layer && stage ? Math.round(layer.getBoundingClientRect().width) === Math.round(stage.getBoundingClientRect().width) : false,
    bodyTransparent: getComputedStyle(document.body).backgroundColor,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    animationName: layer ? getComputedStyle(layer.querySelector('.bg-band') || layer).animationName : null,
  }
})
await browser.close()
console.log(JSON.stringify({ shots, audit, motion: { t1, t2, changed: t1.transform !== t2.transform, moteMoved: t1.moteY !== t2.moteY }, errors }, null, 1))
