# Landing Page Design & Engineering Manual

This document provides a comprehensive technical overview of the **StudyPilot** landing page design philosophy, visual system, interactive features, scroll-driven mechanics, and performance optimizations.

---

## 1. Design System & Brand Identity

The visual language of StudyPilot is tailored to be **premium, quiet, and student-focused**. Rather than typical loud SaaS marketing sites, it feels editorial, distraction-free, and immersive, utilizing elegant high-contrast typography, a dark canvas, and neon accents.

### Design Tokens & Variables (`src/index.css`)
Global variables establish a robust dark mode layout:
```css
:root {
  color-scheme: dark;

  /* Neutrals */
  --bg: #050610;         /* Primary canvas background */
  --bg-deep: #02030a;    /* Deeper canvas for contrast */
  --ink: #f4f5fb;        /* Primary typography high-contrast white */
  --muted: rgba(244, 245, 251, 0.66);
  --quiet: rgba(244, 245, 251, 0.42);
  --whisper: rgba(244, 245, 251, 0.22);
  
  /* Borders and Lines */
  --line: rgba(232, 234, 252, 0.09);
  --line-strong: rgba(232, 234, 252, 0.18);

  /* Neon Brand Accents (used in gradients and interactive spotlights) */
  --cyan: #39d7ff;
  --blue: #5bb8ff;
  --violet: #7c5cff;
  --purple: #a855f7;
  --pink: #ff4fd8;

  /* Typography Stack */
  --serif: 'Instrument Serif', 'Iowan Old Style', Georgia, serif;
  --sans: 'Geist', ui-sans-serif, system-ui, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;

  /* Motion Curves */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
}
```

### Typography Philosophy
- **High-Contrast Editorial Headers**: Heading elements use `--serif` (`Instrument Serif`) and italicized key phrases (`<i>`) to elevate the tone into a premium, literary aesthetic.
- **Modern Clean Copy**: Body copy uses `--sans` (`Geist`) at medium line heights (`1.6`–`1.65`) for excellent readability.
- **Technical Metadata**: Labels, navigation links, and step markers use `--mono` (`JetBrains Mono`) in uppercase with letter-spacing (`0.04em`–`0.18em`) to ground the app in a precise, tool-like utility.

### Premium Scrollbar
The page includes a custom WebKit scrollbar matching the theme:
- **Track**: Blurs the backdrop with `rgba(5, 6, 16, 0.45)` and a subtle border.
- **Thumb**: Smooth brand-violet pill. On **hover/drag**, it lights up into a premium linear neon gradient (`--cyan`, `--violet`, `--pink`) with custom drop shadows.

---

## 2. Architecture & Entry Points

The marketing site serves as the main viewport entrance, supporting highly responsive micro-routing without external routing libraries.

```text
index.html ──> src/main.tsx ──> src/App.tsx ──> site-shell (Hero, Compatibility, Capabilities, etc.)
                                          └── lazy Dashboard (when hash starts with #dashboard)
```

- **Vite HTML Shell (`index.html`)**: Entry points at `/src/main.tsx` in dev, transformed on-the-fly and bundled into hashed files in `dist/` on build.
- **Main Assembly (`src/App.tsx`)**: Mounts the page layout, handles global states, and observes `window.location.hash` changes manually.
- **Zero-Overhead Dashboard Switch**:
  - Hash routes containing `#dashboard` dynamically trigger a React `<Suspense>` boundary that lazy-loads `src/components/Dashboard.tsx`.
  - Normal routes render the marketing `.site-shell` components sequentially.

---

## 3. Hero Section: Scroll-Driven 3D Extension Transition

The core interactive centerpiece of the landing page is the **scroll-driven product showcase**. As the user scrolls, the product card rotates in a 3D context, shrinks, and flies into the top-right corner—visualizing a Chrome Extension pinning itself to the browser toolbar.

```
.hero-scroll-container  (250svh tall - creates "scroll budget")
  └── .hero             (100svh - position: sticky; top: 0)
        ├── .hero-bg    (WebGL dynamic gradient, absolute)
        ├── .hero-mask  (radial masking overlay, absolute)
        └── .hero-grid  (two-column content split)
              ├── .hero-copy    (typography, CTA actions)
              └── .hero-stage   (3D perspective: 1600px)
                    ├── .hero-product    (scroll-driven transforms)
                    └── .hero-installed  (cross-fades in at late progress)
```

