import { describe, expect, it } from 'vitest'

/**
 * CP33: React only notices a hook appearing after an early return by crashing at render time, and only for the
 * paths a test happens to exercise. This walks the source instead, so the rule holds for every component whether
 * or not a test renders the branch. It found DecoratedWidget's dead `useLiveData()` after two early returns.
 */
const HOOK = /\buse[A-Z]\w*\s*\(/
const RETURN = /^\s*(?:\}\s*)?(?:if\s*\(.*\)\s*)?return\b/

type Violation = { file: string; component: string; returnLine: number; hookLine: number }

const indentOf = (line: string) => line.length - line.trimStart().length

export function findHookOrderViolations(source: string, file = 'fixture.tsx'): Violation[] {
  const lines = source.split('\n')
  const violations: Violation[] = []
  const starts: { index: number; name: string; indent: number }[] = []
  lines.forEach((line, index) => {
    const match = line.match(/^\s*(?:export\s+)?(?:default\s+)?function\s+(\w+)\s*\(/)
    if (match) starts.push({ index, name: match[1], indent: indentOf(line) })
  })
  // A component may also be `const Name = memo(() => ...)`. Rather than model that, every top-level declaration
  // ends the previous block, so a component's hooks can never be attributed to the helper above it.
  const boundaries = lines
    .map((line, index) => (/^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|class|type|interface)\b/.test(line) ? index : -1))
    .filter((index) => index >= 0)
  starts.forEach((start) => {
    const limit = boundaries.find((index) => index > start.index) ?? lines.length
    const bodyIndent = start.indent + 2
    let firstReturn = -1
    let firstHook = -1
    for (let i = start.index + 1; i < limit; i += 1) {
      const line = lines[i]
      if (!line.trim() || indentOf(line) !== bodyIndent) continue
      if (firstHook === -1 && HOOK.test(line)) firstHook = i
      if (firstReturn === -1 && RETURN.test(line)) firstReturn = i
      if (firstHook !== -1 && firstReturn !== -1) break
    }
    if (firstReturn !== -1 && firstHook !== -1 && firstReturn < firstHook) {
      violations.push({ file, component: start.name, returnLine: firstReturn + 1, hookLine: firstHook + 1 })
    }
  })
  return violations
}

// The sources come through Vite rather than node:fs, so the test needs no Node type dependency and reads exactly
// what the bundler sees.
const sources = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const walk = () => Object.keys(sources).filter((path) => !path.includes('.test.')).sort()

describe('hooks order guard', () => {
  it('flags a hook that runs after an early return', () => {
    // The exact shape DecoratedWidget had before CP33.
    const broken = [
      'function DecoratedWidget({ children }) {',
      '  if (children === null) return null',
      '  if (!enabled) return <>{children}</>',
      '  const live = useLiveData()',
      '  return <div>{children}</div>',
      '}',
    ].join('\n')
    const violations = findHookOrderViolations(broken)
    expect(violations).toHaveLength(1)
    expect(violations[0].component).toBe('DecoratedWidget')
  })

  it('accepts hooks that run before the first early return', () => {
    const fine = [
      'function Fine({ children }) {',
      '  const live = useLiveData()',
      '  if (!enabled) return null',
      '  return <div>{children}</div>',
      '}',
    ].join('\n')
    expect(findHookOrderViolations(fine)).toHaveLength(0)
  })

  it('finds no component in src that calls a hook after an early return', () => {
    const files = walk()
    const violations = files.flatMap((file) => findHookOrderViolations(sources[file], file))
    expect(files.length).toBeGreaterThan(20)
    expect(violations).toEqual([])
  })
})
