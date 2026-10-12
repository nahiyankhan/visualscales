# Space ruler

Open <http://127.0.0.1:5173/space.html> with the root dev server:

```sh
pnpm dev --host 127.0.0.1 --port 5173
```

Space is a single edge-to-edge dimensional ruler with one globe-style bottom dock. The centered **Visual Scales** home pill returns to the split entrance at `/`. The color globe is at `/globe.html`; the homepage's right hemisphere opens Space.

## Interaction

- On page entry, rows slide horizontally from alternating sides, staggered by 60ms: top calibration labels/ticks from the right, ruler/engravings from the left, first lower label lane from the left, second lower lane from the right. Stems travel with their label lane. Input, resize, blur, hidden tab, or motion-preference changes snap the intro to final geometry; reduced motion starts there immediately.
- Drag horizontally to pan, with short frame-rate-independent release inertia. Grabbing, wheel input, resize, blur, visibility change, and unmount interrupt motion.
- Trackpad/wheel pans with horizontal or vertical input. **Ctrl/Cmd + wheel** and trackpad pinch zoom around the pointer. Native wheel inertia is not applied again.
- Touch drag and two-finger pinch share the camera, with pinch-to-one-finger handoff. Safari GestureEvent support exists, but hardware Safari is not verified.
- Measurement stops are plain numbers. Counts and kinds remain available in accessible labels and hover titles. Close measurements aggregate into explicitly labelled **ranges** at coarse zoom, then separate on zoom or cluster activation. A range midpoint is a layout anchor, never a token value.
- Fine engraved marks beneath the axis show every **distinct resolved value**, even inside a labelled range. Equal-valued expressions and aliases share one mark. Label stems stop below the engravings so layout anchors do not look like extra values.
- Selecting a measurement moves it to the center and reveals actual-length specimens. Select the active stop again, use the close button, or press Escape to clear it. Each expression remains individually selectable; equal appearance never invents a reference.
- Number labels animate after the intro; ticks, engraved marks, stems, and hit areas stay exact. Keyboard input, resize, and reduced motion are instant; preference changes, blur, and unmount cancel label motion.
- Search and the all-token index expose every expression, including off-screen large dimensions. No fake repeated values, placeholder nodes, or category-specific pages are used.
- Ruler region keyboard: **← / →** pan, **+ / −** zoom, **Home** resets, **Enter** selects the center's nearest measurement, **Escape** clears focus. Token buttons remain normal keyboard controls.

## Data and measurement honesty

- The space fixture contains fictional expressions: type-size and computed-leading ingredients, spacing aliases, radii, border widths, icon/control dimensions, and container widths.
- Type sizes are authored as `rem` equivalents at a 16px root. The root control resolves them at **16 / 18 / 20px**; fixed px tokens remain fixed. Each specimen shows its token ID; the selected specimen shows its authored/resolved expression. Full context is in hover titles and accessible labels.
- Computed line height is explicitly `multiplier × rem font size`. Weight and font family are not represented as lengths. `%`, viewport-relative values, and `clamp()` are not invented or implicitly resolved.
- A token's x-coordinate is its **resolved length × ruler magnification**. Ticks and stops use the same camera; dock percentage is magnification relative to the default ruler zoom, not specimen size. Vertical lanes only avoid overlap.
- Specimens render **1:1 CSS px**, independently of the ruler's magnification. CSS px are not physical-device pixels. Large widths retain their actual size and are clipped, with explicit captions; the camera does not silently shrink them.
- No production imports/usage, data upload, component mappings, health scores, editing, or sharing exist today. System sans/Georgia may differ across platforms.

## Verification

```sh
pnpm check
pnpm typecheck  # standalone TypeScript check when needed
```

`pnpm check` runs lint, Vitest unit tests, and build; build includes TypeScript checking. Math tests cover linear axis, anchored zoom, scale limits, ticks, and frame-rate-independent inertia. Use `pnpm build && pnpm preview` for a short manual browser check of gestures, direct stop clicks, root computation, alias identity, search/index reachability, keyboard access, and reduced motion. Touch handoff, physical devices, additional browsers, and real screen-reader software need separate manual verification.
