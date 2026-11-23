import type { CSSProperties } from 'react'
import type { BackgroundKind, Overlay, OverlayTheme, ThemeId } from '../types'
import { createElement, createEmptyOverlay } from './elements'
import { normalizeBackground, themeBackground } from './backgrounds'
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
  /** `starter` is the shared title/panel/chat scene; `stream` is a full broadcast layout with capture regions. */
  layout?: 'starter' | 'stream'
}

export const OVERLAY_TEMPLATES: OverlayTemplate[] = [
  {
    id: 'rose-thorn',
    name: 'Rose & Thorn',
    blurb: 'Briar-dark panel, rose accent, vines climbing behind the title',
    themeId: 'rose-thorn',
    background: 'fluid-ink',
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    blurb: 'Graphite panel, hairline rule, silver type over a calm gradient',
    themeId: 'obsidian',
    background: 'css-orbs',
  },
  {
    id: 'nocturne',
    name: 'Nocturne',
    blurb: 'Cocoa-bronze wash with a double rule, lit by drifting smoke',
    themeId: 'nocturne',
    background: 'living-patterns',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    blurb: 'Cool slate panel, teal-silver accent, soft light overhead',
    themeId: 'aurora',
    background: 'aurora-mesh',
  },
  {
    id: 'monolith',
    name: 'Monolith',
    blurb: 'Square slab, hard corner marks, high contrast against a lattice',
    themeId: 'monolith',
    background: 'reactive-grid',
  },
  {
    id: 'stream-layout',
    name: 'Stream Layout',
    blurb: 'Full broadcast frame: game capture, webcam box, title bar and chat, all in Rose & Thorn',
    themeId: 'rose-thorn',
    background: 'fluid-ink',
    layout: 'stream',
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

function themedChat(theme: OverlayTheme, box = { x: 1240, y: 88, width: 580, height: 640 }) {
  const chat = createElement('chat', 1)
  chat.name = 'Kick chat'
  chat.x = box.x
  chat.y = box.y
  chat.width = box.width
  chat.height = box.height
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
 * Webcam and capture are guide regions: they carry a labelled box the streamer lines OBS up behind, so they are
 * excluded from output by default. Their border is themed here, because the props default to 0px and an invisible
 * guide box would make the layout look empty.
 */
function themedCapture(theme: OverlayTheme) {
  const capture = createElement('capture', 0)
  capture.name = 'Game capture'
  capture.x = 0
  capture.y = 0
  capture.width = 1420
  capture.height = 800
  capture.props = {
    ...capture.props,
    borderColor: theme.palette.accent.base,
    borderWidth: theme.chrome.borderWidth > 0 ? theme.chrome.borderWidth : 1,
    fillColor: theme.palette.surface.sunken,
    fillOpacity: 0.18,
  }
  return capture
}

function themedWebcam(theme: OverlayTheme) {
  const webcam = createElement('webcam', 1)
  webcam.name = 'Webcam frame'
  webcam.x = 48
  webcam.y = 500
  webcam.width = 400
  webcam.height = 225
  webcam.props = {
    ...webcam.props,
    shape: 'rounded',
    borderRadius: theme.chrome.radius,
    borderWidth: theme.chrome.borderWidth > 0 ? theme.chrome.borderWidth : 1,
    borderColor: theme.palette.accent.base,
    fillColor: theme.palette.surface.base,
    fillOpacity: theme.chrome.panelOpacity,
  }
  return webcam
}

/**
 * The five palette starters are the same three layers in the same place, so the gallery compares palettes rather
 * than layouts. The stream template opts into a broadcast arrangement instead: capture region at the back, webcam
 * inset over its lower-left, a title bar above it and chat down the right.
 */
export function buildTemplate(template: OverlayTemplate): Overlay {
  const overlay = createEmptyOverlay(template.name)
  const theme = THEMES[template.themeId]
  overlay.theme = structuredClone(theme)
  // The scene takes the template's palette, so "Rose & Thorn" opens on a rose briar rather than a preset's own blue.
  overlay.background = themeBackground(normalizeBackground({ enabled: true, kind: template.background }), theme)
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
  if (template.layout === 'stream') {
    title.name = 'Stream title'
    title.x = 48
    title.y = 32
    title.width = 900
    title.height = 84
    title.props = { ...title.props, fontSize: 44 }
    const chat = themedChat(theme, { x: 1460, y: 32, width: 420, height: 736 })
    overlay.elements = [themedCapture(theme), themedWebcam(theme), title, chat]
    return overlay
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
