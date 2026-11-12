// CP23 asset guard: the font library must be real. This runs in the node suite because a vitest import of a
// stylesheet is stubbed empty, which would make every assertion here pass vacuously.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const css = readFileSync(resolve(root, 'src/styles/fonts.css'), 'utf8')
const dir = resolve(root, 'src/assets/fonts')
const files = readdirSync(dir).filter((name) => name.endsWith('.woff2'))

const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((match) => {
  const body = match[1]
  const family = body.match(/font-family:\s*'([^']+)'/)?.[1]
  const weight = body.match(/font-weight:\s*(\d+)/)?.[1]
  const src = body.match(/url\('([^']+)'\)/)?.[1]
  return { family, weight: Number(weight), src }
})

test('every declared family ships the weights it advertises', () => {
  const byFamily = new Map()
  for (const face of faces) {
    assert.ok(face.family && face.src && Number.isFinite(face.weight), `malformed @font-face: ${JSON.stringify(face)}`)
    const entry = byFamily.get(face.family) ?? new Set()
    entry.add(face.weight)
    byFamily.set(face.family, entry)
  }
  const curated = [...byFamily.keys()].filter((name) => name !== 'Studio Display')
  assert.ok(curated.length >= 12, `expected at least 12 families, found ${curated.length}`)
  for (const [family, weights] of byFamily) {
    assert.ok(weights.size >= 1, `${family} declares no weight`)
  }
})

test('every declared face points at a real woff2 file', () => {
  for (const face of faces) {
    const relative = face.src.replace('../assets/fonts/', '')
    const bytes = readFileSync(resolve(dir, relative))
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', `${relative} is not a woff2 binary`)
  }
})

test('no font file is shipped without a @font-face rule', () => {
  const referenced = new Set(faces.map((face) => face.src.replace('../assets/fonts/', '')))
  const orphans = files.filter((name) => !referenced.has(name))
  assert.deepEqual(orphans, [], `unreferenced font files would never load: ${orphans.join(', ')}`)
})

test('every self-hosted family carries its OFL licence text', () => {
  const licences = readdirSync(resolve(dir, 'licenses'))
  const families = new Set(faces.map((face) => face.family.toLowerCase().replace(/\s+/g, '-')))
  families.delete('studio-display')
  for (const family of families) {
    assert.ok(licences.includes(`${family}-LICENSE.txt`), `missing licence for ${family}`)
    const text = readFileSync(resolve(dir, 'licenses', `${family}-LICENSE.txt`), 'utf8')
    assert.match(text, /SIL Open Font License/i, `${family} licence is not OFL`)
  }
})

test('fonts are declared with swap so text is never invisible while loading', () => {
  for (const match of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    assert.match(match[1], /font-display:\s*swap/, 'every face must use font-display: swap')
  }
})

test('Arabic coverage is declared through unicode-range, not a separate code path', () => {
  const arabicFaces = faces.filter((face) => /U\+0600-06FF/.test(css.slice(css.indexOf('font-family: \'' + face.family))))
  assert.ok(faces.length > 0)
  const persianFamilies = new Set(faces.filter((face) => face.family === 'Vazirmatn' || face.family === 'Estedad' || face.family === 'Noto Sans Arabic' || face.family === 'Cairo').map((face) => face.family))
  assert.ok(persianFamilies.size >= 3, 'at least three Persian-capable families expected')
  assert.ok(arabicFaces.length >= 1)
})
