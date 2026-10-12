import { Quaternion, Vector3 } from 'three'

/** A virtual trackball. Outside the silhouette, stay on its equator so a
 * captured drag continues smoothly without snapping or losing the pointer. */
export function trackballPoint(x: number, y: number, radius: number): Vector3 {
  const point = new Vector3(x / radius, -y / radius, 0)
  const length = point.lengthSq()
  if (length <= 1) point.z = Math.sqrt(1 - length)
  else point.normalize()
  return point
}

export const SPIN_FRICTION = 5.5
export const MAX_SPIN_SPEED = 5
const coastStep = new Quaternion()

/** Exact exponential decay: the release feels the same at different FPS. */
export function coastRotation(
  rotation: Quaternion,
  axis: Vector3,
  speed: number,
  delta: number
): number {
  const decay = Math.exp(-SPIN_FRICTION * delta)
  const angle = (speed * (1 - decay)) / SPIN_FRICTION
  rotation.premultiply(coastStep.setFromAxisAngle(axis, angle)).normalize()
  return speed * decay
}
