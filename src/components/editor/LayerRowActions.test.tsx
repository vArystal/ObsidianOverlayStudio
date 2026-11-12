import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ElementsPanel } from './ElementsPanel'
import { createElement } from '../../lib/elements'

const base = {
  selectedId: null as string | null,
  onSelect: vi.fn(), onRename: vi.fn(), onToggleVisible: vi.fn(), onToggleLock: vi.fn(),
  onMoveLayer: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn(),
  onAdd: vi.fn(), onUploadAsset: vi.fn(), onUploadBackground: vi.fn(),
}

function setup(_name: string) {
  const elements = [createElement('container'), createElement('text')]
  elements[0].name = 'Container'
  elements[1].name = 'Headline'
  // Row actions only exist for the selected layer, so the fixture selects the container by its real id.
  render(<ElementsPanel {...base} elements={elements} selectedId={elements[0].id} />)
  fireEvent.click(screen.getByRole('tab', { name: /layers/i }))
  return elements
}

describe('CP22.1 layer row actions', () => {
  it('deletes the row that owns the button, not the selected neighbour', () => {
    const elements = setup('Container')
    const onDelete = base.onDelete
    onDelete.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Delete layer' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledWith(elements[0].id)
  })

  it('never nests a button inside a button', () => {
    // The old row was a <button> wrapping <button> actions; browsers retarget the click to the row, which is why
    // Delete only re-selected the element instead of removing it.
    const { container } = render(<ElementsPanel {...base} elements={[createElement('container')]} selectedId="x" />)
    fireEvent.click(screen.getByRole('tab', { name: /layers/i }))
    expect(container.querySelectorAll('button button').length).toBe(0)
  })

  it('keeps the row reachable and operable from the keyboard', () => {
    const elements = setup('Container')
    const row = screen.getByRole('button', { name: 'Container layer' })
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(base.onSelect).toHaveBeenCalledWith(elements[0].id)
  })
})

