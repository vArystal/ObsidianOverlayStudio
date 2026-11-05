export type ElementType =
  | 'text'
  | 'image'
  | 'webcam'
  | 'capture'
  | 'chat'
  | 'alert'
  | 'goal'
  | 'shape'
  | 'container'
  | 'frame'
  | 'counter'
  | 'countdown'
  | 'supporter'
  | 'viewerCount'
  | 'sessionFollowers'
  | 'latestFollower'

export type AnimationType = 'none' | 'fade' | 'slide' | 'scale' | 'pop' | 'ornamental'
export type IdleAnimationType = 'none' | 'shimmer' | 'glow' | 'float' | 'sparkle'
export type AnimationDirection = 'up' | 'down' | 'left' | 'right'
export type TextDirection = 'ltr' | 'rtl' | 'auto'
export type ThemeId = 'obsidian' | 'nocturne' | 'aurora' | 'monolith'
export type DecorationPresetId = 'none' | 'royal-panel' | 'turquoise-panel' | 'imperial-card' | 'esports-line' | 'ornamental-frame' | 'thorn-vine'

export interface OverlayAnimation {
  /** Entrance effect. `type` is retained for backward-compatible saved overlays. */
  type: AnimationType
  exit: AnimationType
  idle: IdleAnimationType
  duration: number
  exitDuration: number
  delay: number
  direction: AnimationDirection
  easing: 'ease' | 'ease-out' | 'ease-in-out' | 'linear'
  intensity: number
  holdDuration: number
  reducedMotion: 'respect' | 'static'
}

export interface ElementDecoration {
  enabled: boolean
  preset: DecorationPresetId
  inheritTheme: boolean
  borderVisible: boolean
  borderWidth: number
  borderColor: string
  borderOpacity: number
  radius: number
  innerBorder: boolean
  innerBorderColor: string
  innerBorderOpacity: number
  cornerOrnaments: boolean
  separator: boolean
  backgroundColor: string
  backgroundOpacity: number
  gradient: boolean
  pattern: 'none' | 'girih' | 'eslimi' | 'diamonds'
  shadow: boolean
  glow: boolean
  highlight: boolean
  padding: number
}

export interface OverlayElement {
  id: string
  type: ElementType
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  visible: boolean
  locked: boolean
  includeInOutput: boolean
  maintainAspectRatio: boolean
  animation: OverlayAnimation
  decoration: ElementDecoration
  props: Record<string, string | number | boolean | null>
}

export type ThemeTexture = 'none' | 'grid' | 'grain' | 'hatch' | 'sheen' | 'aurora'


export type LegacyThemeId = 'royal-persian' | 'persian-turquoise' | 'imperial-night' | 'minimal-esports' | 'thorn-rose'


/** Per-theme chrome. Colour alone cannot separate four dark presets, so geometry and material do the work. */
export interface ThemeChrome {
  radius: number
  borderWidth: number
  texture: ThemeTexture
  /** Small labels set in wide uppercase: part of a theme's voice, not a global style. */
  uppercaseLabels: boolean
  innerBorder: boolean
  cornerOrnaments: boolean
  /** Fill strength of a widget panel, kept high enough to stay legible over bright gameplay. */
  panelOpacity: number
}

/**
 * The full palette a theme owns. Layers of the app and of the overlay read the same token names, so a
 * published overlay and its editor preview cannot drift apart.
 */
export interface ThemePalette {
  surface: { base: string; raised: string; sunken: string; overlay: string }
  accent: { base: string; soft: string; strong: string }
  border: { hairline: string; strong: string; focus: string }
  text: { primary: string; secondary: string; muted: string; inverse: string }
  state: { hover: string; selected: string; disabled: string }
  depth: { raised: string; floating: string; inset: string; glow: string }
}

export interface OverlayTheme {
  id: ThemeId
  name: string
  nameFa: string
  chrome: ThemeChrome
  palette: ThemePalette
  /** Flat mirrors of the palette, kept so element renderers and saved data keep working unchanged. */
  primary: string
  secondary: string
  accent: string
  accentSoft: string
  surface: string
  surfaceAlt: string
  text: string
  muted: string
  glow: string
  pattern: ElementDecoration['pattern']
}

export interface LiveIntegrationConfig {
  backendUrl: string
  runtimeKey: string
  connectionId: string
  channelName: string
}

export type BackgroundKind = 'none' | 'aurora-flow' | 'liquid-light' | 'cinematic-particles' | 'neon-grid' | 'deep-space' | 'ambient-gradient'

/**
 * The overlay's global backdrop. It lives on the document, never in `elements`, so it cannot be dragged,
 * selected, reordered or counted as a layer, and it is independent of the theme.
 */
export interface OverlayBackground {
  enabled: boolean
  kind: BackgroundKind
  primary: string
  secondary: string
  accent: string
  opacity: number
  speed: number
  intensity: number
  blur: number
  density: number
  scale: number
  paused: boolean
}

export interface CanvasSettings {
  showGrid: boolean
  snap: boolean
  showSafeArea: boolean
  transparent: boolean
  backgroundImage: string | null
}


export interface Overlay {
  id: string
  publicId: string
  name: string
  width: number
  height: number
  elements: OverlayElement[]
  background: OverlayBackground
  settings: CanvasSettings
  theme: OverlayTheme
  staticMotion: boolean
  live: LiveIntegrationConfig | null
  createdAt: string
  updatedAt: string
  publishedAt: string | null
}

export interface Guide {
  axis: 'x' | 'y'
  value: number
}

export interface StorageResult<T> {
  ok: boolean
  value?: T
  error?: string
}

export type IntegrationState = 'CONNECTED' | 'DISCONNECTED' | 'SETUP_REQUIRED' | 'PERMISSION_MISSING' | 'STALE_DATA' | 'ERROR'

export interface LiveChatMessage {
  id: string
  username: string
  content: string
  avatar: string | null
  usernameColor: string | null
  badges: Array<{ type: string; text: string; count?: number }>
  createdAt: string
  test: boolean
}

export interface LiveOverlayEvent {
  id: string
  type: string
  receivedAt: string
  test: boolean
  data: Record<string, unknown>
}

export interface ViewerMetric {
  status: 'live' | 'offline' | 'stale' | 'unavailable'
  count: number | null
  updatedAt: string | null
}
