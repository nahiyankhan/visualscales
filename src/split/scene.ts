import * as THREE from 'three'
import { atlasPalette } from '../atlas/palette.js'
import { coastRotation, MAX_SPIN_SPEED, trackballPoint } from '../atlas/spin.js'
import { sampleSplitIntro, SPLIT_INTRO_DURATION_MS } from './intro.js'
import {
  floorFragment,
  floorVertex,
  sphereFragment,
  sphereVertex,
} from './shaders.js'

export interface SplitScene {
  setPaused(paused: boolean): void
  getLandingToken(): string
  dispose(preserveFrame?: boolean): void
}

export function createSplitScene(
  host: HTMLElement,
  spinControl: HTMLButtonElement,
  onFailure: () => void
): SplitScene {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  })
  let shaderFailed = false
  renderer.debug.onShaderError = () => {
    shaderFailed = true
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  renderer.setClearColor(0x111213, 1)
  renderer.domElement.setAttribute('aria-hidden', 'true')
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50)
  const uniforms = {
    uTime: { value: 0 },
    uViewport: { value: new THREE.Vector2(1, 1) },
    uProbe: { value: 0 },
    uEmerge: { value: 0 },
    // THREE.Color decodes the token's sRGB hex into linear RGB once, not per pixel.
    uPalette: {
      value: atlasPalette.map((swatch) => new THREE.Color(swatch.hex)),
    },
  }
  const sphereGeometry = new THREE.SphereGeometry(1.12, 96, 64)
  const sphereMaterial = new THREE.ShaderMaterial({
    vertexShader: sphereVertex,
    fragmentShader: sphereFragment,
    uniforms,
    transparent: true,
    depthWrite: false,
  })
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
  scene.add(sphere)

  const inverseRotation = new THREE.Matrix3()
  const rotationMatrix = new THREE.Matrix4()
  const floorGeometry = new THREE.PlaneGeometry(100, 100)
  const floorMaterial = new THREE.ShaderMaterial({
    vertexShader: floorVertex,
    fragmentShader: floorFragment,
    uniforms: {
      ...uniforms,
      uBackground: { value: new THREE.Color('#111213') },
      uInverseRotation: { value: inverseRotation },
    },
    depthWrite: false,
  })
  const floor = new THREE.Mesh(floorGeometry, floorMaterial)
  // Camera looks straight onto an XY surface: the entire viewport is ground.
  // No horizon, tilted plane, or perspective stage.
  floor.position.z = -1.55
  scene.add(floor)

  let frame = 0
  let disposed = false
  let paused = false
  let visible = !document.hidden
  let intersecting = true
  let previous = 0
  let elapsed = 0
  const app = host.closest<HTMLElement>('.split-app')!
  let introDone = app.dataset.intro === 'done'
  let introTime = introDone ? SPLIT_INTRO_DURATION_MS : 0
  app.dataset.intro = introDone ? 'done' : 'running'
  let distance = 6.25
  const spinAxis = new THREE.Vector3(0, 1, 0)
  const dragRotation = new THREE.Quaternion()
  const projectedCenter = new THREE.Vector3()
  let spinSpeed = 0
  let activePointer: number | null = null
  let lastPoint = new THREE.Vector3()
  let lastMove = 0
  let dragCenterX = 0
  let dragCenterY = 0
  let dragRadius = 1
  let viewportWidth = 0
  let viewportHeight = 0
  let previousControlBounds = ''
  let previousRotation = ''
  let startX = 0
  let startY = 0
  let dragDistance = 0
  let suppressClick = false

  function syncSpinControl() {
    const width = viewportWidth
    const height = viewportHeight
    projectedCenter.copy(sphere.position).project(camera)
    const centerX = ((projectedCenter.x + 1) * width) / 2
    const centerY = ((1 - projectedCenter.y) * height) / 2
    const radius = sphereGeometry.parameters.radius * sphere.scale.x
    const depth = camera.position.z - sphere.position.z
    // Angular silhouette radius, not the smaller radius of the center plane.
    const pixels =
      ((height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) *
        radius) /
      Math.sqrt(depth * depth - radius * radius)
    const left = (centerX - pixels).toFixed(2)
    const top = (centerY - pixels).toFixed(2)
    const diameter = (pixels * 2).toFixed(2)
    const bounds = `${left},${top},${diameter}`
    if (bounds === previousControlBounds) return
    previousControlBounds = bounds
    spinControl.style.left = `${left}px`
    spinControl.style.top = `${top}px`
    spinControl.style.width = `${diameter}px`
    spinControl.style.height = `${diameter}px`
  }

  function draw(delta = 0) {
    camera.position.set(0, 0, distance)
    camera.lookAt(0, 0, 0)
    const intro = sampleSplitIntro(introTime)
    sphere.scale.setScalar(1.12 * intro.scale)
    uniforms.uEmerge.value = intro.emerge
    if (intro.done && !introDone) {
      introDone = true
      app.dataset.intro = 'done'
    }
    if (activePointer === null && !paused && spinSpeed > 0.005) {
      spinSpeed = coastRotation(sphere.quaternion, spinAxis, spinSpeed, delta)
    }
    rotationMatrix.makeRotationFromQuaternion(sphere.quaternion)
    inverseRotation.setFromMatrix4(rotationMatrix).transpose()
    const q = sphere.quaternion
    const rotation = `${q.x.toFixed(4)},${q.y.toFixed(4)},${q.z.toFixed(4)},${q.w.toFixed(4)}`
    if (rotation !== previousRotation) {
      previousRotation = rotation
      spinControl.dataset.rotation = rotation
    }
    syncSpinControl()
    uniforms.uTime.value = elapsed
    renderer.render(scene, camera)
  }

  function tick(now: number) {
    frame = 0
    if (disposed || !visible || !intersecting || paused) return
    const frameTime = Math.max(0, now - previous)
    const delta = Math.min(frameTime / 1000, 0.05)
    previous = now
    elapsed += delta
    if (!introDone) introTime += frameTime
    draw(delta)
    frame = requestAnimationFrame(tick)
  }

  function resume() {
    if (frame || disposed || !visible || !intersecting || paused) return
    previous = performance.now()
    frame = requestAnimationFrame(tick)
  }

  function stop() {
    cancelAnimationFrame(frame)
    frame = 0
  }

  function resize() {
    const { width, height } = host.getBoundingClientRect()
    if (!width || !height || disposed) return
    viewportWidth = width
    viewportHeight = height
    camera.aspect = width / height
    distance = Math.max(6.25, 4.7 / camera.aspect)
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    renderer.getDrawingBufferSize(uniforms.uViewport.value)
    draw()
  }

  function finishIntro() {
    if (introDone) return
    introTime = SPLIT_INTRO_DURATION_MS
    draw()
  }

  function onSpinStart(event: PointerEvent) {
    if (activePointer !== null || event.button !== 0) return
    const bounds = spinControl.getBoundingClientRect()
    dragCenterX = bounds.left + bounds.width / 2
    dragCenterY = bounds.top + bounds.height / 2
    dragRadius = bounds.width / 2
    const x = event.clientX - dragCenterX
    const y = event.clientY - dragCenterY
    if (Math.hypot(x, y) > dragRadius) return
    event.preventDefault()
    activePointer = event.pointerId
    startX = event.clientX
    startY = event.clientY
    dragDistance = 0
    suppressClick = false
    spinSpeed = 0
    lastPoint = trackballPoint(x, y, dragRadius)
    lastMove = performance.now()
    try {
      spinControl.setPointerCapture(event.pointerId)
    } catch {
      /* Synthetic pointers have no active native capture. */
    }
    spinControl.dataset.dragging = 'true'
  }

  function onSpinMove(event: PointerEvent) {
    if (event.pointerId !== activePointer) return
    event.preventDefault()
    dragDistance = Math.max(
      dragDistance,
      Math.hypot(event.clientX - startX, event.clientY - startY)
    )
    if (dragDistance < 5) return
    const point = trackballPoint(
      event.clientX - dragCenterX,
      event.clientY - dragCenterY,
      dragRadius
    )
    dragRotation.setFromUnitVectors(lastPoint, point)
    sphere.quaternion.premultiply(dragRotation).normalize()
    const angle = 2 * Math.acos(THREE.MathUtils.clamp(dragRotation.w, -1, 1))
    const sine = Math.sqrt(Math.max(0, 1 - dragRotation.w * dragRotation.w))
    const now = performance.now()
    if (sine > 0.00001) {
      spinAxis
        .set(dragRotation.x, dragRotation.y, dragRotation.z)
        .divideScalar(sine)
      spinSpeed = Math.min(
        MAX_SPIN_SPEED,
        angle / Math.max((now - lastMove) / 1000, 1 / 120)
      )
    }
    lastPoint.copy(point)
    lastMove = now
    draw()
  }

  function endSpin(allowMomentum = false) {
    if (activePointer === null) return
    const pointer = activePointer
    activePointer = null
    suppressClick = dragDistance >= 5 || !allowMomentum
    if (!allowMomentum || paused || performance.now() - lastMove > 100)
      spinSpeed = 0
    delete spinControl.dataset.dragging
    if (spinControl.hasPointerCapture(pointer))
      spinControl.releasePointerCapture(pointer)
  }

  function onSpinEnd(event: PointerEvent) {
    if (event.pointerId === activePointer) endSpin(event.type === 'pointerup')
  }

  function onSpinClick(event: MouseEvent) {
    if (event.detail > 0 && suppressClick) {
      event.preventDefault()
      event.stopImmediatePropagation()
      suppressClick = false
    }
  }

  function onSpinWheel(event: WheelEvent) {
    if (
      disposed ||
      paused ||
      !visible ||
      !intersecting ||
      activePointer !== null ||
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey
    )
      return
    const bounds = spinControl.getBoundingClientRect()
    const radius = bounds.width / 2
    if (
      !radius ||
      Math.hypot(
        event.clientX - (bounds.left + radius),
        event.clientY - (bounds.top + bounds.height / 2)
      ) > radius
    )
      return

    const unitX =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.width : 1
    const unitY =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1
    const dx = event.deltaX * unitX
    const dy = event.deltaY * unitY
    const pixels = Math.hypot(dx, dy)
    if (!pixels || !Number.isFinite(pixels)) return
    event.preventDefault()
    // Follow the same content direction as /globe's two-finger pan. Rotate
    // around screen axes at any hover position, with no edge-trackball snap.
    spinAxis.set(-dy / pixels, -dx / pixels, 0)
    sphere.quaternion
      .premultiply(
        dragRotation.setFromAxisAngle(
          spinAxis,
          Math.min(pixels / radius, Math.PI / 3)
        )
      )
      .normalize()
    // Native trackpads already supply momentum as wheel events; adding our
    // drag coast would double it and drift after the gesture has ended.
    spinSpeed = 0
    draw()
  }

  function onSpinKey(event: KeyboardEvent) {
    const directions: Record<string, [number, number, number]> = {
      ArrowLeft: [0, -1, 0],
      ArrowRight: [0, 1, 0],
      ArrowUp: [-1, 0, 0],
      ArrowDown: [1, 0, 0],
    }
    if (event.key !== 'Home' && !directions[event.key]) return
    event.preventDefault()
    endSpin()
    spinSpeed = 0
    if (event.key === 'Home') sphere.quaternion.identity()
    else {
      spinAxis.set(...directions[event.key])
      sphere.quaternion
        .premultiply(dragRotation.setFromAxisAngle(spinAxis, Math.PI / 12))
        .normalize()
    }
    draw() // Keyboard changes are immediate: no easing or coasting.
  }

  function resetPointer() {
    endSpin()
    spinSpeed = 0
  }

  function onVisibility() {
    visible = !document.hidden
    if (visible) resume()
    else {
      finishIntro()
      resetPointer()
      stop()
    }
  }

  function onContextLost(event: Event) {
    event.preventDefault()
    stop()
    onFailure()
  }

  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host)
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    intersecting = entry.isIntersecting
    if (intersecting) resume()
    else stop()
  })
  intersectionObserver.observe(host)
  const introInputs = ['pointerdown', 'wheel', 'keydown', 'focusin', 'click'] as const
  for (const event of introInputs) app.addEventListener(event, finishIntro, true)
  spinControl.addEventListener('pointerdown', onSpinStart)
  spinControl.addEventListener('pointermove', onSpinMove)
  spinControl.addEventListener('pointerup', onSpinEnd)
  spinControl.addEventListener('pointercancel', onSpinEnd)
  spinControl.addEventListener('lostpointercapture', onSpinEnd)
  spinControl.addEventListener('keydown', onSpinKey)
  spinControl.addEventListener('wheel', onSpinWheel, { passive: false })
  spinControl.addEventListener('click', onSpinClick, true)
  window.addEventListener('blur', resetPointer)
  document.addEventListener('pointerleave', resetPointer)
  document.addEventListener('visibilitychange', onVisibility)
  renderer.domElement.addEventListener('webglcontextlost', onContextLost)
  resize()
  // Shader compilation errors do not necessarily throw. Detect them before
  // replacing the poster so an unsupported device never gets a blank hero.
  renderer.compile(scene, camera)
  if (shaderFailed) {
    dispose()
    throw new Error('Split shaders could not be compiled')
  }
  resume()

  function dispose(preserveFrame = false) {
    if (disposed) return
    disposed = true
    stop()
    endSpin()
    if (preserveFrame) {
      finishIntro()
      // WebGL's default drawing buffer is discarded after presentation. Render
      // and copy synchronously before disposing GPU resources on navigation.
      renderer.render(scene, camera)
      const frozen = document.createElement('canvas')
      frozen.width = renderer.domElement.width
      frozen.height = renderer.domElement.height
      frozen.setAttribute('aria-hidden', 'true')
      const context = frozen.getContext('2d')
      if (context) {
        context.drawImage(renderer.domElement, 0, 0)
        renderer.domElement.replaceWith(frozen)
      }
    }
    spinControl.hidden = true
    for (const event of introInputs) app.removeEventListener(event, finishIntro, true)
    spinControl.removeEventListener('pointerdown', onSpinStart)
    spinControl.removeEventListener('pointermove', onSpinMove)
    spinControl.removeEventListener('pointerup', onSpinEnd)
    spinControl.removeEventListener('pointercancel', onSpinEnd)
    spinControl.removeEventListener('lostpointercapture', onSpinEnd)
    spinControl.removeEventListener('keydown', onSpinKey)
    spinControl.removeEventListener('wheel', onSpinWheel)
    spinControl.removeEventListener('click', onSpinClick, true)
    resizeObserver.disconnect()
    intersectionObserver.disconnect()
    window.removeEventListener('blur', resetPointer)
    document.removeEventListener('pointerleave', resetPointer)
    document.removeEventListener('visibilitychange', onVisibility)
    renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
    sphereGeometry.dispose()
    sphereMaterial.dispose()
    floorGeometry.dispose()
    floorMaterial.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }

  return {
    setPaused(value) {
      paused = value
      if (paused) {
        spinSpeed = 0
        stop()
      } else resume()
    },
    getLandingToken() {
      // Probe the actual shader at the visible center. A tiny ID pass avoids
      // guessing by rotation or mistaking sunlight for a token value.
      const target = new THREE.WebGLRenderTarget(16, 16, { depthBuffer: true })
      const pixels = new Uint8Array(16 * 16 * 4)
      const previousTarget = renderer.getRenderTarget()
      floor.visible = false
      uniforms.uProbe.value = 1
      try {
        renderer.setRenderTarget(target)
        renderer.render(scene, camera)
        renderer.readRenderTargetPixels(target, 0, 0, 16, 16, pixels)
        const counts = atlasPalette.map(() => 0)
        for (let y = 5; y <= 11; y++)
          for (let x = 5; x <= 11; x++) {
            const index = pixels[(y * 16 + x) * 4] - 1
            if (index >= 0 && index < counts.length) counts[index]++
          }
        const maximum = Math.max(...counts)
        return atlasPalette[maximum > 0 ? counts.indexOf(maximum) : 4].id
      } finally {
        uniforms.uProbe.value = 0
        floor.visible = true
        renderer.setRenderTarget(previousTarget)
        target.dispose()
      }
    },
    dispose,
  }
}
