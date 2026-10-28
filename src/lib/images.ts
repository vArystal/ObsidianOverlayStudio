
/**
 * Image intake for overlays.
 *
 * Overlay media is stored inline as a data URL and then embedded again in the published snapshot
 * URL, which costs about 1.6 characters per source byte. A 1.5 MB logo therefore produces a 2.3 MB
 * URL, past Chromium's ~2 MB ceiling and far past Firefox's 64 KB one, so the browser source simply
 * never loads. Photos are downscaled and re-encoded here so a normal logo lands far under the limit.
 */

export const IMAGE_MAX_EDGE = 1920
export const IMAGE_TARGET_BYTES = 150_000
/** Layers are logos and avatars on a 1080p canvas; they do not need a 1920px edge. */
export const LAYER_MAX_EDGE = 1024
export const LAYER_TARGET_BYTES = 60_000
/** Firefox refuses URLs longer than 64 KB, so that is the first warning line. */
export const SNAPSHOT_WARN_CHARS = 60_000
/** Chromium aborts near 2 MB; keep headroom for the rest of the URL. */
export const SNAPSHOT_BLOCK_CHARS = 1_500_000

export interface OptimizedImage {
  dataUrl: string
  bytes: number
  width: number
  height: number
  originalBytes: number
  changed: boolean
  note: string
}

/** Decoded byte length of a data URL payload, without allocating a copy of the string. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return 0
  const payload = dataUrl.length - comma - 1
  return Math.floor((payload * 3) / 4) - (dataUrl.endsWith('==') ? 2 : dataUrl.endsWith('=') ? 1 : 0)
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

/**
 * How a published snapshot of this size will behave, in the browser that has to load it.
 * The levels drive the publish guard: a URL nobody can open must never be presented as success.
 */
export function snapshotBudget(chars: number): { level: 'ok' | 'warn' | 'blocked'; message: string } {
  if (chars > SNAPSHOT_BLOCK_CHARS) {
    return { level: 'blocked', message: `This snapshot is ${formatBytes(chars)}. Chromium refuses URLs near 2 MB, so OBS could not open it. Reduce or remove large images and publish again.` }
  }
  if (chars > SNAPSHOT_WARN_CHARS) {
    return { level: 'warn', message: `This URL is ${formatBytes(chars)}. Chromium and OBS can load it, but Firefox stops at 64 KB. Prefer smaller images.` }
  }
  return { level: 'ok', message: `URL size ${formatBytes(chars)}.` }
}

function loadBitmap(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).then((bitmap) => ({ source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }))
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) })
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')) }
    image.src = url
  })
}

/**
 * Downscale to at most `maxEdge` and re-encode as WebP, dropping quality then dimensions until the
 * payload fits the target. Already-small files are returned untouched so a crisp logo is not
 * re-compressed for no reason.
 */
export async function optimizeImage(file: File, options: { maxEdge?: number; targetBytes?: number } = {}): Promise<OptimizedImage> {
  const maxEdge = options.maxEdge ?? IMAGE_MAX_EDGE
  const targetBytes = options.targetBytes ?? IMAGE_TARGET_BYTES
  const originalBytes = file.size
  const bitmap = await loadBitmap(file)
  try {
    let scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const unchanged = scale === 1 && originalBytes <= targetBytes
    if (unchanged) {
      const dataUrl = await fileToDataUrl(file)
      return { dataUrl, bytes: originalBytes, width: bitmap.width, height: bitmap.height, originalBytes, changed: false, note: `${formatBytes(originalBytes)} kept as-is` }
    }
    let best = { dataUrl: '', bytes: Number.POSITIVE_INFINITY, width: bitmap.width, height: bitmap.height }
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('This browser cannot resize images.')
      context.imageSmoothingQuality = 'high'
      context.drawImage(bitmap.source, 0, 0, width, height)
      for (const quality of [0.9, 0.8, 0.7, 0.6]) {
        const dataUrl = canvas.toDataURL('image/webp', quality)
        // Browsers without WebP silently return PNG, which is much heavier; keep looking.
        const bytes = dataUrlBytes(dataUrl)
        if (bytes < best.bytes) best = { dataUrl, bytes, width, height }
        if (bytes <= targetBytes) break
      }
      if (best.bytes <= targetBytes) break
      scale *= 0.7
    }
    return {
      dataUrl: best.dataUrl,
      bytes: best.bytes,
      width: best.width,
      height: best.height,
      originalBytes,
      changed: true,
      note: `Optimized ${formatBytes(originalBytes)} → ${formatBytes(best.bytes)} (${best.width}×${best.height})`,
    }
  } finally {
    bitmap.release()
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsDataURL(file)
  })
}
