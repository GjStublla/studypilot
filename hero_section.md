# Hero Section - Scroll-Driven Animation

## Overview

The hero section uses a scroll-linked animation powered by framer-motion's `useScroll` and `useTransform` hooks. As the user scrolls down, the product modal (StudyPilot panel demo) performs a full 3D spin, then shrinks and flies toward the top-right corner of the viewport — mimicking the visual effect of a Chrome extension being installed into the browser toolbar.

The hero stays pinned to the viewport during the entire animation via CSS `position: sticky`, giving the user full control over the animation speed through their scroll input.

---

## Architecture

### DOM Structure

```
.hero-scroll-container   (250svh tall, creates scroll room)
  └── .hero               (100svh, sticky at top: 0)
        ├── .hero-bg        (Silk WebGL background, absolute)
        ├── .hero-mask      (dark gradient overlay, absolute)
        ├── .hero-grain     (noise texture overlay, absolute)
        ├── HeroNav          (header with logo + links)
        └── .hero-frame      (flex: 1, holds the grid)
              └── .hero-grid  (two-column layout)
                    ├── .hero-copy     (headline, buttons, metadata)
                    └── .hero-stage    (perspective: 1600px)
                          └── .hero-product  (scroll-driven transforms)
                                ├── img
                                └── .hero-product-shadow
```

### How the Scroll Container Works

The `.hero-scroll-container` is **250svh** tall but the `.hero` inside it is only **100svh**. The hero is `position: sticky; top: 0`, so it pins to the viewport while the user scrolls through the remaining **150svh** of the container. This 150svh is the animation's scroll budget — the distance over which `scrollYProgress` goes from 0 to 1.

Once the container's bottom edge reaches the viewport's bottom edge, the hero un-sticks and scrolls away normally, revealing the sections below (compat strip, capabilities, etc.).

### Scroll Progress Mapping

`useScroll` is configured with `offset: ['start start', 'end end']`, meaning:

- **Progress 0**: container top aligns with viewport top (initial page load)
- **Progress 1**: container bottom aligns with viewport bottom (after ~150svh of scroll)

All animation values are derived from this single `scrollYProgress` motion value via `useTransform`.

---

## Animation Phases

The animation is broken into four overlapping phases. The overlap between phases creates seamless transitions.

### Phase 1 — Hold (progress 0 to 0.2)

The product sits idle with its initial perspective tilt. This gives the user a moment to read the hero copy before the animation begins.

| Property | Value |
|----------|-------|
| rotateY  | -9deg |
| rotateX  | 4deg  |
| rotateZ  | 1.5deg |
| scale    | 1     |
| x, y     | 0, 0  |
| opacity  | 1     |

### Phase 2 — Spin (progress 0.2 to 0.6)

The product performs a full 360-degree rotation around the Y axis. The X and Z tilts straighten out simultaneously so the product ends facing the viewer head-on.

```tsx
rotateY: useTransform(scrollYProgress, [0, 0.2, 0.6], [-9, -9, 351])
rotateX: useTransform(scrollYProgress, [0, 0.2, 0.5], [4, 4, 0])
rotateZ: useTransform(scrollYProgress, [0, 0.2, 0.5], [1.5, 1.5, 0])
```

The spin goes from **-9deg to 351deg** (a net change of 360deg). At the midpoint (~progress 0.4), the product is edge-on at ~171deg, creating a dramatic 3D card-flip effect. The `perspective: 1600px` on the parent `.hero-stage` gives depth to the rotation.

### Phase 3 — Fly to Extensions (progress 0.55 to 0.9)

The product scales down to 12% of its original size and translates toward the top-right corner of the viewport, simulating the extension being pinned to the browser toolbar.

```tsx
productScale: useTransform(scrollYProgress, [0, 0.55, 0.9], [1, 1, 0.12])
productX:     useTransform(scrollYProgress, [0.55, 0.9], [0, flyTarget.x])
productY:     useTransform(scrollYProgress, [0.55, 0.9], [0, flyTarget.y])
```

The `flyTarget` values are **viewport-responsive** — they're calculated as a percentage of `window.innerWidth` (28%) and `window.innerHeight` (42%) and update on resize via a `useEffect` listener. This ensures the product flies convincingly toward the top-right corner on any screen size, from 1080p to 4K.

This phase intentionally overlaps with the end of the spin (0.55 to 0.6) so the product begins moving while it finishes its last ~36 degrees of rotation.

### Phase 4 — Fade Out & Installed State (progress 0.76 to 0.92)

The product fades to zero opacity while the "installed" state cross-fades in. The two overlap to create a smooth handoff.

```tsx
productOpacity:  useTransform(scrollYProgress, [0.76, 0.9],  [1, 0])
installedOpacity: useTransform(scrollYProgress, [0.78, 0.92], [0, 1])
installedScale:   useTransform(scrollYProgress, [0.78, 0.92], [0.88, 1])
installedY:       useTransform(scrollYProgress, [0.78, 0.92], [24, 0])
```

The installed state shows a glowing ring with the StudyPilot mark, a "Pinned & ready." label, and an "Add to Chrome" CTA button. It fills the empty stage area so the hero never looks hollow after the product flies away.

