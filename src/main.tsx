import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { OverlayList } from './pages/OverlayList'
import { OverlayEditor } from './pages/OverlayEditor'
import { OverlayRuntime } from './pages/OverlayRuntime'
import './styles.css'

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/overlays" replace /> },
  { path: '/overlays', element: <OverlayList /> },
  { path: '/overlays/editor/:id', element: <OverlayEditor /> },
  { path: '/overlay/:publicId', element: <OverlayRuntime /> },
  { path: '*', element: <Navigate to="/overlays" replace /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
