# Release checklist

Use this checklist before publishing the fixture POC.

## Local build and routes

- [ ] `corepack enable`
- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm exec playwright install chromium`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm test:e2e`
- [ ] `pnpm test:visual`
- [ ] Confirm `dist/` contains the domain-root pages for `/`, `/globe.html`, `/space.html`, and the `/split.html` redirect.
- [ ] Confirm no documentation claims an online demo or owned production domain unless that deployment exists.

## Visual and interaction review

- [ ] Confirm the split entrance visuals match the approved current behavior.
- [ ] Confirm the globe row intro, relationship view, and token-centering links still work.
- [ ] Confirm the space ruler still preserves actual-size specimen behavior, root-unit controls, alias identity, keyboard access, and large-value reachability.
- [ ] Record the browser versions used for automated checks.
- [ ] Record any unverified physical devices, Safari/Firefox checks, and screen-reader checks.

## License and assets

- [ ] Include the MIT license in the published repository.
- [ ] Confirm permission to distribute any third-party assets or code added for release.

## Communication

- [ ] State that the app is a fixed-fixture POC with no import, upload, sharing, or account system today.
- [ ] State that future input is planned as paste/open-file in the browser, followed by portable export before deliberate sharing.
- [ ] Confirm the published repository has a passing CI run before claiming remote verification.
