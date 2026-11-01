import { createContext } from 'react'
import { DEFAULT_THORN_TUNING } from '../../lib/themes'
import type { ThornTuning } from '../../types'

/** The overlay's botanical tuning; frames read it directly, so no prop drilling through the renderer. */
export const ThornTuningContext = createContext<ThornTuning>(DEFAULT_THORN_TUNING)
