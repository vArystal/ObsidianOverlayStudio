import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Pages Functions bundle relative imports, so the runtime code just needs to sit beside _worker.js.
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const target = join(root, 'worker/pages')
mkdirSync(target, { recursive: true })
copyFileSync(join(root, 'worker/index.mjs'), join(target, 'index.mjs'))
console.log('pages build: copied worker/index.mjs -> worker/pages/index.mjs')
