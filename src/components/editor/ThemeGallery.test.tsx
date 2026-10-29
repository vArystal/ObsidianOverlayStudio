import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { THEMES } from '../../lib/themes'
import { ThemeGallery } from './ThemeGallery'

afterEach(cleanup)

describe('theme gallery', () => {
  it('offers every theme with a thumbnail and marks the active one', () => {
    render(<ThemeGallery value="royal-persian" onChange={vi.fn()} />)
    const options = screen.getAllByRole('radio')
    expect(options).toHaveLength(Object.keys(THEMES).length)
    expect(screen.getByRole('radio', { name: 'Thorn & Rose theme' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('radio', { name: 'Royal Persian theme' }).getAttribute('aria-checked')).toBe('true')
  })

  it('selects the new theme by its stable id', () => {
    const onChange = vi.fn()
    render(<ThemeGallery value="royal-persian" onChange={onChange} />)
    screen.getByRole('radio', { name: 'Thorn & Rose theme' }).click()
    expect(onChange).toHaveBeenCalledWith('thorn-rose')
  })
})
