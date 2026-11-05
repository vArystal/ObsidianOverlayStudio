// CP20.1 accessibility audit: real axe-core, run against the build on SITE (default: local preview).
import pw from '/tmp/node_modules/playwright/index.js'
import { readFileSync } from 'node:fs'

const { chromium } = pw
const AXE = readFileSync('/tmp/axe.min.js', 'utf8')
const SITE = process.env.SITE || 'http://localhost:4421'

const deco = { enabled: true, preset: 'royal-panel', inheritTheme: true, borderVisible: true, borderWidth: 1, borderColor: '#cfd2d6', borderOpacity: 1, radius: 6, innerBorder: false, innerBorderColor: '#cfd2d6', innerBorderOpacity: 0.3, cornerOrnaments: false, separator: false, backgroundColor: '#0e0f11', backgroundOpacity: 0.7, gradient: true, pattern: 'none', shadow: true, glow: false, highlight: false, padding: 18 }
const anim = { type: 'fade', duration: 600, delay: 0, easing: 'ease', intensity: 1, direction: 'up', reducedMotion: 'static', idle: 'none' }
const mk = (id, type, name, x, y, width, height, props) => ({ id, type, name, x, y, width, height, rotation: 0, opacity: 1, visible: true, includeInOutput: true, locked: false, z: 1, animation: anim, decoration: deco, props })
const overlay = {
  id: 'cp201-audit', publicId: 'pubaudit', name: 'Audit overlay', width: 1280, height: 720,
  settings: { showGrid: false, snap: true, showSafeArea: false, transparent: true, backgroundImage: null },
  theme: { id: 'obsidian', name: 'Obsidian', nameFa: 'Obsidian', chrome: { radius: 6, borderWidth: 1, texture: 'none', uppercaseLabels: true, innerBorder: false, cornerOrnaments: false, panelOpacity: 0.7 },
    palette: { surface: { base: '#0e0f11', raised: '#15161a', sunken: '#0c0c0e', overlay: '#0e0f11' }, accent: { base: '#cfd2d6', soft: '#9ea3aa', strong: '#eef0f2' }, border: { hairline: '#2b2b31', strong: '#3b3b42', focus: '#ffffff' }, text: { primary: '#f2f3f4', secondary: '#b6b9bd', muted: '#8b8f94', inverse: '#0c0c0e' }, state: { hover: '#1d1d21', selected: '#24242a', disabled: '#6e6e74' }, depth: { raised: '0 1px 2px rgba(0,0,0,.5)', floating: '0 12px 32px rgba(0,0,0,.55)', inset: 'inset 0 0 0 1px #2b2b31', glow: 'rgba(207,210,214,.35)' } },
    primary: '#15161a', secondary: '#0c0c0e', accent: '#cfd2d6', accentSoft: '#9ea3aa', surface: '#0e0f11', surfaceAlt: '#15161a', text: '#f2f3f4', muted: '#8b8f94', glow: '#cfd2d6', pattern: 'none' },
  staticMotion: true, live: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  elements: [
    mk('el-chat', 'chat', 'Chat', 40, 400, 460, 280, { title: 'chat', textColor: '#f2f3f4', backgroundColor: '#0e0f11', backgroundOpacity: 0.7, fontSize: 16, maxMessages: 5, showTimestamps: true, showBadges: true, showAvatars: false }),
    mk('el-title', 'text', 'Title', 560, 80, 640, 120, { text: 'AUDIT', fontSize: 56, fontWeight: 700, color: '#ffffff', textAlign: 'left', lineHeight: 1.1 }),
  ],
}

const SURFACES = [
  { name: 'dashboard', url: '/#/overlays' },
  { name: 'editor', url: '/#/overlays/editor/cp201-audit' },
  { name: 'theme-selector', url: '/#/overlays/editor/cp201-audit', act: async (page) => {
      const tab = page.getByRole('tab', { name: /theme/i }).first()
      if (await tab.count()) { await tab.click(); await page.waitForTimeout(500) }
    } },
  { name: 'publish-dialog', url: '/#/overlays/editor/cp201-audit', act: async (page) => {
      // The publish sheet is the dialog an author sees most; open it and audit it in place.
      const trigger = page.getByRole('button', { name: /^publish$/i }).first()
      if (await trigger.count()) { await trigger.click(); await page.waitForTimeout(900) }
    } },
]

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addInitScript((data) => {
  localStorage.setItem('obsidian-overlays-v1', JSON.stringify([data]))
}, overlay)

const report = {}
const errors = []
for (const surface of SURFACES) {
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(`${surface.name}: ${error.message}`))
  await page.goto(SITE + surface.url)
  await page.waitForTimeout(1400)
  if (surface.act) await surface.act(page)
  await page.addScriptTag({ content: AXE })
  const audited = await page.evaluate(() => ({
    nodes: document.querySelectorAll('*').length,
    dialogs: document.querySelectorAll('[role="dialog"], .dialog, .publish-modal, .modal-backdrop, .dialog-backdrop').length,
    themeThumbs: document.querySelectorAll('.theme-thumb, [role="radio"]').length,
    tabs: document.querySelectorAll('[role="tab"]').length,
  }))
  const result = await page.evaluate(async () => {
    const out = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    })
    return out.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target, summary: (n.failureSummary || '').split('\n').slice(0, 2).join(' ') })),
    }))
  })
  const selfTest = await page.evaluate(async () => {
    const probe = document.createElement('button')
    probe.textContent = 'low contrast probe'
    probe.style.cssText = 'color:#111;background:#000;border:0;font-size:14px;position:fixed;left:0;top:0;z-index:9999'
    document.body.appendChild(probe)
    const out = await window.axe.run(probe, { runOnly: { type: 'tag', values: ['wcag2aa'] } })
    probe.remove()
    return out.violations.map((v) => v.id)
  })
  report[surface.name] = {
    violations: result,
    audited,
    detectorWorks: selfTest.includes('color-contrast'),
  }
  await page.close()
}
await browser.close()

const totals = Object.fromEntries(Object.entries(report).map(([k, v]) => [k, {
  violations: v.violations.length,
  serious: v.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical').length,
  nodes: v.audited.nodes,
  dialogs: v.audited.dialogs,
  themeThumbs: v.audited.themeThumbs,
  detectorWorks: v.detectorWorks,
}]))
console.log(JSON.stringify({ totals, report, errors }, null, 1))
