# Color globe

Interactive color relationship view for Visual Scales.

## Routes

- `/` — split color/space entrance.
- `/globe.html` — canonical color globe page with its alternating-row intro.
- `/globe.html?token=palette.violet.400` — starts from a validated token when present.
- `/space.html` — dimensional ruler.

The centered **Visual Scales** home pill returns to `/`. Browser Back from a homepage entry restores the split entrance. Relationship back controls return to the collection view, not to another document.

## Source layout

- `main.tsx` and `TokenSurface.tsx` render the globe experience.
- `model.ts`, `layout.ts`, `navigation.ts`, `relationships.ts`, and related modules define collection layout, navigation, and relationship behavior.
- `network-links.ts` draws rounded-elbow SVG connections between related color cards.
- Shared fictional color data lives in `../data/color/`.

## Interaction notes

- The globe keeps the approved row intro and relationship navigation.
- Token-centering query parameters are validated before use.
- Alias and relationship views are visual explanations of the fixture, not production usage analytics.
- No import, upload, sharing, package API, or embedded React surface exists today.

## Verification

```sh
pnpm check
pnpm typecheck  # standalone TypeScript check when needed
```

`pnpm check` runs lint, Vitest unit tests, and build; build includes TypeScript checking. Use `pnpm build && pnpm preview` for a short manual browser check of token search, selection, relationship navigation, keyboard access, and reduced motion where relevant. Physical devices, additional browsers, and screen readers need separate manual verification.
