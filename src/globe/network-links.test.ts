import { describe, expect, it } from 'vitest'
import { roundedElbowPath } from './network-links.js'
import { layoutRelationshipNetwork } from './relationship-network.js'
import { buildRelationships } from './relationships.js'
import { sampleData } from '../data/color/globe-data.js'
import { CARD_WIDTH, CARD_HEIGHT } from './model.js'

describe('rounded-elbow connectors', () => {
  it('goes straight for aligned nodes and rounds turns in the target gutter', () => {
    expect(roundedElbowPath(268, 102, 368, 102)).toBe('M268,102 L368,102')
    expect(roundedElbowPath(268, 102, 368, 330)).toBe('M268,102 L316,102 Q328,102 328,114 L328,318 Q328,330 340,330 L368,330')
    expect(roundedElbowPath(268, 330, 368, 102)).toBe('M268,330 L316,330 Q328,330 328,318 L328,114 Q328,102 340,102 L368,102')
  })
  it('scales corner radius and gutter offset together, with no cubic curves or multi-turn detours', () => {
    expect(roundedElbowPath(134, 51, 184, 165, .5)).toBe('M134,51 L158,51 Q164,51 164,57 L164,159 Q164,165 170,165 L184,165')
    expect(roundedElbowPath(268, 102, 368, 108)).not.toContain('NaN')
    expect(roundedElbowPath(268, 102, 368, 330)).not.toContain('C')
  })
  it('keeps every alias hop in the adjacent layer gutter without crossing another card', () => {
    const layout = layoutRelationshipNetwork(buildRelationships(sampleData.tokens), 'palette.indigo.600', { cardWidth: CARD_WIDTH, cardHeight: CARD_HEIGHT, columnGap: 100, rowGap: 24 })
    for (const depth of new Set(layout.nodes.map(node => node.depth))) {
      expect(new Set(layout.nodes.filter(node => node.depth === depth).map(node => node.x)).size).toBe(1)
    }
    for (const edge of layout.edges) {
      const from = layout.nodes.find(node => node.id === edge.source)!
      const to = layout.nodes.find(node => node.id === edge.target)!
      expect(to.depth).toBe(from.depth + 1)
      const bendX = to.x - 40
      expect(bendX).toBeGreaterThan(from.x + CARD_WIDTH)
      expect(bendX).toBeLessThan(to.x)
      // Main trunk and terminal horizontal are confined to the column gap;
      // the vertical segment and both rounded elbows are in that same gap.
      for (const node of layout.nodes) {
        expect(bendX > node.x && bendX < node.x + CARD_WIDTH).toBe(false)
      }
    }
  })
})
