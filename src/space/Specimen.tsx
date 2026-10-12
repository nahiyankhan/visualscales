import type { CSSProperties } from 'react'
import { families } from '../data/dimensions.js'
import { format, kindLabels, type Measurement } from './data.js'
import './specimen.css'

const sample = 'Good things take shape.'
const dimensionPreviewWidth = 198

function px(value: number) {
  return `${format(value)}px`
}

function typeVars(item: Measurement): CSSProperties {
  const type = item.type
  return {
    fontFamily: type ? families[type.family] : families.sans,
    fontWeight: type?.weight ?? 400,
    letterSpacing: type ? `${type.tracking}em` : undefined,
  }
}

function TypePreview({ item }: { item: Measurement }) {
  return (
    <span className="space-specimen-well space-specimen-type-well">
      <span
        className="space-specimen-type-sample"
        style={{
          ...typeVars(item),
          fontSize: item.value,
          lineHeight: item.type?.lineHeight ?? 1.15,
        }}
      >
        {sample}
      </span>
    </span>
  )
}

function LeadingPreview({ item }: { item: Measurement }) {
  const multiplier = item.multiplier ?? item.type?.lineHeight ?? 1
  const fontSize = multiplier ? item.value / multiplier : item.value
  return (
    <span className="space-specimen-well space-specimen-leading-well">
      <span
        className="space-specimen-leading-text"
        style={{
          ...typeVars(item),
          fontSize,
          lineHeight: multiplier,
        }}
      >
        Good things
        <br />
        take shape.
      </span>
      <span
        className="space-specimen-leading-mark"
        style={{ height: item.value, top: `calc(50% - ${item.value}px)` }}
        aria-hidden="true"
      />
    </span>
  )
}

function GapPreview({ item }: { item: Measurement }) {
  return (
    <span className="space-specimen-well space-specimen-gap-well">
      <span className="space-specimen-gap-row" style={{ gap: item.value }}>
        <span />
        <span />
      </span>
      <span
        className="space-specimen-gap-line"
        style={{ width: item.value }}
        aria-hidden="true"
      />
    </span>
  )
}

function RadiusPreview({ item }: { item: Measurement }) {
  return (
    <span className="space-specimen-well space-specimen-radius-well">
      <span
        className="space-specimen-radius-object"
        style={{ borderRadius: item.value }}
      />
      <span
        className="space-specimen-radius-mark"
        style={{
          width: item.value,
          height: item.value,
          borderTopLeftRadius: item.value,
        }}
        aria-hidden="true"
      />
    </span>
  )
}

function BorderPreview({ item }: { item: Measurement }) {
  return (
    <span className="space-specimen-well space-specimen-border-well">
      <span
        className="space-specimen-border-line"
        style={{ height: item.value }}
      />
      <span
        className="space-specimen-leading-mark space-specimen-border-mark"
        style={{ height: item.value, top: `calc(50% - ${item.value / 2}px)` }}
        aria-hidden="true"
      />
    </span>
  )
}

function DimensionPreview({ item }: { item: Measurement }) {
  const small = item.value <= 48
  return (
    <span className="space-specimen-well space-specimen-dimension-well">
      {small ? (
        <svg
          className="space-specimen-icon-box"
          width={item.value}
          height={item.value}
          viewBox={`0 0 ${item.value} ${item.value}`}
          role="img"
          aria-label={`${px(item.value)} square`}
        >
          <rect
            x="0.5"
            y="0.5"
            width={Math.max(item.value - 1, 0)}
            height={Math.max(item.value - 1, 0)}
            rx="3"
          />
          <path
            d={`M${item.value * 0.3} ${item.value * 0.55}h${item.value * 0.4}M${item.value * 0.5} ${item.value * 0.35}v${item.value * 0.4}`}
          />
        </svg>
      ) : (
        <span
          className="space-specimen-wide-clip"
          style={{ width: dimensionPreviewWidth }}
        >
          <span
            className="space-specimen-wide-box"
            style={{ width: item.value }}
          />
        </span>
      )}
      <span
        className="space-specimen-dimension-mark"
        style={{ width: item.value }}
      />
    </span>
  )
}

function Preview({ item }: { item: Measurement }) {
  switch (item.kind) {
    case 'type':
      return <TypePreview item={item} />
    case 'leading':
      return <LeadingPreview item={item} />
    case 'gap':
      return <GapPreview item={item} />
    case 'radius':
      return <RadiusPreview item={item} />
    case 'border':
      return <BorderPreview item={item} />
    case 'dimension':
      return <DimensionPreview item={item} />
  }
}

export function Specimen({ item }: { item: Measurement }) {
  const note =
    item.kind === 'dimension' && item.value > dimensionPreviewWidth
      ? 'clipped'
      : item.kind === 'radius' && item.value > 40
        ? 'capped'
        : ''
  const context = `${item.context}${note ? ` · ${note === 'clipped' ? 'Actual width is clipped, not scaled' : 'Radius is CSS-capped by the 120×80 shape'}` : ''}`
  return (
    <article
      className="space-specimen"
      aria-label={`${item.id}, ${kindLabels[item.kind]}, ${item.expression} → ${px(item.value)}. ${context}`}
      title={`${item.name} · ${item.expression} → ${px(item.value)} · ${context}`}
    >
      <Preview item={item} />
      <span className="space-specimen-foot">
        <code>{item.id}</code>
        {note && <span className="space-specimen-note">{note}</span>}
      </span>
    </article>
  )
}

export default Specimen
