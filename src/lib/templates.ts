import type { CSSProperties } from 'react'
import type { BackgroundKind, Overlay, OverlayTheme, ThemeId } from '../types'
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
 * Containers and chat read their colours from their own props, not from `--theme-*`, so a template has to copy the
 * palette into them. Doing it here is what makes "styled by the theme" true rather than a card that merely sets
 * `overlay.theme` while the widgets stay grey.
 */
function themedPanel(theme: OverlayTheme) {
  const panel = createElement('container', 0)
  panel.name = 'Panel'
  panel.x = 96
  panel.y = 280
  panel.width = 640
  panel.height = 420
  panel.props = {
    ...panel.props,
    preset: 'clean-frame',
    fill: 'gradient',
    fillColor: theme.palette.surface.raised,
    fillColor2: theme.palette.surface.sunken,
    fillOpacity: theme.chrome.panelOpacity,
    gradientAngle: 160,
    borderStyle: theme.chrome.borderWidth > 0 ? 'solid' : 'none',
    borderWidth: theme.chrome.borderWidth,
    borderColor: theme.palette.accent.base,
    borderOpacity: 0.42,
    radius: theme.chrome.radius,
    shadow: 'soft',
    inner: theme.chrome.innerBorder ? 'subtle' : 'none',
    blur: 0,
  }
  return panel
}

function themedChat(theme: OverlayTheme) {
  const chat = createElement('chat', 1)
  chat.name = 'Kick chat'
  chat.x = 1240
  chat.y = 88
  chat.width = 580
  chat.height = 640
  chat.props = {
    ...chat.props,
    textColor: theme.palette.text.primary,
    backgroundColor: theme.palette.surface.base,
    backgroundOpacity: theme.chrome.panelOpacity,
    borderRadius: theme.chrome.radius,
  }
  return chat
}

/**
 * Every template is the same three layers in the same place — a title, a panel and a chat column — so the gallery
 * compares palettes, not layouts. All of it is ordinary editable work once it lands in the editor.
 */
export function buildTemplate(template: OverlayTemplate): Overlay {
  const overlay = createEmptyOverlay(template.name)
  const theme = THEMES[template.themeId]
  overlay.theme = structuredClone(theme)
  overlay.background = normalizeBackground({ enabled: true, kind: template.background })
  const title = createElement('text', 0)
  title.name = 'Title'
  title.x = 96
  title.y = 88
  title.width = 1100
  title.height = 140
  title.props = {
    ...title.props,
    text: template.name,
    color: theme.palette.text.primary,
    fontSize: 64,
    textAlign: 'left',
    direction: 'ltr',
  }
  overlay.elements = [title, themedPanel(theme), themedChat(theme)]
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
