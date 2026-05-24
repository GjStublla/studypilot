# StudyPilot Context

This folder is a compact handoff guide for the StudyPilot app. Use it before changing code, reviewing performance, or onboarding another agent.

## What This App Is

StudyPilot is a Vite + React single page app for an AI study copilot. The public page presents a browser-tab study assistant that can listen, summarize, quiz, and answer questions without forcing students to switch apps. The app also has a dashboard experience behind the `#dashboard` hash route.

The current product tone is premium, quiet, and student-focused: dark interface, high-contrast editorial typography, smooth motion, and privacy-first copy.

## Current Stack

- React 19 with TypeScript.
- Vite for dev, build, and preview.
- Framer Motion for entrance and scroll-driven animation.
- Lucide React for icons.
- OGL/WebGL for the animated hero background.
- Plain CSS in `src/index.css`; no Tailwind config is present.

## Primary Entry Points

- `index.html` is the Vite HTML shell. In dev it points at `/src/main.tsx`; Vite transforms that TSX module before the browser executes it.
- `src/main.tsx` mounts React into `#root`.
- `src/App.tsx` decides between the marketing site and dashboard based on `window.location.hash`.
- `src/components/Dashboard.tsx` contains the dashboard route and is currently being worked on separately.

## Routes

- `/` or `/#...` without `#dashboard`: renders the marketing/landing experience.
- `/#dashboard`: lazy-loads and renders the dashboard.

## Important Guardrail

Do not edit `src/components/Dashboard.tsx` unless the dashboard owner explicitly asks for it. At the time this context folder was created, another agent/person was actively working on that file.

## More Detail

- See `context/app-map.md` for architecture and file responsibilities.
- See `context/runbook.md` for local commands and known build notes.
- See `context/performance-notes.md` for the performance scan summary and likely optimization areas.
