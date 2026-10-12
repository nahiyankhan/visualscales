export type Camera = { center: number; scale: number }
export const MIN_SCALE = 0.45
export const MAX_SCALE = 160
export const DEFAULT_CAMERA: Camera = { center: 16, scale: 30 }
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

export function project(value: number, camera: Camera, width: number) {
  return width / 2 + (value - camera.center) * camera.scale
}
export function unproject(x: number, camera: Camera, width: number) {
  return camera.center + (x - width / 2) / camera.scale
}
// Physical lengths begin at zero. The positive axis extends beyond the fixture
// so absence of tokens is legible. No fabricated values or collection wrapping.
export function constrain(camera: Camera): Camera {
  return {
    center: clamp(camera.center, 0, 1200),
    scale: clamp(camera.scale, MIN_SCALE, MAX_SCALE),
  }
}
export function pan(camera: Camera, pixels: number): Camera {
  return constrain({ ...camera, center: camera.center - pixels / camera.scale })
}
export function zoomAt(
  camera: Camera,
  factor: number,
  x: number,
  width: number
): Camera {
  const value = unproject(x, camera, width)
  const scale = clamp(camera.scale * factor, MIN_SCALE, MAX_SCALE)
  return constrain({ center: value - (x - width / 2) / scale, scale })
}
export function visibleRange(camera: Camera, width: number) {
  return {
    min: Math.max(0, unproject(0, camera, width)),
    max: Math.max(0, unproject(width, camera, width)),
  }
}
export function majorStep(scale: number) {
  const desired = 110 / scale
  const base = 10 ** Math.floor(Math.log10(desired))
  const multiple = [1, 2, 5, 10].find((value) => value * base >= desired) ?? 10
  return multiple * base
}
export function makeTicks(camera: Camera, width: number) {
  const major = majorStep(camera.scale)
  const minor = major / 5
  const start = Math.max(0, Math.ceil(unproject(-20, camera, width) / minor))
  const end = Math.floor(unproject(width + 20, camera, width) / minor)
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => {
    const index = start + i
    const value = Number((index * minor).toFixed(6))
    return { value, x: project(value, camera, width), major: index % 5 === 0 }
  })
}
export function glide(camera: Camera, velocity: number, seconds: number) {
  // Closed-form exponential drag so release travel is frame-rate independent.
  const decay = Math.exp(-seconds * 7)
  const next = pan(camera, (velocity * (1 - decay)) / 7)
  return {
    camera: next,
    velocity: next.center === camera.center ? 0 : velocity * decay,
  }
}
