# Visual Scales

Explore color relationships and dimensional scales through an interactive globe
and ruler.

![Visual Scales split color and space sphere](public/split/poster.webp)

## The POC

This version uses bundled, fictional design tokens. It demonstrates a way to
explore visual specifications before adding your own data.

- **Color:** navigate 218 tokens arranged by color, search by name, and trace
  their explicit alias relationships.
- **Space:** compare 50 dimensional expressions, including spacing, type sizes,
  radii, and borders. Inspect specimens at their actual CSS-pixel size.
- **Entrance:** rotate the shared color/space sphere and choose an exploration.

The app supports keyboard navigation, reduced motion, and rendering fallbacks.
The color and space collections are separately authored fixtures. There is no
JSON import, editing, export, or data-sharing UI yet. CSS pixels do not represent
physical screen measurements.

## Run locally

Use Node **24.11.0** (`.nvmrc`) and pnpm **10.33.0**. With Node installed:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:5173/>. If your Node distribution omits Corepack, install
pnpm 10.33.0 using the [pnpm installation guide](https://pnpm.io/installation).

```sh
pnpm build    # static output in dist/
pnpm preview  # serve the production build
```

Deploy the contents of `dist/` at a domain root. The app uses root-relative paths;
project-subpath hosting is not supported. `/globe.html` and `/space.html` are the
exploration pages; `/split.html` redirects to `/` for compatibility.

## Where this is going

Planned work, in order:

1. **Bring your own tokens.** Paste JSON or open a local file, validate a documented
   DTCG/Style Dictionary subset, and explore supported colors and dimensions with
   these same visualizations. Keep processing in the browser and explain skipped
   or unresolved values.
2. **Export and reopen.** Save a portable snapshot of the collection and exploration
   state so someone can open it without a hosted service.
3. **Share an exploration.** Add deliberate share links with clear data disclosure
   and size limits. Consider hosted snapshots only if files and small links fall short.

See the [roadmap](docs/roadmap.md) for scope and acceptance criteria. The README
tracks direction; scoped issues can track implementation when a public repository
and maintainer are in place.

## Verify and contribute

Install the test browser once:

```sh
pnpm exec playwright install chromium
pnpm check        # lint, types, unit tests, build, production-route tests
pnpm test:visual  # self-contained desktop/mobile interaction suites
```

Focused commands: `pnpm test`, `pnpm test:split`, `pnpm test:globe`, and
`pnpm test:space`. Browser suites start and stop their own servers. They do not
require installed Chrome or an already running dev server.

See [CONTRIBUTING.md](CONTRIBUTING.md), [architecture](docs/architecture.md), and
the [release checklist](docs/release-checklist.md). Physical-device and screen-reader
verification remain separate from automated browser coverage.

## License

[MIT](LICENSE).
