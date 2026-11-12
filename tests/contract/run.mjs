#!/usr/bin/env node
/**
 * CP36: `npm run test:contract` runs the shared contract suite against BOTH backends and exits non-zero on drift.
 */
import { adapters } from './harness.mjs'
import { runContract } from './scenarios.mjs'

let failures = 0
for (const factory of Object.values(adapters)) {
  const adapter = await factory()
  const { label, results, failed } = await runContract(adapter)
  for (const item of results) console.log(`${item.ok ? 'ok  ' : 'FAIL'} ${label} ${item.name}${item.ok ? '' : ` -> ${item.error}`}`)
  failures += failed.length
}
console.log(`\n${failures === 0 ? 'contract: PASS' : `contract: ${failures} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
