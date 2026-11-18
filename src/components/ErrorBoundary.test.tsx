import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

const Boom = ({ fail }: { fail: boolean }) => {
  if (fail) throw new Error('widget exploded')
  return <p>canvas content</p>
}

describe('error boundary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps a thrown widget from blanking the page and recovers without a reload', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(<ErrorBoundary scope="canvas"><Boom fail /></ErrorBoundary>)
    expect(screen.getByRole('alert').textContent).toContain('The canvas hit an error')
    expect(screen.getByText('widget exploded')).toBeTruthy()
    // Recovering re-renders the subtree in place: the composition is still in state, so nothing is lost.
    rerender(<ErrorBoundary scope="canvas"><Boom fail={false} /></ErrorBoundary>)
    fireEvent.click(screen.getByText('Try again'))
    expect(screen.getByText('canvas content')).toBeTruthy()
  })
})
