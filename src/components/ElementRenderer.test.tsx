import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from '../lib/elements'
import { ElementRenderer } from './ElementRenderer'

afterEach(cleanup)

describe('widget preview boundaries', () => {
  it('labels sample chat in the editor and does not publish sample messages', () => {
    const chat = createElement('chat')
    const editor = render(<ElementRenderer element={chat} />)
    expect(screen.getByText(/SAMPLE ONLY/)).toBeTruthy()
    expect(screen.getByText(/قاب جدید/)).toBeTruthy()
    editor.unmount()

    const runtime = render(<ElementRenderer element={chat} runtime />)
    expect(runtime.queryByText(/قاب جدید/)).toBeNull()
    expect(runtime.container.textContent).toBe('')
  })

  it('does not render unconnected alerts in output', () => {
    const alert = createElement('alert')
    const { container } = render(<ElementRenderer element={alert} runtime />)
    expect(container.textContent).toBe('')
  })

  it('does not render preview donation totals unless explicitly enabled', () => {
    const goal = createElement('goal')
    const hidden = render(<ElementRenderer element={goal} runtime />)
    expect(hidden.container.textContent).toBe('')
    hidden.unmount()
    goal.props.includePreviewOutput = true
    render(<ElementRenderer element={goal} runtime />)
    expect(screen.getByText(/هدف حمایت/)).toBeTruthy()
  })

  it('renders Persian text with an explicit RTL direction', () => {
    const text = createElement('text')
    text.props.text = 'شروع پخش زنده'
    text.props.direction = 'rtl'
    render(<ElementRenderer element={text} />)
    const content = screen.getByText('شروع پخش زنده')
    expect(content.getAttribute('dir')).toBe('rtl')
  })
})
