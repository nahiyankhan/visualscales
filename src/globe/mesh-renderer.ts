// Subdivided, unlit token cards: color and labels share genuinely bent geometry.
// Rendering is input-driven. The caller owns context loss/restoration and the
// accessible token list. Label textures use a byte-bounded, frame-pinned cache.
//
// Motion treatment: peripheral directional softness. The sphere geometry is
// exact and immutable — motion is expressed as a screen-space directional blur
// applied only to the viewport fringes in a post pass, driven by a caller-owned
// velocity model. At rest (zero blur) the post pass is skipped entirely and the
// scene renders directly to the backbuffer, so the still image is pixel-exact.

import { projectMeshPoint } from './mesh-projection.js'
import { MAX_BLUR_PX } from './motion-blur.js'
import { CARD_HEIGHT, CARD_WIDTH, inkFor, type GlobeToken } from './model.js'
import { chooseRasterDpr, TEXTURE_CACHE_BYTES, textureBytesForDpr, WeightedLruCache } from './renderer-texture-cache.js'

export type MeshCard = { token: GlobeToken; x: number; y: number; flatness?: number; scale?: number; prominence?: number }

// Neutral backdrop; a selected card receives a contrast-safe inset outline.
export type MeshAtmosphere = {
  background: readonly [number, number, number]
  selectedId?: string
  hoveredId?: string
  /** Eased hover intensity. Keeps hover from snapping on/off. */
  hoverAmount?: number
  /** Subtle view rotation in radians: [yaw, pitch]. */
  viewTilt?: readonly [number, number]
  prominentIds?: ReadonlySet<string>
  labelOpacity?: number
}

export type MeshRenderer = {
  resize(width: number, height: number): void
  render(cards: MeshCard[], radius: number, perspective: number, scale: number, blurX?: number, blurY?: number, atmosphere?: MeshAtmosphere): void
  dispose(): void
}

// --- Tunables (exported so tests and the integrating agent can assert them) ---

/** Mesh density. 24x18 quads ≈ 11px cells at native card size: smooth bends, cheap verts. */
export const MESH_COLUMNS = 24
export const MESH_ROWS = 18

/** Byte-bounded texture cache: former 80 × (536×408×4 bytes) worst case, now enforced by bytes. */
export { TEXTURE_CACHE_BYTES }

/** Backbuffer DPR cap. */
export const CANVAS_DPR_CAP = 2
/** Maximum label raster DPR; small/dense scenes use a lower resolution tier. */
export const TEXTURE_DPR_CAP = 2

/** Cards whose center exceeds this lon/lat are culled (matches the DOM prototype's horizon). */
const CULL_ANGLE = 1.25

/** Maximum blur trail length, CSS px. The (blurX, blurY) vector is clamped to this. */
export const BLUR_MAX = MAX_BLUR_PX
/** Inside this normalized viewport extent (max-axis metric) the image is perfectly sharp. */
export const BLUR_SHARP_EXTENT = 0.55
/** Blur ramps from zero to full between BLUR_SHARP_EXTENT and this extent (smoothstep). */
export const BLUR_FULL_EXTENT = 0.82
/** Directional kernel tap count: short, symmetric, gaussian-weighted, no temporal accumulation. */
export const BLUR_TAPS = 17

/** Color prominence for cards outside an active selection neighborhood. */
export const SEARCH_DIM_PROMINENCE = 0.42
export const SELECTION_DIM_PROMINENCE = 0.22

/** Default opaque scene background (used when no atmosphere is supplied). */
const BACKGROUND = [0x11 / 255, 0x12 / 255, 0x13 / 255] as const

// --- Shaders -----------------------------------------------------------------

