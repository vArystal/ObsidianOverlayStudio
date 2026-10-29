export type ElementType =
  | 'text'
  | 'image'
  | 'webcam'
  | 'capture'
  | 'chat'
  | 'alert'
  | 'goal'
  | 'shape'
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
export type ThemeId = 'royal-persian' | 'persian-turquoise' | 'imperial-night' | 'minimal-esports' | 'thorn-rose'
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

export interface OverlayTheme {
  id: ThemeId
  name: string
  nameFa: string
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
