# Contributing

Visual Scales currently uses fixed fictional fixtures. Useful contributions include
interaction quality, accessibility, fixture correctness, documentation, and the
local JSON workflow described in the [roadmap](docs/roadmap.md).

## Setup

Use Node 24.11.0 (`.nvmrc`) and pnpm 10.33.0:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

If Node omits Corepack, install the pinned pnpm version using the
[pnpm installation guide](https://pnpm.io/installation).

## Checks

```sh
pnpm check      # lint, Vitest unit tests, and build
pnpm typecheck  # standalone TypeScript check when needed
```

`pnpm build` includes TypeScript checking. Run `pnpm build && pnpm preview` for a
short manual browser check: home to color/space navigation, search, selection,
page navigation, gestures, keyboard access, and reduced motion where relevant.

The CI workflow installs dependencies and runs `pnpm check`. Record separate
manual browser, physical-device, and screen-reader checks when you perform them.

## Changes

- Keep the fixtures fictional. Do not add private design-system data or assets.
- Preserve token identity and explicit references. Equal appearance does not imply
  an alias or a semantic relationship.
- Keep measurements honest about authored units, root-size assumptions, ruler
  magnification, and specimen size.
- Preserve keyboard access, reduced motion, and rendering fallbacks.
- Discuss visual changes and new input formats before expanding the POC.
- Update docs when behavior changes. Do not describe roadmap features as available.

For a pull request, include the behavior change, checks run, and any known gaps.
Include before/after screenshots for intentional visual changes. Avoid reformatting
unrelated renderer files.

## Public release

Complete the [release checklist](docs/release-checklist.md) before publishing.
