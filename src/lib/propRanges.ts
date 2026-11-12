/**
 * CP39 — the numeric bands and enum spellings shared by storage, animation and typography.
 *
 * A leaf module on purpose: the typography normaliser needs the same bands as the registry normaliser, and having
 * either import the other would put the font registry and the widget registry in a cycle.
 */
/** Numeric bands that must match the inspector sliders, so a stored value is always one the UI can show again. */
export const NUMERIC_RANGES: Record<string, [number, number]> = {
  fontSize: [4, 400],
  headlineSize: [12, 64],
  messageSize: [12, 48],
  usernameSize: [8, 64],
  fontWeight: [100, 900],
  lineHeight: [0.6, 4],
  letterSpacing: [-40, 80],
  radius: [0, 200],
  borderRadius: [0, 400],
  borderWidth: [0, 20],
  padding: [0, 200],
  opacity: [0, 1],
  fillOpacity: [0, 1],
  backgroundOpacity: [0, 1],
  borderOpacity: [0, 1],
  intensity: [0.1, 1],
  volume: [0, 1],
  messageSpacing: [0, 60],
  maxMessages: [1, 20],
  messageDuration: [3, 300],
  minutes: [0, 1440],
  target: [1, 1_000_000_000],
  current: [0, 1_000_000_000],
  startValue: [0, 1_000_000_000],
  width: [16, 7680],
  height: [16, 4320],
}

/** Enum props keep the exact spellings the renderers switch on; anything else falls back to the default. */
export const ENUM_VALUES: Record<string, readonly string[]> = {
  direction: ['auto', 'rtl', 'ltr'],
  textAlign: ['left', 'center', 'right', 'justify'],
  contentAlign: ['', 'left', 'center', 'right'],
  dataSource: ['preview', 'kick', 'none'],
  layout: ['list', 'grid', 'cards'],
  entrance: ['none', 'fade', 'slide', 'ornamental'],
  exit: ['none', 'fade', 'slide', 'scale', 'pop', 'ornamental'],
  fit: ['contain', 'cover', 'fill'],
  shape: ['rectangle', 'ellipse', 'rounded'],
  scrolling: ['true', 'false'],
}
