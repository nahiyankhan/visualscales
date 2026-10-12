# Release checklist

Use this checklist before publishing the fixture POC.

## Local build and routes

- [ ] `corepack enable`
- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm check`
- [ ] Confirm `dist/` contains the domain-root pages for `/`, `/globe.html`, `/space.html`, and the `/split.html` redirect.
- [ ] Confirm no documentation claims an online demo or owned production domain unless that deployment exists.

## Visual and interaction review

- [ ] Run `pnpm build && pnpm preview` for a short manual browser check.
- [ ] Confirm home to color/space navigation works.
- [ ] Confirm search, selection, and page navigation still work.
- [ ] Confirm gestures, keyboard access, and reduced motion where relevant.
- [ ] Confirm the split entrance visuals match the approved current behavior.
- [ ] Confirm the globe row intro, relationship view, and token-centering links still work.
- [ ] Confirm the space ruler still preserves actual-size specimen behavior, root-unit controls, alias identity, keyboard access, and large-value reachability.
- [ ] Record browser, device, and screen-reader checks performed, plus any gaps.

## License and assets

- [ ] Include the MIT license in the published repository.
- [ ] Confirm permission to distribute any third-party assets or code added for release.

## Communication

- [ ] State that the app is a fixed-fixture POC with no import, upload, sharing, or account system today.
- [ ] State that future input is planned as paste/open-file in the browser, followed by portable export before deliberate sharing.
- [ ] Confirm the published repository has a passing CI run before claiming remote verification.
