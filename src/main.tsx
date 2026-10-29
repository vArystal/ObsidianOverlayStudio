import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
import { OverlayList } from './pages/OverlayList'
import { OverlayEditor } from './pages/OverlayEditor'
import { OverlayRuntime } from './pages/OverlayRuntime'
import { Integrations } from './pages/Integrations'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles.css'
import './premium.css'
import './styles/studio.css'
// Loaded last: the botanical theme overrides panel surfaces, so it must win the cascade.
import './styles/thorn-rose.css'
import './styles/integrations-receipts.css'

const router = createHashRouter([
  { path: '/', element: <Navigate to="/overlays" replace /> },
  { path: '/overlays', element: <OverlayList /> },
  { path: '/overlays/editor/:id', element: <OverlayEditor /> },
  { path: '/integrations', element: <Integrations /> },
  { path: '/overlay/:publicId', element: <OverlayRuntime /> },
  { path: '*', element: <Navigate to="/overlays" replace /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
