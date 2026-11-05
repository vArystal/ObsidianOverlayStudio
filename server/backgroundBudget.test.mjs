// Frame-budget guard for the background engine. It lives in the node test suite because it reads the stylesheet
// from disk, and because the rule it enforces is about the shipped CSS, not about React components.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles/backgrounds.css', import.meta.url), 'utf8')

function animatedProperties(sheet) {
  const props = new Set()
  for (const match of sheet.matchAll(/animation:\s*([\w-]+)/g)) {
    const start = sheet.indexOf(`@keyframes ${match[1]}`)
    if (start === -1) continue
    const open = sheet.indexOf('{', start)
    let depth = 0
    let end = open
    for (let i = open; i < sheet.length; i += 1) {
      if (sheet[i] === '{') depth += 1
      if (sheet[i] === '}') { depth -= 1; if (depth === 0) { end = i; break } }
    }
    for (const decl of sheet.slice(open, end).matchAll(/([a-z-]+)\s*:/g)) props.add(decl[1])
  }
  return props
}

test('background scenes animate only compositor-friendly properties', () => {
  const allowed = new Set(['transform', 'opacity', 'translate', 'scale', 'background', 'animation', 'animation-delay'])
  const offenders = [...animatedProperties(css)].filter((prop) => !allowed.has(prop))
  assert.deepEqual(offenders, [], `animated properties that force layout or paint: ${offenders.join(', ')}`)
  assert.ok(animatedProperties(css).size > 0, 'guard found no keyframes, so it is not testing anything')
})

test('blur is opt-in, so no preset ships a full-screen filter by default', () => {
  const lines = css.split('\n')
  const filters = lines.map((line, index) => ({ line, index })).filter(({ line }) => line.includes('filter: blur('))
  assert.ok(filters.length > 0, 'no blur rule found')
  for (const { index } of filters) {
    let selector = ''
    for (let i = index; i >= 0; i -= 1) if (lines[i].includes('{')) { selector = lines[i]; break }
    assert.match(selector, /\.has-blur/, `filter escaped the opt-in: ${selector.trim()}`)
  }
})
