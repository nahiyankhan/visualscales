# Color fixture data

Fixed fictional color collection data used by the Visual Scales globe and split sphere. It is not a standalone palette product, npm package, or production design-system export.

The modules in this directory define the generated color fixture and semantics used by the current POC:

- `generator.ts`
- `semantics.ts`
- `components.ts`
- `globe-data.ts`

Tests in this directory help keep palette generation, semantic grouping, component relationships, and globe data stable. Future browser-only import work should preserve alias identity and diagnostics rather than replacing this fixture silently.

## Verification

```sh
pnpm test
pnpm test:globe
```
