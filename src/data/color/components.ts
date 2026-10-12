import { semantics, evaluateContrast, type SemanticToken, type ContrastPair, type ContrastCheck } from './semantics.js'

export type ComponentDefinition = { id: string; group: string; reference: string; description: string }
export type ComponentToken = ComponentDefinition & { hex: string; chain: string[] }
export type ComponentSystem = {
  name: string; theme: 'light'; version: number; definitions: ComponentDefinition[]; tokens: ComponentToken[]; checks: ContrastCheck[]
  report: { total: number; checks: number; passed: number; failed: number; issues: string[] }
}

function entries(group: string, mapping: Record<string, string>): ComponentDefinition[] {
  return Object.entries(mapping).map(([part, reference]) => ({ id: `component.${group}.${part}`, group, reference: `semantic.${reference}`, description: `${group} · ${part.split('.').join(' ')}` }))
}

// Only actual parts/states in the specimen sheet. Components never reference
// primitives directly, even when their resolved colors happen to be identical.
export const COMPONENT_DEFINITIONS: ComponentDefinition[] = [
  ...['primary', 'secondary', 'danger'].flatMap(variant => entries('button', {
    [`${variant}.background.default`]: `action.${variant}.background`,
    [`${variant}.background.hover`]: `action.${variant}.hover`,
    [`${variant}.background.pressed`]: `action.${variant}.pressed`,
    [`${variant}.foreground`]: `action.${variant}.foreground`,
    [`${variant}.focus`]: 'focus.ring',
  })),
  ...entries('button', { 'disabled.background': 'action.disabled.background', 'disabled.foreground': 'action.disabled.foreground' }),
  ...entries('input', {
    background: 'surface.raised', foreground: 'text.default', placeholder: 'text.placeholder',
    'border.default': 'border.control', 'border.hover': 'border.strong', 'border.invalid': 'status.danger.border',
    focus: 'focus.ring', 'disabled.background': 'action.disabled.background', 'disabled.foreground': 'action.disabled.foreground',
  }),
  ...entries('checkbox', { 'background.off': 'surface.raised', 'background.on': 'action.primary.background', foreground: 'action.primary.foreground', border: 'border.control', focus: 'focus.ring' }),
  ...entries('switch', { 'track.off': 'border.strong', 'track.on': 'action.primary.background', thumb: 'surface.raised', border: 'border.control', focus: 'focus.ring' }),
  ...entries('tabs', { background: 'surface.raised', 'foreground.default': 'text.muted', 'foreground.selected': 'text.link', indicator: 'action.primary.background', border: 'border.decorative', focus: 'focus.ring' }),
  ...entries('card', { background: 'surface.raised', foreground: 'text.default', muted: 'text.muted', border: 'border.decorative' }),
  ...entries('dialog', { background: 'surface.raised', foreground: 'text.default', muted: 'text.muted', border: 'border.decorative' }),
  ...entries('tooltip', { background: 'surface.inverse', foreground: 'text.inverse' }),
  ...entries('badge', { 'neutral.background': 'surface.muted', 'neutral.foreground': 'text.default' }),
  ...['information', 'success', 'warning', 'danger'].flatMap(status => [
    ...entries('badge', { [`${status}.background`]: `status.${status}.background`, [`${status}.foreground`]: `status.${status}.foreground` }),
    ...entries('alert', { [`${status}.background`]: `status.${status}.background`, [`${status}.foreground`]: `status.${status}.foreground`, [`${status}.border`]: `status.${status}.border` }),
  ]),
  ...entries('table', { background: 'surface.raised', 'header.background': 'surface.muted', 'row.selected': 'surface.selected', foreground: 'text.default', muted: 'text.muted', border: 'border.decorative' }),
  ...entries('chart', { background: 'surface.raised', foreground: 'text.default', grid: 'border.decorative', 'series.one': 'data.series.one', 'series.two': 'data.series.two', 'series.three': 'data.series.three' }),
]

