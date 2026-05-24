# Dashboard

The dashboard is the memory layer for the Chrome extension. Where the extension delivers live, real-time coaching while a student works, the dashboard is where everything from those sessions lands and stays useful afterwards — transcripts, summaries, rubrics, action items, and follow-up chat that remembers what happened.

It lives behind the `#dashboard` hash route and is lazy-loaded from `src/App.tsx`. The landing page is untouched when the dashboard is mounted.

## Files

- `src/components/Dashboard.tsx` — single-file dashboard. All views, primitives, and state live here.
- `src/components/Dashboard.css` — scoped stylesheet imported by `Dashboard.tsx`. Every selector is prefixed `app-dashboard` or `ds-*` so it cannot leak into the landing page.
- `src/App.tsx` — owns the hash route switch. `Suspense` + `React.lazy(() => import('./components/Dashboard'))`.

The landing page CSS in `src/index.css` does not touch any dashboard selector.

## Routing

There is no router package. The dashboard is one component with an internal `view` state machine:

```ts
type View =
  | 'home'
  | 'chat'
  | 'sessions'
  | 'session-detail'
  | 'rubrics'
  | 'action-items'
  | 'settings';
```

`Dashboard` renders the sidebar, top bar, view router (a switch over `view`), and the right context panel — all in one tree. Navigation is `setView(...)`, not URL changes. The only URL contract is the outer `#dashboard` hash check in `App.tsx`.

## Layout

A three-column grid:

```
| 244px sidebar | flexible main | 312px context |
```

Two modifier classes on the root `.app-dashboard` collapse columns independently:

- `.is-collapsed` — collapses the left sidebar (track 1 → 0px). Sidebar slides out via `transform: translateX(-100%)`. Toggled by the `PanelLeft` button in the top bar.
- `.is-context-collapsed` — collapses the right context panel (track 3 → 0px), main expands to fill. Panel slides out via `translateX(100%)`. Toggled by the `PanelRight` button in the top bar.

Both can be active simultaneously, leaving only the main column.

### Responsive

- `≥ 1180px` — three columns visible.
- `1180px > w ≥ 760px` — context panel hidden, two columns. The context-toggle button hides as a no-op.
- `< 760px` — single column. The sidebar becomes a `position: fixed` drawer that slides in over content. The grid is forced to `1fr` for both `.is-collapsed` and the default state because the fixed sidebar is out of flow.

Initial state is viewport-aware: `sidebarOpen` defaults `false` below 760px, `contextOpen` defaults `false` below 1180px.

## Views

All views are top-level components inside `Dashboard.tsx`. They are pure functions of props.

| View | Component | What it shows |
| --- | --- | --- |
| Home | `HomeView` | Editorial greeting, latest imported extension session card, active rubric criteria, open action items, recent activity. The "Continue in chat" CTA on the latest session deep-links into chat with that session loaded as context. |
| Chat | `ChatView` | Local seed conversation, four quick-prompt chips, composer with mic toggle and send. The header strip shows context chips: the active session (clickable to its detail view), the active rubric, "Imported from Chrome extension", and the session's mode + duration. |
| Sessions | `SessionsView` | Editorial card stack of every imported coaching session. Each card opens the detail view or jumps to chat with that session as context. |
| Session detail | `SessionDetailView` | Summary, transcript preview (with `YOU` / `STUDYPILOT` mono labels), session action items, the rubric used, and a follow-up prompts list. "Continue in chat" loads the session into chat. |
| Rubrics | `RubricsView` | Card stack with criteria pills and a mint *Active* pill on the active rubric. "Set active" toggles which rubric the chat and home views read from. |
| Action items | `ActionItemsView` | Tabbed Open / Done list with checkboxes. Each item carries pills linking back to its source session and rubric. Toggling propagates counts to the sidebar badge, the tab counters, and the context-panel stat. |
| Settings | `SettingsView` | Account card, default coach mode segmented control, privacy and data retention copy. |

## State

All persistent state is held by the root `Dashboard` component:

```ts
const [view, setView] = useState<View>('home');
const [actionItems, setActionItems] = useState<ActionItem[]>(...);
const [activeRubricId, setActiveRubricId] = useState<string>('r1');
const [selectedSessionId, setSelectedSessionId] = useState<string>('s1');
const [chatContextSessionId, setChatContextSessionId] = useState<string>('s1');
const [sidebarOpen, setSidebarOpen] = useState(...);
const [contextOpen, setContextOpen] = useState(...);
```

Two distinct session selections are kept on purpose:

- `selectedSessionId` is what the Session detail view reads. Clicking a session card sets it.
- `chatContextSessionId` is what the Chat view (and right context panel) reads. Clicking "Continue in chat" anywhere sets it.

This lets a user open one session's transcript while chat keeps a different session loaded, which mirrors how the extension can spin up parallel coaching contexts.

`ChatView` keeps its own local message list and input draft so it survives unmounting via Suspense but does not persist across reloads (mock-only).

## Right context panel

The right column is not decorative — it is the working surface for the current view. It always shows three blocks plus a footer:

- Active rubric card, clickable, with criteria + score dots. Jumps to Rubrics.
- "From the extension" card: source mode, duration, when, plus the session summary as a cyan-bordered editorial quote.
- Suggested next steps: three follow-up prompts that all push the user back into chat with the current session as context.
- Footer: open action item count + an Open extension button.

Which session this block describes is `selectedSession` while on Session detail, otherwise `chatSession`.

## Primitives

There is no shadcn install. A few small primitives are defined inside `Dashboard.tsx`:

- `DsButton` — three variants: `primary` (light pill on dark), `secondary` (outlined surface), `ghost` (text only).
- `ScoreDots` — four-dot rubric score indicator.
- `TodoRow` — single action item with checkbox, text, and optional session tag.
- `EmptyState` — editorial empty state with serif title and quiet body copy.
- `StudyPilotMark` — fallback inline mark (the sidebar uses the SVG lockup from `/assets/studypilot-monochrome-lockup.svg`).

Lucide icons are used sparingly: `Home`, `MessageCircle`, `ScrollText`, `BookOpen`, `ListTodo`, `Settings`, `Chrome`, `PanelLeft`, `PanelRight`, `Sparkles`, `ShieldCheck`, `Clock`, `FileText`, `ArrowRight`, `ArrowUp`, `ChevronRight`, `Search`, `Plus`, `MoreHorizontal`, `Check`, `Paperclip`, `Mic`, `MicOff`.

## Design tokens

`Dashboard.css` declares `--ds-*` tokens scoped to `.app-dashboard`:

- Canvas `#050610`, deeper `#02030a` — matches the landing system.
- Three surface levels at `rgba(255, 255, 255, 0.022 / 0.045 / 0.075)`.
- Soft lines at `rgba(232, 234, 252, 0.055 / 0.09 / 0.18)`.
- Ink + four levels of muted text: `--ds-muted`, `--ds-quiet`, `--ds-whisper`.
- Accents restrained: cyan `#39d7ff` (extension imports), violet `#7c5cff` (subtle radial wash), mint `#6cf0c0` (active-rubric pill only).

Typography mirrors the landing system: Instrument Serif for display headings and card titles, Geist for body, JetBrains Mono for eyebrows, badge counts, and small metadata. The "hero" greeting on Home uses a serif italic with a soft gradient on the user's name — the only piece of brand color on Home.

## Mock data

All data is static, hardcoded at the top of `Dashboard.tsx`:

- `STUDENT` — name, initials, email.
- `RUBRICS` — three rubrics with course, criteria, and a per-criterion score.
- `SESSIONS` — three imported coaching sessions, each with summary, transcript snippets, mode, duration, and associated rubric.
- `ACTION_ITEMS_INITIAL` — eight items split across the three sessions and two rubrics. Eight is enough to show counts, tabs, and the source-tag rendering without bloating the list.

When a real backend lands, replace these constants with fetched data and lift the mutation paths (`toggleAction`, `setActiveRubricId`, `openInChat`) into the appropriate effect or store. The components themselves stay pure.

## Accessibility

- `aria-label` on icon buttons (panel toggles, send, mic, attach, more).
- `aria-pressed` on toggles (mic, panel toggles, action item checkboxes).
- `role="tab"` + `aria-selected` on the Open/Done tabs.
- `role="radiogroup"` + `aria-checked` on the Settings coach-mode segmented control.
- A global `@media (prefers-reduced-motion: reduce)` block neutralizes panel slide transforms and hover lifts.

## Guardrails

- Do not introduce Tailwind. The project is vanilla CSS with custom properties; the dashboard stays consistent with that.
- Do not add a router package. The view switch is internal state on purpose — it keeps the bundle small and matches the lazy-loaded entry.
- Keep `Dashboard.css` scoped to `.app-dashboard *`. No styles should leak.
- Do not change `src/index.css` for dashboard work. Anything dashboard-specific belongs in `Dashboard.css`.
