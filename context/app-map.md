# App Map

## High-Level Flow

```text
index.html
  -> src/main.tsx
    -> src/App.tsx
      -> marketing site sections
      -> lazy Dashboard when hash starts with #dashboard
```

## Key Files

`src/main.tsx`

Mounts the React app with `createRoot`. It imports global CSS from `src/index.css`.

`src/App.tsx`

Owns the marketing page and hash-route switch. It includes:

- `Hero`: sticky first-viewport marketing hero with scroll-driven product transform.
- `Compatibility`: horizontal marquee of supported learning surfaces.
- `Capabilities`: four feature modes: Listen, Summarize, Quiz, Ask.
- `Workflow`: three-step usage explanation.
- `Principles`: quiet/local/fast positioning.
- `Install`: install call-to-action.
- `Footer`: footer navigation and privacy-first beta badge.

`src/components/GradientBlinds.tsx`

WebGL gradient background powered by OGL. It creates a canvas, shader program, resize observer, intersection observer, and pointer/scroll listeners. This is visually important but should be treated as a performance-sensitive component.

`src/components/GradientBlinds.css`

Canvas container styling for the hero background.

`src/components/RippleGrid.tsx`

Another OGL canvas effect. It is not currently part of the main marketing route in `App.tsx`, but it exists as a reusable visual effect.

`src/components/Dashboard.tsx`

Dashboard route. Do not edit right now unless asked; it is under active parallel work.

`src/components/ui/button.tsx`

Small anchor-style button component with variants mapped to CSS classes.

`src/lib/utils.ts`

Utility helpers. Currently used by the button component for class name joining.

`src/index.css`

Global styles for both the marketing site and dashboard. It contains layout, motion, visual styling, responsive rules, and accessibility reduced-motion overrides.

`vite.config.ts`

Vite config with manual chunks for React and Framer Motion dependencies:

- `react-vendor`
- `motion-vendor`

## Assets

Main public assets live in `public/assets/`, including:

- StudyPilot logo/mark SVGs.
- Product modal demo SVG.
- Hero and extension mockup WebP assets.
- App icon images.

Brand source material also exists under `logos/studypilot_logo_pack/`.

## Current UI Model

The marketing page is the first screen. It does not use a separate router package. It uses hash navigation for page sections and the dashboard route. This keeps the app small, but means hash changes are manually observed in `App.tsx`.

## Copy Themes

The app emphasizes:

- Studying from any browser tab.
- Asking without switching apps.
- Voice, summary, quiz, and ask modes.
- Privacy-first/local-by-default behavior.
- Low-distraction student workflow.
