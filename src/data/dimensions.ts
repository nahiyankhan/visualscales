// Original fictional dimensional ingredients shared by the Visual Scales space experience.
export type TypeToken = {
  id: string
  label: string
  role: string
  size: number
  weight: number
  lineHeight: number
  tracking: number
  family: 'sans' | 'serif'
  refs: {
    family: string
    size: string
    weight: string
    lineHeight: string
    tracking: string
  }
}
export type SpaceToken = {
  id: string
  label: string
  value: number
  reference?: string
}

export const families = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
}
export const typeTokens: TypeToken[] = [
  {
    id: 'type.caption',
    label: 'Caption',
    role: 'Annotations & supporting details',
    size: 12,
    weight: 400,
    lineHeight: 1.5,
    tracking: 0.02,
    family: 'sans',
    refs: {
      family: 'font.family.sans',
      size: 'font.size.100',
      weight: 'font.weight.regular',
      lineHeight: 'font.leading.relaxed',
      tracking: 'font.tracking.open',
    },
  },
  {
    id: 'type.label',
    label: 'Label',
    role: 'Controls & short labels',
    size: 14,
    weight: 600,
    lineHeight: 1.25,
    tracking: 0,
    family: 'sans',
    refs: {
      family: 'font.family.sans',
      size: 'font.size.200',
      weight: 'font.weight.semibold',
      lineHeight: 'font.leading.tight',
      tracking: 'font.tracking.normal',
    },
  },
  {
    id: 'type.body.small',
    label: 'Body small',
    role: 'Compact paragraphs',
    size: 14,
    weight: 400,
    lineHeight: 1.5,
    tracking: 0,
    family: 'sans',
    refs: {
      family: 'font.family.sans',
      size: 'font.size.200',
      weight: 'font.weight.regular',
      lineHeight: 'font.leading.relaxed',
      tracking: 'font.tracking.normal',
    },
  },
  {
    id: 'type.body',
    label: 'Body',
    role: 'Everyday reading',
    size: 16,
    weight: 400,
    lineHeight: 1.5,
    tracking: 0,
    family: 'sans',
    refs: {
      family: 'font.family.sans',
      size: 'font.size.300',
      weight: 'font.weight.regular',
      lineHeight: 'font.leading.relaxed',
      tracking: 'font.tracking.normal',
    },
  },
  {
    id: 'type.lead',
    label: 'Lead',
    role: 'Introductions & summaries',
    size: 20,
    weight: 400,
    lineHeight: 1.5,
    tracking: 0,
    family: 'sans',
    refs: {
      family: 'font.family.sans',
      size: 'font.size.400',
      weight: 'font.weight.regular',
      lineHeight: 'font.leading.relaxed',
      tracking: 'font.tracking.normal',
    },
  },
  {
    id: 'type.title',
    label: 'Title',
    role: 'Section headings',
    size: 24,
    weight: 600,
    lineHeight: 1.25,
    tracking: -0.02,
    family: 'sans',
    refs: {
      family: 'font.family.sans',
      size: 'font.size.500',
      weight: 'font.weight.semibold',
      lineHeight: 'font.leading.tight',
      tracking: 'font.tracking.tight',
    },
  },
  {
    id: 'type.heading',
    label: 'Heading',
    role: 'Page headings',
    size: 32,
    weight: 600,
    lineHeight: 1.25,
    tracking: -0.02,
    family: 'sans',
    refs: {
      family: 'font.family.sans',
      size: 'font.size.600',
      weight: 'font.weight.semibold',
      lineHeight: 'font.leading.tight',
      tracking: 'font.tracking.tight',
    },
  },
  {
    id: 'type.display',
    label: 'Display',
    role: 'Editorial moments',
    size: 48,
    weight: 400,
    lineHeight: 1.1,
    tracking: -0.02,
    family: 'serif',
    refs: {
      family: 'font.family.serif',
      size: 'font.size.700',
      weight: 'font.weight.regular',
      lineHeight: 'font.leading.display',
      tracking: 'font.tracking.tight',
    },
  },
]

export const spaceTokens: SpaceToken[] = [
  { id: 'space.100', label: 'Fine', value: 4 },
  { id: 'space.200', label: 'Close', value: 8 },
  { id: 'space.300', label: 'Compact', value: 12 },
  { id: 'space.400', label: 'Comfortable', value: 16 },
  { id: 'space.500', label: 'Open', value: 24 },
  { id: 'space.600', label: 'Generous', value: 32 },
  {
    id: 'space.stack',
    label: 'Default stack',
    value: 16,
    reference: 'space.400',
  },
  { id: 'space.inset', label: 'Card inset', value: 24, reference: 'space.500' },
]