export function resolveComponents(definitions: readonly ComponentDefinition[], parents: readonly SemanticToken[]): ComponentToken[] {
  const byId = new Map(parents.map(token => [token.id, token]))
  const seen = new Set<string>()
  return definitions.map(definition => {
    if (!definition.id.startsWith('component.') || seen.has(definition.id)) throw new Error(`Invalid or duplicate component ID: ${definition.id}`)
    seen.add(definition.id)
    if (!definition.reference.startsWith('semantic.')) throw new Error(`Component must reference a semantic role: ${definition.id}`)
    const parent = byId.get(definition.reference)
    if (!parent) throw new Error(`Missing semantic role: ${definition.reference}`)
    return { ...definition, hex: parent.hex, chain: [definition.id, ...parent.chain] }
  })
}

const pair = (foreground: string, background: string, kind: ContrastPair['kind'] = 'text'): ContrastPair => ({
  id: `${foreground}-on-${background}`, label: `${foreground} on ${background}`,
  foreground: `component.${foreground}`, background: background.startsWith('semantic.') ? background : `component.${background}`,
  kind, threshold: kind === 'text' ? 4.5 : 3,
})
export const COMPONENT_PAIRS: ContrastPair[] = [
  ...['primary', 'secondary', 'danger'].flatMap(variant => [
    ...['default', 'hover', 'pressed'].map(state => pair(`button.${variant}.foreground`, `button.${variant}.background.${state}`)),
    pair(`button.${variant}.focus`, 'semantic.surface.raised', 'non-text'),
  ]),
  pair('input.foreground', 'input.background'), pair('input.placeholder', 'input.background'),
  ...['default', 'hover', 'invalid'].map(state => pair(`input.border.${state}`, 'input.background', 'non-text')),
  pair('input.focus', 'input.background', 'non-text'),
  pair('checkbox.foreground', 'checkbox.background.on', 'non-text'),
  pair('checkbox.border', 'checkbox.background.off', 'non-text'),
  pair('checkbox.focus', 'semantic.surface.raised', 'non-text'),
  ...['off', 'on'].map(state => pair('switch.thumb', `switch.track.${state}`, 'non-text')),
  pair('switch.focus', 'semantic.surface.raised', 'non-text'),
  pair('tabs.foreground.default', 'tabs.background'), pair('tabs.foreground.selected', 'tabs.background'),
  pair('tabs.indicator', 'tabs.background', 'non-text'), pair('tabs.focus', 'tabs.background', 'non-text'),
  ...['card', 'dialog'].flatMap(group => [pair(`${group}.foreground`, `${group}.background`), pair(`${group}.muted`, `${group}.background`)]),
  pair('tooltip.foreground', 'tooltip.background'),
  ...['neutral', 'information', 'success', 'warning', 'danger'].map(status => pair(`badge.${status}.foreground`, `badge.${status}.background`)),
  ...['information', 'success', 'warning', 'danger'].flatMap(status => [pair(`alert.${status}.foreground`, `alert.${status}.background`), pair(`alert.${status}.border`, `alert.${status}.background`, 'non-text')]),
  ...['background', 'header.background', 'row.selected'].flatMap(state => [pair('table.foreground', `table.${state}`), pair('table.muted', `table.${state}`)]),
  pair('chart.foreground', 'chart.background'),
  ...['one', 'two', 'three'].map(series => pair(`chart.series.${series}`, 'chart.background', 'non-text')),
]

export function buildComponents(definitions = COMPONENT_DEFINITIONS, parents = semantics.tokens, pairs = COMPONENT_PAIRS): ComponentSystem {
  const tokens = resolveComponents(definitions, parents)
  const checks = evaluateContrast([...parents, ...tokens], pairs)
  const failures = checks.filter(check => !check.pass)
  return { name: 'Sample', theme: 'light', version: 1, definitions, tokens, checks,
    report: { total: tokens.length, checks: checks.length, passed: checks.length - failures.length, failed: failures.length,
      issues: failures.map(check => `${check.id}: ${check.ratio.toFixed(3)}:1 < ${check.threshold}:1`) },
  }
}
export const components = buildComponents()
const byId = new Map(components.tokens.map(token => [token.id, token]))
export function color(shortId: string): string {
  const token = byId.get(`component.${shortId}`)
  if (!token) throw new Error(`Unknown component token: ${shortId}`)
  return token.hex
}
