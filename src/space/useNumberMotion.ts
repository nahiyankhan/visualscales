import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { project, type Camera } from './camera.js'

type NumberLabel = {
  node: HTMLElement
  value: number
  y: number
  width: number
  opacity: string
  transform: string
  font: string
  color: string
}
type Departure = {
  anchor: HTMLElement
  node: HTMLElement
  value: number
  animation: Animation
  y: number
}

// Presentation only: x always follows the live camera. Motion belongs to the
// numbers, never the measuring ticks, density engravings, or button hit areas.
export function useNumberMotion(
  ruler: RefObject<HTMLDivElement | null>,
  camera: Camera,
  width: number,
  keyboard: boolean
) {
  const previous = useRef(new Map<string, NumberLabel>())
  const departures = useRef(new Map<string, Departure>())
  const animations = useRef(new Map<HTMLElement, Animation>())
  const initialized = useRef(false)
  const lastWidth = useRef(width)
  const finish = () => {
    for (const animation of animations.current.values()) animation.cancel()
    animations.current.clear()
    for (const label of previous.current.values()) {
      label.opacity = '1'
      label.transform = 'none'
    }
    for (const departure of departures.current.values()) {
      departure.animation.cancel()
      departure.anchor.remove()
    }
    departures.current.clear()
  }

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const interrupt = () => finish()
    const visibility = () => {
      if (document.hidden) finish()
    }
    media.addEventListener('change', interrupt)
    window.addEventListener('blur', interrupt)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      finish()
      previous.current.clear()
      initialized.current = false
      media.removeEventListener('change', interrupt)
      window.removeEventListener('blur', interrupt)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])

  useLayoutEffect(() => {
    const root = ruler.current
    if (!root) return
    const instant =
      keyboard ||
      lastWidth.current !== width ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    lastWidth.current = width
    if (instant) finish()
    const easing = getComputedStyle(root)
      .getPropertyValue('--space-ease')
      .trim()
    const current = new Map<string, NumberLabel>()
    const rulerY = root.getBoundingClientRect().y
    const animate = (node: HTMLElement, transform: string, opacity: string) => {
      animations.current.get(node)?.cancel()
      const animation = node.animate(
        [
          { transform, opacity },
          { transform: 'translateY(0px)', opacity: 1 },
        ],
        { duration: 180, easing }
      )
      animations.current.set(node, animation)
      animation.onfinish = () => {
        if (animations.current.get(node) !== animation) return
        animations.current.delete(node)
        for (const label of previous.current.values()) {
          if (label.node !== node) continue
          label.opacity = '1'
          label.transform = 'none'
        }
      }
    }
    for (const node of root.querySelectorAll<HTMLElement>(
      '[data-number-key]'
    )) {
      const key = node.dataset.numberKey!
      const value = Number(node.dataset.numberValue)
      const style = getComputedStyle(node)
      const y =
        node.getBoundingClientRect().y -
        rulerY -
        new DOMMatrixReadOnly(style.transform).m42
      const old = previous.current.get(key)
      const returning = departures.current.get(key)
      if (!instant && initialized.current) {
        if (returning) {
          // Reverse from the departing number's live presentation, not zero.
          const presentation = getComputedStyle(returning.node)
          const offset = new DOMMatrixReadOnly(presentation.transform).m42
          animate(
            node,
            `translateY(${returning.y - y + offset}px)`,
            presentation.opacity
          )
        } else if (!old) animate(node, 'translateY(-6px)', '0')
        else if (Math.abs(old.y - y) > 0.1) {
          const offset = new DOMMatrixReadOnly(style.transform).m42
          animate(node, `translateY(${old.y - y + offset}px)`, style.opacity)
        }
      }
      if (returning) {
        returning.animation.cancel()
        returning.anchor.remove()
        departures.current.delete(key)
      }
      const presentation = getComputedStyle(node)
      current.set(key, {
        node,
        value,
        y,
        width: node.getBoundingClientRect().width,
        opacity: presentation.opacity,
        transform: presentation.transform,
        font: presentation.font,
        color: presentation.color,
      })
    }
    for (const [key, old] of previous.current) {
      if (current.has(key)) continue
      animations.current.get(old.node)?.cancel()
      animations.current.delete(old.node)
      if (instant) continue
      const anchor = document.createElement('div')
      anchor.className = 'space-number-departure'
      anchor.setAttribute('aria-hidden', 'true')
      anchor.inert = true
      anchor.style.top = `${old.y}px`
      const node = old.node.cloneNode(true) as HTMLElement
      node.removeAttribute('data-number-key')
      node.style.width = `${old.width}px`
      node.style.marginLeft = `${-old.width / 2}px`
      node.style.font = old.font
      node.style.color = old.color
      anchor.append(node)
      root.append(anchor)
      const animation = node.animate(
        [
          { transform: old.transform, opacity: old.opacity },
          { transform: 'translateY(-6px)', opacity: 0 },
        ],
        { duration: 140, easing }
      )
      const departure = { anchor, node, value: old.value, animation, y: old.y }
      departures.current.set(key, departure)
      animation.onfinish = () => {
        if (departures.current.get(key) !== departure) return
        anchor.remove()
        departures.current.delete(key)
      }
    }
    for (const departure of departures.current.values()) {
      departure.anchor.style.transform = `translateX(${project(departure.value, camera, width)}px)`
    }
    previous.current = current
    initialized.current = true
  })
}
