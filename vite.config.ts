import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const integrationTarget = env.INTEGRATION_PROXY_TARGET || 'http://localhost:8787'
  const proxy = { '/api': { target: integrationTarget, changeOrigin: true } }
  return {
    base: './',
    plugins: [react()],
    server: { host: '0.0.0.0', allowedHosts: true, proxy },
    preview: { host: '0.0.0.0', allowedHosts: true, proxy },
  }
})
