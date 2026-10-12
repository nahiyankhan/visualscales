import type { MeasurementGroup } from './data.js'
import { project, type Camera } from './camera.js'

export type Stop = {
  groups: MeasurementGroup[]
  value: number
  x: number
  top: number
  clustered: boolean
}
export function layoutStops(
  groups: MeasurementGroup[],
  camera: Camera,
  width: number,
  focused?: number
): Stop[] {
  // Combine only unresolved *screen proximity*. A cluster always carries its
  // exact endpoints and opens on zoom. No midpoint is presented as a token.
  const batches: MeasurementGroup[][] = []
  for (const group of groups) {
    const previous = batches.at(-1)
    if (
      previous &&
      !(camera.scale >= 30 && group.value === focused) &&
      !(
        camera.scale >= 30 && previous.some((group) => group.value === focused)
      ) &&
      project(
        group.value - previous[0].value,
        { center: 0, scale: camera.scale },
        0
      ) < 74
    )
      previous.push(group)
    else batches.push([group])
  }
  const ends = [-Infinity, -Infinity]
  return batches
    .map((batch) => {
      const value = (batch[0].value + batch.at(-1)!.value) / 2
      const x = project(value, camera, width)
      let lane = ends.findIndex((end) => x - end > 128)
      if (lane === -1) lane = ends.indexOf(Math.min(...ends))
      ends[lane] = x
      return {
        groups: batch,
        value,
        x,
        top: 32 + lane * 64,
        clustered: batch.length > 1,
      }
    })
    .filter((stop) => stop.x > -100 && stop.x < width + 100)
}
