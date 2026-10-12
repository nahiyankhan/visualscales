import type { SplitScene } from './scene.js'

const app = document.querySelector<HTMLElement>('.split-app')!
const host = document.querySelector<HTMLElement>('#split-canvas')!
const spin = document.querySelector<HTMLButtonElement>('.split-spin')!
const color = document.querySelector<HTMLAnchorElement>('[data-atlas="color"]')!
const motion = matchMedia('(prefers-reduced-motion: reduce)')
let scene: SplitScene | undefined
let generation = 0
let disposed = false

function poster() {
  generation++
  app.dataset.renderer = 'poster'
  app.dataset.intro = 'done'
  scene?.dispose()
  scene = undefined
  spin.hidden = true
}

async function initialize() {
  if (motion.matches || disposed) {
    poster()
    return
  }
  const request = ++generation
  scene?.dispose()
  scene = undefined
  spin.hidden = true
  app.dataset.renderer = 'loading'
  try {
    const { createSplitScene } = await import('./scene.js')
    // The inline watchdog may have restored usable artwork while this module
    // was in flight. A late response must not replace it with another entrance.
    if (request !== generation || disposed || motion.matches || app.dataset.renderer !== 'loading') return
    scene = createSplitScene(host, spin, poster)
    app.dataset.renderer = 'webgl'
    spin.hidden = false
  } catch {
    if (request === generation && !disposed) poster()
  }
}

function enter(event: MouseEvent) {
  if (event.defaultPrevented || event.detail === 0 || disposed) return
  // The renderer's capture-phase click guard consumes dragged/cancelled clicks.
  const bounds = spin.getBoundingClientRect()
  if (
    Math.hypot(
      event.clientX - (bounds.x + bounds.width / 2),
      event.clientY - (bounds.y + bounds.height / 2)
    ) >
    bounds.width / 2
  )
    return
  if (event.clientX < innerWidth / 2) {
    const url = new URL(color.href)
    url.searchParams.set(
      'token',
      scene?.getLandingToken() ?? 'palette.indigo.600'
    )
    location.assign(url.href)
  } else location.assign('/space.html')
}

spin.addEventListener('click', enter)
motion.addEventListener('change', initialize)
window.addEventListener(
  'pagehide',
  () => {
    disposed = true
    generation++
    // Freeze the last live frame while the next document takes over. Switching
    // back to the fallback poster here flashes a different size/rotation.
    scene?.dispose(true)
    scene = undefined
    spin.removeEventListener('click', enter)
    motion.removeEventListener('change', initialize)
  },
  { once: true }
)
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload()
})
void initialize()
