import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Aperture, Layers3, Link2 } from 'lucide-react'

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/overlays" className="brand" aria-label="Obsidian Overlay Studio home">
          <span className="brand-mark"><Aperture size={18} /></span>
          <span><strong>OBSIDIAN</strong><small>OVERLAY STUDIO</small></span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link className={location.pathname.startsWith('/overlays') ? 'active' : ''} to="/overlays">
            <Layers3 size={17} /> Overlays
          </Link>
          <Link className={location.pathname.startsWith('/integrations') ? 'active' : ''} to="/integrations">
            <Link2 size={17} /> Integrations
          </Link>
        </nav>
        <div className="local-badge"><span /> LOCAL WORKSPACE</div>
      </header>
      {children}
    </div>
  )
}
