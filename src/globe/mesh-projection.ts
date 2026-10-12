export type MeshScreenPoint = { x: number; y: number }

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

/**
 * Projects an unrolled mesh point into centered screen coordinates.
 * flatness=0 matches the spherical WebGL path; flatness=1 is a z=0 screen plane.
 */
export function projectMeshPoint(x: number, y: number, radius: number, perspective: number, flatness = 0): MeshScreenPoint {
  const longitude = x / radius
  const latitude = y / radius
  const cl = Math.cos(latitude)
  const sphereX = radius * Math.sin(longitude) * cl
  const sphereY = radius * Math.sin(latitude)
  const sphereZ = radius * (Math.cos(longitude) * cl - 1)
  const f = clamp01(flatness)
  const px = sphereX * (1 - f) + x * f
  const py = sphereY * (1 - f) + y * f
  const pz = sphereZ * (1 - f)
  const factor = perspective / (perspective - pz)
  return { x: px * factor, y: py * factor }
}
