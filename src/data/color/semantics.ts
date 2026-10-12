import Color from 'colorjs.io'
import { palette, type Palette } from './generator.js'

export type SemanticDefinition = { id: string; group: string; description: string; reference: string }
export type SemanticToken = SemanticDefinition & { hex: string; chain: string[] }
export type ContrastPair = { id: string; label: string; foreground: string; background: string; kind: 'text' | 'non-text'; threshold: number }
export type ContrastCheck = ContrastPair & { ratio: number; pass: boolean; foregroundHex: string; backgroundHex: string }
export type SemanticSystem = {
  name: string; theme: 'light'; version: number; definitions: SemanticDefinition[]; tokens: SemanticToken[]; checks: ContrastCheck[]
  report: { total: number; checks: number; passed: number; failed: number; issues: string[] }
}

const role = (id: string, reference: string, description: string): SemanticDefinition => ({
  id: `semantic.${id}`, group: id.split('.')[0], reference, description,
})
const primitive = (family: string, step: number) => `palette.${family}.${step}`

// These are deliberate mappings, not an algorithm choosing whichever color
// passes. Checks below report regressions without silently remapping roles.
export const SEMANTIC_DEFINITIONS: SemanticDefinition[] = [
  role('surface.canvas', primitive('gray', 100), 'Main light-theme canvas.'),
  role('surface.raised', primitive('gray', 50), 'Raised panels and fields.'),
  role('surface.muted', primitive('gray', 200), 'Subdued sections.'),
  role('surface.selected', primitive('indigo', 100), 'Selected rows and options, not primary action fills.'),
  role('surface.inverse', primitive('gray', 900), 'Inverse surfaces; use inverse text.'),
  role('text.default', primitive('gray', 900), 'Body copy on light surfaces.'),
  // Gray 600 fails normal-text contrast on canvas/muted/selected; 700 is the
  // reviewed mapping for this role, not an automatic contrast-time adjustment.
  role('text.muted', primitive('gray', 700), 'Secondary copy; still readable text, not disabled.'),
  role('text.placeholder', 'semantic.text.muted', 'Placeholder shares the secondary-text readability contract.'),
  role('text.inverse', primitive('gray', 50), 'Text on inverse and solid action surfaces.'),
  role('text.link', primitive('indigo', 700), 'Links on light surfaces; underline provides a non-color cue.'),
  role('text.link-hover', primitive('indigo', 800), 'Hovered link; preserve underline.'),
  role('border.decorative', primitive('gray', 300), 'Decorative separators only; not an essential control boundary.'),
  role('border.control', primitive('gray', 600), 'Essential control outlines on light surfaces.'),
  role('border.strong', primitive('gray', 700), 'Stronger outlines when needed.'),
  role('focus.ring', primitive('indigo', 600), 'Focus ring on light surfaces; use a surface-colored gap around filled controls.'),
  role('action.primary.background', primitive('indigo', 600), 'Primary solid action fill.'),
  role('action.primary.hover', primitive('indigo', 700), 'Primary hover fill.'),
  role('action.primary.pressed', primitive('indigo', 800), 'Primary pressed fill.'),
  role('action.primary.foreground', 'semantic.text.inverse', 'Primary action text and icons.'),
  role('action.secondary.background', primitive('gray', 200), 'Secondary action fill; boundary supplied separately.'),
  role('action.secondary.hover', primitive('gray', 300), 'Secondary hover fill.'),
  role('action.secondary.pressed', primitive('gray', 400), 'Secondary pressed fill.'),
  role('action.secondary.foreground', 'semantic.text.default', 'Secondary action text and icons.'),
  role('action.danger.background', primitive('red', 600), 'Destructive action fill, distinct from passive danger messaging.'),
  role('action.danger.hover', primitive('red', 700), 'Destructive hover fill.'),
  role('action.danger.pressed', primitive('red', 800), 'Destructive pressed fill.'),
  role('action.danger.foreground', 'semantic.text.inverse', 'Destructive action text and icons.'),
  role('action.disabled.background', primitive('gray', 200), 'Inactive controls only; not a general low-emphasis surface.'),
  role('action.disabled.foreground', primitive('gray', 500), 'Inactive-control text, explicitly outside enabled-text contrast claims.'),
  role('data.series.one', primitive('cyan', 600), 'Categorical series one; pair with a direct label, never color alone.'),
  role('data.series.two', primitive('violet', 600), 'Categorical series two; pair with a direct label.'),
  role('data.series.three', primitive('rose', 600), 'Categorical series three; pair with a direct label.'),
  ...(['danger', 'warning', 'success', 'information'] as const).flatMap((status, i) => {
    const hue = ['red', 'amber', 'green', 'cyan'][i]
    return [
      role(`status.${status}.background`, primitive(hue, 100), `${status} message surface; always accompany with text or icon.`),
      role(`status.${status}.foreground`, primitive(hue, 800), `${status} message text and icon.`),
      role(`status.${status}.border`, primitive(hue, 600), `${status} indicator stroke.`),
    ]
  }),
]