### Core Scroll Mechanics
- The outer `.hero-scroll-container` spans **`250svh`**, creating a scroll buffer.
- The inner `.hero` container is **`100svh`** and `position: sticky; top: 0`. It remains locked to the viewport while the user scrolls through the remaining `150svh`.
- `scrollYProgress` tracks the scroll progress between `0.0` and `1.0` using Framer Motion's `useScroll` with `offset: ['start start', 'end end']`.

### The 4 Transform Phases
The scroll transformation is mapped across `scrollYProgress` using `useTransform` to maintain deterministic, reversible frames:

| Phase | `scrollYProgress` Range | Mechanical Behavior & Values |
| :--- | :--- | :--- |
| **1. Hold** | `0.0` ──> `0.2` | Product sits in static perspective tilt: `rotateY: -9deg`, `rotateX: 4deg`, `rotateZ: 1.5deg`. Allows text readability. |
| **2. Spin** | `0.2` ──> `0.6` | Product card performs a dramatic 3D spin. X and Z tilt straighten out. `rotateY` changes by $360^\circ$ (ends at `351deg`). |
| **3. Fly** | `0.55` ──> `0.9` | Card scales down from `1.0` to `0.12` and translates ($X, Y$) toward the top-right corner (`flyTarget`). |
| **4. Cross-Fade** | `0.76` ──> `0.92` | The product card fades to `0.0` opacity. Concurrently, the `.hero-installed` badge container slides up and fades to `1.0` opacity. |

### Viewport-Responsive Calculations
The $X$ and $Y$ coordinates for the extension destination are computed programmatically on viewport resize to guarantee the product flies exactly to the top-right Chrome bar on any screen width (1080p, widescreen, or mobile):
```typescript
const [flyTarget, setFlyTarget] = useState({ x: 500, y: -420 });

useEffect(() => {
  const update = () =>
    setFlyTarget({
      x: window.innerWidth * 0.28,
      y: -window.innerHeight * 0.42,
    });
  update();
  window.addEventListener('resize', update);
  return () => window.removeEventListener('resize', update);
}, []);
```

### Critical CSS Structural Rules
1. **`overflow: clip` on `.hero`**: Replaces `overflow: hidden` to suppress clipping margins while preventing browser-specific sticky context issues.
2. **`z-index: 1` on `.hero-scroll-container`**: Forces the sticky canvas layer to paint over subsequent DOM siblings (`.compat`, `.capabilities`) during scroll containment.
3. **`perspective: 1600` on `.hero-stage`**: Placed on the parent element to establish a stable, natural 3D camera environment, preventing flat distortions of child components.

---

## 4. Interactive WebGL Background (`GradientBlinds`)

To wow the user, the hero features a complex, interactive WebGL mesh rendering a silky, distorted blind-stripe pattern. It is powered by `OGL` (a minimal WebGL library) inside `src/components/GradientBlinds.tsx`.

### GPU & Rendering Pipeline
- **Triangle Mesh Setup**: Deploys a full-screen triangle to feed coordinates into custom vertex/fragment shaders.
- **Custom Color Stops**: Parses hex strings dynamically, converting them into floating-point RGB representations arrays mapped into the fragment shader uniforms (`uColor0` through `uColor7`).
- **Interactive Mouse Spotlight**: Tracks `pointermove` coordinates and passes dampening uniforms to the shader. The spotlight follows the cursor with smooth easing:
  $$\text{Mouse}_{\text{current}} += (\text{Mouse}_{\text{target}} - \text{Mouse}_{\text{current}}) \times \text{dampening}$$

### Fragment Shader Pipeline
The core look is computed programmatically per-pixel in WebGL:
1. **Aspect Ratio Correction**: Adjusts coordinates so the circular mouse spotlight remains perfectly uniform regardless of browser dimensions.
2. **2D Rotation**: Rotates space by `--angle` to render diagonal bands.
3. **Domain Distortion (Wave Simulation)**: Simulates liquid flow by perturbing coordinates using high-frequency mathematical offsets:
   ```glsl
   uvMod.x += sin(uvMod.y * 6.0) * (0.01 * uDistort);
   uvMod.y += cos(uvMod.x * 6.0) * (0.01 * uDistort);
   ```
