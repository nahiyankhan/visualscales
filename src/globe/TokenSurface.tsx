import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CARD_WIDTH, CARD_HEIGHT, STEP_X, STEP_Y, gridMetrics, mod } from './model.js'
import { createMeshRenderer, type MeshCard, type MeshRenderer } from './mesh-renderer.js'
import { createBlur, blurActive, resetBlur, stepBlur, velocityBlur } from './motion-blur.js'
import { NEUTRAL, colorSurround, pickToken } from './selection.js'
import { buildRelationships, lineage, neighborhood, type RelationshipToken } from './relationships.js'
import { relationshipDescriptions } from './connectors.js'
import { layoutRelationshipNetwork } from './relationship-network.js'
import { roundedElbowPath } from './network-links.js'
import { LINK_GROW_MS, NETWORK_MIN_SCALE, NETWORK_MAX_SCALE, linkRevealPlan, zoomNetworkAt } from './network-motion.js'
import { createSceneTransition, sampleSceneTransition } from './scene-transition.js'
import { nearestTokenOffset, indexLayout, rowOffset, sampleLayout } from './navigation.js'
import { buildLayout, type LayoutOptions, type TokenLayout } from './layout.js'
import { searchTokens, focusLayout } from './exploration.js'
import { applyIntroRowEntrance, createIntroRowEntrance, type IntroRowEntrance } from './intro-motion.js'
import { createCardTransition, sampleCardTransition } from './transitions.js'
import { sampleData } from '../data/color/globe-data.js'
import { COLLECTION_MIN_ZOOM, COLLECTION_MAX_ZOOM, zoomCollectionAt } from './collection-camera.js'
import './style.css'

export type TokenSurfaceData = {
  meta: {
    name: string
    homeId?: string
  }
  tokens: RelationshipToken[]
}

export type TokenSurfaceReady = {
  renderer: 'webgl' | 'unavailable'
  setLabelOpacity(value: number): void
  focus(): void
}

type TokenSurfaceProps = {
  data?: TokenSurfaceData
  background?: readonly [number, number, number]
  intro?: 'rows' | 'none'
  initialLabelOpacity?: number
  onReady?: (ready: TokenSurfaceReady) => void
}

const DEFAULT_DATA: TokenSurfaceData = { meta: { name: sampleData.meta.name, homeId: sampleData.meta.homeId }, tokens: sampleData.tokens }

const DEFAULT_OPTIONS: LayoutOptions = { mode: 'spatial', order: 'color', seed: 0 }
const ZOOM_STEP = 1.25
const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1))
const backgroundHex = (background: readonly [number, number, number]) => `#${background.map(channel => Math.round(Math.max(0, Math.min(1, channel)) * 255).toString(16).padStart(2, '0')).join('')}`

