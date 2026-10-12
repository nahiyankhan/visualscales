import { easeOutCubic } from '../globe/transitions.js'

// One entrance for the finished globe, with no material or background phases.
export const SPLIT_INTRO_DURATION_MS = 800

export function sampleSplitIntro(time: number) {
  const emerge = easeOutCubic(Math.max(0, Math.min(1, time / SPLIT_INTRO_DURATION_MS)))
  return {
    emerge,
    scale: 0.92 + emerge * 0.08,
    done: time >= SPLIT_INTRO_DURATION_MS,
  }
}
