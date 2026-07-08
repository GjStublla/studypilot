import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, MouseEvent, ReactNode, SVGProps } from 'react';
import { clearAuth, apiFetch } from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import {
  fetchSessions,
  fetchRubrics,
  fetchActionItems,
  fetchSessionTranscript,
  createSessionCaptureSignedUrl,
  setActionItemDone,
} from '../lib/studypilot-api';
import { sendCoachingMessage } from '../lib/socraticCoach';
import { useStudyPilotRealtime } from '../lib/useRealtime';
import './Dashboard.css';

type Session = any;
type Rubric = any;
type ActionItem = any;
type TranscriptLine = {
  id: string;
  who: string;
  text: string;
  t: number;
};
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Chrome,
  Clock,
  FileText,
  Home,
  ListTodo,
  MessageCircle,
  Mic,
  MicOff,
  Moon,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Paperclip,
  Plus,
  ScrollText,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Sun,
} from 'lucide-react';

/* ============================================================================
   StudyPilot — Dashboard
   The "memory layer" of the Chrome extension.
   Renders inside #dashboard hash route (lazy-loaded from App.tsx).
   ============================================================================ */

type View =
  | 'home'
  | 'chat'
  | 'sessions'
  | 'session-detail'
  | 'rubrics'
  | 'action-items'
  | 'settings';