export function TokenSurface({ data = DEFAULT_DATA, background = NEUTRAL, intro: introMode = 'rows', initialLabelOpacity = 1, onReady }: TokenSurfaceProps) {
  const tokens = data.tokens
  const [backgroundR, backgroundG, backgroundB] = background
  const onReadyRef = useRef<TokenSurfaceProps['onReady']>(undefined)
  useEffect(() => { onReadyRef.current = onReady }, [onReady])
  const relationships = useMemo(() => buildRelationships(tokens), [tokens])
  const homeId = data.meta.homeId ?? tokens[0]?.id ?? ''
  const makeLayout = useCallback(() => buildLayout(tokens, DEFAULT_OPTIONS), [tokens])
  const search = useRef<(text: string) => void>(() => {})
  const [query, setQuery] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const cancelSearch = useRef(() => {})
  const confirmSearch = useRef(() => {})
  const viewport = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLCanvasElement>(null)
  const choose = useRef<(id: string) => void>(() => {})
  const collectionView = useRef<(action: 'in' | 'out' | 'reset') => void>(() => {})
  const [zoomControls, setZoomControls] = useState({ percent: 100, atMin: false, atMax: false })
  const goBack = useRef(() => {})
  const [canGoBack, setCanGoBack] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [relationshipView, setRelationshipView] = useState(false)
  const openRelationships = useRef<(instant?: boolean) => void>(() => {})
  const connectors = useRef<SVGGElement>(null)
  const traceConnectors = useRef<SVGGElement>(null)
  const connectorMask = useRef<SVGGElement>(null)
  const networkView = useRef<(action: 'fit' | 'in' | 'out' | string) => void>(() => {})
  const [relationshipText, setRelationshipText] = useState<string[]>([])
  const selected = tokens.find(token => token.id === selectedId)
  const networkLayout = useMemo(() => layoutRelationshipNetwork(relationships, '', { cardWidth: CARD_WIDTH, cardHeight: CARD_HEIGHT, columnGap: 100, rowGap: 24 }), [relationships])
  const selectedLineage = selected ? lineage(relationships, selected.id) : undefined
  const source = selectedLineage?.ancestors[0]
  const dependents = selectedLineage?.descendants ?? []
  const searchResults = useMemo(() => searchTokens(tokens, query).slice(0, 12), [tokens, query])
  const transparent = selected ? colorSurround(selected.light).transparent : false
  useEffect(() => {
    const surface = viewport.current!
    const world = grid.current!
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)')
    let metrics = gridMetrics(surface.clientWidth, surface.clientHeight)
    let layout = makeLayout()
    let slots = indexLayout(layout)
    let x = 0, y = 0, vx = 0, vy = 0
    let zoom = 1
    const collectionScale = () => metrics.scale * zoom
    const collectionCards = () => sampleLayout(layout, slots, x, y, collectionScale(), Math.ceil(metrics.columns / zoom), Math.ceil(metrics.rows / zoom / 2) * 2)
    const home = nearestTokenOffset(layout, homeId, x, y, metrics.scale)
    x = home.x; y = home.y
    const shouldIntro = introMode === 'rows' && !reduced.matches && !document.hidden
    let intro: IntroRowEntrance | null = shouldIntro ? createIntroRowEntrance(collectionCards(), performance.now(), surface.clientWidth, surface.clientHeight, metrics.scale) : null
    let pointer: number | null = null
    let hoverId = '', hoverRenderId = '', hoverAmount = 0, hoverX = 0, hoverY = 0
    let tiltX = 0, tiltY = 0
    let lastX = 0, lastY = 0, lastMove = 0, frame = 0, previous = 0
    const blur = createBlur()
    let inputVX = 0, inputVY = 0, lastInput = 0
    let wheelTime = 0
    let selectedToken: typeof tokens[number] | null = null
    let prominentIds: Set<string> | undefined
    type Snapshot = { layout: TokenLayout; x: number; y: number; zoom: number }
    const history: (Snapshot & { id: string })[] = []
    let selectionReturn: Snapshot | null = null
    let searchReturn: Snapshot | null = null
    let searchQuery = ''
    let searchTimer: ReturnType<typeof setTimeout> | undefined
    let matchIds: Set<string> | undefined
    let cardTransition: ReturnType<typeof createCardTransition> | null = null
    let cardFrame = 0, transitionX = 0, transitionY = 0
    const snapshot = (): Snapshot => ({ layout, x, y, zoom })
    const network = networkLayout
    let inRelationships = false
    let networkScale = 1, networkX = 0, networkY = 0
    let sceneTransition: ReturnType<typeof createSceneTransition> | null = null
    const linkPaths = new Map<string, SVGPathElement>()
    const tracePaths = new Map<string, SVGPathElement>()
    let traceId = '', tracePending = false, traceInstant = false
    let tracePlan = linkRevealPlan([], '')
    let revealInstant = false
    let revealPlan = linkRevealPlan([], '')
    const touches = new Map<number, { x: number; y: number }>()
    let pinch: { distance: number; midpoint: { x: number; y: number }; camera: { x: number; y: number; scale: number } } | null = null
    const atmosphereBackground = [backgroundR, backgroundG, backgroundB] as const
    const atmosphereBackgroundHex = backgroundHex(atmosphereBackground)
    let labelOpacity = clamp01(initialLabelOpacity)
    let readyFrame = 0
    let readySent = false
    const networkCards = (): MeshCard[] => network.nodes.map(node => ({ token: node.token,
      x: networkX + (node.x + CARD_WIDTH / 2) * networkScale,
      y: networkY + (node.y + CARD_HEIGHT / 2) * networkScale,
      flatness: 1, scale: networkScale / collectionScale(), prominence: 1,
    }))
    const fitNetwork = (full = false) => {
      if (!network.nodes.length) return
      const fit = Math.min(1, (surface.clientWidth - 100) / network.bounds.width, (surface.clientHeight - 220) / network.bounds.height)
      networkScale = full ? Math.max(NETWORK_MIN_SCALE, fit) : metrics.scale
      networkX = -network.bounds.width * networkScale / 2
      networkY = -network.bounds.height * networkScale / 2
      if (!full) {
        const node = network.nodes.find(node => node.id === (selectedToken?.id ?? centerTokenId)) ?? network.nodes[0]
        if (network.bounds.width * networkScale > surface.clientWidth - 48) networkX = -surface.clientWidth / 2 + 24 - node.x * networkScale
        networkY = -(node.y + CARD_HEIGHT / 2) * networkScale
      }
    }
    const renderLinks = () => {
      const group = connectors.current
      if (!group) return
      const mask = connectorMask.current
      mask?.replaceChildren()
      if (inRelationships && !sceneTransition && mask) {
        for (const card of pool.filter(card => card.flatness === 1)) {
          const lift = card.token.id === hoverRenderId ? 1 + hoverAmount * .014 : 1
          const width = CARD_WIDTH * networkScale * lift, height = CARD_HEIGHT * networkScale * lift
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
          rect.setAttribute('x', String(surface.clientWidth / 2 + card.x - width / 2))
          rect.setAttribute('y', String(surface.clientHeight / 2 + card.y - height / 2))
          rect.setAttribute('width', String(width)); rect.setAttribute('height', String(height))
          rect.setAttribute('rx', String(19 * networkScale * lift))
          rect.setAttribute('fill', 'black')
          mask.append(rect)
        }
      }
      const edges = inRelationships && !sceneTransition && !document.hidden ? network.edges : []
      const traceIds = traceId ? prominentIds ?? new Set<string>() : new Set<string>()
      const pathIds = traceId ? traceIds : hoverId ? neighborhood(relationships, hoverId) : prominentIds
      const cardsById = new Map(pool.filter(card => card.flatness === 1).map(card => [card.token.id, card]))
      const tracedEdges = edges.filter(edge => traceIds.has(edge.source) && traceIds.has(edge.target))
      const tracedEdgeIds = new Set(tracedEdges.map(edge => edge.id))
      for (const [id, path] of tracePaths) {
        if (!tracedEdgeIds.has(id)) { path.getAnimations().forEach(animation => animation.cancel()); path.remove(); tracePaths.delete(id) }
      }
      const activeEdgeIds = new Set(edges.map(edge => edge.id))
      for (const [id, path] of linkPaths) {
        if (!activeEdgeIds.has(id)) { path.getAnimations().forEach(animation => animation.cancel()); path.remove(); linkPaths.delete(id) }
      }
      world.dataset.connectors = JSON.stringify(edges.map(edge => ({ from: edge.source, to: edge.target, intersections: 0 })))
      world.dataset.connectorCount = String(edges.length)
      for (const edge of edges) {
        const source = cardsById.get(edge.source)
        const target = cardsById.get(edge.target)
        if (!source || !target) continue
        const x1 = surface.clientWidth / 2 + source.x + CARD_WIDTH * networkScale / 2
        const x2 = surface.clientWidth / 2 + target.x - CARD_WIDTH * networkScale / 2
        const y1 = surface.clientHeight / 2 + source.y, y2 = surface.clientHeight / 2 + target.y
        let path = linkPaths.get(edge.id)
        const entering = !path
        if (!path) {
          path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          linkPaths.set(edge.id, path)
          group.append(path)
        }
        path.dataset.source = edge.source; path.dataset.target = edge.target
        path.setAttribute('d', roundedElbowPath(x1, y1, x2, y2, networkScale))
        path.setAttribute('pathLength', '1')
        if (entering && !revealInstant && !reduced.matches) {
          const plan = revealPlan.get(edge.id) ?? { reverse: false, delay: 0 }
          path.dataset.revealDirection = plan.reverse ? 'target-to-source' : 'source-to-target'
          path.style.strokeDasharray = '1 1'
          // A negative offset reveals the existing source→target path backwards.
          const animation = path.animate([
            { strokeDashoffset: plan.reverse ? '-1' : '1' },
            { strokeDashoffset: '0' },
          ], { duration: LINK_GROW_MS, delay: plan.delay, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'both' })
          animation.onfinish = () => { path!.style.strokeDasharray = ''; animation.cancel() }
        }
        // Keep active links prominent and dim the rest of the family.
        const active = !pathIds || (pathIds.has(edge.source) && pathIds.has(edge.target))
        path.dataset.active = String(active)
        path.style.opacity = traceId ? '.45' : active ? '1' : '.3'
        if (tracedEdgeIds.has(edge.id)) {
          let trace = tracePaths.get(edge.id)
          const newTrace = !trace
          if (!trace) {
            trace = document.createElementNS('http://www.w3.org/2000/svg', 'path')
            tracePaths.set(edge.id, trace)
            traceConnectors.current?.append(trace)
          }
          const plan = tracePlan.get(edge.id) ?? { reverse: false, delay: 0 }
          trace.dataset.source = edge.source; trace.dataset.target = edge.target
          trace.dataset.trace = 'true'
          trace.dataset.revealDirection = plan.reverse ? 'target-to-source' : 'source-to-target'
          trace.setAttribute('d', path.getAttribute('d')!)
          trace.setAttribute('pathLength', '1')
          if (tracePending || newTrace) {
            trace.getAnimations().forEach(animation => animation.cancel())
            trace.style.strokeDasharray = ''
            if (!traceInstant && !reduced.matches && !document.hidden) {
              trace.style.strokeDasharray = '1 1'
              const animation = trace.animate([
                { strokeDashoffset: plan.reverse ? '-1' : '1' }, { strokeDashoffset: '0' },
              ], { duration: LINK_GROW_MS, delay: plan.delay, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'both' })
              animation.onfinish = () => { trace!.style.strokeDasharray = ''; animation.cancel() }
            }
          }
        }

      }
      if (edges.length) tracePending = false
    }
    let selectionStartX = 0, selectionStartY = 0, dragged = false
    const clearMotion = () => {
      intro = null
      vx = vy = inputVX = inputVY = 0
      tiltX = tiltY = 0
      hoverId = hoverRenderId = ''; hoverAmount = 0
      resetBlur(blur)
      cancelAnimationFrame(frame); frame = 0
    }
    let centerTokenId = homeId
    let pool: MeshCard[] = []
    let renderer: MeshRenderer | null = null
    const app = surface.parentElement!
    const readyApi = (rendererName: 'webgl' | 'unavailable'): TokenSurfaceReady => ({
      renderer: rendererName,
      setLabelOpacity(value: number) { labelOpacity = clamp01(value); paint() },
      focus() { viewport.current?.focus({ preventScroll: true }) },
    })
    const notifyReadyOnce = (rendererName: 'webgl' | 'unavailable') => {
      if (readySent) return
      readySent = true
      cancelAnimationFrame(readyFrame)
      readyFrame = requestAnimationFrame(() => { readyFrame = 0; onReadyRef.current?.(readyApi(rendererName)) })
    }
    const unavailable = () => {
      app.dataset.renderer = 'unavailable'
      clearMotion()
      cancelAnimationFrame(cardFrame); cardFrame = 0; cardTransition = null
      notifyReadyOnce('unavailable')
    }

    // Only update React when displayed zoom changes, not on pan/animation frames.
    let displayedPercent: number | undefined, displayedAtMin = false, displayedAtMax = false
    const syncZoomControls = () => {
      const percent = Math.round((inRelationships ? networkScale / metrics.scale : zoom) * 100)
      const atMin = inRelationships ? networkScale <= NETWORK_MIN_SCALE : zoom <= COLLECTION_MIN_ZOOM
      const atMax = inRelationships ? networkScale >= NETWORK_MAX_SCALE : zoom >= COLLECTION_MAX_ZOOM
      if (percent === displayedPercent && atMin === displayedAtMin && atMax === displayedAtMax) return
      displayedPercent = percent; displayedAtMin = atMin; displayedAtMax = atMax
      setZoomControls({ percent, atMin, atMax })
    }
    const paint = () => {
      syncZoomControls()
      const targetPool = inRelationships ? networkCards() : collectionCards()
      if (sceneTransition) {
        const sampled = sampleSceneTransition(sceneTransition, performance.now())
        pool = sampled.cards
        if (sampled.done) { sceneTransition = null; pool = targetPool }
      } else if (cardTransition) {
        const sampled = sampleCardTransition(cardTransition, performance.now())
        pool = sampled.cards.map(card => ({ ...card, x: card.x + x - transitionX, y: card.y + y - transitionY }))
        if (sampled.done) { cardTransition = null; pool = targetPool }
      } else pool = targetPool
      if (!inRelationships) {
        const center = pool.reduce<MeshCard | undefined>((nearest, card) => !nearest || Math.hypot(card.x, card.y) < Math.hypot(nearest.x, nearest.y) ? card : nearest, undefined)
        if (center) centerTokenId = center.token.id
      }
      world.dataset.centerToken = centerTokenId
      world.dataset.collectionZoom = zoom.toFixed(4)
      world.dataset.collectionScale = String(collectionScale())
      world.dataset.collectionCards = JSON.stringify(!inRelationships ? pool.map(card => ({ id: card.token.id, x: card.x, y: card.y })) : [])
      world.dataset.rowOffsets = '[]'
      if (intro) {
        const sampled = applyIntroRowEntrance(pool, intro, performance.now())
        pool = sampled.cards
        world.dataset.rowOffsets = JSON.stringify(sampled.offsets)
        if (sampled.done) intro = null
      }
      world.dataset.rearranging = String(Boolean(cardTransition || sceneTransition))
      world.dataset.intro = intro ? 'running' : 'done'
      world.dataset.query = searchQuery
      world.dataset.matches = matchIds ? [...matchIds].join('|') : ''
      world.dataset.layout = DEFAULT_OPTIONS.mode
      world.dataset.seed = String(DEFAULT_OPTIONS.seed)
      world.dataset.sheet = `${layout.width},${layout.height}`
      world.dataset.selectedPositions = JSON.stringify(pool.filter(c => c.token.id === selectedToken?.id).map(c => [c.x, c.y]))
      world.dataset.visibleIds = pool.map(card => card.token.id).join('|')
      world.dataset.trace = traceId
      world.dataset.networkScale = String(networkScale)
      world.dataset.networkCards = JSON.stringify(pool.filter(card => card.flatness === 1).map(card => ({ id: card.token.id, x: card.x, y: card.y, scale: card.scale })))
      renderLinks()
      if (renderer && !document.hidden && app.dataset.renderer === 'webgl') {
        try { renderer.render(pool, metrics.radius * zoom, metrics.perspective * zoom, collectionScale(), blur.x, blur.y, { background: atmosphereBackground, selectedId: selectedToken?.id, hoveredId: hoverRenderId, hoverAmount, viewTilt: inRelationships || sceneTransition ? [0, 0] : [tiltX, tiltY], prominentIds: searchQuery ? matchIds : undefined, labelOpacity }) }
        catch { unavailable() }
      }
      world.dataset.prominent = prominentIds ? [...prominentIds].join('|') : ''
      world.dataset.blur = `${blur.x.toFixed(5)},${blur.y.toFixed(5)}`
      world.dataset.position = `${x.toFixed(2)},${y.toFixed(2)}`
    }
    const applyLayout = (next: TokenLayout, nextX = x, nextY = y, instant = false) => {
      // Retarget from what is actually on screen, not a previous target frame.
      paint()
      // Retain visible/near-visible flights, not exits already past the horizon.
      // This bounds repeated retargeting instead of accumulating old departures.
      const from = pool.filter(card => Math.abs(card.x) < metrics.radius * zoom * 1.2 && Math.abs(card.y) < metrics.radius * zoom * 1.2).map(card => ({ ...card }))
      cancelAnimationFrame(cardFrame); cardFrame = 0
      layout = next; slots = indexLayout(layout); x = nextX; y = nextY
      transitionX = x; transitionY = y
      const to = collectionCards()
      cardTransition = instant || reduced.matches || document.hidden ? null : createCardTransition(from, to, performance.now())
      const tick = () => { cardFrame = 0; paint(); if (cardTransition) cardFrame = requestAnimationFrame(tick) }
      tick()
    }
    const paintSurround = () => {
      world.dataset.background = atmosphereBackgroundHex
      world.dataset.selected = selectedToken?.id ?? ''
      paint()
    }
    const transitionScene = (from: MeshCard[], instant = false) => {
      cancelAnimationFrame(cardFrame); cardFrame = 0; cardTransition = null
      revealInstant = instant || reduced.matches || document.hidden
      revealPlan = linkRevealPlan(network.edges, selectedToken?.id ?? '')
      const to = inRelationships ? networkCards() : collectionCards()
      sceneTransition = instant || reduced.matches || document.hidden ? null : createSceneTransition(from, to, performance.now())
      const tick = () => { cardFrame = 0; paint(); if (sceneTransition) cardFrame = requestAnimationFrame(tick) }
      tick()
    }
    const clearSearch = () => {
      clearTimeout(searchTimer); searchQuery = ''; matchIds = undefined; setQuery('')
    }
    const enterRelationships = (token: typeof tokens[number] | null, instant = false) => {
      clearMotion()
      selectionReturn = searchReturn ? { ...searchReturn, x: searchReturn.x * zoom / searchReturn.zoom, y: searchReturn.y * zoom / searchReturn.zoom, zoom } : snapshot()
      paint()
      const from = pool.map(card => ({ ...card }))
      if (searchReturn) {
        const prior = searchReturn; searchReturn = null
        layout = prior.layout; slots = indexLayout(layout); x = prior.x * zoom / prior.zoom; y = prior.y * zoom / prior.zoom
      }
      clearSearch()
      inRelationships = true; selectedToken = token
      setRelationshipView(true); setSelectedId(token?.id ?? '')
      prominentIds = token ? neighborhood(relationships, token.id) : undefined
      setRelationshipText(token ? relationshipDescriptions(relationships, token.id) : [])
      fitNetwork()
      transitionScene(from, instant)
      paintSurround()
    }
    openRelationships.current = instant => {
      if (!inRelationships) enterRelationships(null, instant)
    }
    const selectToken = (token: typeof tokens[number] | null, remember = true, instant = false) => {
      // Card clicks only change the trace; the full graph and camera stay put.
      // Search also recenters the camera so an off-screen result can be found.
      if (token && inRelationships) {
        if (remember && selectedToken && token.id !== selectedToken.id) history.push({ id: selectedToken.id, ...snapshot() })
        clearTimeout(searchTimer)
        const fromSearch = Boolean(searchQuery || searchInput.current?.value)
        clearSearch()
        selectedToken = token
        if (fromSearch) networkView.current(token.id)
        traceId = token.id; tracePending = true; traceInstant = instant || reduced.matches
        tracePlan = linkRevealPlan(network.edges, token.id)
        prominentIds = neighborhood(relationships, token.id)
        setCanGoBack(history.length > 0)
        setSelectedId(token.id)
        setRelationshipText(relationshipDescriptions(relationships, token.id))
        // Show full neutral context immediately if the initial reveal is interrupted.
        for (const path of linkPaths.values()) { path.getAnimations().forEach(animation => animation.cancel()); path.style.strokeDasharray = '' }
        hoverId = hoverRenderId = ''; hoverAmount = 0
        paintSurround()
        return
      }
      traceId = ''; tracePending = false
      if (token) { enterRelationships(token, instant); return }
      history.length = 0; setCanGoBack(false)
      if (!inRelationships) { applySearch(''); return }
      clearMotion(); paint()
      const from = pool.map(card => ({ ...card }))
      clearSearch()
      inRelationships = false; selectedToken = null
      setRelationshipView(false); setSelectedId(''); setRelationshipText([])
      prominentIds = undefined
      if (selectionReturn) {
        const prior = selectionReturn; selectionReturn = null
        layout = prior.layout; slots = indexLayout(layout); x = prior.x; y = prior.y; zoom = prior.zoom
      }
      transitionScene(from, instant)
      paintSurround()
    }
    networkView.current = action => {
      sceneTransition = null; cancelAnimationFrame(cardFrame)
      if (action === 'fit') fitNetwork(true)
      else if (action === 'in' || action === 'out') {
        const next = zoomNetworkAt({ x: networkX, y: networkY, scale: networkScale }, action === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP, { x: 0, y: 0 })
        networkX = next.x; networkY = next.y; networkScale = next.scale
      } else {
        const node = network.nodes.find(node => node.id === action)
        if (node) { networkX = -(node.x + CARD_WIDTH / 2) * networkScale; networkY = -(node.y + CARD_HEIGHT / 2) * networkScale }
      }
      paint()
    }
    goBack.current = () => {
      const prior = history.pop()
      if (!prior) return
      selectToken(relationships.byId.get(prior.id) ?? null, false)
    }
    const applySearch = (text: string) => {
      clearMotion()
      clearTimeout(searchTimer)
      if (!text.trim()) {
        searchQuery = ''; matchIds = undefined; setQuery('')
        if (searchReturn) { const prior = searchReturn; searchReturn = null; applyLayout(prior.layout, prior.x * zoom / prior.zoom, prior.y * zoom / prior.zoom) }
        else paint()
        return
      }
      if (inRelationships) {
        searchQuery = text
        matchIds = new Set(searchTokens(tokens, text).map(match => match.token.id))
        paint(); return
      }
      if (!searchReturn) searchReturn = snapshot()
      searchQuery = text
      const matches = searchTokens(tokens, text)
      matchIds = new Set(matches.map(m => m.token.id))
      const row = Math.round(-y / (STEP_Y * collectionScale()))
      const col = Math.round((-x - rowOffset(row, collectionScale())) / (STEP_X * collectionScale()))
      const anchor = mod(row * layout.width + col, layout.count)
      if (matches.length) applyLayout(focusLayout(layout, matches.map(m => m.token.id), anchor))
      else paint() // Empty results keep the collection in place, never a blank canvas.
    }
    confirmSearch.current = () => {
      if (composing.current) return
      applySearch(searchInput.current?.value ?? '')
      if (inRelationships) {
        const token = searchTokens(tokens, searchInput.current?.value ?? '')[0]?.token
        if (token) selectToken(token, true, true)
      }
      viewport.current?.focus()
    }
    cancelSearch.current = () => clearTimeout(searchTimer)
    search.current = text => {
      setQuery(text)
      clearTimeout(searchTimer)
      if (composing.current) return
      if (!text.trim()) applySearch('')
      else searchTimer = setTimeout(() => applySearch(text), 140)
    }
    const exitExploration = () => {
      clearTimeout(searchTimer)
      if (searchQuery || searchInput.current?.value) { applySearch(''); return }
      selectToken(null)
    }
    choose.current = id => selectToken(tokens.find(token => token.id === id) ?? null, true, document.activeElement !== surface && document.activeElement?.matches(':focus-visible'))
    const hit = (clientX: number, clientY: number) => {
      const bounds = surface.getBoundingClientRect()
      if (inRelationships) {
        const px = clientX - bounds.left - bounds.width / 2, py = clientY - bounds.top - bounds.height / 2
        const card = [...pool].reverse().find(card => card.flatness === 1 && Math.abs(px - card.x) <= CARD_WIDTH * (card.scale ?? 1) * collectionScale() / 2 && Math.abs(py - card.y) <= CARD_HEIGHT * (card.scale ?? 1) * collectionScale() / 2)
        return card ? relationships.byId.get(card.token.id) ?? null : null
      }
      const token = pickToken(pool, clientX - bounds.left - bounds.width / 2, clientY - bounds.top - bounds.height / 2, metrics.radius * zoom, metrics.perspective * zoom, collectionScale()) as typeof tokens[number] | null
      return token && token.layer !== '__label' && token.layer !== '__blank' ? token : null
    }
    const animate = (now: number) => {
      frame = 0
      const dt = Math.min((now - previous) / 1000, 0.032)
      previous = now
      if (!inRelationships && !intro && pointer === null && !reduced.matches) {
        const decay = Math.exp(-4.8 * dt)
        x += vx * (1 - decay) / 4.8
        y += vy * (1 - decay) / 4.8
        vx *= decay; vy *= decay
      }
      const freshness = now - lastInput > 120 ? 0 : Math.exp(-Math.max(0, now - lastInput - 24) / 35)
      const moving = Math.abs(vx) + Math.abs(vy) > 2
      const target = reduced.matches || intro ? { x: 0, y: 0 } : velocityBlur(
        pointer === null && moving ? vx : inputVX * freshness,
        pointer === null && moving ? vy : inputVY * freshness,
      )
      if (reduced.matches) resetBlur(blur)
      else stepBlur(blur, target, dt)
      const targetHover = !reduced.matches && !cardTransition && !intro && pointer === null && hoverId ? 1 : 0
      if (hoverId && (targetHover || !hoverRenderId)) hoverRenderId = hoverId
      const hoverEase = 1 - Math.exp(-(targetHover > hoverAmount ? 9 : 5.2) * dt)
      hoverAmount += (targetHover - hoverAmount) * hoverEase
      if (hoverAmount < 0.01 && !targetHover) { hoverAmount = 0; hoverRenderId = hoverId }
      const targetTiltX = !reduced.matches && finePointer.matches && pointer === null ? hoverX * -0.025 : 0
      const targetTiltY = !reduced.matches && finePointer.matches && pointer === null ? hoverY * 0.018 : 0
      const tiltEase = 1 - Math.exp(-7 * dt)
      tiltX += (targetTiltX - tiltX) * tiltEase
      tiltY += (targetTiltY - tiltY) * tiltEase
      if (!moving && pointer === null) vx = vy = 0
      paint()
      if (app.dataset.renderer === 'webgl' && !document.hidden && !reduced.matches && ((pointer === null && moving) || intro || blurActive(blur) || Math.hypot(target.x, target.y) > 0.001 || Math.hypot(targetTiltX - tiltX, targetTiltY - tiltY) > 0.05 || Math.abs(targetHover - hoverAmount) > 0.001)) frame = requestAnimationFrame(animate)
    }
    const wake = () => {
      if (!frame && !document.hidden && app.dataset.renderer === 'webgl') { previous = performance.now(); frame = requestAnimationFrame(animate) }
    }
    let viewportWidth = surface.clientWidth, viewportHeight = surface.clientHeight
    const resize = () => {
      // Fallback hides the canvas. Do not treat its zero size as a mobile resize.
      if (!surface.clientWidth || !surface.clientHeight) return
      if (intro && (viewportWidth !== surface.clientWidth || viewportHeight !== surface.clientHeight)) clearMotion()
      viewportWidth = surface.clientWidth; viewportHeight = surface.clientHeight
      cancelAnimationFrame(cardFrame); cardFrame = 0; cardTransition = null
      const previousScale = metrics.scale
      metrics = gridMetrics(surface.clientWidth, surface.clientHeight)
      // Preserve logical sheet position across the mobile scale breakpoint.
      const ratio = metrics.scale / previousScale
      x *= ratio; y *= ratio
      for (const entry of [...history, ...(selectionReturn ? [selectionReturn] : []), ...(searchReturn ? [searchReturn] : [])]) { entry.x *= ratio; entry.y *= ratio }
      renderer?.resize(surface.clientWidth, surface.clientHeight)
      world.dataset.poolSize = String(metrics.columns * metrics.rows)
      if (inRelationships) { fitNetwork(); sceneTransition = null }
      paint()
    }
    const pointerPoint = (clientX: number, clientY: number) => {
      const bounds = surface.getBoundingClientRect()
      return { x: clientX - bounds.left - bounds.width / 2, y: clientY - bounds.top - bounds.height / 2 }
    }
    const touchPair = () => {
      const [a, b] = [...touches.values()]
      return { distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
    }
    const zoomCollection = (factor: number, point = { x: 0, y: 0 }) => {
      clearMotion()
      cancelAnimationFrame(cardFrame); cardFrame = 0; cardTransition = null; sceneTransition = null
      const next = zoomCollectionAt({ x, y, zoom }, factor, point, metrics)
      x = next.x; y = next.y; zoom = next.zoom
      paint()
    }
    collectionView.current = action => {
      if (inRelationships) return
      zoomCollection(action === 'reset' ? 1 / zoom : action === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP)
    }
    const down = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        touches.set(event.pointerId, pointerPoint(event.clientX, event.clientY))
        surface.setPointerCapture(event.pointerId)
        if (touches.size === 2) {
          pinch = { ...touchPair(), camera: inRelationships ? { x: networkX, y: networkY, scale: networkScale } : { x, y, scale: zoom } }
          clearMotion()
          dragged = true; sceneTransition = null; cancelAnimationFrame(cardFrame)
          return
        }
        if (touches.size > 2) return
      }
      if (pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return
      hoverId = ''; delete surface.dataset.hovering
      pointer = event.pointerId; vx = vy = inputVX = inputVY = 0
      lastX = selectionStartX = event.clientX; lastY = selectionStartY = event.clientY; lastMove = performance.now(); dragged = false
      surface.setPointerCapture(pointer)
      surface.dataset.dragging = 'true'
      surface.focus({ preventScroll: true })
    }
    const move = (event: PointerEvent) => {
      if (touches.has(event.pointerId)) {
        touches.set(event.pointerId, pointerPoint(event.clientX, event.clientY))
        if (pinch && touches.size >= 2) {
          const pair = touchPair()
          if (inRelationships) {
            const next = zoomNetworkAt(pinch.camera, pair.distance / pinch.distance, pinch.midpoint)
            networkScale = next.scale
            networkX = next.x + pair.midpoint.x - pinch.midpoint.x
            networkY = next.y + pair.midpoint.y - pinch.midpoint.y
          } else {
            const next = zoomCollectionAt({ x: pinch.camera.x, y: pinch.camera.y, zoom: pinch.camera.scale }, pair.distance / pinch.distance, pinch.midpoint, metrics)
            zoom = next.zoom
            x = next.x + pair.midpoint.x - pinch.midpoint.x
            y = next.y + pair.midpoint.y - pinch.midpoint.y
          }
          hoverId = ''; paint(); return
        }
      }
      if (event.pointerId !== pointer) return
      hoverId = ''; delete surface.dataset.hovering
      if (!dragged && Math.hypot(event.clientX - selectionStartX, event.clientY - selectionStartY) < 6) return
      dragged = true
      const now = performance.now(), dt = Math.max((now - lastMove) / 1000, 0.008)
      const dx = event.clientX - lastX, dy = event.clientY - lastY
      if (inRelationships) {
        sceneTransition = null; cancelAnimationFrame(cardFrame)
        networkX += dx; networkY += dy
        lastX = event.clientX; lastY = event.clientY; lastMove = now
        paint(); return
      }
      x += dx; y += dy
      vx = Math.max(-2400, Math.min(2400, dx / dt))
      vy = Math.max(-2400, Math.min(2400, dy / dt))
      inputVX = vx; inputVY = vy; lastInput = now
      lastX = event.clientX; lastY = event.clientY; lastMove = now
      paint(); wake()
    }
    const release = (event: PointerEvent) => {
      if (touches.has(event.pointerId)) {
        touches.delete(event.pointerId)
        if (pinch) {
          pinch = null; dragged = true
          if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId)
          const remaining = touches.entries().next().value
          pointer = remaining?.[0] ?? null
          if (remaining) {
            const bounds = surface.getBoundingClientRect()
            lastX = remaining[1].x + bounds.left + bounds.width / 2
            lastY = remaining[1].y + bounds.top + bounds.height / 2
          } else delete surface.dataset.dragging
          return
        }
      }
      if (event.pointerId !== pointer) return
      pointer = null
      delete surface.dataset.dragging
      if (performance.now() - lastMove > 90 || event.type !== 'pointerup' || reduced.matches) vx = vy = 0
      inputVX = inputVY = 0
      if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId)
      if (!dragged && event.type === 'pointerup') {
        const token = hit(event.clientX, event.clientY)
        if (token) {
          selectToken(token)
        }
      } else wake()
    }
    const hover = (event: PointerEvent) => {
      if (!finePointer.matches || pointer !== null || event.pointerType !== 'mouse') return
      const bounds = surface.getBoundingClientRect()
      hoverX = Math.max(-1, Math.min(1, (event.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2)))
      hoverY = Math.max(-1, Math.min(1, (event.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2)))
      const token = hit(event.clientX, event.clientY)
      const nextId = token?.id ?? ''
      if (nextId !== hoverId) {
        if (nextId && hoverRenderId && nextId !== hoverRenderId) hoverAmount = 0
        hoverId = nextId
        if (hoverId) surface.dataset.hovering = 'true'
        else delete surface.dataset.hovering
        wake()
      }
      paint(); wake()
    }
    const leave = () => {
      hoverId = ''; hoverX = hoverY = 0
      delete surface.dataset.hovering
      wake(); paint()
    }
    const wheel = (event: WheelEvent) => {
      if (inRelationships) {
        event.preventDefault(); sceneTransition = null; cancelAnimationFrame(cardFrame)
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? surface.clientHeight : 1
        if (event.ctrlKey || event.metaKey || event.altKey) {
          const factor = Math.exp(Math.max(-1, Math.min(1, -event.deltaY * unit * .01)))
          const next = zoomNetworkAt({ x: networkX, y: networkY, scale: networkScale }, factor, pointerPoint(event.clientX, event.clientY))
          networkX = next.x; networkY = next.y; networkScale = next.scale
        } else { networkX -= event.deltaX * unit; networkY -= event.deltaY * unit }
        hoverId = ''; paint(); return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        event.preventDefault()
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? surface.clientHeight : 1
        zoomCollection(Math.exp(Math.max(-1, Math.min(1, -event.deltaY * unit * .01))), pointerPoint(event.clientX, event.clientY))
        return
      }
      event.preventDefault()
      vx = vy = 0
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? surface.clientHeight : 1
      const now = performance.now()
      const dt = Math.max(0.008, Math.min(0.05, (now - wheelTime) / 1000 || 0.016))
      wheelTime = now; lastInput = now
      inputVX = Math.max(-2400, Math.min(2400, -event.deltaX * unit / dt))
      inputVY = Math.max(-2400, Math.min(2400, -event.deltaY * unit / dt))
      x -= event.deltaX * unit; y -= event.deltaY * unit
      paint(); wake() // Trackpads provide their own momentum: don't apply it twice.
    }
    // Safari trackpad pinch uses GestureEvent rather than ctrl-wheel.
    let safariPinch: { camera: { x: number; y: number; scale: number }; point: { x: number; y: number }; scale: number } | null = null
    type PinchEvent = Event & { scale: number; clientX: number; clientY: number }
    const gestureStart = (event: Event) => {
      event.preventDefault()
      clearMotion()
      const gesture = event as PinchEvent
      safariPinch = { camera: inRelationships ? { x: networkX, y: networkY, scale: networkScale } : { x, y, scale: zoom }, point: pointerPoint(gesture.clientX, gesture.clientY), scale: gesture.scale || 1 }
      sceneTransition = null; cancelAnimationFrame(cardFrame)
    }
    const gestureChange = (event: Event) => {
      if (!safariPinch) return
      event.preventDefault()
      if (inRelationships) {
        const next = zoomNetworkAt(safariPinch.camera, (event as PinchEvent).scale / safariPinch.scale, safariPinch.point)
        networkX = next.x; networkY = next.y; networkScale = next.scale
      } else {
        const next = zoomCollectionAt({ x: safariPinch.camera.x, y: safariPinch.camera.y, zoom: safariPinch.camera.scale }, (event as PinchEvent).scale / safariPinch.scale, safariPinch.point, metrics)
        x = next.x; y = next.y; zoom = next.zoom
      }
      paint()
    }
    const gestureEnd = (event: Event) => {
      if (safariPinch) event.preventDefault()
      safariPinch = null
    }
    const key = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const steps: Record<string, [number, number]> = { ArrowLeft: [STEP_X, 0], ArrowRight: [-STEP_X, 0], ArrowUp: [0, STEP_Y], ArrowDown: [0, -STEP_Y] }
      if (['+', '=', '-', '0'].includes(event.key)) {
        event.preventDefault()
        if (inRelationships) networkView.current(event.key === '-' ? 'out' : event.key === '0' ? 'fit' : 'in')
        else collectionView.current(event.key === '-' ? 'out' : event.key === '0' ? 'reset' : 'in')
        return
      }
      if (event.key === 'Escape') { event.preventDefault(); exitExploration(); return }
      if (inRelationships && steps[event.key]) {
        event.preventDefault(); sceneTransition = null; cancelAnimationFrame(cardFrame)
        networkX += steps[event.key][0]; networkY += steps[event.key][1]; paint(); return
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        const bounds = surface.getBoundingClientRect()
        const token = hit(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
        if (token) selectToken(token, true, true)
        return
      }
      if (steps[event.key]) {
        event.preventDefault(); clearMotion()
        x += steps[event.key][0] * collectionScale(); y += steps[event.key][1] * collectionScale()
        paint()
      }
    }
    const stop = () => {
      clearMotion()
      cancelAnimationFrame(cardFrame); cardFrame = 0; cardTransition = null; sceneTransition = null
      revealInstant = true
      for (const path of [...linkPaths.values(), ...tracePaths.values()]) { path.getAnimations().forEach(animation => animation.cancel()); path.style.strokeDasharray = '' }
      traceInstant = true
      const captured = pointer
      const touchIds = [...touches.keys()]
      touches.clear(); pinch = null; safariPinch = null
      for (const id of touchIds) if (surface.hasPointerCapture(id)) surface.releasePointerCapture(id)
      pointer = null
      hoverId = ''; hoverX = hoverY = 0; tiltX = tiltY = 0
      if (captured !== null && surface.hasPointerCapture(captured)) surface.releasePointerCapture(captured)
      delete surface.dataset.dragging
      delete surface.dataset.hovering
      paintSurround()
    }
    const initialize = () => {
      try {
        renderer?.dispose()
        renderer = createMeshRenderer(world)
        app.dataset.renderer = 'webgl'
        resize()
      } catch {
        renderer?.dispose(); renderer = null
        unavailable()
      }
    }
    const contextLost = (event: Event) => {
      event.preventDefault()
      stop()
      unavailable()
    }
    const contextRestored = () => initialize()
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && event.target !== surface) { event.preventDefault(); exitExploration() }
    }
    const visibility = () => { stop(); if (!document.hidden && app.dataset.renderer === 'webgl') paint() }
    world.addEventListener('webglcontextlost', contextLost)
    world.addEventListener('webglcontextrestored', contextRestored)
    const observer = new ResizeObserver(resize)
    observer.observe(surface)
    initialize()
    paintSurround()
    if (app.dataset.renderer === 'webgl') notifyReadyOnce('webgl')
    if (intro) { intro.start = performance.now(); wake() }
    const interruptIntro = () => {
      if (!intro) return
      clearMotion(); paint()
    }
    // Capture chrome input too: interacting with search must not leave the surface drifting.
    const introInputEvents = ['pointerdown', 'wheel', 'keydown', 'focusin', 'input'] as const
    for (const event of introInputEvents) app.addEventListener(event, interruptIntro, { capture: true, passive: true })
    surface.addEventListener('pointerdown', down)
    surface.addEventListener('pointermove', hover)
    surface.addEventListener('pointermove', move)
    surface.addEventListener('pointerleave', leave)
    surface.addEventListener('pointerup', release)
    surface.addEventListener('pointercancel', release)
    surface.addEventListener('lostpointercapture', release)
    surface.addEventListener('wheel', wheel, { passive: false })
    surface.addEventListener('gesturestart', gestureStart, { passive: false })
    surface.addEventListener('gesturechange', gestureChange, { passive: false })
    surface.addEventListener('gestureend', gestureEnd, { passive: false })
    surface.addEventListener('keydown', key)
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('keydown', escape)
    reduced.addEventListener('change', stop)
    return () => {
      for (const event of introInputEvents) app.removeEventListener(event, interruptIntro, true)
      cancelAnimationFrame(readyFrame); clearTimeout(searchTimer); stop(); observer.disconnect(); renderer?.dispose()
      world.removeEventListener('webglcontextlost', contextLost)
      world.removeEventListener('webglcontextrestored', contextRestored)
      surface.removeEventListener('pointerdown', down)
      surface.removeEventListener('pointermove', hover)
      surface.removeEventListener('pointermove', move)
      surface.removeEventListener('pointerleave', leave)
      surface.removeEventListener('pointerup', release)
      surface.removeEventListener('pointercancel', release)
      surface.removeEventListener('lostpointercapture', release)
      surface.removeEventListener('wheel', wheel)
      surface.removeEventListener('gesturestart', gestureStart)
      surface.removeEventListener('gesturechange', gestureChange)
      surface.removeEventListener('gestureend', gestureEnd)
      surface.removeEventListener('keydown', key)
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', visibility)
      document.removeEventListener('keydown', escape)
      reduced.removeEventListener('change', stop)
    }
  }, [tokens, relationships, homeId, makeLayout, networkLayout, backgroundR, backgroundG, backgroundB, introMode, initialLabelOpacity])

  return (
    <main className="token-surface" data-view={relationshipView ? 'relationships' : 'collection'}>
      <h1 className="surface-sr-only">Color — Visual Scales — {data.meta.name}</h1>
      <div className="surface-dock">
        <div className="surface-mode-switch" role="group" aria-label="Visualization">
          <button aria-label="Collection" title="collection" aria-pressed={!relationshipView} onClick={() => { choose.current(''); viewport.current?.focus({ preventScroll: true }) }}><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" /><ellipse cx="10" cy="10" rx="3" ry="7" /><path d="M3 10h14" /></svg><span>Collection</span></button>
          <button aria-label="Relationships" title="relationships" aria-pressed={relationshipView} onClick={event => { openRelationships.current(event.detail === 0); viewport.current?.focus({ preventScroll: true }) }}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 6v4m0 0H4v4m6-4h6v4" /><rect x="7" y="2" width="6" height="4" rx="1" /><rect x="1" y="14" width="6" height="4" rx="1" /><rect x="13" y="14" width="6" height="4" rx="1" /></svg><span>Relationships</span></button>
        </div>
        <div className="surface-toolbar">
          <div className="toolbar-search">
            <svg className="toolbar-search-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M8.75 14.5a5.75 5.75 0 1 1 0-11.5 5.75 5.75 0 0 1 0 11.5Zm4.25-1.5 4 4" /></svg>
            <input ref={searchInput} type="search" aria-label="Search tokens" placeholder="Search tokens…" value={query}
              onChange={event => search.current(event.target.value)}
              onCompositionStart={() => { composing.current = true; cancelSearch.current() }}
              onCompositionEnd={event => { composing.current = false; search.current(event.currentTarget.value) }}
              onKeyDown={event => { if (event.key === 'Enter' && !composing.current) { confirmSearch.current(); event.preventDefault() } }} />
            {query && <button className="toolbar-clear-search" aria-label="Clear search" title="clear search" onClick={() => { search.current(''); searchInput.current?.focus() }}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 6l8 8M14 6l-8 8" /></svg>
            </button>}
          </div>
          {query.trim() && <div className="surface-search-results" aria-label="Token search results">
            {searchResults.length ? searchResults.map(({ token }) => <div className="surface-search-row" key={token.id}>
              <button className="surface-search-token" onClick={() => { choose.current(token.id); viewport.current?.focus({ preventScroll: true }) }}
                aria-label={`${token.id} · ${token.light}`}>
                <span className="search-result-swatch" style={{ background: token.light }} aria-hidden="true" />
                <span>{token.id}</span><code>{token.light}</code>
              </button>
            </div>) : <p role="status">No matching tokens.</p>}
          </div>}
        </div>
        <div className="surface-zoom-controls" role="group" aria-label="Zoom">
          <button aria-label="Zoom out" title="zoom out (−)" disabled={zoomControls.atMin} onClick={() => relationshipView ? networkView.current('out') : collectionView.current('out')}>−</button>
          <button className="surface-zoom-reset" aria-label={`${relationshipView ? 'Fit graph' : 'Reset zoom'} (${zoomControls.percent}%)`} title={relationshipView ? 'fit the whole graph (0)' : 'reset to 100% (0)'} onClick={() => relationshipView ? networkView.current('fit') : collectionView.current('reset')}>{zoomControls.percent}%</button>
          <button aria-label="Zoom in" title="zoom in (+)" disabled={zoomControls.atMax} onClick={() => relationshipView ? networkView.current('in') : collectionView.current('in')}>+</button>
        </div>
        {(canGoBack || relationshipView) && (
          <div className="surface-contextual">
            {canGoBack && <button onClick={() => { goBack.current(); viewport.current?.focus({ preventScroll: true }) }} aria-label="Back through references" title="back through references">← Back</button>}
            {relationshipView && <button onClick={() => { choose.current(''); viewport.current?.focus({ preventScroll: true }) }} aria-label="Back to collection" title="back to collection (esc)">Back to collection</button>}
          </div>
        )}
      </div>
      <div className="surface-viewport" ref={viewport} tabIndex={0} role="region" aria-label={relationshipView ? "Token collection and relationship network" : "Infinite curved token grid"} aria-describedby="surface-help surface-relationship-descriptions">
        <canvas className="surface-grid" ref={grid} aria-hidden="true" />
        <svg className="relationship-connectors" aria-hidden="true">
          <defs><mask id="network-card-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
            <rect width="100%" height="100%" fill="white" />
            <g ref={connectorMask} />
          </mask></defs>
          <g className="network-base-links" ref={connectors} mask="url(#network-card-mask)" />
          <g className="network-trace-links" ref={traceConnectors} mask="url(#network-card-mask)" />
        </svg>
      </div>
      <p className="surface-fallback" role="status">3D rendering is unavailable. Your tokens are shown below.</p>
      <ul className="surface-sr-only" aria-label={`${tokens.length} ${data.meta.name} color tokens`}>
        {tokens.map(token => <li key={token.id}><span className="fallback-swatch" aria-hidden="true" style={{ background: token.light }} /><span>{token.id}</span><code>{token.light}</code></li>)}
      </ul>
      <ul id="surface-relationship-descriptions" className="surface-sr-only" aria-label="Selected token directed relationships">
        {relationshipText.map(text => <li key={text}>{text}</li>)}
      </ul>
      {relationshipView && <ul className="surface-sr-only" aria-label="Network tokens">
        {networkLayout.nodes.map(({ token }) => <li key={token.id}><button
          onFocus={() => networkView.current(token.id)} onClick={() => choose.current(token.id)}
          aria-label={`${token.id} · ${token.light}`}>{token.id}</button></li>)}
      </ul>}
      <p id="surface-help" className="surface-sr-only">Drag or arrow keys to explore the collection. Enter opens relationships for the centered token. In both views, pinch, Control, Command or Alt plus scroll, or the plus and minus buttons zoom around the pointer or view center. The percentage shows card size relative to the default reading size. Click the percentage or press zero to reset Collection to 100% or fit the whole Relationships graph. Clicking a collection card opens relationships. Returning restores the globe position and zoom. Browser keyboard zoom shortcuts remain available. Relationships contains every token and verified reference. In relationships, drag or scroll to pan. Click a card to trace its sources and consumers in red without changing the network. Tab moves between token cards. Escape returns to the collection.</p>
      <span className="surface-sr-only surface-selection-status" role="status">{selected ? `${selected.id} selected. ${selected.light}${transparent ? '. Alpha over white' : ''}${selected.alpha != null ? `. Alpha modifier ${Math.round(selected.alpha * 100)}%` : ''}. ${source ? `${selectedLineage?.ancestors.length} ${selectedLineage?.ancestors.length === 1 ? 'ancestor' : 'ancestors'}, ` : ''}${dependents.length} ${dependents.length === 1 ? 'descendant' : 'descendants'}.${selected.reference && !source ? ` Reference outside this view: ${selected.reference}.` : ''}` : ''}</span>
    </main>
  )
}