4. **Spotlight Masking & Contrast**: Computes a circular spotlight relative to the damped mouse position, mixing in random noise overlays to give an organic, physical texture.

### Performance Tuning & Battery Preservation
Because high-resolution shader calculations can stress GPU hardware, several critical architectural guardrails are coded in:
1. **DPR Resolution Limit**: The WebGL Renderer limits the device pixel ratio (`dpr`) to **`0.6`**. Since the canvas holds purely blurred, ambient background gradients, shading fewer pixels saves enormous GPU cycles with zero visible quality drop.
2. **Dynamic Target Framerate**: Caps loops to **`30 FPS`** (`1000 / 30` intervals) to balance visual fluidity with processor thermals.
3. **Scroll & Idle Throttle**: Suspends WebGL loops (`cancelAnimationFrame`) during user scrolling. Scroll intervals are assumed static; rendering resume-triggers occur immediately when momentum stops.
4. **Visibility & Intersection Observers**: Utilizes `IntersectionObserver` and `document.visibilityState` changes to pause WebGL loops the instant the hero scrolls out of view or the browser tab is minimized.

---

## 5. Sub-Hero Page Sections

Once the hero un-sticks, the user is introduced to a rhythm of highly structured informational blocks.

```
       [ Hero Sticky Section ]
                  │ (Smooth gradient bridge masking)
                  ▼
   [ Compatibility Infinite Marquee ]
                  │
                  ▼
   [ Capabilities Asymmetrical Grid ]
                  │
                  ▼
        [ Workflow 3-Step ]
                  │
                  ▼
        [ Principles / Values ]
                  │
                  ▼
     [ Pinned & Ready Extension CTA ]
                  │
                  ▼
      [ Premium Editorial Footer ]
```

### Compatibility Strip (`Compatibility`)
An endless horizontal scroll marquee showcasing supported browser platforms and study targets (mitocw, youtube, coursera, pdfs, etc.).
- **Seamless Marquee Animation**: Renders double sets of data arrays inside a Flex track running CSS marquee keyframes translating `-50%` on infinite loop:
  ```css
  @keyframes marquee {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  ```
- **Observer-Linked Sleep**: Uses an `IntersectionObserver` on the section boundary. The animation sets `animation-play-state: paused` automatically when scrolled away to completely free browser paint thread memory.
- **Hover Micro-Interaction**: Mousing over the track pauses the scroll marquee, while individual items transition their icon fill color and opacity to standard white (`--ink`).

### Capabilities Asymmetrical Grid (`Capabilities`)
Highlights the 4 visual operational modes of the StudyPilot panel: **Listen**, **Summarize**, **Quiz**, and **Ask**.
- **Asymmetrical Column Layout**: Implemented using a modern CSS Grid layout that groups cards dynamically:
  ```css
  .mode-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  /* First Card (Listen): 2x2 double block */
  .mode-card:nth-child(1) { grid-column: span 2; grid-row: span 2; }
  /* Second Card (Summarize): 2-column wide bar */
  .mode-card:nth-child(2) { grid-column: span 2; }
  /* Third and Fourth Cards (Quiz & Ask): 1-column cards */
  ```
- **Subtle Visual Hover Glows**: Interactive hover states are driven by a absolute-positioned glow pseudo-element (`.mode-card::before`) which lights up an organic linear gradient atop the card container, accompanied by custom color transitions.

---

## 6. Development & Quality Guardrails

### 1. Motion Sensitivity Compliance
All core entrance and scroll-driven transformations check system-level preferences via `useReducedMotion()`. 
- **Behavior**: If a user has reduced motion active, all 3D rotations, scales, fly translations, and interactive canvas loops are completely deactivated.
- The hero renders a static, hardware-stabilized, high-contrast flat layout.

### 2. Manual Hash Routing Compliance
- Route transitions to `#dashboard` must lazy-load the dashboard component.
- **Note**: The dashboard page (`src/components/Dashboard.tsx`) is owned by parallel development tasks. Documentation additions to this landing page manual must not interfere with Dashboard file structures to ensure compile-stability.

### 3. Verification Protocol
To verify the page compilation and visual performance baseline locally:
- Run a production bundle compile: `npm run build`
- Start the optimized production preview server: `npm run preview`
- Performance profiling should always target the preview port (`http://127.0.0.1:4173/`) rather than Vite dev mode, which loads thousands of separate source TSX modules.