// Perspective model matches CSS `perspective: Npx` exactly: screen = local *
// P / (P - z), y-down. We emit clip coords with w = (P - z) / P so the GPU's
// divide reproduces the CSS projection, and a linearized z for depth testing.
// Every vertex sits exactly on the sphere — no deformation terms of any kind.
// Exported so geometry-guard tests can assert the sphere equation is intact.
export const VERTEX_SHADER = `
attribute vec2 aLocal;   // card-local offset in px, centered (±w/2, ±h/2)
attribute vec2 aUV;
uniform vec2 uCenter;      // card center on the unrolled surface, px
uniform float uRadius;     // sphere radius R, px
uniform float uScale;      // card scale
uniform float uFlatness;   // 0=sphere, 1=screen-space plane at z0
uniform float uPerspective;// CSS perspective, px
uniform vec2 uHalfView;    // half viewport in CSS px
uniform vec2 uViewTilt;    // yaw, pitch in radians
varying vec2 vUV;
void main() {
  vec2 world = uCenter + aLocal * uScale;
  float lon = world.x / uRadius;
  float lat = world.y / uRadius;
  float cl = cos(lat);
  vec3 sphere = vec3(uRadius * sin(lon) * cl, uRadius * sin(lat), uRadius * (cos(lon) * cl - 1.0));
  float cy = cos(uViewTilt.x);
  float sy = sin(uViewTilt.x);
  float cp = cos(uViewTilt.y);
  float sp = sin(uViewTilt.y);
  sphere = vec3(sphere.x * cy + sphere.z * sy, sphere.y, -sphere.x * sy + sphere.z * cy);
  sphere = vec3(sphere.x, sphere.y * cp - sphere.z * sp, sphere.y * sp + sphere.z * cp);
  vec3 pos = mix(sphere, vec3(world, 0.0), clamp(uFlatness, 0.0, 1.0));
  float w = (uPerspective - pos.z) / uPerspective;
  // Linearized depth over [0, P + 2R] keeps ordering correct everywhere.
  float zNdc = -pos.z / (uPerspective + 2.0 * uRadius + 1.0);
  gl_Position = vec4(pos.x / uHalfView.x, -pos.y / uHalfView.y, zNdc * w, w);
  vUV = aUV;
}
`

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D uTexture;
uniform vec3 uSurround;
uniform float uProminence;
uniform float uHover;
uniform float uLabelOpacity;
uniform vec3 uFaceColor;
varying vec2 vUV;
void main() {
  vec4 color = texture2D(uTexture, vUV);
  if (color.a < 0.5) discard; // rounded corners expose lower cards in painter order
  vec3 labeled = mix(uSurround, color.rgb, uProminence);
  vec3 face = uLabelOpacity >= 0.9999 ? labeled : mix(uFaceColor, labeled, uLabelOpacity);
  face = mix(face, vec3(1.0), uHover * 0.035);
  gl_FragColor = vec4(face, 1.0);
}
`

// Fullscreen post pass: directional blur along the motion vector, masked to the
// viewport periphery. The mask scales the tap offsets, so at the protected
// center every tap lands on the same texel and the output is bit-identical to
// the source — no color shift at rest or at center, no glass. The scene is
// opaque, so straight averaging is alpha-correct by construction.
const POST_VERTEX_SHADER = `
attribute vec2 aPos;      // fullscreen quad in clip space
varying vec2 vUV;
varying vec2 vNdc;
void main() {
  vNdc = aPos;
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

const POST_FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D uScene;
uniform vec2 uBlurUV;     // full trail length as a UV-space vector
varying vec2 vUV;
varying vec2 vNdc;
void main() {
  float extent = max(abs(vNdc.x), abs(vNdc.y));
  float mask = smoothstep(${BLUR_SHARP_EXTENT.toFixed(4)}, ${BLUR_FULL_EXTENT.toFixed(4)}, extent);
  // Symmetric taps spanning the full trail (±half-vector), gaussian weighted.
  vec2 step = uBlurUV * mask * ${(1 / (BLUR_TAPS - 1)).toFixed(6)};
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < ${BLUR_TAPS}; i++) {
    float t = float(i) - ${((BLUR_TAPS - 1) / 2).toFixed(1)}; // symmetric sample index
    float normalized = t / ${((BLUR_TAPS - 1) / 2).toFixed(1)};
    float w = exp(-2.0 * normalized * normalized);
    sum += texture2D(uScene, vUV + step * t).rgb * w;
    total += w;
  }
  gl_FragColor = vec4(sum / total, 1.0);
}
`

// --- Texture painting (exact CSS reproduction in canvas2D) --------------------

const RADIUS = 19
const PAD_TOP = 19
const PAD_SIDE = 20
const PAD_BOTTOM = 20
const NAME_SIZE = 25
const NAME_LINE = Math.round(NAME_SIZE * 1.08)
const VALUE_SIZE = 11
const BOTTOM_GAP = 13
const SANS = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, monospace'

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Break token names preferentially after dots (mirrors the DOM's `.` + zwsp),
// with greedy per-character fallback for pathological segments. Max 3 lines,
// ellipsis on overflow — full details stay in the caller's accessible DOM.
function wrapName(ctx: CanvasRenderingContext2D, name: string, maxWidth: number): string[] {
  const segments = name.split(/(?<=\.)/)
  const lines: string[] = []
  let line = ''
  const push = (l: string) => { if (l) lines.push(l) }
  for (let segment of segments) {
    while (segment) {
      const candidate = line + segment
      if (ctx.measureText(candidate).width <= maxWidth) { line = candidate; segment = ''; break }
      if (!line) {
        // Segment alone overflows: greedy character break.
        let cut = segment.length
        while (cut > 1 && ctx.measureText(segment.slice(0, cut)).width > maxWidth) cut--
        push(segment.slice(0, cut))
        segment = segment.slice(cut)
      } else {
        push(line)
        line = ''
      }
    }
  }
  push(line)
  if (lines.length > 3) {
    lines.length = 3
    let last = lines[2]
    while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1)
    lines[2] = last + '…'
  }
  return lines
}

function paintLabelCard(token: GlobeToken, dpr: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(CARD_WIDTH * dpr)
  canvas.height = Math.round(CARD_HEIGHT * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.fillStyle = token.labelLevel === 'chapter' ? 'rgba(27, 29, 31, 0.86)' : 'rgba(27, 29, 31, 0.58)'
  roundedRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, RADIUS)
  ctx.fill()
  ctx.strokeStyle = token.labelLevel === 'chapter' ? 'rgba(237, 238, 239, 0.22)' : 'rgba(237, 238, 239, 0.12)'
  ctx.lineWidth = 1
  roundedRect(ctx, 0.5, 0.5, CARD_WIDTH - 1, CARD_HEIGHT - 1, RADIUS - 0.5)
  ctx.stroke()

  const anyCtx = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  ctx.fillStyle = token.labelLevel === 'chapter' ? '#ffffff' : '#c8cdd3'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  if ('letterSpacing' in anyCtx) anyCtx.letterSpacing = token.labelLevel === 'chapter' ? '2.2px' : '1.2px'
  ctx.font = token.labelLevel === 'chapter' ? `600 22px ${MONO}` : `500 28px ${SANS}`
  ctx.fillText(token.name.toLowerCase(), CARD_WIDTH / 2, CARD_HEIGHT / 2, CARD_WIDTH - PAD_SIDE * 2)
  if ('letterSpacing' in anyCtx) anyCtx.letterSpacing = '0px'
  return canvas
}

function tokenFaceColor(token: GlobeToken): readonly [number, number, number] {
  if (token.layer === '__label') return BACKGROUND
  let value = token.light.slice(1)
  if (value.length === 3 || value.length === 4) value = [...value].map(c => c + c).join('')
  const alpha = value.length === 8 ? parseInt(value.slice(6), 16) / 255 : 1
  return [0, 2, 4].map(i => (parseInt(value.slice(i, i + 2), 16) * alpha + 255 * (1 - alpha)) / 255) as [number, number, number]
}

function paintCard(token: GlobeToken, dpr: number, selected = false): HTMLCanvasElement {
  if (token.layer === '__label') return paintLabelCard(token, dpr)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(CARD_WIDTH * dpr)
  canvas.height = Math.round(CARD_HEIGHT * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  const ink = inkFor(token.light)

  ctx.save()
  roundedRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, RADIUS)
  ctx.clip()
  // Transparency checker (matches repeating-conic 12px tile in the CSS).
  ctx.fillStyle = '#f7f7f7'
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  ctx.fillStyle = '#e4e4e4'
  for (let ty = 0; ty * 6 < CARD_HEIGHT; ty++)
    for (let tx = 0; tx * 6 < CARD_WIDTH; tx++)
      if ((tx + ty) % 2 === 0) ctx.fillRect(tx * 6, ty * 6, 6, 6)
  // Solid token color over the checker: transparency in the token reads through.
  ctx.fillStyle = token.light
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  ctx.restore()
  if (selected) {
    ctx.save()
    const inset = 1.25
    roundedRect(ctx, inset, inset, CARD_WIDTH - inset * 2, CARD_HEIGHT - inset * 2, RADIUS - inset)
    ctx.lineWidth = 2.5
    ctx.strokeStyle = ink
    ctx.stroke()
    ctx.restore()
  }

  ctx.fillStyle = ink
  const anyCtx = ctx as CanvasRenderingContext2D & { letterSpacing?: string }

  // One stable label layout at every distance. The mesh projection scales
  // typography continuously with the card, without zoom-specific font variants.
  if ('letterSpacing' in anyCtx) anyCtx.letterSpacing = '1.1px'
  ctx.font = `10px ${MONO}`
  ctx.textBaseline = 'top'
  const layerText = (token.layer + (token.id.startsWith('component.') ? ` / ${token.id.split('.')[1]}` : '')).toLowerCase()
  ctx.fillText(layerText, PAD_SIDE, PAD_TOP + 3, CARD_WIDTH - PAD_SIDE * 2 - 26)
  if ('letterSpacing' in anyCtx) anyCtx.letterSpacing = '0px'
  if (token.alpha != null) {
    ctx.font = `10px ${MONO}`
    ctx.fillText(`${Math.round(token.alpha * 100)}% alpha`, PAD_SIDE, PAD_TOP + 23)
  }

  // Bottom stack, anchored to the bottom edge: value, gap, then name lines.
  const maxTextWidth = CARD_WIDTH - PAD_SIDE * 2
  ctx.font = `${VALUE_SIZE}px ${MONO}`
  if ('letterSpacing' in anyCtx) anyCtx.letterSpacing = '0.5px'
  ctx.textBaseline = 'alphabetic'
  const valueBaseline = CARD_HEIGHT - PAD_BOTTOM - 2
  ctx.fillText(token.light.toLowerCase(), PAD_SIDE, valueBaseline, maxTextWidth)
  if ('letterSpacing' in anyCtx) anyCtx.letterSpacing = '-0.9px'
  ctx.font = `500 ${NAME_SIZE}px ${SANS}`
  const lines = wrapName(ctx, token.name.toLowerCase(), maxTextWidth)
  const nameBottom = valueBaseline - VALUE_SIZE - BOTTOM_GAP + 4
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], PAD_SIDE, nameBottom - (lines.length - 1 - i) * NAME_LINE, maxTextWidth)
  }
  if ('letterSpacing' in anyCtx) anyCtx.letterSpacing = '0px'
  return canvas
}

// --- Renderer ------------------------------------------------------------------

export function createMeshRenderer(canvas: HTMLCanvasElement): MeshRenderer {
  const gl = (canvas.getContext('webgl2', { alpha: true, antialias: true }) ??
    canvas.getContext('webgl', { alpha: true, antialias: true })) as WebGLRenderingContext | null
  if (!gl) throw new Error('mesh-renderer: WebGL context creation failed')

  const compile = (type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type)
    if (!shader) throw new Error('mesh-renderer: createShader failed')
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader)
      gl.deleteShader(shader)
      throw new Error(`mesh-renderer: shader compile failed: ${log}`)
    }
    return shader
  }

  const link = (vsSource: string, fsSource: string): WebGLProgram => {
    const vs = compile(gl.VERTEX_SHADER, vsSource)
    let fs: WebGLShader
    try { fs = compile(gl.FRAGMENT_SHADER, fsSource) }
    catch (error) { gl.deleteShader(vs); throw error }
    const program = gl.createProgram()
    if (!program) { gl.deleteShader(vs); gl.deleteShader(fs); throw new Error('mesh-renderer: createProgram failed') }
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`mesh-renderer: program link failed: ${log}`)
    }
    return program
  }

  const program = link(VERTEX_SHADER, FRAGMENT_SHADER)
  let postProgram: WebGLProgram
  try { postProgram = link(POST_VERTEX_SHADER, POST_FRAGMENT_SHADER) }
  catch (error) { gl.deleteProgram(program); throw error }

  // Shared subdivided quad, indexed. (COLS+1)×(ROWS+1) verts, drawn per card.
  const verts: number[] = []
  const indices: number[] = []
  for (let row = 0; row <= MESH_ROWS; row++) {
    for (let col = 0; col <= MESH_COLUMNS; col++) {
      const u = col / MESH_COLUMNS
      const v = row / MESH_ROWS
      verts.push((u - 0.5) * CARD_WIDTH, (v - 0.5) * CARD_HEIGHT, u, v)
    }
  }
  const stride = MESH_COLUMNS + 1
  for (let row = 0; row < MESH_ROWS; row++) {
    for (let col = 0; col < MESH_COLUMNS; col++) {
      const a = row * stride + col
      indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride)
    }
  }
  const indexCount = indices.length

  const cleanupPrograms = () => { gl.deleteProgram(program); gl.deleteProgram(postProgram) }

  const vertexBuffer = gl.createBuffer()
  if (!vertexBuffer) { cleanupPrograms(); throw new Error('mesh-renderer: vertex buffer allocation failed') }
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW)
  const indexBuffer = gl.createBuffer()
  if (!indexBuffer) { gl.deleteBuffer(vertexBuffer); cleanupPrograms(); throw new Error('mesh-renderer: index buffer allocation failed') }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW)

  // Fullscreen quad for the post pass (two triangles, clip space).
  const quadBuffer = gl.createBuffer()
  if (!quadBuffer) {
    gl.deleteBuffer(vertexBuffer); gl.deleteBuffer(indexBuffer); cleanupPrograms()
    throw new Error('mesh-renderer: quad buffer allocation failed')
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)

  const aLocal = gl.getAttribLocation(program, 'aLocal')
  const aUV = gl.getAttribLocation(program, 'aUV')
  const uCenter = gl.getUniformLocation(program, 'uCenter')
  const uRadius = gl.getUniformLocation(program, 'uRadius')
  const uScale = gl.getUniformLocation(program, 'uScale')
  const uFlatness = gl.getUniformLocation(program, 'uFlatness')
  const uPerspective = gl.getUniformLocation(program, 'uPerspective')
  const uHalfView = gl.getUniformLocation(program, 'uHalfView')
  const uViewTilt = gl.getUniformLocation(program, 'uViewTilt')
  const uTexture = gl.getUniformLocation(program, 'uTexture')
  const uSurround = gl.getUniformLocation(program, 'uSurround')
  const uProminence = gl.getUniformLocation(program, 'uProminence')
  const uHover = gl.getUniformLocation(program, 'uHover')
  const uLabelOpacity = gl.getUniformLocation(program, 'uLabelOpacity')
  const uFaceColor = gl.getUniformLocation(program, 'uFaceColor')

  const aPos = gl.getAttribLocation(postProgram, 'aPos')
  const uScene = gl.getUniformLocation(postProgram, 'uScene')
  const uBlurUV = gl.getUniformLocation(postProgram, 'uBlurUV')

  const textureKey = (token: GlobeToken, selected: boolean, dpr: number) =>
    `${token.id}\u0000${selected ? 'selected' : ''}\u0000${dpr}`

  const textures = new WeightedLruCache<WebGLTexture>(TEXTURE_CACHE_BYTES, texture => gl.deleteTexture(texture))
  let previousRasterDpr: number | undefined

  const createTexture = (token: GlobeToken, selected: boolean, dpr: number): WebGLTexture => {
    const texture = gl.createTexture()
    if (!texture) throw new Error('mesh-renderer: createTexture failed')
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paintCard(token, dpr, selected))
    // NPOT-safe: clamp + linear, no mips. Cards render near 1:1, so no shimmer.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    return texture
  }

  const getTexture = (token: GlobeToken, selected: boolean, dpr: number, pinnedKeys: ReadonlySet<string>): WebGLTexture => {
    const key = textureKey(token, selected, dpr)
    const cached = textures.get(key)
    if (cached) return cached
    const bytes = textureBytesForDpr(dpr)
    textures.reclaimFor(bytes, pinnedKeys)
    const texture = createTexture(token, selected, dpr)
    textures.set(key, texture, bytes, pinnedKeys)
    return texture
  }

  // --- Offscreen scene target (lazy: only allocated once blur is requested) ---

  let sceneFramebuffer: WebGLFramebuffer | null = null
  let sceneColor: WebGLTexture | null = null
  let sceneDepth: WebGLRenderbuffer | null = null
  let sceneWidth = 0
  let sceneHeight = 0
  let sceneTargetBroken = false // allocation failed; fall back to direct rendering

  const releaseSceneTarget = () => {
    if (sceneFramebuffer) gl.deleteFramebuffer(sceneFramebuffer)
    if (sceneColor) gl.deleteTexture(sceneColor)
    if (sceneDepth) gl.deleteRenderbuffer(sceneDepth)
    sceneFramebuffer = null
    sceneColor = null
    sceneDepth = null
    sceneWidth = 0
    sceneHeight = 0
  }

  /** Create or resize the offscreen target to match the backbuffer. Returns false on failure. */
  const ensureSceneTarget = (width: number, height: number): boolean => {
    if (sceneTargetBroken) return false
    if (sceneFramebuffer && sceneWidth === width && sceneHeight === height) return true
    releaseSceneTarget()
    const framebuffer = gl.createFramebuffer()
    const color = gl.createTexture()
    const depth = gl.createRenderbuffer()
    if (!framebuffer || !color || !depth) {
      if (framebuffer) gl.deleteFramebuffer(framebuffer)
      if (color) gl.deleteTexture(color)
      if (depth) gl.deleteRenderbuffer(depth)
      sceneTargetBroken = true
      return false
    }
    gl.bindTexture(gl.TEXTURE_2D, color)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth)
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth)
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    if (!complete) {
      gl.deleteFramebuffer(framebuffer)
      gl.deleteTexture(color)
      gl.deleteRenderbuffer(depth)
      sceneTargetBroken = true
      return false
    }
    sceneFramebuffer = framebuffer
    sceneColor = color
    sceneDepth = depth
    sceneWidth = width
    sceneHeight = height
    return true
  }

  let viewWidth = canvas.clientWidth || 1
  let viewHeight = canvas.clientHeight || 1
  let disposed = false

  const resize = (width: number, height: number) => {
    if (disposed) return
    viewWidth = Math.max(1, width)
    viewHeight = Math.max(1, height)
    const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, CANVAS_DPR_CAP)
    canvas.width = Math.round(viewWidth * dpr)
    canvas.height = Math.round(viewHeight * dpr)
    // The offscreen target is re-validated against the backbuffer on the next
    // blurred frame; a failed allocation at one size may succeed at another.
    sceneTargetBroken = false
  }

  type DrawableCard = MeshCard & { cardScale: number; factor: number; selected: boolean }

  const collectDrawables = (cards: MeshCard[], radius: number, perspective: number, scale: number, atmosphere?: MeshAtmosphere): DrawableCard[] => {
    return [...cards].filter(card => card.token.layer !== '__blank').sort((a, b) => {
      const hovered = Number(a.token.id === atmosphere?.hoveredId) - Number(b.token.id === atmosphere?.hoveredId)
      const selected = Number(a.token.id === atmosphere?.selectedId) - Number(b.token.id === atmosphere?.selectedId)
      const label = Number(a.token.layer === '__label') - Number(b.token.layer === '__label')
      return (a.flatness ?? 0) - (b.flatness ?? 0) || label || selected || hovered || (a.token.id < b.token.id ? -1 : a.token.id > b.token.id ? 1 : 0)
    }).flatMap(card => {
      const flatness = Math.max(0, Math.min(1, card.flatness ?? 0))
      const cardScale = scale * (card.scale ?? 1)
      const lon = card.x / radius
      const lat = card.y / radius
      if (flatness === 0 && (Math.abs(lon) > CULL_ANGLE || Math.abs(lat) > CULL_ANGLE)) return []
      const cl = Math.cos(lat)
      const pz = (radius * (Math.cos(lon) * cl - 1)) * (1 - flatness)
      const factor = perspective / (perspective - pz)
      if (factor <= 0) return []
      const { x: sx, y: sy } = projectMeshPoint(card.x, card.y, radius, perspective, flatness)
      const reach = (Math.hypot(CARD_WIDTH, CARD_HEIGHT) / 2) * cardScale * factor
      if (Math.abs(sx) - reach > viewWidth / 2 || Math.abs(sy) - reach > viewHeight / 2) return []
      return [{ ...card, flatness, cardScale, factor, selected: card.token.id === atmosphere?.selectedId }]
    })
  }

  const drawScene = (cards: MeshCard[], radius: number, perspective: number, scale: number, atmosphere?: MeshAtmosphere) => {
    const background = atmosphere?.background ?? BACKGROUND
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(background[0], background[1], background[2], 1)
    // Every card lies on the same front-facing sphere. Overlapping meshes
    // have independently tessellated triangles, so depth testing interleaves
    // their faces during travel. Use a stable whole-card painter order instead.
    // Horizon culling keeps each card on the non-self-overlapping front patch.
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    gl.enableVertexAttribArray(aLocal)
    gl.vertexAttribPointer(aLocal, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(aUV)
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 16, 8)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
    gl.uniform1f(uRadius, radius)
    gl.uniform1f(uScale, scale)
    gl.uniform1f(uFlatness, 0)
    gl.uniform1f(uPerspective, perspective)
    gl.uniform2f(uHalfView, viewWidth / 2, viewHeight / 2)
    gl.uniform2f(uViewTilt, atmosphere?.viewTilt?.[0] ?? 0, atmosphere?.viewTilt?.[1] ?? 0)
    gl.uniform3f(uSurround, background[0], background[1], background[2])
    gl.uniform1i(uTexture, 0)
    const labelOpacity = Math.max(0, Math.min(1, atmosphere?.labelOpacity ?? 1))
    gl.uniform1f(uLabelOpacity, labelOpacity)
    gl.activeTexture(gl.TEXTURE0)

    // Identity order must not follow pool/transition-array order, which changes
    // during retargeting. Repeated copies have identical textures. Keep selection
    // on top so an arriving neighbor cannot hide its label. Don't mutate inputs.
    const ordered = collectDrawables(cards, radius, perspective, scale, atmosphere)
    const variantKeys = new Set<string>()
    let maxProjectedScale = 0
    for (const card of ordered) {
      variantKeys.add(textureKey(card.token, card.selected, 0))
      maxProjectedScale = Math.max(maxProjectedScale, card.cardScale * card.factor)
    }
    const rasterDpr = Math.min(TEXTURE_DPR_CAP, chooseRasterDpr(variantKeys.size, maxProjectedScale, TEXTURE_CACHE_BYTES, previousRasterDpr))
    previousRasterDpr = rasterDpr
    const pinnedKeys = new Set<string>()
    for (const card of ordered) pinnedKeys.add(textureKey(card.token, card.selected, rasterDpr))
    textures.evictIdle(pinnedKeys)

    for (const card of ordered) {
      const flatness = card.flatness ?? 0
      const cardScale = card.cardScale
      // Lazy: textures are only rasterized for cards that survive culling.
      const hoverAmount = card.token.id === atmosphere?.hoveredId ? Math.max(0, Math.min(1, atmosphere?.hoverAmount ?? 0)) : 0
      gl.bindTexture(gl.TEXTURE_2D, getTexture(card.token, card.selected, rasterDpr, pinnedKeys))
      const dimProminence = atmosphere?.selectedId ? SELECTION_DIM_PROMINENCE : SEARCH_DIM_PROMINENCE
      const atmosphereProminence = !atmosphere?.prominentIds || atmosphere.prominentIds.has(card.token.id) ? 1 : hoverAmount ? 0.65 + 0.35 * hoverAmount : dimProminence
      const prominence = card.prominence ?? atmosphereProminence
      gl.uniform1f(uProminence, prominence)
      gl.uniform1f(uHover, hoverAmount)
      if (labelOpacity < 0.9999) {
        const faceColor = card.token.layer === '__label' ? background : tokenFaceColor(card.token)
        gl.uniform3f(uFaceColor, faceColor[0], faceColor[1], faceColor[2])
      }
      const lift = 1 + hoverAmount * 0.014
      gl.uniform1f(uScale, cardScale * lift)
      gl.uniform1f(uFlatness, flatness)
      gl.uniform2f(uCenter, card.x, card.y)
      gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0)
    }

    gl.uniform1f(uScale, scale)
    gl.uniform1f(uFlatness, 0)
    gl.disableVertexAttribArray(aLocal)
    gl.disableVertexAttribArray(aUV)
  }

  const render = (cards: MeshCard[], radius: number, perspective: number, scale: number, blurX = 0, blurY = 0, atmosphere?: MeshAtmosphere) => {
    if (disposed) return

    // Clamp the motion vector: the full trail never exceeds BLUR_MAX CSS px.
    let bx = blurX
    let by = blurY
    const length = Math.hypot(bx, by)
    if (length > BLUR_MAX) {
      bx *= BLUR_MAX / length
      by *= BLUR_MAX / length
    }
    // Sub-tap-width trails are invisible; skip the pass entirely so the still
    // frame goes straight to the backbuffer with zero resampling loss.
    const wantBlur = Math.min(length, BLUR_MAX) > 0.05

    if (wantBlur && ensureSceneTarget(canvas.width, canvas.height)) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFramebuffer)
      drawScene(cards, radius, perspective, scale, atmosphere)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)

      // Post pass: fullscreen quad, no depth, opaque output.
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.disable(gl.DEPTH_TEST)
      gl.disable(gl.BLEND)
      gl.useProgram(postProgram)
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
      gl.enableVertexAttribArray(aPos)
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, sceneColor)
      gl.uniform1i(uScene, 0)
      // CSS px → UV. CSS y is down, texture v is up; the kernel is symmetric,
      // but keep the sign honest so the trail direction matches the motion.
      gl.uniform2f(uBlurUV, bx / viewWidth, -by / viewHeight)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      gl.disableVertexAttribArray(aPos)
    } else {
      // At rest (or if the offscreen target is unavailable) render directly:
      // no intermediate texture, no resampling — maximum fidelity, minimum cost.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      drawScene(cards, radius, perspective, scale, atmosphere)
    }
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    textures.clear()
    releaseSceneTarget()
    gl.deleteBuffer(vertexBuffer)
    gl.deleteBuffer(indexBuffer)
    gl.deleteBuffer(quadBuffer)
    gl.deleteProgram(program)
    gl.deleteProgram(postProgram)
  }

  return { resize, render, dispose }
}
