import { useCallback, useEffect, useRef, useState } from 'react'
import {
  constrain,
  DEFAULT_CAMERA,
  glide,
  pan,
  zoomAt,
  type Camera,
} from './camera.js'

export function useCamera() {
  const [camera, setState] = useState<Camera>(DEFAULT_CAMERA)
  const live = useRef<Camera>(DEFAULT_CAMERA)
  const [size, setSize] = useState({ width: 1440, height: 1000 })
  const [dragging, setDragging] = useState(false)
  const viewport = useRef<HTMLDivElement>(null)
  const reduced = useRef(false)
  const animation = useRef(0)
  const ignoreClickRef = useRef(false)
  const stop = useCallback(() => {
    cancelAnimationFrame(animation.current)
    animation.current = 0
  }, [])
  const update = useCallback((value: Camera) => {
    const next = constrain(value)
    live.current = next
    setState(next)
  }, [])

  // A short center/zoom transition connects a pointer selection to its place
  // on the axis. It starts at the live camera and every input can interrupt it.
  const moveTo = useCallback(
    (target: Camera, immediate = false) => {
      stop()
      const next = constrain(target)
      if (immediate || reduced.current) {
        update(next)
        return
      }
      const from = live.current
      const start = performance.now()
      const frame = (now: number) => {
        const progress = Math.min(1, (now - start) / 240)
        const eased = 1 - (1 - progress) ** 3
        update({
          center: from.center + (next.center - from.center) * eased,
          scale: Math.exp(
            Math.log(from.scale) +
              (Math.log(next.scale) - Math.log(from.scale)) * eased
          ),
        })
        if (progress < 1) animation.current = requestAnimationFrame(frame)
        else animation.current = 0
      }
      animation.current = requestAnimationFrame(frame)
    },
    [stop, update]
  )

  useEffect(() => {
    const element = viewport.current!
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    reduced.current = media.matches
    const onMotion = () => {
      reduced.current = media.matches
      stop()
    }
    media.addEventListener('change', onMotion)
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect
      setSize({ width: rect.width, height: rect.height })
      stop()
    })
    observer.observe(element)
    let lastTime = 0,
      velocity = 0
    const pointers = new Map<number, { x: number; y: number }>()
    let originX = 0,
      originY = 0,
      previousX = 0,
      active = false
    let pinch: { distance: number; midpoint: number; camera: Camera } | null =
      null
    const measurePinch = () => {
      const [a, b] = [...pointers.values()]
      return {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        midpoint: (a.x + b.x) / 2,
      }
    }
    const reset = () => {
      pointers.clear()
      pinch = null
      active = false
      velocity = 0
      setDragging(false)
      stop()
    }
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || pointers.size >= 2) return
      stop()
      ignoreClickRef.current = false
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size === 2) {
        const metrics = measurePinch()
        pinch = { ...metrics, camera: live.current }
        for (const id of pointers.keys()) {
          if (element.hasPointerCapture(id)) continue
          try {
            element.setPointerCapture(id)
          } catch {
            /* Synthetic pointer events have no active native capture. */
          }
        }
        active = true
        ignoreClickRef.current = true
        setDragging(true)
      } else {
        originX = previousX = event.clientX
        originY = event.clientY
        lastTime = performance.now()
        velocity = 0
        active = false
      }
    }
    const onMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size === 2 && pinch) {
        const metrics = measurePinch()
        const rect = element.getBoundingClientRect()
        const zoomed = zoomAt(
          pinch.camera,
          metrics.distance / Math.max(1, pinch.distance),
          pinch.midpoint - rect.left,
          rect.width
        )
        update(pan(zoomed, metrics.midpoint - pinch.midpoint))
        return
      }
      const now = performance.now()
      const dx = event.clientX - previousX
      if (
        !active &&
        Math.hypot(event.clientX - originX, event.clientY - originY) > 6
      ) {
        active = true
        ignoreClickRef.current = true
        previousX = originX
        try {
          element.setPointerCapture(event.pointerId)
        } catch {
          /* No native capture for synthetic pointers. */
        }
        setDragging(true)
      }
      if (active) {
        const pixels = previousX === originX ? event.clientX - originX : dx
        update(pan(live.current, pixels))
        velocity = Math.max(
          -2400,
          Math.min(2400, pixels / Math.max(0.008, (now - lastTime) / 1000))
        )
      }
      if (active) {
        previousX = event.clientX
        lastTime = now
      }
    }
    const onUp = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return
      pointers.delete(event.pointerId)
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId)
      if (pointers.size) {
        const point = [...pointers.values()][0]
        pinch = null
        originX = previousX = point.x
        originY = point.y
        velocity = 0
        lastTime = performance.now()
        return
      }
      pinch = null
      setDragging(false)
      const releaseVelocity = performance.now() - lastTime > 90 ? 0 : velocity
      if (!active || reduced.current || Math.abs(releaseVelocity) < 40) {
        active = false
        return
      }
      active = false
      let speed = releaseVelocity,
        previous = performance.now()
      const frame = (now: number) => {
        const step = glide(
          live.current,
          speed,
          Math.min(0.064, (now - previous) / 1000)
        )
        previous = now
        speed = step.velocity
        update(step.camera)
        if (Math.abs(speed) > 12)
          animation.current = requestAnimationFrame(frame)
        else animation.current = 0
      }
      animation.current = requestAnimationFrame(frame)
    }
    const onLeave = (event: PointerEvent) => {
      if (!active) pointers.delete(event.pointerId)
    }
    const onCancel = () => {
      ignoreClickRef.current = true
      reset()
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      stop()
      const rect = element.getBoundingClientRect()
      const unit =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.width : 1
      if (event.ctrlKey || event.metaKey)
        update(
          zoomAt(
            live.current,
            Math.exp(
              Math.max(-0.7, Math.min(0.7, -event.deltaY * unit * 0.008))
            ),
            event.clientX - rect.left,
            rect.width
          )
        )
      else
        update(
          pan(
            live.current,
            -(Math.abs(event.deltaX) > Math.abs(event.deltaY)
              ? event.deltaX
              : event.deltaY) * unit
          )
        )
    }
    // Safari delivers pinch via GestureEvent rather than ctrl-wheel.
    let gestureCamera: Camera | null = null
    const onGestureStart = (event: Event) => {
      event.preventDefault()
      stop()
      gestureCamera = live.current
    }
    const onGestureChange = (event: Event) => {
      event.preventDefault()
      const gesture = event as Event & { scale: number; clientX: number }
      if (!gestureCamera || !Number.isFinite(gesture.scale)) return
      const rect = element.getBoundingClientRect()
      const x = Number.isFinite(gesture.clientX)
        ? gesture.clientX - rect.left
        : rect.width / 2
      update(zoomAt(gestureCamera, gesture.scale, x, rect.width))
    }
    const onGestureEnd = () => {
      gestureCamera = null
    }
    const onVisibility = () => {
      if (document.hidden) reset()
    }
    element.addEventListener('pointerdown', onDown)
    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerup', onUp)
    element.addEventListener('pointercancel', onCancel)
    element.addEventListener('pointerleave', onLeave)
    element.addEventListener('wheel', onWheel, { passive: false })
    element.addEventListener('gesturestart', onGestureStart, { passive: false })
    element.addEventListener('gesturechange', onGestureChange, {
      passive: false,
    })
    element.addEventListener('gestureend', onGestureEnd)
    window.addEventListener('blur', reset)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      reset()
      observer.disconnect()
      media.removeEventListener('change', onMotion)
      element.removeEventListener('pointerdown', onDown)
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerup', onUp)
      element.removeEventListener('pointercancel', onCancel)
      element.removeEventListener('pointerleave', onLeave)
      element.removeEventListener('wheel', onWheel)
      element.removeEventListener('gesturestart', onGestureStart)
      element.removeEventListener('gesturechange', onGestureChange)
      element.removeEventListener('gestureend', onGestureEnd)
      window.removeEventListener('blur', reset)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [stop, update])
  return {
    camera,
    live,
    size,
    viewport,
    dragging,
    ignoreClickRef,
    update,
    moveTo,
    stop,
  }
}
