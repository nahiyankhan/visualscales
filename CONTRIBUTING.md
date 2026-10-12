# Contributing

Visual Scales currently uses fixed fictional fixtures. Useful contributions include
interaction quality, accessibility, fixture correctness, documentation, and the
local JSON workflow described in the [roadmap](docs/roadmap.md).

## Setup

Use Node 24.11.0 (`.nvmrc`) and pnpm 10.33.0:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm dev
```

If Node omits Corepack, install the pinned pnpm version using the
[pnpm installation guide](https://pnpm.io/installation). On Linux, browser tests
may also require `pnpm exec playwright install --with-deps chromium`.

## Checks

```sh
pnpm check        # lint, types, unit tests, build, production-route tests
pnpm test:visual  # split, color, and space interaction suites
```

Focused checks: `pnpm test`, `pnpm test:split`, `pnpm test:globe`, and
`pnpm test:space`. Browser tests start their own servers on ports 4186 and 4187.
Keep those ports free. Run `pnpm build && pnpm preview` to inspect a production build.

The CI workflow runs the same checks with Playwright-managed Chromium. Automated
mobile coverage uses emulation, not physical devices. Record separate Safari,
Firefox, and screen-reader checks when you perform them.

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
