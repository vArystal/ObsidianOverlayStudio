export const REQUIRED_KICK_SCOPES = ['user:read', 'channel:read', 'events:subscribe']
export const KICK_EVENT_TYPES = [
  'chat.message.sent',
  'channel.followed',
  'channel.subscription.new',
  'channel.subscription.renewal',
  'channel.subscription.gifts',
  'livestream.status.updated',
  'livestream.metadata.updated',
  'kicks.gifted',
]

export function loadConfig(env = process.env) {
  const port = Number(env.PORT || 8787)
  const allowedOrigins = String(env.APP_ORIGIN || 'http://localhost:5173').split(',').map((value) => value.trim()).filter(Boolean)
  const config = {
    port,
    host: env.HOST || '0.0.0.0',
    appOrigins: allowedOrigins,
    kickClientId: env.KICK_CLIENT_ID || '',
    kickClientSecret: env.KICK_CLIENT_SECRET || '',
    kickRedirectUri: env.KICK_REDIRECT_URI || `http://localhost:${port}/api/auth/kick/callback`,
    tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY || '',
    dataFile: env.DATA_FILE || './data/integrations.json',
    viewerPollMs: Math.max(15_000, Number(env.VIEWER_POLL_INTERVAL_MS || 30_000)),
    publicApiUrl: env.PUBLIC_API_URL || `http://localhost:${port}`,
    nodeEnv: env.NODE_ENV || 'development',
  }
  return { ...config, missing: integrationMissing(config) }
}

export function integrationMissing(config) {
  const missing = []
  if (!config.kickClientId) missing.push('KICK_CLIENT_ID')
  if (!config.kickClientSecret) missing.push('KICK_CLIENT_SECRET')
  if (!config.kickRedirectUri) missing.push('KICK_REDIRECT_URI')
  if (!config.tokenEncryptionKey || config.tokenEncryptionKey.length < 32) missing.push('TOKEN_ENCRYPTION_KEY (minimum 32 characters)')
  return missing
}