const pair = (id: string, foreground: string, background: string, label: string, kind: ContrastPair['kind'] = 'text'): ContrastPair => ({
  id, label, foreground: `semantic.${foreground}`, background: `semantic.${background}`, kind, threshold: kind === 'text' ? 4.5 : 3,
})
const lightSurfaces = ['canvas', 'raised', 'muted', 'selected']
export const CONTRAST_PAIRS: ContrastPair[] = [
  ...['one', 'two', 'three'].map(series => pair(`series-${series}`, `data.series.${series}`, 'surface.raised', `Series ${series} against plot background`, 'non-text')),
  ...lightSurfaces.flatMap(surface => ['default', 'muted', 'placeholder', 'link', 'link-hover'].map(text =>
    pair(`text-${text}-${surface}`, `text.${text}`, `surface.${surface}`, `${text} text on ${surface}`))),
  pair('inverse-text', 'text.inverse', 'surface.inverse', 'Inverse text'),
  ...['primary', 'secondary', 'danger'].flatMap(action => ['background', 'hover', 'pressed'].map(state =>
    pair(`action-${action}-${state}`, `action.${action}.foreground`, `action.${action}.${state}`, `${action} action · ${state}`))),
  ...lightSurfaces.flatMap(surface => ['control', 'strong'].map(border =>
    pair(`border-${border}-${surface}`, `border.${border}`, `surface.${surface}`, `${border} boundary on ${surface}`, 'non-text'))),
  ...lightSurfaces.map(surface => pair(`focus-${surface}`, 'focus.ring', `surface.${surface}`, `Focus ring against ${surface} gap`, 'non-text')),
  ...['danger', 'warning', 'success', 'information'].flatMap(status => [
    pair(`status-${status}-text`, `status.${status}.foreground`, `status.${status}.background`, `${status} message text`),
    pair(`status-${status}-border`, `status.${status}.border`, `status.${status}.background`, `${status} indicator`, 'non-text'),
  ]),
]

/** Preserve aliases and full provenance; never infer references from equal hex. */
export function resolveSemantics(definitions: readonly SemanticDefinition[], source: Palette): SemanticToken[] {
  const primitives = new Map(source.families.flatMap(family => family.swatches.map(swatch => [swatch.id, swatch.hex] as const)))
  const byId = new Map<string, SemanticDefinition>()
  for (const definition of definitions) {
    if (!definition.id.startsWith('semantic.') || byId.has(definition.id) || primitives.has(definition.id)) throw new Error(`Invalid or duplicate semantic ID: ${definition.id}`)
    byId.set(definition.id, definition)
  }
  const resolved = new Map<string, SemanticToken>()
  const visit = (id: string, visiting: Set<string>): SemanticToken => {
    if (visiting.has(id)) throw new Error(`Circular reference: ${[...visiting, id].join(' → ')}`)
    const cached = resolved.get(id)
    if (cached) return cached
    const definition = byId.get(id)
    if (!definition) throw new Error(`Missing reference: ${id}`)
    visiting.add(id)
    const hex = primitives.get(definition.reference)
    const parent = hex ? null : visit(definition.reference, visiting)
    const token = { ...definition, hex: hex ?? parent!.hex, chain: [id, ...(parent?.chain ?? [definition.reference])] }
    if (!/^#[\dA-F]{6}$/i.test(token.hex)) throw new Error(`Only opaque sRGB hex is supported at this stage: ${id}`)
    visiting.delete(id); resolved.set(id, token)
    return token
  }
  return definitions.map(definition => visit(definition.id, new Set()))
}

export function evaluateContrast(tokens: readonly SemanticToken[], pairs: readonly ContrastPair[]): ContrastCheck[] {
  const byId = new Map(tokens.map(token => [token.id, token]))
  const ids = new Set<string>()
  return pairs.map(check => {
    if (ids.has(check.id)) throw new Error(`Duplicate contrast check: ${check.id}`)
    ids.add(check.id)
    if (!Number.isFinite(check.threshold) || check.threshold < 1 || check.threshold > 21) throw new Error(`Invalid contrast threshold: ${check.id}`)
    const foreground = byId.get(check.foreground), background = byId.get(check.background)
    if (!foreground || !background) throw new Error(`Missing contrast role: ${check.id}`)
    const ratio = new Color(background.hex).contrast(foreground.hex, 'WCAG21')
    return { ...check, foregroundHex: foreground.hex, backgroundHex: background.hex, ratio, pass: ratio >= check.threshold }
  })
}

export function buildSemantics(source: Palette = palette, definitions: SemanticDefinition[] = SEMANTIC_DEFINITIONS, pairs: ContrastPair[] = CONTRAST_PAIRS): SemanticSystem {
  const tokens = resolveSemantics(definitions, source)
  const checks = evaluateContrast(tokens, pairs)
  const failed = checks.filter(check => !check.pass)
  return {
    name: 'Sample', version: 1, theme: 'light', definitions, tokens, checks,
    report: { total: tokens.length, checks: checks.length, passed: checks.length - failed.length, failed: failed.length,
      issues: failed.map(check => `${check.id}: ${check.ratio.toFixed(3)}:1 is below ${check.threshold}:1`) },
  }
}

export const semantics = buildSemantics()
