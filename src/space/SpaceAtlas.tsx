import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import {
  format,
  groupMeasurements,
  kindGlyphs,
  kindLabels,
  resolveMeasurements,
  searchMeasurements,
  type Measurement,
  type MeasurementGroup,
} from './data.js'
import {
  DEFAULT_CAMERA,
  makeTicks,
  MAX_SCALE,
  MIN_SCALE,
  pan,
  project,
  zoomAt,
} from './camera.js'
import { layoutStops, type Stop } from './layout.js'
import { useCamera } from './useCamera.js'
import { useNumberMotion } from './useNumberMotion.js'
import { useSpaceIntro } from './useSpaceIntro.js'
import { Specimen } from './Specimen.js'
import './space.css'

export default function SpaceAtlas() {
  const {
    camera,
    live,
    size,
    viewport,
    dragging,
    ignoreClickRef,
    moveTo,
    update,
    stop,
  } = useCamera()
  const rulerRef = useRef<HTMLDivElement>(null)
  const [rootSize, setRootSize] = useState(16)
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [list, setList] = useState(false)
  const [keyboard, setKeyboard] = useState(false)
  useSpaceIntro(rulerRef)
  useNumberMotion(rulerRef, camera, size.width, keyboard)
  const items = useMemo(() => resolveMeasurements(rootSize), [rootSize])
  const groups = useMemo(() => groupMeasurements(items), [items])
  const selected = items.find((item) => item.id === selectedId)
  const selectedGroup = groups.find((group) => group.value === selected?.value)
  const matches = searchMeasurements(items, query)
  const stops = layoutStops(groups, camera, size.width, selected?.value)
  // Reserve room for the specimen strip even when nothing is selected, so
  // the ruler never shifts and its lower labels stay clear on short screens.
  const axisY = Math.min(size.height * 0.46, Math.max(90, size.height - 464))
  const ticks = makeTicks(camera, size.width)
  const choose = (item: Measurement, instant = keyboard) => {
    setSelectedId(item.id)
    setQuery('')
    setList(false)
    moveTo({ ...live.current, center: item.value }, instant)
  }
  const chooseGroup = (group: MeasurementGroup, instant = keyboard) =>
    choose(
      group.items.find((item) => item.id === selectedId) ?? group.items[0],
      instant
    )
  const handleStop = (landmark: Stop, event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0 && ignoreClickRef.current) {
      ignoreClickRef.current = false
      return
    }
    if (!landmark.clustered) {
      if (landmark.value === selected?.value) setSelectedId('')
      else chooseGroup(landmark.groups[0], event.detail === 0)
    } else {
      const span = landmark.groups.at(-1)!.value - landmark.groups[0].value
      moveTo(
        {
          center: landmark.value,
          scale: Math.min(
            MAX_SCALE,
            Math.max(
              live.current.scale * 2,
              (size.width * 0.55) / Math.max(1, span)
            )
          ),
        },
        event.detail === 0
      )
    }
    viewport.current?.focus({ preventScroll: true })
  }
  const changeZoom = (factor: number) => {
    stop()
    update(zoomAt(live.current, factor, size.width / 2, size.width))
  }
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest('input, select, textarea')
    )
      return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    setKeyboard(true)
    let handled = true
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      stop()
      update(
        pan(
          live.current,
          event.key === 'ArrowLeft' ? size.width * 0.16 : -size.width * 0.16
        )
      )
    } else if (event.key === '+' || event.key === '=') changeZoom(1.3)
    else if (event.key === '-') changeZoom(1 / 1.3)
    else if (event.key === 'Home') {
      setSelectedId('')
      moveTo(DEFAULT_CAMERA, true)
    } else if (event.key === 'Enter' && event.target === event.currentTarget) {
      const nearest = groups.reduce(
        (best, group) =>
          Math.abs(group.value - camera.center) <
          Math.abs(best.value - camera.center)
            ? group
            : best,
        groups[0]
      )
      chooseGroup(nearest, true)
    } else if (event.key === 'Escape') {
      setSelectedId('')
      setQuery('')
      setList(false)
    } else handled = false
    if (handled) event.preventDefault()
  }
  return (
    <main
      className="space-atlas"
      data-intro="pending"
      data-keyboard={keyboard}
      onPointerDownCapture={(event) => {
        setKeyboard(false)
        if (!viewport.current?.contains(event.target as Node)) stop()
      }}
      onKeyDownCapture={() => setKeyboard(true)}
      onWheelCapture={() => setKeyboard(false)}
    >
      <h1 className="space-sr-only">Space — Visual Scales</h1>
      <div
        className="space-world"
        ref={viewport}
        tabIndex={0}
        role="region"
        aria-label="Dimensional ruler. Drag or scroll to pan; pinch or control-wheel to zoom. Arrow keys pan, plus and minus zoom, Home resets, Enter selects the center, Escape clears focus."
        data-dragging={dragging || undefined}
        data-center={camera.center}
        data-scale={camera.scale}
        onKeyDown={onKey}
      >
        <div
          className="space-ruler"
          ref={rulerRef}
          data-width={size.width}
          style={{ transform: `translateY(${axisY}px)` }}
        >
          <div className="space-ruler-axis" />
          <div
            className="space-zero-ground"
            style={{ width: Math.max(0, project(0, camera, size.width) - 2) }}
            aria-hidden="true"
          />
          <div className="space-ruler-ticks" aria-hidden="true">
            {ticks.map((tick) => (
              <div
                className={`space-tick${tick.major ? ' space-tick-major' : ''}${tick.value > 960 ? ' space-tick-beyond' : ''}`}
                key={tick.value}
                style={{ transform: `translateX(${tick.x}px)` }}
              >
                {tick.major && (
                  <span className="space-tick-label">
                    <span
                      className="space-tick-number"
                      data-number-key={`tick-${tick.value}`}
                      data-number-value={tick.value}
                    >
                      <span className="space-intro-label">
                        {format(tick.value)}
                      </span>
                    </span>
                  </span>
                )}
                <i />
              </div>
            ))}
          </div>
          <div className="space-value-marks" aria-hidden="true">
            {groups.map((group) => (
              <i
                className="space-value-mark"
                key={group.value}
                data-value={group.value}
                data-active={group.value === selected?.value || undefined}
                style={{
                  transform: `translateX(${project(group.value, camera, size.width)}px)`,
                }}
              />
            ))}
          </div>
          <div className="space-landmarks">
            {stops.map((landmark) => {
              const active = landmark.groups.some(
                (group) => group.value === selected?.value
              )
              const count = landmark.groups.reduce(
                (sum, group) => sum + group.items.length,
                0
              )
              const kinds = [
                ...new Set(
                  landmark.groups.flatMap((group) =>
                    group.items.map((item) => item.kind)
                  )
                ),
              ]
              const label = landmark.clustered
                ? `${format(landmark.groups[0].value)}–${format(landmark.groups.at(-1)!.value)}px, ${count} tokens. Zoom into this range`
                : `${format(landmark.value)}px, ${count} tokens: ${kinds.map((kind) => kindLabels[kind]).join(', ')}`
              return (
                <div
                  className="space-landmark"
                  key={landmark.groups.map((group) => group.value).join('-')}
                  style={{
                    transform: `translateX(${landmark.x}px)`,
                    top: landmark.top,
                  }}
                  data-active={active || undefined}
                >
                  <i
                    className="space-landmark-stem"
                    style={{ height: landmark.top - 12 }}
                    aria-hidden="true"
                  />
                  <button
                    className="space-stop"
                    aria-label={label}
                    aria-pressed={landmark.clustered ? undefined : active}
                    data-cluster={landmark.clustered || undefined}
                    title={label}
                    data-value={
                      !landmark.clustered ? landmark.value : undefined
                    }
                    onClick={(event) => handleStop(landmark, event)}
                  >
                    <span
                      className="space-stop-value"
                      data-number-key={`stop-${landmark.groups.map((group) => group.value).join('-')}`}
                      data-number-value={landmark.value}
                    >
                      <span className="space-intro-label">
                        {landmark.clustered
                          ? `${format(landmark.groups[0].value)}–${format(landmark.groups.at(-1)!.value)}`
                          : format(landmark.value)}
                        <small>px</small>
                      </span>
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
        {!stops.length && (
          <div className="space-no-landmarks">
            <span>No tokens in this stretch.</span>
            <button
              onClick={() => {
                setSelectedId('')
                moveTo(DEFAULT_CAMERA, keyboard)
              }}
            >
              Back to 16px →
            </button>
          </div>
        )}
      </div>
      {selectedGroup && (
        <section className="space-focus" aria-label="Focused measurement">
          <h2 className="space-sr-only">{format(selectedGroup.value)}px</h2>
          <button
            className="space-clear"
            aria-label="Clear focus"
            title="back to ruler (esc)"
            onClick={() => setSelectedId('')}
          >
            ×
          </button>
          <div className="space-specimen-strip">
            {selectedGroup.items.map((item) => (
              <div className="space-specimen-entry" key={item.id}>
                <Specimen item={item} />
              </div>
            ))}
          </div>
        </section>
      )}
      <footer className="space-dock">
        <div className="space-search">
          <button
            className="space-index-toggle"
            aria-pressed={list}
            aria-label="Browse all tokens"
            title="browse tokens and root context"
            onClick={() => {
              setList((value) => !value)
              setQuery('')
            }}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M8.75 14.5a5.75 5.75 0 1 1 0-11.5 5.75 5.75 0 0 1 0 11.5Zm4.25-1.5 4 4" />
            </svg>
          </button>
          <input
            type="search"
            aria-label="Search space tokens"
            placeholder="search tokens…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setList(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setQuery('')
                setList(false)
              }
              if (event.key === 'Enter' && matches[0]) {
                choose(matches[0], true)
                viewport.current?.focus()
              }
            }}
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery('')}>
              ×
            </button>
          )}
        </div>
        <div className="space-zoom">
          <button
            aria-label="Zoom out"
            disabled={camera.scale <= MIN_SCALE}
            onClick={() => changeZoom(1 / 1.3)}
          >
            −
          </button>
          <button
            aria-label="Reset view"
            className="space-reset"
            onClick={() => {
              setSelectedId('')
              moveTo(DEFAULT_CAMERA, keyboard)
            }}
          >
            {Math.round((camera.scale / DEFAULT_CAMERA.scale) * 100)}%
          </button>
          <button
            aria-label="Zoom in"
            disabled={camera.scale >= MAX_SCALE}
            onClick={() => changeZoom(1.3)}
          >
            +
          </button>
        </div>
        {(query || list) && (
          <div
            className="space-results"
            role="region"
            aria-label={list ? 'All space tokens' : 'Search results'}
          >
            {list && (
              <label className="space-root">
                root
                <select
                  aria-label="Root font size"
                  value={rootSize}
                  onChange={(event) => {
                    const root = Number(event.target.value)
                    const next = resolveMeasurements(root).find(
                      (item) => item.id === selectedId
                    )
                    setRootSize(root)
                    if (next)
                      moveTo({ ...live.current, center: next.value }, true)
                  }}
                >
                  {[16, 18, 20].map((value) => (
                    <option key={value} value={value}>
                      {value}px
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(list
              ? [...items].sort((a, b) => a.value - b.value)
              : matches
            ).map((item) => (
              <button
                key={item.id}
                onClick={(event) => {
                  choose(item, event.detail === 0)
                  viewport.current?.focus({ preventScroll: true })
                }}
              >
                <span className="space-result-glyph" aria-hidden="true">
                  {kindGlyphs[item.kind]}
                </span>
                <span>
                  <code>{item.id}</code>
                  <small>
                    {kindLabels[item.kind]} · {item.expression}
                  </small>
                </span>
                <strong>
                  {format(item.value)}
                  <small>px</small>
                </strong>
              </button>
            ))}
            {query && !matches.length && (
              <p>No matches. Try “radius”, “16px”, or a token name.</p>
            )}
          </div>
        )}
      </footer>
      <span
        className="space-attribution"
        title="50 fictional dimensional tokens"
      >
        space — sample
      </span>
      <p className="space-sr-only">
        Engraved marks below the axis show each distinct resolved value,
        including values inside labelled ranges. Shared values make one mark,
        regardless of token count. Stops are resolved CSS pixel lengths. Ruler
        zoom does not scale the specimens, which render at 1:1 CSS px. Equal
        lengths do not imply shared references. Select a range to zoom closer;
        select an active measurement to clear focus. Browse all tokens to change
        the rem root context.
      </p>
      <div className="space-sr-only" role="status" aria-live="polite">
        {selectedGroup
          ? `${format(selectedGroup.value)}px selected. ${selectedGroup.items.length} separate tokens. ${selected ? kindLabels[selected.kind] + ': ' + selected.id : ''}`
          : 'Focus cleared. Explore the dimensional ruler.'}
      </div>
    </main>
  )
}