type Theme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'studypilot.dashboard-theme';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage unavailable */
  }
  if (typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

type Message = {
  id: string;
  role: 'ai' | 'user';
  text: string;
  lines: readonly string[];
  time: string;
};

type SessionRow = {
  session: Session;
  rubric?: Rubric;
  openCount: number;
};

/* ---------- Mock data ---------- */

/* ---------- Read logged-in user from localStorage ---------- */

function getLoggedInStudent() {
  try {
    const email = localStorage.getItem('sp_email') ?? 'student@university.edu';
    const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
    return { name, initials, email };
  } catch {
    return { name: 'Student', initials: 'S', email: '' };
  }
}

const STUDENT = getLoggedInStudent();

const QUICK_PROMPTS = [
  'What should I revise first?',
  'Explain this rubric',
  'Turn my feedback into a checklist',
  'Ask me Socratic questions',
] as const;

const SESSION_DETAIL_PROMPTS = [
  'Show me the strongest revision opportunity.',
  'Convert this session into a checklist.',
  'Ask me Socratic questions about my thesis.',
] as const;

const CONTEXT_PROMPTS = [
  'What should I revise first?',
  'Turn my feedback into a checklist',
  'Ask me Socratic questions',
] as const;

const SETTINGS_COACH_MODES = [
  { id: 'essay', label: 'Essay coach' },
  { id: 'lecture', label: 'Lecture' },
  { id: 'reader', label: 'Research reader' },
] as const;

const SCORE_DOT_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

type CoachMode = (typeof SETTINGS_COACH_MODES)[number]['id'];

const SIDEBAR_NAV_ITEMS: {
  id: View;
  label: string;
  icon: LucideIcon;
  meta?: 'sessions' | 'rubrics' | 'openActions';
}[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'sessions', label: 'Sessions', icon: ScrollText, meta: 'sessions' },
  { id: 'rubrics', label: 'Rubrics', icon: BookOpen, meta: 'rubrics' },
  { id: 'action-items', label: 'Action items', icon: ListTodo, meta: 'openActions' },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

const VIEW_TITLES: Record<View, { eyebrow: string; title: string }> = {
  home: { eyebrow: 'Today', title: 'Home' },
  chat: { eyebrow: 'Coach', title: 'Chat' },
  sessions: { eyebrow: 'Memory', title: 'Sessions' },
  'session-detail': { eyebrow: 'Memory', title: 'Session' },
  rubrics: { eyebrow: 'Library', title: 'Rubrics' },
  'action-items': { eyebrow: 'Followups', title: 'Action items' },
  settings: { eyebrow: 'Account', title: 'Settings' },
};

const homeDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

function createMessage(message: Omit<Message, 'lines'>): Message {
  return {
    ...message,
    lines: message.text.split('\n'),
  };
}

/* ---------- Component ---------- */

export default function Dashboard() {
  const [view, setView] = useState<View>('home');

  // ── Live data from the backend ──────────────────────────────────────────────
  const [sessions, setSessions] = useState<Session[]>([]);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [transcripts, setTranscripts] = useState<Record<string, TranscriptLine[]>>({});
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // ── Realtime subscriptions ─────────────────────────────────────────────────
  const [userId, setUserId] = useState<string | null>(null);

  // Resolve the Supabase UUID for realtime channel filtering.
  // For email/password users the user ID is already in localStorage (sp_user_id).
  // For OAuth users it comes from the Supabase session.
  // We avoid calling supabase.auth.getUser() here because it makes a network
  // request that can 403 if the token is expired or the client has no session yet.
  useEffect(() => {
    // Try localStorage first — populated immediately after any login
    const storedId = localStorage.getItem('sp_user_id');
    if (storedId) {
      setUserId(storedId);
      return;
    }
    // Fallback for OAuth users whose ID may only be in the Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setUserId(session.user.id);
    }).catch(() => { /* not fatal */ });
  }, []);

  useStudyPilotRealtime(userId, {
    onNewSession: (newSession) => {
      setSessions((prev) => [newSession, ...prev]);
    },
    onDocumentUpdated: (doc) => {
      // Update rubric status if document is linked to a rubric
      if (doc.rubric_id) {
        setRubrics((prev) =>
          prev.map((r) =>
            r.id === doc.rubric_id
              ? { ...r, file_search_status: doc.index_status }
              : r
          )
        );
      }
    },
    onActionItemChanged: (payload) => {
      if (payload.event === 'INSERT') {
        setActionItems((prev) => [payload.new as ActionItem, ...prev]);
      } else if (payload.event === 'UPDATE') {
        setActionItems((prev) =>
          prev.map((item) =>
            item.id === payload.new.id ? payload.new as ActionItem : item
          )
        );
      } else if (payload.event === 'DELETE') {
        setActionItems((prev) => prev.filter((item) => item.id !== payload.old.id));
      }
    },
    onRubricChanged: (payload) => {
      if (payload.event === 'INSERT') {
        setRubrics((prev) => [payload.new as Rubric, ...prev]);
      } else if (payload.event === 'UPDATE') {
        setRubrics((prev) =>
          prev.map((r) =>
            r.id === payload.new.id ? payload.new as Rubric : r
          )
        );
      } else if (payload.event === 'DELETE') {
        setRubrics((prev) => prev.filter((r) => r.id !== payload.old.id));
      }
    },
  });

  const [activeRubricId, setActiveRubricId] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [chatContextSessionId, setChatContextSessionId] = useState<string>('');
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  // Real profile from the backend; starts as the email-derived guess so first
  // paint isn't blank, then gets replaced with the actual name/initials/email.
  const [student, setStudent] = useState(STUDENT);
  // Default coach mode also comes from the profile; persisted back via PATCH /users/me.
  const [coachMode, setCoachMode] = useState<CoachMode>('essay');

  // Load the signed-in user's real profile. apiFetch refreshes the token on a
  // 401 and, if that fails, redirects to #auth — so this doubles as the session
  // validity check on dashboard entry (no longer trusting mere token presence).
  useEffect(() => {
    let cancelled = false;
    apiFetch('/users/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((profile) => {
        if (cancelled || !profile) return;
        setStudent({
          name: profile.name,
          email: profile.email,
          initials: profile.initials,
        });
        if (profile.default_coach_mode) {
          setCoachMode(profile.default_coach_mode as CoachMode);
        }
        // Backend is authoritative for a logged-in user — adopt the saved theme
        // (React bails out if it already matches, so no needless re-render/flash).
        if (profile.theme === 'light' || profile.theme === 'dark') {
          setTheme(profile.theme);
          try {
            window.localStorage.setItem(THEME_STORAGE_KEY, profile.theme);
          } catch {
            /* localStorage unavailable */
          }
        }
      })
      .catch(() => {
        /* network error or expired session (already redirected) — keep fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load sessions, rubrics, and action items in parallel. allSettled means one
  // failing endpoint doesn't blank the whole dashboard — we render whatever loaded.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([fetchSessions(), fetchRubrics(), fetchActionItems()])
      .then(([s, r, a]) => {
        if (cancelled) return;
        if (s.status === 'fulfilled') setSessions(s.value);
        if (r.status === 'fulfilled') {
          setRubrics(r.value);
          const active = r.value.find((x) => x.active) ?? r.value[0];
          if (active) setActiveRubricId((prev) => prev || active.id);
        }
        if (a.status === 'fulfilled') setActionItems(a.value);
        if (s.status === 'rejected' && r.status === 'rejected' && a.status === 'rejected') {
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('theme-light');
    } else {
      root.classList.remove('theme-light');
    }
    return () => {
      root.classList.remove('theme-light');
    };
  }, [theme]);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 760;
  });
  const [contextOpen, setContextOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1180;
  });
  // Global search query — filters the sessions, rubrics, and action-items lists.
  const [query, setQuery] = useState('');

  const rubricsById = useMemo(
    () => new Map(rubrics.map((rubric) => [rubric.id, rubric])),
    [rubrics],
  );
  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  );
  const activeRubric = useMemo<Rubric | undefined>(
    () => rubricsById.get(activeRubricId) ?? rubrics.find((r) => r.active) ?? rubrics[0],
    [activeRubricId, rubricsById, rubrics],
  );
  const latestSession: Session | undefined = sessions[0];
  const selectedSession = useMemo<Session | undefined>(
    () => sessionsById.get(selectedSessionId) ?? sessions[0],
    [selectedSessionId, sessionsById, sessions],
  );
  const chatSession = useMemo<Session | undefined>(
    () => sessionsById.get(chatContextSessionId) ?? sessions[0],
    [chatContextSessionId, sessionsById, sessions],
  );

  const openActionItems = useMemo(() => actionItems.filter((a) => !a.done), [actionItems]);
  const doneActionItems = useMemo(() => actionItems.filter((a) => a.done), [actionItems]);
  const sessionRows = useMemo<SessionRow[]>(
    () =>
      sessions.map((session) => ({
        session,
        rubric: session.rubricId ? rubricsById.get(session.rubricId) : undefined,
        openCount: actionItems.filter((a) => a.sessionId === session.id && !a.done).length,
      })),
    [sessions, rubricsById, actionItems],
  );
  const homeActionItems = useMemo(() => openActionItems.slice(0, 4), [openActionItems]);
  const latestSessionOpenCount = useMemo(
    () =>
      latestSession
        ? actionItems.filter((a) => a.sessionId === latestSession.id && !a.done).length
        : 0,
    [latestSession, actionItems],
  );
  const selectedSessionActionItems = useMemo(
    () => (selectedSession ? actionItems.filter((a) => a.sessionId === selectedSession.id) : []),
    [actionItems, selectedSession],
  );
  const selectedSessionRubric =
    selectedSession && selectedSession.rubricId
      ? rubricsById.get(selectedSession.rubricId)
      : undefined;
  const selectedTranscript = selectedSession ? transcripts[selectedSession.id] ?? [] : [];
  // Memoized so the reference is stable between unrelated renders — the ChatView
  // effect that seeds messages from it depends on this not changing every render.
  const chatTranscript = useMemo(
    () => (chatSession ? transcripts[chatSession.id] ?? [] : []),
    [chatSession, transcripts],
  );
  // "Recent activity" derived from the user's real sessions (most recent first).
  const recentActivity = useMemo(
    () => sessions.slice(0, 5).map((s) => ({ id: s.id, time: s.when, title: s.title })),
    [sessions],
  );

  const toggleAction = useCallback(
    (id: string) => {
      const current = actionItems.find((a) => a.id === id);
      if (!current) return;
      const nextDone = !current.done;
      // Optimistic flip; revert if the PATCH fails so the UI never lies.
      setActionItems((items) => items.map((a) => (a.id === id ? { ...a, done: nextDone } : a)));
      setActionItemDone(id, nextDone).catch(() => {
        setActionItems((items) =>
          items.map((a) => (a.id === id ? { ...a, done: current.done } : a)),
        );
      });
    },
    [actionItems],
  );

  // Fetch a session's transcript the first time it's needed, then cache it.
  // Using a ref for the transcripts lookup so this callback is stable and
  // doesn't re-create (and cascade to openInChat / openSessionDetail) every
  // time a transcript is fetched.
  const transcriptsRef = useRef(transcripts);
  useEffect(() => { transcriptsRef.current = transcripts; });

  const ensureTranscript = useCallback(
    (sessionId: string) => {
      if (transcriptsRef.current[sessionId] !== undefined) return;
      setTranscriptLoading(true);
      fetchSessionTranscript(sessionId)
        .then((lines) => setTranscripts((prev) => ({ ...prev, [sessionId]: lines })))
        .catch(() => setTranscripts((prev) => ({ ...prev, [sessionId]: [] })))
        .finally(() => setTranscriptLoading(false));
    },
    [], // stable — reads transcripts via ref, not closure
  );

  const openInChat = useCallback(
    (sessionId: string) => {
      setChatContextSessionId(sessionId);
      setView('chat');
      ensureTranscript(sessionId); // so the chat opens on the real conversation
    },
    [ensureTranscript],
  );

  const openSessionDetail = useCallback(
    (sessionId: string) => {
      setSelectedSessionId(sessionId);
      setView('session-detail');
      ensureTranscript(sessionId);
    },
    [ensureTranscript],
  );

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const toggleContext = useCallback(() => setContextOpen((v) => !v), []);
  const applyTheme = useCallback((next: Theme) => {
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* localStorage unavailable */
    }
    // Persist to the profile so the choice follows the user across devices.
    apiFetch('/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ theme: next }),
    }).catch(() => {
      /* best-effort — the local theme is already applied */
    });
  }, []);
  const toggleTheme = useCallback(
    () => applyTheme(theme === 'dark' ? 'light' : 'dark'),
    [applyTheme, theme],
  );
  const continueLatestInChat = useCallback(() => {
    if (latestSession) openInChat(latestSession.id);
  }, [latestSession, openInChat]);
  const openChatSessionDetail = useCallback(() => {
    if (chatSession) openSessionDetail(chatSession.id);
  }, [chatSession, openSessionDetail]);
  const continueSelectedInChat = useCallback(() => {
    if (selectedSession) openInChat(selectedSession.id);
  }, [openInChat, selectedSession]);
  const continueContextInChat = useCallback(() => {
    if (chatSession) openInChat(chatSession.id);
  }, [chatSession, openInChat]);
  const backToSessions = useCallback(() => setView('sessions'), []);
  const askAboutRubric = useCallback(
    (rubricId: string) => {
      const session = sessions.find((s) => s.rubricId === rubricId);
      if (session) openInChat(session.id);
      else setView('chat');
    },
    [openInChat, sessions],
  );
  const openExtension = useCallback(() => {
    /* placeholder - would deep link the extension */
  }, []);
  const changeCoachMode = useCallback((mode: CoachMode) => {
    setCoachMode((prev) => {
      if (prev === mode) return prev;
      // Optimistic; revert if the profile PATCH is rejected or fails.
      apiFetch('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ default_coach_mode: mode }),
      })
        .then((res) => {
          if (!res.ok) setCoachMode(prev);
        })
        .catch(() => setCoachMode(prev));
      return mode;
    });
  }, []);
  const signOut = useCallback(() => {
    clearAuth();
    window.location.hash = '#auth';
  }, []);

  return (
    <main
      className={[
        'app-dashboard',
        theme === 'light' ? 'is-light' : '',
        sidebarOpen ? '' : 'is-collapsed',
        contextOpen ? '' : 'is-context-collapsed',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Sidebar
        student={student}
        view={view}
        setView={setView}
        openCount={openActionItems.length}
        sessionsCount={sessions.length}
        rubricsCount={rubrics.length}
      />

      <section className="ds-main">
        <TopBar
          view={view}
          theme={theme}
          contextOpen={contextOpen}
          query={query}
          onQueryChange={setQuery}
          onToggleSidebar={toggleSidebar}
          onToggleContext={toggleContext}
          onToggleTheme={toggleTheme}
        />

        <div className="ds-canvas">
          {loading ? (
            <div className="ds-state ds-state-loading">
              <span className="ds-state-spinner" aria-hidden="true" />
              <p>Loading your workspace…</p>
            </div>
          ) : loadError ? (
            <div className="ds-state ds-state-error">
              <p>We couldn't load your data. Check your connection and try again.</p>
              <button type="button" className="ds-btn" onClick={() => window.location.reload()}>
                Retry
              </button>
            </div>
          ) : (
            <>
              {view === 'home' && (
                <HomeView
                  student={student}
                  activeRubric={activeRubric}
                  latestSession={latestSession}
                  latestSessionOpenCount={latestSessionOpenCount}
                  openActionItems={homeActionItems}
                  sessionsById={sessionsById}
                  recentActivity={recentActivity}
                  onContinueInChat={continueLatestInChat}
                  onOpenSession={openSessionDetail}
                  onToggleAction={toggleAction}
                  onGoTo={setView}
                />
              )}

              {view === 'chat' && (
                <ChatView
                  student={student}
                  activeRubric={activeRubric}
                  session={chatSession}
                  transcript={chatTranscript}
                  transcriptLoading={transcriptLoading}
                  onOpenSession={openChatSessionDetail}
                />
              )}

              {view === 'sessions' && (
                <SessionsView
                  rows={sessionRows}
                  query={query}
                  onOpenSession={openSessionDetail}
                  onContinueInChat={openInChat}
                />
              )}

              {view === 'session-detail' && (
                <SessionDetailView
                  session={selectedSession}
                  rubric={selectedSessionRubric}
                  actionItems={selectedSessionActionItems}
                  transcript={selectedTranscript}
                  transcriptLoading={transcriptLoading}
                  onToggleAction={toggleAction}
                  onBack={backToSessions}
                  onContinueInChat={continueSelectedInChat}
                />
              )}

              {view === 'rubrics' && (
                <RubricsView
                  rubrics={rubrics}
                  activeRubricId={activeRubricId}
                  query={query}
                  onSetActive={setActiveRubricId}
                  onAskAbout={askAboutRubric}
                />
              )}

              {view === 'action-items' && (
                <ActionItemsView
                  open={openActionItems}
                  done={doneActionItems}
                  sessionsById={sessionsById}
                  rubricsById={rubricsById}
                  query={query}
                  onToggle={toggleAction}
                  onOpenSession={openSessionDetail}
                />
              )}

              {view === 'settings' && (
                <SettingsView
                  student={student}
                  theme={theme}
                  coachMode={coachMode}
                  onSetCoachMode={changeCoachMode}
                  onSignOut={signOut}
                  onSetTheme={applyTheme}
                />
              )}
            </>
          )}
        </div>
      </section>

      <ContextPanel
        view={view}
        student={student}
        activeRubric={activeRubric}
        chatSession={chatSession}
        selectedSession={selectedSession}
        openActionItemCount={openActionItems.length}
        onGoTo={setView}
        onContinueInChat={continueContextInChat}
        onOpenExtension={openExtension}
      />
    </main>
  );
}

/* ============================================================================
   Sidebar
   ============================================================================ */

const Sidebar = memo(function Sidebar({
  student,
  view,
  setView,
  openCount,
  sessionsCount,
  rubricsCount,
}: {
  student: typeof STUDENT;
  view: View;
  setView: (v: View) => void;
  openCount: number;
  sessionsCount: number;
  rubricsCount: number;
}) {
  const metaValues = {
    sessions: String(sessionsCount),
    rubrics: String(rubricsCount),
    openActions: String(openCount),
  };

  return (
    <aside className="ds-sidebar">
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
        <a
          href="#install"
          className="ds-ext-pill"
          onClick={(e) => {
            // allow normal navigation away from dashboard hash
            if (typeof window !== 'undefined') {
              e.preventDefault();
              window.location.hash = '#install';
            }
          }}
        >
          <Chrome size={13} strokeWidth={1.6} />
          <span>Open extension</span>
          <ArrowUpRight size={12} strokeWidth={1.6} />
        </a>

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

const TopBar = memo(function TopBar({
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

/* ============================================================================
   Home view
   ============================================================================ */

const HomeView = memo(function HomeView({
  student,
  activeRubric,
  latestSession,
  latestSessionOpenCount,
  openActionItems,
  sessionsById,
  recentActivity,
  onContinueInChat,
  onOpenSession,
  onToggleAction,
  onGoTo,
}: {
  student: typeof STUDENT;
  activeRubric: Rubric | undefined;
  latestSession: Session | undefined;
  latestSessionOpenCount: number;
  openActionItems: ActionItem[];
  sessionsById: Map<string, Session>;
  recentActivity: { id: string; time: string; title: string }[];
  onContinueInChat: () => void;
  onOpenSession: (id: string) => void;
  onToggleAction: (id: string) => void;
  onGoTo: (v: View) => void;
}) {
  const todayLabel = useMemo(() => homeDateFormatter.format(new Date()), []);
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return 'Still up,';
    if (h < 12) return 'Good morning,';
    if (h < 18) return 'Good afternoon,';
    return 'Good evening,';
  }, []);

  return (
    <div className="ds-view ds-view-home">
      <header className="ds-hero">
        <p className="ds-eyebrow">{todayLabel}</p>
        <h2 className="ds-display">
          {greeting} <i>{student.name}</i>.
        </h2>
        <p className="ds-lede">
          {openActionItems.length > 0
            ? `${openActionItems.length} open action ${openActionItems.length === 1 ? 'item' : 'items'} waiting. Pick up where the extension left off.`
            : 'Your coaching memory lives here. Import a session from the extension to get started.'}
        </p>
      </header>

      <section className="ds-row ds-row-2">
        {/* Latest imported session */}
        {latestSession ? (
          <article className="ds-card ds-card-primary">
            <div className="ds-card-eyebrow">
              <span className="ds-dot ds-dot-cyan" aria-hidden="true" />
              <span>Imported from Chrome extension · {latestSession.when}</span>
            </div>
            <h3 className="ds-card-title">{latestSession.title}</h3>
            <p className="ds-card-summary">{latestSession.summary}</p>

            <dl className="ds-meta-row">
              <div>
                <dt>Mode</dt>
                <dd>{latestSession.mode}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{latestSession.duration}</dd>
              </div>
              <div>
                <dt>Rubric</dt>
                <dd>{activeRubric ? activeRubric.title.replace(' Rubric', '') : '—'}</dd>
              </div>
              <div>
                <dt>Open items</dt>
                <dd>{latestSessionOpenCount}</dd>
              </div>
            </dl>

            <div className="ds-card-actions">
              <DsButton variant="primary" onClick={onContinueInChat}>
                Continue in chat <ArrowRight size={13} strokeWidth={1.7} />
              </DsButton>
              <DsButton variant="ghost" onClick={() => onOpenSession(latestSession.id)}>
                View transcript
              </DsButton>
            </div>
          </article>
        ) : (
          <article className="ds-card ds-card-primary">
            <div className="ds-card-eyebrow">
              <span className="ds-dot ds-dot-cyan" aria-hidden="true" />
              <span>No sessions yet</span>
            </div>
            <h3 className="ds-card-title">Import your first session</h3>
            <EmptyState
              title="Nothing here yet."
              body="Run a coaching session in the Chrome extension and it'll show up here with its transcript and action items."
            />
          </article>
        )}

        {/* Active rubric */}
        <article className="ds-card">
          <div className="ds-card-eyebrow">
            <span>Active rubric</span>
          </div>
          {activeRubric ? (
            <>
              <h3 className="ds-card-title ds-card-title-sm">{activeRubric.title}</h3>
              <p className="ds-card-sub">{activeRubric.course}</p>

              <ul className="ds-criteria">
                {activeRubric.criteria?.map((c: any) => (
                  <li key={c.name}>
                    <span>{c.name}</span>
                    <ScoreDots score={c.score ?? 0} max={c.max ?? 4} />
                  </li>
                )) || []}
              </ul>

              <div className="ds-card-actions">
                <DsButton variant="ghost" onClick={() => onGoTo('rubrics')}>
                  All rubrics <ChevronRight size={13} strokeWidth={1.7} />
                </DsButton>
              </div>
            </>
          ) : (
            <EmptyState
              title="No rubric yet."
              body="Upload a rubric to anchor your coaching feedback."
            />
          )}
        </article>
      </section>

      <section className="ds-row ds-row-2-1">
        {/* Open action items */}
        <article className="ds-card">
          <div className="ds-card-eyebrow ds-card-eyebrow-row">
            <span>Open action items</span>
            <button type="button" className="ds-link" onClick={() => onGoTo('action-items')}>
              All <ChevronRight size={12} strokeWidth={1.7} />
            </button>
          </div>

          {openActionItems.length === 0 ? (
            <EmptyState
              title="All clear."
              body="New action items from your next coaching session will land here."
            />
          ) : (
            <ul className="ds-todo">
              {openActionItems.map((a) => (
                <TodoRow
                  key={a.id}
                  item={a}
                  onToggle={() => onToggleAction(a.id)}
                  sessionTitle={a.sessionId ? sessionsById.get(a.sessionId)?.title : undefined}
                />
              ))}
            </ul>
          )}
        </article>

        {/* Recent activity */}
        <article className="ds-card">
          <div className="ds-card-eyebrow">
            <span>Recent activity</span>
          </div>
          {recentActivity.length === 0 ? (
            <EmptyState
              title="No activity yet."
              body="Imported coaching sessions will show up here."
            />
          ) : (
            <ul className="ds-activity">
              {recentActivity.map((a) => (
                <li key={a.id}>
                  <span className="ds-activity-time">{a.time}</span>
                  <span>
                    Session imported · <b>{a.title}</b>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
});

/* ============================================================================
   Chat view
   ============================================================================ */

/** Map a session's stored transcript lines into chat message bubbles. */
function transcriptToMessages(lines: TranscriptLine[]): Message[] {
  return lines.map((l) =>
    createMessage({
      id: l.id,
      role: l.who === 'Student' ? 'user' : 'ai',
      text: l.text,
      time: String(l.t),
    }),
  );
}

const ChatView = memo(function ChatView({
  student,
  activeRubric,
  session,
  transcript,
  transcriptLoading,
  onOpenSession,
}: {
  student: typeof STUDENT;
  activeRubric: Rubric | undefined;
  session: Session | undefined;
  transcript: TranscriptLine[];
  transcriptLoading: boolean;
  onOpenSession: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [micOn, setMicOn] = useState(false);

  // Seed the conversation from the session's real transcript. Re-runs when the
  // chat switches sessions or the transcript finishes loading.
  useEffect(() => {
    setMessages(transcriptToMessages(transcript));
  }, [session?.id, transcript]);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
    }

    scrollFrameRef.current = requestAnimationFrame(() => {
      if (messagesRef.current) {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      }
      scrollFrameRef.current = null;
    });

    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [messages.length]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    if (resizeFrameRef.current !== null) {
      cancelAnimationFrame(resizeFrameRef.current);
    }

    resizeFrameRef.current = requestAnimationFrame(() => {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
      resizeFrameRef.current = null;
    });

    return () => {
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [input]);

  const send = useCallback(async (text?: string) => {
    const value = (text ?? input).trim();
    if (!value) return;
    const now = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const userMsg = createMessage({
      id: `local-${Date.now()}`,
      role: 'user',
      text: value,
      time: now,
    });
    
    setMessages((m) => [...m.filter((msg) => !msg.id.startsWith('ai-')), userMsg]);
    setInput('');
    
    // Create a placeholder AI message for streaming
    const aiMsgId = `ai-${Date.now()}`;
    const aiMsg = createMessage({
      id: aiMsgId,
      role: 'ai',
      text: '',
      time: now,
    });
    setMessages((m) => [...m, aiMsg]);
    
    // Stream the AI response
    let accumulatedText = '';
    await sendCoachingMessage(
      session?.id,
      value,
      {
        onTokenReceived: (token) => {
          accumulatedText += token;
          setMessages((m) =>
            m.map((msg) =>
              msg.id === aiMsgId
                ? { ...msg, text: accumulatedText, lines: accumulatedText.split('\n') }
                : msg
            )
          );
        },
        onStreamComplete: () => {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === aiMsgId
                ? { ...msg, text: accumulatedText, lines: accumulatedText.split('\n') }
                : msg
            )
          );
        },
        onStreamError: (error) => {
          console.error('Chat stream error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('Error message:', errorMessage);
          setMessages((m) =>
            m.map((msg) =>
              msg.id === aiMsgId
                ? { ...msg, text: `Error: ${errorMessage}`, lines: [`Error: ${errorMessage}`] }
                : msg
            )
          );
        },
      }
    );
  }, [input, session?.id]);

  const toggleMic = useCallback(() => setMicOn((v) => !v), []);

  return (
    <div className="ds-view ds-view-chat">
      <div className="ds-context-strip">
        {session && (
          <span className="ds-context-chip ds-chip-accent" onClick={onOpenSession} role="button" tabIndex={0}>
            <ScrollText size={11} strokeWidth={1.8} />
            <span>{session.title}</span>
          </span>
        )}
        {activeRubric && (
          <span className="ds-context-chip">
            <BookOpen size={11} strokeWidth={1.8} />
            <span>{activeRubric.title.replace(' Rubric', '')}</span>
          </span>
        )}
        <span className="ds-context-chip">
          <Chrome size={11} strokeWidth={1.8} />
          <span>Imported from Chrome extension</span>
        </span>
        {session && (
          <span className="ds-context-chip ds-chip-muted">
            <Clock size={11} strokeWidth={1.8} />
            <span>{session.duration} · {session.mode}</span>
          </span>
        )}
      </div>

      <div className="ds-messages" ref={messagesRef}>
        {transcriptLoading && messages.length === 0 ? (
          <div className="ds-state ds-state-loading ds-state-inline">
            <span className="ds-state-spinner" aria-hidden="true" />
            <p>Loading conversation…</p>
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            title="Start the conversation."
            body="Ask about your rubric, feedback, or what to revise next."
          />
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} student={student} />)
        )}
      </div>

      <div className="ds-composer-wrap">
        <div className="ds-quick-prompts" role="group" aria-label="Quick prompts">
          {QUICK_PROMPTS.map((p) => (
            <button key={p} type="button" className="ds-quick-prompt" onClick={() => send(p)}>
              <Sparkles size={11} strokeWidth={1.7} />
              <span>{p}</span>
            </button>
          ))}
        </div>

        <form
          className="ds-composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <button type="button" className="ds-icon-btn" aria-label="Attach">
            <Paperclip size={14} strokeWidth={1.6} />
          </button>
          <textarea
            ref={textareaRef}
            placeholder="Ask about your rubric, feedback, or next revision…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
          />
          <button
            type="button"
            className={`ds-icon-btn ${micOn ? 'is-on' : ''}`}
            aria-label={micOn ? 'Stop listening' : 'Start voice input'}
            onClick={toggleMic}
          >
            {micOn ? <Mic size={14} strokeWidth={1.7} /> : <MicOff size={14} strokeWidth={1.7} />}
          </button>
          <button
            type="submit"
            className="ds-send"
            disabled={!input.trim()}
            aria-label="Send"
          >
            <ArrowUp size={14} strokeWidth={2} />
          </button>
        </form>

        <p className="ds-composer-hint">
          <ShieldCheck size={11} strokeWidth={1.7} /> StudyPilot will not write your work — it
          helps you revise it.
        </p>
      </div>
    </div>
  );
});

const MessageBubble = memo(function MessageBubble({
  message,
  student,
}: {
  message: Message;
  student: typeof STUDENT;
}) {
  return (
    <article className={`ds-msg ds-msg-${message.role}`}>
      <div className="ds-msg-avatar" aria-hidden="true">
        {message.role === 'ai' ? <StudyPilotMark size={14} /> : <span>{student.initials}</span>}
      </div>
      <div className="ds-msg-body">
        <div className="ds-msg-meta">
          <b>{message.role === 'ai' ? 'StudyPilot' : student.name}</b>
          <time>{message.time}</time>
        </div>
        {message.lines.map((line, i) => (
          <p key={i}>{line || ' '}</p>
        ))}
      </div>
    </article>
  );
});

/* ============================================================================
   Sessions view
   ============================================================================ */

const SessionsView = memo(function SessionsView({
  rows,
  query,
  onOpenSession,
  onContinueInChat,
}: {
  rows: SessionRow[];
  query: string;
  onOpenSession: (id: string) => void;
  onContinueInChat: (id: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? rows.filter(({ session: s, rubric }) =>
            [s.title, s.summary, s.mode, s.source, rubric?.title ?? ''].some((f) =>
              f.toLowerCase().includes(q),
            ),
          )
        : rows,
    [rows, q],
  );

  return (
    <div className="ds-view ds-view-sessions">
      <header className="ds-view-head">
        <div>
          <h2 className="ds-h2">Coaching sessions</h2>
          <p className="ds-lede">
            Every coaching session imported from the extension. Continue any of them in chat — your
            rubric, transcript, and feedback travel with the conversation.
          </p>
        </div>
        <span className="ds-pill ds-pill-quiet">
          <Chrome size={11} strokeWidth={1.8} />
          {rows.length} imported
        </span>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="No sessions yet."
          body="Run a coaching session in the Chrome extension and it'll be imported here automatically."
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches." body={`No sessions match “${query.trim()}”.`} />
      ) : (
      <ul className="ds-session-list">
        {filtered.map(({ session: s, rubric, openCount }) => {
          return (
            <li key={s.id}>
              <article className="ds-session-card">
                <button
                  type="button"
                  className="ds-session-body"
                  onClick={() => onOpenSession(s.id)}
                >
                  <div className="ds-card-eyebrow">
                    <span className="ds-dot ds-dot-cyan" aria-hidden="true" />
                    <span>{s.when}</span>
                    <span className="ds-divider" aria-hidden="true" />
                    <span>{s.source}</span>
                    <span className="ds-divider" aria-hidden="true" />
                    <span>{s.mode}</span>
                  </div>
                  <h3 className="ds-card-title">{s.title}</h3>
                  <p className="ds-card-summary">{s.summary}</p>
                  <dl className="ds-meta-row">
                    <div>
                      <dt>Duration</dt>
                      <dd>{s.duration}</dd>
                    </div>
                    <div>
                      <dt>Rubric</dt>
                      <dd>{rubric ? rubric.title.replace(' Rubric', '') : '—'}</dd>
                    </div>
                    <div>
                      <dt>Open items</dt>
                      <dd>{openCount}</dd>
                    </div>
                  </dl>
                </button>
                <div className="ds-session-actions">
                  <DsButton variant="primary" onClick={() => onContinueInChat(s.id)}>
                    Continue in chat <ArrowRight size={13} strokeWidth={1.7} />
                  </DsButton>
                  <DsButton variant="ghost" onClick={() => onOpenSession(s.id)}>
                    View transcript
                  </DsButton>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
});

/* ============================================================================
   Session detail
   ============================================================================ */

const SessionDetailView = memo(function SessionDetailView({
  session,
  rubric,
  actionItems,
  transcript,
  transcriptLoading,
  onToggleAction,
  onBack,
  onContinueInChat,
}: {
  session: Session | undefined;
  rubric: Rubric | undefined;
  actionItems: ActionItem[];
  transcript: TranscriptLine[];
  transcriptLoading: boolean;
  onToggleAction: (id: string) => void;
  onBack: () => void;
  onContinueInChat: () => void;
}) {
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setScreenshotUrl(null);
    setScreenshotError(false);

    if (!session?.screenshotPath) return () => {
      cancelled = true;
    };

    createSessionCaptureSignedUrl(session.screenshotPath)
      .then((url) => {
        if (!cancelled) setScreenshotUrl(url);
      })
      .catch(() => {
        if (!cancelled) setScreenshotError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.id, session?.screenshotPath]);

  if (!session) {
    return (
      <div className="ds-view ds-view-session">
        <button type="button" className="ds-back" onClick={onBack}>
          <ChevronRight size={13} strokeWidth={1.7} style={{ transform: 'rotate(180deg)' }} />
          <span>Back to sessions</span>
        </button>
        <EmptyState title="Session not found." body="It may have been removed. Head back to your sessions." />
      </div>
    );
  }

  return (
    <div className="ds-view ds-view-session">
      <button type="button" className="ds-back" onClick={onBack}>
        <ChevronRight size={13} strokeWidth={1.7} style={{ transform: 'rotate(180deg)' }} />
        <span>Back to sessions</span>
      </button>

      <header className="ds-view-head ds-view-head-stack">
        <div className="ds-card-eyebrow">
          <span className="ds-dot ds-dot-cyan" aria-hidden="true" />
          <span>{session.when}</span>
          <span className="ds-divider" aria-hidden="true" />
          <span>{session.source}</span>
          <span className="ds-divider" aria-hidden="true" />
          <span>{session.mode}</span>
          <span className="ds-divider" aria-hidden="true" />
          <span>{session.duration}</span>
        </div>
        <h2 className="ds-h1 ds-serif">{session.title}</h2>
      </header>

      <div className="ds-row ds-row-2-1">
        <div className="ds-stack">
          {session.screenshotPath ? (
            <article className="ds-card ds-screenshot-card">
              <div className="ds-card-eyebrow">
                <span>Screenshot</span>
              </div>
              {screenshotUrl ? (
                <img
                  className="ds-session-screenshot"
                  src={screenshotUrl}
                  alt={`Screenshot captured during ${session.title}`}
                />
              ) : screenshotError ? (
                <EmptyState
                  title="Screenshot unavailable."
                  body="StudyPilot could not create a signed preview for this capture."
                />
              ) : (
                <div className="ds-state ds-state-loading ds-state-inline">
                  <span className="ds-state-spinner" aria-hidden="true" />
                  <p>Loading screenshot...</p>
                </div>
              )}
            </article>
          ) : null}

          <article className="ds-card">
            <div className="ds-card-eyebrow">
              <span>Summary</span>
            </div>
            <p className="ds-prose">{session.summary}</p>
          </article>

          <article className="ds-card">
            <div className="ds-card-eyebrow ds-card-eyebrow-row">
              <span>Transcript preview</span>
              <button type="button" className="ds-link" onClick={onContinueInChat}>
                Continue in chat <ChevronRight size={12} strokeWidth={1.7} />
              </button>
            </div>
            {transcriptLoading ? (
              <div className="ds-state ds-state-loading ds-state-inline">
                <span className="ds-state-spinner" aria-hidden="true" />
                <p>Loading transcript…</p>
              </div>
            ) : transcript.length === 0 ? (
              <EmptyState
                title="No transcript."
                body="This session didn't capture any messages."
              />
            ) : (
              <ul className="ds-transcript">
                {transcript.map((t) => (
                  <li key={t.id} className={t.who === 'You' ? 'is-you' : 'is-ai'}>
                    <span className="ds-transcript-who">{t.who}</span>
                    <p>{t.text}</p>
                    <time>{t.t}</time>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="ds-card">
            <div className="ds-card-eyebrow">
              <span>Action items from this session</span>
            </div>
            {actionItems.length === 0 ? (
              <EmptyState title="No action items." body="Nothing was flagged in this session." />
            ) : (
              <ul className="ds-todo">
                {actionItems.map((a) => (
                  <TodoRow key={a.id} item={a} onToggle={() => onToggleAction(a.id)} />
                ))}
              </ul>
            )}
          </article>
        </div>

        <div className="ds-stack">
          <article className="ds-card">
            <div className="ds-card-eyebrow">
              <span>Rubric used</span>
            </div>
            {rubric ? (
              <>
                <h4 className="ds-card-title ds-card-title-sm">{rubric.title}</h4>
                <p className="ds-card-sub">{rubric.course}</p>
                <ul className="ds-criteria">
                  {rubric.criteria?.map((c: any) => (
                    <li key={c.name}>
                      <span>{c.name}</span>
                      <ScoreDots score={c.score ?? 0} max={c.max ?? 4} />
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState title="No rubric." body="This session wasn't linked to a rubric." />
            )}
          </article>

          <article className="ds-card">
            <div className="ds-card-eyebrow">
              <span>Follow-up prompts</span>
            </div>
            <ul className="ds-followups">
              {SESSION_DETAIL_PROMPTS.map((p) => (
                <li key={p}>
                  <button type="button" onClick={onContinueInChat}>
                    <Sparkles size={11} strokeWidth={1.7} />
                    <span>{p}</span>
                    <ArrowRight size={12} strokeWidth={1.7} />
                  </button>
                </li>
              ))}
            </ul>

            <DsButton variant="primary" onClick={onContinueInChat}>
              Continue in chat <ArrowRight size={13} strokeWidth={1.7} />
            </DsButton>
          </article>
        </div>
      </div>
    </div>
  );
});

/* ============================================================================
   Rubrics view
   ============================================================================ */

const RubricsView = memo(function RubricsView({
  rubrics,
  activeRubricId,
  query,
  onSetActive,
  onAskAbout,
}: {
  rubrics: Rubric[];
  activeRubricId: string;
  query: string;
  onSetActive: (id: string) => void;
  onAskAbout: (id: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? rubrics.filter((r) =>
            [r.title, r.course, ...(r.criteria?.map((c: any) => c.name) || [])].some((f) =>
              f.toLowerCase().includes(q),
            ),
          )
        : rubrics,
    [rubrics, q],
  );

  return (
    <div className="ds-view ds-view-rubrics">
      <header className="ds-view-head">
        <div>
          <h2 className="ds-h2">Rubrics</h2>
          <p className="ds-lede">
            The criteria your coach holds you to. Set one as active and every session inherits its
            scoring — including your imports from the extension.
          </p>
        </div>
        <DsButton variant="secondary">
          <Plus size={13} strokeWidth={1.7} /> Upload rubric
        </DsButton>
      </header>

      {rubrics.length === 0 ? (
        <EmptyState
          title="No rubrics yet."
          body="Upload a rubric to set the criteria your coach holds you to."
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches." body={`No rubrics match “${query.trim()}”.`} />
      ) : (
      <ul className="ds-rubric-list">
        {filtered.map((r) => {
          const isActive = r.id === activeRubricId;
          return (
            <li key={r.id}>
              <article className={`ds-rubric-card ${isActive ? 'is-active' : ''}`}>
                <div className="ds-card-eyebrow ds-card-eyebrow-row">
                  <span className="ds-card-eyebrow-left">
                    <FileText size={11} strokeWidth={1.8} />
                    <span>{r.course}</span>
                  </span>
                  {isActive ? (
                    <span className="ds-pill ds-pill-active">
                      <span className="ds-dot ds-dot-mint" aria-hidden="true" />
                      Active
                    </span>
                  ) : (
                    <span className="ds-pill ds-pill-quiet">Uploaded {r.uploaded}</span>
                  )}
                </div>
                <h3 className="ds-card-title">{r.title}</h3>

                <div className="ds-criteria-grid">
                  {r.criteria?.map((c: any) => (
                    <div key={c.name} className="ds-criteria-pill">
                      <span>{c.name}</span>
                    </div>
                  ))}
                </div>

                <div className="ds-rubric-foot">
                  <span className="ds-quiet-meta">
                    <ScrollText size={11} strokeWidth={1.8} /> {r.sessionsCount} sessions
                  </span>
                  <div className="ds-card-actions">
                    <DsButton variant="ghost" onClick={() => onAskAbout(r.id)}>
                      Ask about rubric
                    </DsButton>
                    <DsButton
                      variant={isActive ? 'secondary' : 'primary'}
                      disabled={isActive}
                      onClick={() => onSetActive(r.id)}
                    >
                      {isActive ? 'Currently active' : 'Set active'}
                    </DsButton>
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
});

/* ============================================================================
   Action items view
   ============================================================================ */

const ActionItemsView = memo(function ActionItemsView({
  open,
  done,
  sessionsById,
  rubricsById,
  query,
  onToggle,
  onOpenSession,
}: {
  open: ActionItem[];
  done: ActionItem[];
  sessionsById: ReadonlyMap<string, Session>;
  rubricsById: ReadonlyMap<string, Rubric>;
  query: string;
  onToggle: (id: string) => void;
  onOpenSession: (id: string) => void;
}) {
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const q = query.trim().toLowerCase();
  const items = useMemo(() => {
    const base = tab === 'open' ? open : done;
    if (!q) return base;
    return base.filter((a) => {
      const sessionTitle = a.sessionId ? sessionsById.get(a.sessionId)?.title ?? '' : '';
      return [a.text, sessionTitle].some((f) => f.toLowerCase().includes(q));
    });
  }, [tab, open, done, q, sessionsById]);

  return (
    <div className="ds-view ds-view-todo">
      <header className="ds-view-head">
        <div>
          <h2 className="ds-h2">Action items</h2>
          <p className="ds-lede">
            What your coach flagged. Check them off as you revise — they sync back into the
            session they came from.
          </p>
        </div>
        <div className="ds-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'open'}
            className={`ds-tab ${tab === 'open' ? 'is-active' : ''}`}
            onClick={() => setTab('open')}
          >
            Open <em>{open.length}</em>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'done'}
            className={`ds-tab ${tab === 'done' ? 'is-active' : ''}`}
            onClick={() => setTab('done')}
          >
            Done <em>{done.length}</em>
          </button>
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title={q ? 'No matches.' : tab === 'open' ? 'All clear.' : 'Nothing completed yet.'}
          body={
            q
              ? `No ${tab} action items match “${query.trim()}”.`
              : tab === 'open'
                ? 'New action items from your next coaching session will land here.'
                : 'Check items off as you revise and they’ll show up here.'
          }
        />
      ) : (
        <ul className="ds-todo ds-todo-detailed">
          {items.map((a) => {
            const session = a.sessionId ? sessionsById.get(a.sessionId) : undefined;
            const rubric = a.rubricId ? rubricsById.get(a.rubricId) : undefined;
            return (
              <li key={a.id} className={a.done ? 'is-done' : ''}>
                <button
                  type="button"
                  className={`ds-check ${a.done ? 'is-checked' : ''}`}
                  onClick={() => onToggle(a.id)}
                  aria-pressed={a.done}
                  aria-label={a.done ? 'Mark as not done' : 'Mark as done'}
                >
                  {a.done && <Check size={11} strokeWidth={2.4} />}
                </button>
                <div className="ds-todo-body">
                  <p>{a.text}</p>
                  <div className="ds-todo-meta">
                    {session && (
                      <button
                        type="button"
                        className="ds-todo-source"
                        onClick={() => onOpenSession(session.id)}
                      >
                        <ScrollText size={10} strokeWidth={1.8} />
                        {session.title}
                      </button>
                    )}
                    {rubric && (
                      <span className="ds-todo-rubric">
                        <BookOpen size={10} strokeWidth={1.8} />
                        {rubric.title.replace(' Rubric', '')}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

/* ============================================================================
   Settings view
   ============================================================================ */

const SettingsView = memo(function SettingsView({
  student,
  theme,
  coachMode,
  onSetCoachMode,
  onSignOut,
  onSetTheme,
}: {
  student: typeof STUDENT;
  theme: Theme;
  coachMode: CoachMode;
  onSetCoachMode: (mode: CoachMode) => void;
  onSignOut: () => void;
  onSetTheme: (theme: Theme) => void;
}) {
  return (
    <div className="ds-view ds-view-settings">
      <header className="ds-view-head">
        <div>
          <h2 className="ds-h2">Settings</h2>
          <p className="ds-lede">A short list, kept short on purpose.</p>
        </div>
      </header>

      <div className="ds-stack ds-stack-tight">
        <article className="ds-card">
          <div className="ds-card-eyebrow">
            <span>Account</span>
          </div>
          <div className="ds-settings-row">
            <span className="ds-account-avatar ds-account-avatar-lg" aria-hidden="true">
              {student.initials}
            </span>
            <div className="ds-account-body">
              <b>{student.name}</b>
              <em>{student.email}</em>
            </div>
            <DsButton variant="ghost" onClick={onSignOut}>Sign out</DsButton>
          </div>
        </article>

        <article className="ds-card">
          <div className="ds-card-eyebrow">
            <span>Default coach mode</span>
          </div>
          <p className="ds-card-sub">
            What StudyPilot opens with in a new tab. Each session can still switch modes.
          </p>
          <div className="ds-segment" role="radiogroup">
            {SETTINGS_COACH_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={coachMode === m.id}
                className={`ds-segment-btn ${coachMode === m.id ? 'is-active' : ''}`}
                onClick={() => onSetCoachMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </article>

        <article className="ds-card">
          <div className="ds-card-eyebrow">
            <span>Appearance</span>
          </div>
          <p className="ds-card-sub">
            Customize the dashboard look. Toggling updates the colors instantly.
          </p>
          <div className="ds-segment" role="radiogroup">
            <button
              type="button"
              role="radio"
              aria-checked={theme === 'dark'}
              className={`ds-segment-btn ${theme === 'dark' ? 'is-active' : ''}`}
              onClick={() => onSetTheme('dark')}
            >
              Dark mode
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={theme === 'light'}
              className={`ds-segment-btn ${theme === 'light' ? 'is-active' : ''}`}
              onClick={() => onSetTheme('light')}
            >
              Light mode
            </button>
          </div>
        </article>

        <article className="ds-card">
          <div className="ds-card-eyebrow">
            <span>Privacy</span>
          </div>
          <p className="ds-prose">
            Audio and transcripts stay on your device by default. Sessions only appear in this
            dashboard when you choose to import them from the extension.
          </p>
          <p className="ds-prose ds-prose-quiet">
            Cloud sync is a single toggle, never a default.
          </p>
        </article>

        <article className="ds-card">
          <div className="ds-card-eyebrow">
            <span>Data retention</span>
          </div>
          <p className="ds-prose">
            Imported sessions are kept until you delete them. Action items archive after 60 days
            once marked done.
          </p>
        </article>
      </div>
    </div>
  );
});

/* ============================================================================
   Context panel (right column) — varies by view
   ============================================================================ */

const ContextPanel = memo(function ContextPanel({
  view,
  activeRubric,
  chatSession,
  selectedSession,
  openActionItemCount,
  onGoTo,
  onContinueInChat,
  onOpenExtension,
}: {
  view: View;
  student: typeof STUDENT;
  activeRubric: Rubric | undefined;
  chatSession: Session | undefined;
  selectedSession: Session | undefined;
  openActionItemCount: number;
  onGoTo: (v: View) => void;
  onContinueInChat: () => void;
  onOpenExtension: () => void;
}) {
  const contextSession = view === 'session-detail' ? selectedSession : chatSession;
  const visibleCriteria = useMemo(
    () => activeRubric?.criteria.slice(0, 5) ?? [],
    [activeRubric],
  );

  return (
    <aside className="ds-context">
      <div className="ds-context-head">
        <span className="ds-eyebrow">Current context</span>
      </div>

      {activeRubric && (
        <section className="ds-context-section">
          <span className="ds-context-label">Active rubric</span>
          <button
            type="button"
            className="ds-context-block ds-context-block-button"
            onClick={() => onGoTo('rubrics')}
          >
            <span className="ds-context-block-title">{activeRubric.title}</span>
            <span className="ds-context-block-sub">{activeRubric.course}</span>
            <ul className="ds-mini-criteria">
              {visibleCriteria.map((c: any) => (
                <li key={c.name}>
                  <span>{c.name}</span>
                  <ScoreDots score={c.score ?? 0} max={c.max ?? 4} />
                </li>
              ))}
            </ul>
          </button>
        </section>
      )}

      {contextSession && (
        <section className="ds-context-section">
          <span className="ds-context-label">From the extension</span>
          <div className="ds-context-block">
            <div className="ds-context-source">
              <span className="ds-context-source-ico" aria-hidden="true">
                <Chrome size={12} strokeWidth={1.7} />
              </span>
              <div>
                <b>{contextSession.title}</b>
                <em>
                  {contextSession.mode} · {contextSession.duration} · {contextSession.when}
                </em>
              </div>
            </div>
            <p className="ds-context-quote">{contextSession.summary}</p>
          </div>
        </section>
      )}

      <section className="ds-context-section">
        <span className="ds-context-label">Suggested next steps</span>
        <ul className="ds-context-prompts">
          {CONTEXT_PROMPTS.map((p) => (
            <li key={p}>
              <button type="button" onClick={onContinueInChat}>
                <span>{p}</span>
                <ArrowRight size={11} strokeWidth={1.8} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="ds-context-foot">
        <div className="ds-context-stat">
          <span className="ds-eyebrow">Open</span>
          <b>{openActionItemCount}</b>
          <em>action items</em>
        </div>
        <DsButton variant="secondary" onClick={onOpenExtension}>
          <Chrome size={13} strokeWidth={1.7} />
          Open extension
        </DsButton>
      </div>
    </aside>
  );
});

/* ============================================================================
   Small primitives
   ============================================================================ */

function DsButton({
  children,
  variant = 'primary',
  onClick,
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      className={`ds-btn ds-btn-${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

const ScoreDots = memo(function ScoreDots({ score, max }: { score: number; max: number }) {
  const dotIndexes =
    max <= SCORE_DOT_INDEXES.length
      ? SCORE_DOT_INDEXES.slice(0, max)
      : Array.from({ length: max }, (_, i) => i);

  return (
    <span className="ds-dots" aria-label={`${score} of ${max}`}>
      {dotIndexes.map((i) => (
        <i key={i} className={i < score ? 'on' : ''} />
      ))}
    </span>
  );
});

const TodoRow = memo(function TodoRow({
  item,
  onToggle,
  sessionTitle,
}: {
  item: ActionItem;
  onToggle: () => void;
  sessionTitle?: string;
}) {
  return (
    <li className={item.done ? 'is-done' : ''}>
      <button
        type="button"
        className={`ds-check ${item.done ? 'is-checked' : ''}`}
        onClick={onToggle}
        aria-pressed={item.done}
        aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
      >
        {item.done && <Check size={10} strokeWidth={2.6} />}
      </button>
      <span className="ds-todo-text">{item.text}</span>
      {sessionTitle && <span className="ds-todo-tag">{sessionTitle}</span>}
    </li>
  );
});

const EmptyState = memo(function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="ds-empty">
      <p className="ds-empty-title">{title}</p>
      <p className="ds-empty-body">{body}</p>
    </div>
  );
});

const StudyPilotMark = memo(function StudyPilotMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      aria-hidden="true"
      className="ds-spmark"
    >
      <circle cx="100" cy="100" r="84" className="ds-spmark-bg" />
      <path
        d="M100 56l26 84-26-18-26 18 26-84z"
        className="ds-spmark-arrow"
        strokeWidth="6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
});