**Important:** These fade ranges intentionally complete well before progress 1.0. Framer-motion's `useScroll` can behave unpredictably in the last ~5% of the scroll range (near the sticky→unsticky boundary). Ending the animation by 0.92 avoids any jitter.

---

## Key CSS Decisions

### `overflow: clip` instead of `overflow: hidden`

The hero uses `overflow: clip` rather than `overflow: hidden`. Both clip visual overflow, but `overflow: hidden` creates an implicit scroll container which can break `position: sticky` in some browsers. `overflow: clip` clips without creating a scroll container, so sticky positioning works reliably.

### `z-index: 1` on the scroll container

Ensures the sticky hero renders above the sibling sections (compat, capabilities, etc.) that exist later in the DOM. Without this, those sections could paint over the hero during the sticky phase.

### No CSS `transform` on `.hero-product`

The perspective tilt that was previously set via CSS (`transform: perspective(1600px) rotateY(-9deg) rotateX(4deg) rotateZ(1.5deg)`) is now handled entirely by framer-motion's `style` prop. If both CSS and framer-motion set transforms on the same element, framer-motion overrides the CSS transform — so the CSS version was removed to avoid confusion.

### `perspective: 1600` on `.hero-stage`

The perspective is set on the parent container via framer-motion's `style={{ perspective: 1600 }}`, not on the product itself. This establishes a 3D rendering context so the child's `rotateY` produces visible depth. A value of 1600px gives a subtle, natural-looking perspective — lower values (e.g. 400) would exaggerate the 3D distortion.

---

## Dos

- **Do keep scroll-driven values in `useTransform` arrays.** Each transform is a pure function of `scrollYProgress`. This makes the animation deterministic, reversible, and tied to the user's scroll position with no timing dependencies.

- **Do overlap animation phases slightly.** The spin ends at progress 0.6 and the fly starts at 0.55. This 5% overlap creates a seamless transition instead of a jarring phase switch.

- **Do set `perspective` on the parent, not the rotating element.** CSS perspective on a parent creates a 3D context for children. Setting it on the element itself doesn't produce the same depth effect.

- **Do use `svh` units for the scroll container and hero heights.** `svh` (small viewport height) accounts for mobile browser chrome (URL bar, bottom nav). Using `vh` can cause the hero to be taller than the visible area on mobile.

- **Do keep the hold phase (0 to 0.2).** Without it, the animation starts the instant the user begins scrolling, which feels abrupt and doesn't give them time to read the hero copy.

- **Do test by scrolling slowly.** The animation is best evaluated at a slow, steady scroll speed. Fast scrolling compresses the phases and can make the spin look jerky.

---

## Don'ts

- **Don't add `animate` or `transition` props to `.hero-product`.** The product's motion is driven entirely by the `style` prop with motion values. Adding `animate={{ y: [0, -10, 0] }}` (the old floating animation) would conflict with the scroll-driven `y` transform, causing jittery behavior.

- **Don't put a CSS `transform` on `.hero-product`.** Framer-motion's `style` prop generates its own `transform` string. A CSS transform on the same element gets overridden entirely, not merged. If you need the initial tilt, set it as the first keyframe in the `useTransform` arrays (which is already done: `rotateY` starts at -9deg).

- **Don't use `overflow: hidden` on `.hero`.** It can break `position: sticky` by creating an implicit scroll container. Use `overflow: clip` instead.

- **Don't change `offset` on `useScroll` without recalculating all phase boundaries.** The offset `['start start', 'end end']` defines when progress is 0 and 1. Changing it shifts every phase. If you switch to `['start start', 'end start']` for example, progress 1 would occur much earlier and the animation would be compressed.

- **Don't add `will-change: transform` to `.hero-product`.** Framer-motion handles GPU layer promotion internally. Adding `will-change` manually is redundant and can cause excessive memory usage on mobile.

- **Don't use pixel values for the scroll container height.** The container must be taller than the hero by a scrollable margin. Using `250svh` guarantees the ratio holds across viewport sizes. A fixed pixel height like `1800px` would break on smaller or larger screens.

- **Don't wrap the scroll container or hero in an element with `overflow: auto` or `overflow: scroll`.** Sticky positioning is relative to the nearest scroll ancestor. If you introduce a scroll container between `.hero-scroll-container` and the viewport, the hero will stick inside that container instead of the viewport.

- **Don't remove `z-index: 1` from `.hero-scroll-container`.** Without it, later DOM siblings (compat, capabilities) can paint above the sticky hero, creating visual glitches during the scroll animation.

---

## File Locations

| Concern | File | Lines |
|---------|------|-------|
| Viewport fly target + scroll hooks | `src/App.tsx` | `Hero()` function (~line 120-146) |
| Product motion element | `src/App.tsx` | `.hero-product` motion.div (~line 222) |
| Installed state element | `src/App.tsx` | `.hero-installed` motion.div (~line 238) |
| Stage perspective | `src/App.tsx` | `.hero-stage` style prop (~line 219) |
| Scroll container CSS | `src/index.css` | `.hero-scroll-container` (~line 104) |
| Sticky hero CSS | `src/index.css` | `.hero` (~line 110) |
| Product styles | `src/index.css` | `.hero-product` (~line 350) |
| Installed state CSS | `src/index.css` | `.hero-installed` (~line 375) |
