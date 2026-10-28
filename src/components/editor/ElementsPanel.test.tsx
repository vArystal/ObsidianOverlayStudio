import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from '../../lib/elements'
import { ElementsPanel } from './ElementsPanel'

const props = () => ({
  elements: [createElement('text')],
  selectedId: null as string | null,
  onAdd: vi.fn(),
  onSelect: vi.fn(),
  onToggleVisible: vi.fn(),
  onToggleLock: vi.fn(),
  onRename: vi.fn(),
  onMoveLayer: vi.fn(),
  onDuplicate: vi.fn(),
  onDelete: vi.fn(),
  onUploadAsset: vi.fn(),
  onUploadBackground: vi.fn(),
})

afterEach(cleanup)

describe('editor panel tabs', () => {
  it('exposes a real tablist so a screen reader can navigate the panels', () => {
    render(<ElementsPanel {...props()} />)
    const tablist = screen.getByRole('tablist')
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[1].getAttribute('aria-selected')).toBe('false')
    // Panels mount on demand, so the selected tab's panel must exist and point back at it.
    for (const tab of tabs) expect(tab.getAttribute('aria-controls')).toBeTruthy()
    const activePanel = document.querySelector('[role="tabpanel"]')!
    expect(activePanel.getAttribute('id')).toBe(tabs[0].getAttribute('aria-controls'))
    expect(activePanel.getAttribute('aria-labelledby')).toBe(tabs[0].id)
    expect(tablist.getAttribute('aria-label')).toBeTruthy()
  })

  it('switches panels with the arrow keys and moves focus with them', () => {
    render(<ElementsPanel {...props()} />)
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: /layers/i }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /layers/i }))
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: /elements/i }).getAttribute('aria-selected')).toBe('true')
  })
})
