import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Activity, AlertTriangle, Check, Copy, ExternalLink, Link2, MessageSquare, Radio, RefreshCw, ShieldCheck, Unplug, Users, Webhook, Zap } from 'lucide-react'
import { AppShell } from '../components/AppShell'
import { clearExchangeFromUrl, clearIntegrationSession, getBackendUrl, getIntegrationSession, integrationRequest, readExchangeCode, saveIntegrationSession, setBackendUrl, startKickOAuth } from '../lib/integration'

interface StatusResponse {
  state: string
  missing?: string[]
  requiredScopes?: string[]
  missingScopes?: string[]
  connection?: Record<string, any>
  webhook?: { state: string; endpoint: string; subscriptions: Array<Record<string, any>>; error?: string | null }
  donation?: { state: string; message: string }
  callbackUrl?: string
  webhookUrl?: string
}

const badgeClass = (state: string) => `status-pill status-${state.toLowerCase().replace('_', '-')}`

export function Integrations() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [backend, setBackend] = useState(getBackendUrl())
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const session = getIntegrationSession()

  async function refresh() {
    setError('')
    try {
      const activeSession = getIntegrationSession()
      const result = activeSession ? await integrationRequest<StatusResponse>('/api/integrations/kick') : await integrationRequest<StatusResponse>('/api/setup', {}, false)
      setStatus(result)
    } catch (cause) { setStatus({ state: 'ERROR' }); setError(cause instanceof Error ? cause.message : 'Integration service unavailable') }
  }

  useEffect(() => {
    const exchange = readExchangeCode(params.toString(), window.location.hash, window.location.search)
    if (!exchange) { void refresh(); return }
    setBusy(true)
    integrationRequest<any>('/api/auth/session', { method: 'POST', body: JSON.stringify({ code: exchange }) }, false)
      .then((result) => {
        saveIntegrationSession({ managementToken: result.managementToken, connectionId: result.connection.id, runtimeKey: result.connection.runtimeKey, channelName: result.connection.channel?.slug || result.connection.account?.username || 'Kick' })
        clearExchangeFromUrl()
        navigate('/integrations', { replace: true })
        return refresh()
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'OAuth session exchange failed'))
      .finally(() => setBusy(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function action(path: string, body?: object) {
    setBusy(true); setError('')
    try { await integrationRequest(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }); await refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Action failed') }
    finally { setBusy(false) }
  }

  async function disconnect() {
    await action('/api/integrations/kick/disconnect')
    clearIntegrationSession(); setStatus({ state: 'DISCONNECTED' })
  }

  const connection = status?.connection
  const viewer = connection?.viewer
  return (
    <AppShell>
      <main className="integrations-page">
        <section className="integration-hero persian-surface">
          <div className="ornament-medallion"><Link2 /></div>
          <div><span className="fa-kicker">درگاه‌های زنده</span><h1>Live integrations</h1><p>Secure, official event delivery for your OBS composition.</p></div>
          <span className={badgeClass(status?.state || 'DISCONNECTED')}>{status?.state || 'DISCONNECTED'}</span>
        </section>
        {error && <div className="error-banner"><AlertTriangle /> {error}</div>}
        <div className="integration-layout">
          <section className="integration-main-card persian-surface">
            <header><div className="kick-logo">K</div><div><h2>Kick Developer API</h2><p>OAuth 2.1 + PKCE · signed webhooks · server-side tokens</p></div><span className={badgeClass(status?.state || 'DISCONNECTED')}>{status?.state || 'DISCONNECTED'}</span></header>
            {connection ? (
              <>
                <div className="account-identity">
                  <div className="account-avatar">{connection.account?.avatar ? <img src={connection.account.avatar} alt="" /> : String(connection.account?.username || 'K')[0]}</div>
                  <div><strong>{connection.account?.username}</strong><span>kick.com/{connection.channel?.slug || connection.account?.username}</span></div>
                  <div className="sync-copy"><small>Last sync</small><strong>{connection.lastSyncAt ? new Date(connection.lastSyncAt).toLocaleString() : 'Not yet'}</strong></div>
                </div>
                <div className="integration-stats">
                  <article><Radio /><span><small>Viewer data</small><strong>{viewer?.status === 'live' ? `${viewer.count} live` : viewer?.status || 'Unavailable'}</strong><em>{viewer?.updatedAt ? new Date(viewer.updatedAt).toLocaleTimeString() : 'No poll yet'}</em></span></article>
                  <article><MessageSquare /><span><small>Last real chat</small><strong>{connection.lastChatUser || 'None received'}</strong><em>{connection.lastChatAt ? new Date(connection.lastChatAt).toLocaleTimeString() : 'Webhooks start now'}</em></span></article>
                  <article><Users /><span><small>Latest follower</small><strong>{connection.lastFollower?.username || 'None received'}</strong><em>{connection.sessionFollowerCount || 0} this connection</em></span></article>
                  <article><Activity /><span><small>Last event</small><strong>{connection.lastEventType || 'None received'}</strong><em>{connection.lastEventAt ? new Date(connection.lastEventAt).toLocaleTimeString() : 'Waiting'}</em></span></article>
                </div>
                <div className="scope-list"><h3>Granted permissions</h3>{connection.scopes?.map((scope: string) => <span key={scope}><Check />{scope}</span>)}{status?.missingScopes?.map((scope) => <span className="missing" key={scope}><AlertTriangle />{scope}</span>)}</div>
                <div className="integration-actions"><button className="secondary-button" disabled={busy} onClick={() => action('/api/integrations/kick/resubscribe')}><RefreshCw /> Resubscribe webhooks</button><button className="danger-button" disabled={busy} onClick={disconnect}><Unplug /> Disconnect & revoke</button></div>
              </>
            ) : (
              <div className="connect-panel">
                <ShieldCheck /><h3>Connect without exposing credentials</h3><p>You will sign in on Kick. The client secret, access token, and refresh token stay encrypted on the integration server and never enter this browser or an overlay URL.</p>
                {status?.missing?.length ? <div className="setup-missing"><strong>Backend setup required</strong>{status.missing.map((item) => <code key={item}>{item}</code>)}</div> : <button className="kick-connect-button" disabled={busy} onClick={startKickOAuth}>Connect Kick account <ExternalLink /></button>}
              </div>
            )}
          </section>
          <aside className="integration-side">
            <section className="integration-card persian-surface"><header><Webhook /><div><h3>Webhook delivery</h3><p>Official signed event subscriptions</p></div><span className={badgeClass(status?.webhook?.state || 'SETUP_REQUIRED')}>{status?.webhook?.state || 'SETUP REQUIRED'}</span></header><div className="endpoint-box"><small>Public endpoint</small><code>{status?.webhook?.endpoint || status?.webhookUrl || 'Backend unavailable'}</code></div><p>{status?.webhook?.subscriptions?.length || 0} active subscriptions</p>{status?.webhook?.error && <div className="mini-error">{status.webhook.error}</div>}</section>
            <section className="integration-card persian-surface"><header><Zap /><div><h3>Safe test events</h3><p>Always marked TEST — never presented as real</p></div></header><div className="test-event-grid"><button disabled={!session || busy} onClick={() => action('/api/integrations/test-event', { type: 'chat.message.sent' })}>Test chat</button><button disabled={!session || busy} onClick={() => action('/api/integrations/test-event', { type: 'channel.followed' })}>Test follow</button><button disabled={!session || busy} onClick={() => action('/api/integrations/test-event', { type: 'channel.subscription.new' })}>Test sub</button><button disabled={!session || busy} onClick={() => action('/api/integrations/test-event', { type: 'kicks.gifted' })}>Test KICKs</button></div></section>
            <section className="integration-card persian-surface"><header><Activity /><div><h3>Donation provider</h3><p>Adapter boundary</p></div><span className={badgeClass(status?.donation?.state || 'SETUP_REQUIRED')}>{status?.donation?.state || 'SETUP REQUIRED'}</span></header><p>{status?.donation?.message || 'No provider selected. Manual amounts are not verified payments.'}</p></section>
          </aside>
        </div>
        <section className="backend-config persian-surface"><div><h3>Integration server</h3><p>GitHub Pages hosts only the UI. OAuth and webhook delivery require this separate public HTTPS endpoint.</p></div><label><span>Backend URL</span><input value={backend} onChange={(event) => setBackend(event.target.value)} /></label><button className="secondary-button" onClick={() => { setBackendUrl(backend); void refresh() }}>Save & check</button><button className="icon-button" title="Copy callback URL" onClick={() => { void navigator.clipboard.writeText(`${backend}/api/auth/kick/callback`); setCopied(true) }}>{copied ? <Check /> : <Copy />}</button></section>
      </main>
    </AppShell>
  )
}
