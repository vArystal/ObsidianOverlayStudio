import type { CSSProperties } from 'react'
import type { BackgroundKind, Overlay, ThemeId } from '../types'
import { createElement, createEmptyOverlay } from './elements'
import { normalizeBackground } from './backgrounds'
import { THEMES } from './themes'

/**
 * CP51: a template is a starting composition, not a separate document format. It builds an ordinary overlay out of
 * the same constructors the editor uses, so anything a template contains can be edited, undone and deleted exactly
 * like hand-made work — and a template can never drift from the schema.
 */
export interface OverlayTemplate {
  id: string
  name: string
  blurb: string
  themeId: ThemeId
  background: BackgroundKind
}

export const OVERLAY_TEMPLATES: OverlayTemplate[] = [
  {
    id: 'rose-thorn',
    name: 'Rose & Thorn',
    blurb: 'Briar-dark panel, rose accent, vines climbing behind the title',
    themeId: 'rose-thorn',
    background: 'rose-vines',
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    blurb: 'Graphite panel, hairline rule, silver type over a calm gradient',
    themeId: 'obsidian',
    background: 'ambient-gradient',
  },
  {
    id: 'nocturne',
    name: 'Nocturne',
    blurb: 'Cocoa-bronze wash with a double rule, lit by drifting smoke',
    themeId: 'nocturne',
    background: 'smoke-drift',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    blurb: 'Cool slate panel, teal-silver accent, soft light overhead',
    themeId: 'aurora',
    background: 'aurora-flow',
  },
  {
    id: 'monolith',
    name: 'Monolith',
    blurb: 'Square slab, hard corner marks, high contrast against a lattice',
    themeId: 'monolith',
    background: 'neon-grid',
  },
]

/**
 * The title is the one element every template carries: a themed scene with nothing on it looks broken rather than
 * minimal, and the text uses the theme's own primary text colour so the preset is recognisable before any edit.
 */
export function buildTemplate(template: OverlayTemplate): Overlay {
  const overlay = createEmptyOverlay(template.name)
  const theme = THEMES[template.themeId]
  overlay.theme = structuredClone(theme)
  overlay.background = normalizeBackground({ enabled: true, kind: template.background })
  const title = createElement('text', 0)
  title.name = 'Title'
  title.x = 160
  title.y = 430
  title.width = 1200
  title.height = 150
  title.props = {
    ...title.props,
    text: template.name,
    color: theme.palette.text.primary,
    fontSize: 72,
    textAlign: 'left',
    direction: 'ltr',
  }
  overlay.elements = [title]
  return overlay
}

/** The card's static swatch: the preset's own accent and surfaces, so the gallery shows the theme it creates. */
export function templateSwatch(template: OverlayTemplate): CSSProperties {
  const { palette } = THEMES[template.themeId]
  return {
    backgroundImage: `radial-gradient(circle at 28% 22%, ${palette.accent.base}, transparent 62%), radial-gradient(circle at 78% 80%, ${palette.accent.soft}, transparent 56%), linear-gradient(150deg, ${palette.surface.raised}, ${palette.surface.base} 72%)`,
    borderColor: palette.border.hairline,
  }
}
