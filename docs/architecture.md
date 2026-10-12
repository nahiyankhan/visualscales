# Architecture

Visual Scales is a static Vite multi-page app rooted at this repository. The public experiences are built from `index.html`, `globe.html`, `space.html`, and `split.html` into `dist/`.

## Routes

- `/` loads the split entrance from `src/split/main.ts`.
- `/globe.html` loads the color globe from `src/globe/main.tsx`.
- `/space.html` loads the dimensional ruler from `src/space/main.tsx`.
- `/split.html` is a compatibility redirect to `/`.

There is no SPA fallback. The build is intended for hosting at a domain root so the HTML routes and asset paths resolve directly.

## Source areas

- `src/split/` owns the split color/space entrance and poster fallback behavior.
- `src/atlas/` contains shared sphere artwork, palette anchors, shaders, and spin math used by the entrance.
- `src/globe/` owns the color collection and relationship interactions.
- `src/data/color/` contains the fixed fictional color fixture and generation semantics used by the globe and atlas.
- `src/space/` owns the dimensional ruler, camera, specimens, root-unit handling, and unit tests.
- `public/split/` contains the entrance fallback posters. `public/atlas/` retains
  earlier artwork captures; the current entrance does not reference them.

## Data model today

The current app does not import user files. It uses fixed fictional fixtures to exercise visual relationships:

- color tokens and aliases for the globe and split sphere,
- dimensional tokens and computed specimens for the ruler,
- authored precision caveats for aliases, root units, and actual-size CSS rendering.

Future local input should be added as a browser-only workflow first: paste JSON or open a local file, parse a documented DTCG/Style Dictionary subset, show diagnostics, and export a portable artifact. Do not assume a backend, hosted account, package API, or sharing service.

## Verification model

Root scripts cover:

- `pnpm dev` for local development,
- `pnpm build` and `pnpm preview` for the static production build,
- `pnpm typecheck` for a standalone TypeScript check,
- `pnpm lint` and `pnpm test` for linting and Vitest unit tests,
- `pnpm check` for lint, Vitest unit tests, and build.

`pnpm build` includes TypeScript checking. For a short manual browser check, run
`pnpm build && pnpm preview`, then verify the home to color/space paths, search,
selection, navigation, gestures, keyboard access, and reduced motion where
relevant.

The CI workflow installs dependencies and runs `pnpm check`; it does not install
browsers or upload browser-test artifacts. Physical devices, additional browsers,
and screen readers need separate manual verification.
