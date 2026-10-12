import { useEffect, type RefObject } from 'react'

/** Alternating horizontal row entrances; camera and hit areas stay exact. */
export function useSpaceIntro(ruler: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const surface = ruler.current!
    const root = surface.closest<HTMLElement>('.space-atlas')!
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const animations = new Set<Animation>()
    const easing = getComputedStyle(root)
      .getPropertyValue('--space-ease')
      .trim()
    let firstFrame = 0
    let readyFrame = 0
    let done = false
    let started = false
    let width = 0
    let height = 0

    const finish = () => {
      if (done) return
      done = true
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(readyFrame)
      // The underlying DOM is already at its exact measuring position. Removing
      // presentation effects snaps there before the input changes the camera.
      for (const animation of animations) animation.cancel()
      animations.clear()
      // Resolve the pending startup height before restoring the normal
      // selection transition, so interruption never eases ruler geometry.
      void surface.getBoundingClientRect()
      root.dataset.intro = 'done'
    }
    const hidden = () => {
      if (document.hidden) finish()
    }
    const resized = () => {
      if (!started || done) return
      const bounds = root.getBoundingClientRect()
      if (bounds.width !== width || bounds.height !== height) finish()
    }
    const animate = (
      node: HTMLElement,
      kind: string,
      keys: Keyframe[],
      duration: number,
      delay: number,
      origin: string
    ) => {
      const animation = node.animate(
        keys.map((key) => ({ ...key, transformOrigin: origin })),
        {
          duration,
          delay,
          easing,
          fill: 'both',
        }
      )
      animation.id = `space-intro-${kind}`
      animations.add(animation)
      animation.onfinish = () => {
        animation.cancel()
        animations.delete(animation)
        if (!animations.size) finish()
      }
    }
    const start = () => {
      if (done || media.matches || document.hidden) {
        finish()
        return
      }
      const bounds = root.getBoundingClientRect()
      width = bounds.width
      height = bounds.height
      if (!width || !height) {
        finish()
        return
      }
      // ResizeObserver delivery and React's commit can straddle startup frames.
      // Never snapshot the default desktop projection on a smaller viewport.
      if (Number(surface.dataset.width) !== width) {
        readyFrame = requestAnimationFrame(start)
        return
      }
      started = true
      // The second startup frame normally sees the final viewport projection.
      void surface.getBoundingClientRect()
      // Rows travel from outside the viewport, like the color atlas entrance.
      // Only presentation children move; every button keeps its final hit area.
      const travel = width + 160
      const slide = (
        node: HTMLElement,
        kind: string,
        direction: -1 | 1,
        delay: number
      ) => {
        const base = node.style.transform
        animate(
          node,
          kind,
          [
            {
              transform: `${base} translateX(${direction * travel}px)`,
              opacity: 0,
            },
            { transform: base || 'none', opacity: 1 },
          ],
          800,
          delay,
          'center center'
        )
      }
      slide(
        surface.querySelector<HTMLElement>('.space-ruler-axis')!,
        'axis',
        -1,
        60
      )

      const landmarks = [
        ...surface.querySelectorAll<HTMLElement>('.space-landmark'),
      ]
      const lanes = [...new Set(landmarks.map((node) => node.offsetTop))].sort(
        (a, b) => a - b
      )
      // The top calibration row enters from the right. Under the ruler, lane
      // one enters from the left, lane two from the right, and so on. Stems
      // share their labels' direction and timing rather than hinging separately.
      const nodes = [
        ...surface.querySelectorAll<HTMLElement>(
          '.space-tick > i, .space-value-mark, .space-landmark-stem, .space-intro-label'
        ),
      ].map((node) => {
        const rect = node.getBoundingClientRect()
        return { node, x: rect.x + rect.width / 2 - bounds.x }
      })
      for (const { node, x } of nodes) {
        if (x < -20 || x > width + 20) continue
        const label = node.classList.contains('space-intro-label')
        const mark = node.classList.contains('space-value-mark')
        const stem = node.classList.contains('space-landmark-stem')
        const landmark = node.closest<HTMLElement>('.space-landmark')
        const lane = landmark ? lanes.indexOf(landmark.offsetTop) : -1
        const direction = landmark ? (lane % 2 === 0 ? -1 : 1) : mark ? -1 : 1
        const delay = landmark ? 120 + lane * 60 : mark ? 60 : 0
        slide(
          node,
          label ? 'label' : mark ? 'mark' : stem ? 'stem' : 'tick',
          direction,
          delay
        )
      }
      root.dataset.intro = 'running'
    }

    // Wait for the initial ResizeObserver camera dimensions to commit before
    // scheduling effects. Pending CSS prevents a fully visible first-frame flash.
    if (media.matches || document.hidden) finish()
    else
      firstFrame = requestAnimationFrame(() => {
        readyFrame = requestAnimationFrame(start)
      })
    const inputs = [
      'pointerdown',
      'wheel',
      'keydown',
      'focusin',
      'input',
      'click',
      'gesturestart',
    ] as const
    for (const event of inputs) root.addEventListener(event, finish, true)
    media.addEventListener('change', finish)
    window.addEventListener('blur', finish)
    window.addEventListener('pagehide', finish)
    window.addEventListener('resize', resized)
    document.addEventListener('visibilitychange', hidden)
    const observer = new ResizeObserver(resized)
    observer.observe(root)
    return () => {
      finish()
      observer.disconnect()
      for (const event of inputs) root.removeEventListener(event, finish, true)
      media.removeEventListener('change', finish)
      window.removeEventListener('blur', finish)
      window.removeEventListener('pagehide', finish)
      window.removeEventListener('resize', resized)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [ruler])
}
