import { memo, useEffect, useRef } from 'react';
import { ArrowUpRight, Chrome, MoreHorizontal, Moon, PanelLeft, PanelRight, Search, Sun } from 'lucide-react';
import { SIDEBAR_NAV_ITEMS, VIEW_TITLES, type DashboardStudent, type Theme, type View } from './dashboard-types';

export const Sidebar = memo(function Sidebar({
  student,
  view,
  setView,
  openCount,
  sessionsCount,
  rubricsCount,
  onOpenExtension,
}: {
  student: DashboardStudent;
  view: View;
  setView: (v: View) => void;
  openCount: number;
  sessionsCount: number;
  rubricsCount: number;
  onOpenExtension: () => void;
}) {
  const metaValues = {
    sessions: String(sessionsCount),
    rubrics: String(rubricsCount),
    openActions: String(openCount),
  };

  return (
    <aside className="ds-sidebar" aria-label="Dashboard navigation">
      <div className="ds-brand">
        <svg
          viewBox="0 0 200 180"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          className="ds-brand-logo"
        >
          <title>StudyPilot</title>
          <g strokeLinecap="round" strokeLinejoin="round">
            <path d="M34 72V38c0-9.9 8.1-18 18-18h96c9.9 0 18 8.1 18 18v34" fill="none" stroke="currentColor" strokeWidth="4" />
            <path d="M34 48h132" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.6" />
            <circle cx="52" cy="34" r="4.5" fill="currentColor" />
            <circle cx="66" cy="34" r="4.5" fill="currentColor" opacity="0.82" />
            <circle cx="80" cy="34" r="4.5" fill="currentColor" opacity="0.64" />
            <circle cx="100" cy="92" r="44" fill="currentColor" opacity="0.15" />
            <path d="M100 61l19 58-19-13-19 13 19-58z" fill="none" stroke="currentColor" strokeWidth="4" />
            <path d="M100 155c-23-16-49-22-86-22" fill="none" stroke="currentColor" strokeWidth="4" />
            <path d="M100 155c23-16 49-22 86-22" fill="none" stroke="currentColor" strokeWidth="4" />
            <path d="M100 9l4 11 11 4-11 4-4 11-4-11-11-4 11-4 4-11z" fill="currentColor" />
          </g>
        </svg>
        <span className="ds-brand-env">Dashboard</span>
      </div>

      <nav className="ds-nav" aria-label="Primary navigation">
        {SIDEBAR_NAV_ITEMS.map(({ id, label, icon: Icon, meta }) => {
          const isActive = view === id || (id === 'sessions' && view === 'session-detail');
          return (
            <button
              key={id}
              type="button"
              className={`ds-nav-item ${isActive ? 'is-active' : ''}`}
              onClick={() => setView(id)}
            >
              <Icon size={14} strokeWidth={1.6} />
              <span>{label}</span>
              {meta && <em className="ds-nav-meta">{metaValues[meta]}</em>}
            </button>
          );
        })}
      </nav>

      <div className="ds-side-spacer" />

      <div className="ds-side-foot">
        <button
          type="button"
          className="ds-ext-pill"
          onClick={onOpenExtension}
        >
          <Chrome size={13} strokeWidth={1.6} />
          <span>Open extension</span>
          <ArrowUpRight size={12} strokeWidth={1.6} />
        </button>

        <button type="button" className="ds-account">
          <span className="ds-account-avatar" aria-hidden="true">
            {student.initials}
          </span>
          <span className="ds-account-body">
            <b>{student.name}</b>
            <em>{student.email}</em>
          </span>
        </button>
      </div>
    </aside>
  );
});

/* ============================================================================
   Top bar — view title, search, sidebar toggle
   ============================================================================ */


export const TopBar = memo(function TopBar({
  view,
  theme,
  contextOpen,
  query,
  onQueryChange,
  onToggleSidebar,
  onToggleContext,
  onToggleTheme,
}: {
  view: View;
  theme: Theme;
  contextOpen: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onToggleSidebar: () => void;
  onToggleContext: () => void;
  onToggleTheme: () => void;
}) {
  const t = VIEW_TITLES[view];
  const isLight = theme === 'light';
  const searchRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl-K focuses the search box from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="ds-topbar">
      <button
        type="button"
        className="ds-icon-btn"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
      >
        <PanelLeft size={15} strokeWidth={1.6} />
      </button>

      <div className="ds-topbar-title">
        <span className="ds-eyebrow">{t.eyebrow}</span>
        <h1>{t.title}</h1>
      </div>

      <div className="ds-topbar-actions">
        <div className="ds-search">
          <Search size={13} strokeWidth={1.6} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search sessions, rubrics, action items…"
            aria-label="Search"
          />
          {query ? (
            <button
              type="button"
              className="ds-search-clear"
              onClick={() => onQueryChange('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          ) : (
            <kbd>⌘K</kbd>
          )}
        </div>
        <button
          type="button"
          className="ds-icon-btn ds-theme-toggle"
          onClick={onToggleTheme}
          aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
          title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {isLight ? <Moon size={14} strokeWidth={1.6} /> : <Sun size={14} strokeWidth={1.6} />}
        </button>
        <button type="button" className="ds-icon-btn" aria-label="More">
          <MoreHorizontal size={15} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          className={`ds-icon-btn ds-topbar-context-toggle ${contextOpen ? 'is-on-quiet' : ''}`}
          onClick={onToggleContext}
          aria-label={contextOpen ? 'Hide context panel' : 'Show context panel'}
          aria-pressed={contextOpen}
        >
          <PanelRight size={15} strokeWidth={1.6} />
        </button>
      </div>
    </header>
  );
});
