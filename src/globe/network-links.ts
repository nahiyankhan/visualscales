/** Rounded-elbow relationship routing as an SVG path. Units are screen px.
 * Travel horizontally, turn in the target gutter, then enter its left edge.
 * Same-row branches share the horizontal trunk; no arrowheads or detours.
 */
export function roundedElbowPath(startX: number, startY: number, endX: number, endY: number, scale = 1): string {
  const dy = endY - startY
  if (Math.abs(dy) <= 5 * scale) return `M${startX},${startY} L${endX},${endY}`
  const direction = endX >= startX ? 1 : -1
  const vertical = dy > 0 ? 1 : -1
  // Clamp corners on small deltas: never overshoot or double back at zoom levels.
  const radius = Math.min(12 * scale, Math.abs(dy) / 2, Math.abs(endX - startX) / 4)
  const offset = Math.min(40 * scale, Math.abs(endX - startX) / 2)
  const bendX = endX - direction * offset
  return `M${startX},${startY} L${bendX - direction * radius},${startY}`
    + ` Q${bendX},${startY} ${bendX},${startY + vertical * radius}`
    + ` L${bendX},${endY - vertical * radius}`
    + ` Q${bendX},${endY} ${bendX + direction * radius},${endY}`
    + ` L${endX},${endY}`
}
