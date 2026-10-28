import { loadConfig } from './config.mjs'
import { createApp } from './app.mjs'

const config = loadConfig()
if (config.missing.length) {
  console.warn(`[integration-api] Setup required: ${config.missing.join(', ')}`)
  console.warn('[integration-api] OAuth routes will stay disabled; health and setup diagnostics remain available.')
}
const app = await createApp({ config })
app.server.listen(config.port, config.host, () => {
  console.log(`[integration-api] Listening on ${config.publicApiUrl}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => { await app.close(); process.exit(0) })
}
