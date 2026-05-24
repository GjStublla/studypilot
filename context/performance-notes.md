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
