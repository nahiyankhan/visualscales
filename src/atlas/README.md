# Atlas artwork

Shared sphere artwork for Visual Scales. The split homepage in `../split/` reuses the palette anchors, shader artwork, and trackball math here; color fixture data lives in `../data/color/`.

## Shared modules

- `palette.ts`: generated fictional palette anchors with source token IDs.
- `shaders.ts`: procedural color field and floor artwork used by the split entrance.
- `spin.ts`: virtual trackball and frame-rate-independent coast math.

The split entrance opens Color at `/globe.html` and Space at `/space.html`. Both destination pages return to `/` with the centered Visual Scales home pill. Existing collection-style bookmarks from the old entrance are redirected by the root page to `/globe.html?token=…` when possible.

## Verification

```sh
pnpm check
pnpm typecheck  # standalone TypeScript check when needed
```

`pnpm check` runs lint, Vitest unit tests, and build; build includes TypeScript checking. Use `pnpm build && pnpm preview` for a short manual browser check of the shared sphere behavior.
