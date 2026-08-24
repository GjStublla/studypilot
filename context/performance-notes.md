# Performance Notes

These notes summarize the performance scan and the main places to investigate.

## Initial Finding

The `index.html` -> `/src/main.tsx` path is normal for Vite development. It does not mean the browser is running raw TSX in production. A production build rewrites the HTML to hashed JS/CSS chunks in `dist/`.

If the app feels sluggish in dev, part of that is expected: Vite dev serves source modules, React refresh, and unminified dependency modules. Production preview is the right baseline for performance decisions.

## Production Bundle Shape

The app manually chunks React and Framer Motion:

- `react-vendor`
- `motion-vendor`

The marketing route also uses Framer Motion and a WebGL hero background. The dashboard is lazy-loaded on `#dashboard`.

## Main Runtime Suspects

`src/App.tsx`

- Sticky `250svh` hero.
- Multiple `useTransform` values driven by `useScroll`.
- Product image transforms on scroll.

`src/components/GradientBlinds.tsx`

- WebGL canvas setup.
- Shader rendering loop.
- Resize observer.
- Intersection observer.
- Global pointer and scroll listeners.

`src/index.css`

- Large visual system shared by marketing and dashboard.
- Heavy visual effects: shadows, sticky regions, backdrop blur, marquee animation, and dashboard animations.
- Reduced-motion rules exist and should be preserved.

`src/components/Dashboard.tsx`

- Larger DOM.
- Timer and animated voice waveform.
- Many icons and SVG charts.
- Currently under active dashboard work; coordinate before editing.

## Performance Work Already Explored

A scan compared dev and production preview. Dev was heavier because it served source modules and Vite tooling. Production preview was much smaller and smoother.

The WebGL background was identified as a good candidate to defer because it is visually nice but not required for first paint.

## Measured evidence — 2026-08-24

These measurements use the production bundle from `npm run build` served with:

```bash
npm run preview -- --host 127.0.0.1 --port 5178
```

Each route was audited three times. The JSON artifacts are local, ignored files under `tmp/`:

| Route | Device | Performance median | Accessibility | Best practices | SEO | LCP median | CLS median | TBT median |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | Lighthouse mobile (412×823) | 0.96 | 1.00 | 1.00 | 1.00 | 2,627 ms | 0.00 | 14.5 ms |
| `/#auth` | Lighthouse mobile (412×823) | 0.96 | 1.00 | 1.00 | 1.00 | 2,575 ms | 0.00 | 0 ms |
| `/` | Lighthouse desktop (1,350×940) | 0.91 | 1.00 | 1.00 | 1.00 | 807 ms | 0.00 | 234 ms |
| `/#auth` | Lighthouse desktop (1,350×940) | 1.00 | 1.00 | 1.00 | 1.00 | 547 ms | 0.00 | 0 ms |

The mobile landing median was below the Phase 11 performance target before this slice (0.85, LCP 2.93 s, TBT 310 ms). The hero now keeps its CSS gradient fallback and skips the decorative WebGL renderer below 900 px; the post-change mobile median is 0.96 with LCP 2.63 s and TBT 14.5 ms. Desktop still loads the WebGL treatment and remains above 0.90.

Representative commands (repeat with `-1`, `-2`, and `-3` output suffixes):

```bash
# mobile
npx --yes lighthouse http://127.0.0.1:5178/ --output=json \
  --output-path=tmp/lighthouse-home-prod-mobile-fallback-20260824-1.json \
  --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless --no-sandbox" --quiet

# desktop
npx --yes lighthouse http://127.0.0.1:5178/ --output=json \
  --output-path=tmp/lighthouse-home-desktop-fallback-20260824-1.json \
  --preset=desktop --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless --no-sandbox" --quiet
```

On Windows, Lighthouse writes valid JSON and scores before occasionally reporting an `EPERM` error while removing its temporary Chrome directory. That cleanup error is a tooling/environment issue; inspect the JSON artifact rather than calling the CLI exit code a clean pass. These are local preview results, not hosted deployment or authenticated-dashboard performance claims. The dashboard has a deterministic axe check in the web golden flow; a hosted dashboard Lighthouse run remains an external release gate.

## Recommended Next Steps

1. Use production preview as the baseline, not Vite dev.
2. Keep WebGL and decorative animation off the critical path.
3. Avoid changing dashboard performance while dashboard code is actively being edited elsewhere.
4. Re-run Lighthouse or Playwright timing after dashboard work stabilizes.
5. Consider profiling CSS and font loading separately if mobile Lighthouse remains slow.

## Useful Checks

Run production build and preview:

```bash
npm run build
npm run preview
```

Run Lighthouse against preview:

```bash
npx lighthouse http://127.0.0.1:4173/ --only-categories=performance
```

If Lighthouse fails to clean up temporary files on Windows but still writes the report, read the output file and treat the cleanup error as a tooling issue.
