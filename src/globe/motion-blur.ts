// Perceptual motion cue only; these values never reach the vertex shader.
export type BlurState = { x: number; y: number }
export const MAX_BLUR_PX = 24 // full trail length, not radius; at most 12px on either side
export const createBlur = (): BlurState => ({ x: 0, y: 0 })
export const resetBlur = (state: BlurState) => { state.x = state.y = 0 }
export const blurActive = (state: BlurState) => Boolean(state.x || state.y)

export function velocityBlur(vx: number, vy: number): BlurState {
  const speed = Math.hypot(vx, vy)
  // A small dead zone keeps precision adjustments sharp.
  const length = MAX_BLUR_PX * Math.tanh(Math.max(0, speed - 100) / 700)
  return speed ? { x: vx / speed * length, y: vy / speed * length } : createBlur()
}

export function stepBlur(state: BlurState, target: BlurState, dt: number) {
  const response = 1 - Math.exp(-dt / 0.045)
  state.x += (target.x - state.x) * response
  state.y += (target.y - state.y) * response
  if (!target.x && !target.y && Math.hypot(state.x, state.y) < 0.025) resetBlur(state)
}
