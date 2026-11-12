import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

/**
 * CP40 — the guard against dead controls.
 *
 * A persisted, user-editable field must change the published output. This test extracts every field an inspector
 * writes (element props, decoration, animation, alert template, motion clip and effects) and fails when the key
 * appears nowhere outside the inspector code: such a control cannot do anything, and the phase that shipped it
 * shipped a promise instead of a feature.
 */
const ROOT = new URL('..', import.meta.url).pathname
const INSPECTORS = [
  'src/components/editor/PropertiesPanel.tsx',
  'src/components/editor/WidgetSettings.tsx',
  'src/components/editor/MotionStudio.tsx',
  'src/components/editor/AlertStudio.tsx',
  'src/components/editor/TypographyStudio.tsx',
]
const READ = (path) => readFileSync(join(ROOT, path), 'utf8')

function walk(dir, out = []) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) walk(path, out)
    else if (/\.(tsx?|css)$/.test(entry.name) && !/\.test\.(tsx?|ts)$/.test(entry.name)) out.push(path)
  }
  return out
}

/** Every field the inspectors write, with the file that offers it, so a failure names the control. */
function controls() {
  const found = new Map()
  for (const file of INSPECTORS) {
    const source = READ(file)
    const patterns = [
      /\b(?:prop|onProp)\(\s*'([A-Za-z0-9_]+)'/g,
      /\b(?:decorate|animate)\(\{\s*([A-Za-z0-9_]+)/g,
      /\bpatchTemplate\(\{\s*([A-Za-z0-9_]+)/g,
      /\bpatchEffect\(\{\s*([A-Za-z0-9_]+)/g,
      /\bpatchClip\(\{\s*([A-Za-z0-9_]+)/g,
    ]
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        if (!found.has(match[1])) found.set(match[1], file)
      }
    }
  }
  return found
}

/** Anything that renders, styles or queues an element: the places a field has to be read to matter. */
function consumers() {
  return walk('src')
    .filter((path) => !INSPECTORS.includes(path))
    .map((path) => READ(path))
    .join('\n')
}

/**
 * Fields whose consumer is a shared builder rather than a literal read in a component. Each entry says where the
 * value goes, and the comment is the reason the allowlist entry is honest rather than a way to silence the test.
 */
const INDIRECT = new Map([
  ['preset', 'applies the whole preset object through createDecoration/toggleDecoration in themes.ts'],
])

const readPattern = (key) => new RegExp(`(['"\`]${key}['"\`]|\\.${key}\\b|\\b${key}\\s*:)`)

test('every control an inspector writes has a consumer outside the inspector', () => {
  const corpus = consumers()
  const dead = []
  for (const [key, file] of controls()) {
    if (INDIRECT.has(key)) continue
    // A read is a quoted field name (`'key'`), a member access (`.key`) or an object key (`key:`). A bare
    // substring hit inside an unrelated word does not count, which is what keeps this guard meaningful.
    if (readPattern(key).test(corpus)) continue
    dead.push(`${file}: ${key}`)
  }
  assert.deepEqual(dead, [], `controls with no renderer consumer:\n  ${dead.join('\n  ')}`)
})

/** Negative control: if the detector ever became a substring search, these assertions would stop holding. */
test('the guard rejects keys nothing reads', () => {
  const corpus = consumers()
  assert.equal(readPattern('definitelyNotAConsumerKey').test(corpus), false)
  // A word that appears as prose but never as a field must not count either.
  assert.equal(readPattern('gradientLayers101').test(corpus), false)
})

test('the guard is not vacuous: it finds the real controls', () => {
  const keys = controls()
  // A handful that must always be present, so a broken extractor cannot make the test pass by finding nothing.
  for (const key of ['fontSize', 'borderWidth', 'duration', 'holdDuration', 'shape']) {
    assert.ok(keys.has(key), `extractor missed ${key}`)
  }
  assert.ok(keys.size > 80, `only ${keys.size} controls extracted`)
})
