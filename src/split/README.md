# Visual Scales entrance

Open <http://127.0.0.1:5173/> with the root dev server:

```sh
pnpm dev --host 127.0.0.1 --port 5173
```

The split sphere is the canonical homepage. `/split.html` redirects to `/` for compatibility.

## Construction and interaction

- One Three.js sphere, camera, and trackball quaternion. Both patterns turn together; the material boundary stays at the screen's physical-pixel midpoint.
- Reuses the Atlas palette, marble shading, floor artwork, and spin math. The right side adds level latitude bands, thin meridians, and sparse ruler ticks over a dark surface. Ruler graduations are artwork, not authored token values.
- No idle sphere rotation, scrolling engine, extra motion framework, or new dependencies. The slow color currents remain; sphere motion follows input.
- Two-finger trackpad scrolling over the sphere rotates both axes directly, following `/globe.html` pan direction. Native wheel momentum is not doubled. Off-sphere scroll and Ctrl/Meta-wheel zoom gestures are not intercepted.
- Drag rotates with a 5px threshold; drag/cancel suppresses pointer navigation. Arrow keys rotate immediately; Home resets. Native color/space links support keyboard, modified-click, and no-JavaScript navigation.
- Click left to open `/globe.html?token=…`, centered on a palette token sampled from the color shader. Click right to open `/space.html`. Both destination home pills return here. Navigation is between documents, not a sphere-to-ruler geometric morph.
- Startup reserves a dark scene before first paint, then fades in the live canvas at its final size. A five-second module watchdog restores fallback art.
- Navigation copies the last live frame synchronously while disposing GPU resources, avoiding an exit-time poster flash. Destinations start dark.
- Reduced motion skips Three.js and keeps captured artwork. WebGL/context failure restores posters. Visibility/intersection pause rendering; DPR is capped; listeners, observers, and GPU resources are disposed.

## Artwork

Original procedural image based on the project's shader artwork and fictional colors. `public/split/` posters are text-free captures at desktop and mobile sizes. No stock images, external fonts, or real-world brands are intentionally included.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:split
pnpm build
```

Browser checks cover GPU color/monochrome pixels, shared rotation, wheel/drag/touch, loading and exit frames, fallback artwork, native home links, and Back navigation. Globe coverage verifies that its row intro remains intact. Tests use Playwright-managed Chromium and start their own Vite server.
