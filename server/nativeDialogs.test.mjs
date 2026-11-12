import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

/**
 * CP41 — no native browser dialogs. window.prompt/confirm/alert ignore the studio's type scale, block the event loop
 * and cannot be styled or validated, so the product must use its own surfaces. Comments are stripped first, because
 * the components that replaced them say so in prose.
 */
const ROOT = new URL('..', import.meta.url).pathname

function walk(dir, out = []) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) walk(path, out)
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.test\.(tsx?|ts)$/.test(entry.name)) out.push(path)
  }
  return out
}

test('no source file calls a native browser dialog', () => {
  const offenders = []
  for (const file of walk('src')) {
    const source = readFileSync(join(ROOT, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    const match = /window\.(prompt|confirm|alert)\s*\(|[^.\w](prompt|confirm|alert)\s*\(/.exec(source)
    if (match) offenders.push(`${file}: ${match[0].trim()}`)
  }
  assert.deepEqual(offenders, [], `native dialogs must not ship:\n  ${offenders.join('\n  ')}`)
})
