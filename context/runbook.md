# Runbook

## Local Commands

Install dependencies:

```bash
npm install
```

Start dev server:

```bash
npm run dev
```

Build production assets:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Vite HTML Behavior

In development, `index.html` contains:

```html
<script type="module" src="/src/main.tsx"></script>
```

That is normal for Vite. The browser requests `/src/main.tsx`, and Vite serves transformed JavaScript. In production, `vite build` rewrites `dist/index.html` to hashed JS and CSS assets.

If a production deployment serves the root source `index.html` without running `vite build`, the app may fail or behave inconsistently. A normal Vite deployment should serve the `dist/` output.

## Known Current Build Note

At the time this context folder was created, `npm run build` may be blocked by TypeScript errors in `src/components/Dashboard.tsx`. That file is under active dashboard work by another agent/person. Do not "fix" those errors from unrelated tasks without coordinating first.

## Local Server Note

During the performance scan, local servers were started on:

- `http://127.0.0.1:4173/` for production preview.
- `http://127.0.0.1:5174/` for Vite dev after `5173` was occupied.

If ports are busy, either stop those processes or let Vite choose another port.

## Before Changing Code

1. Read `context/README.md`.
2. Check whether work overlaps with `src/components/Dashboard.tsx`.
3. Prefer narrowly scoped changes.
4. Run the cheapest relevant verification.
5. If build failures are only in dashboard while dashboard work is active, report them rather than editing dashboard.
