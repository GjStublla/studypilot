import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, MouseEvent, ReactNode, SVGProps } from 'react';
import './Dashboard.css';
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

type Rubric = {
  id: string;
  title: string;
  course: string;
  uploaded: string;
  active?: boolean;
  criteria: { name: string; score?: number; max?: number }[];
  sessionsCount: number;
};

type Session = {
  id: string;
  title: string;
  source: 'Chrome Extension';
  mode: 'Essay Coach' | 'Lecture' | 'Research Reader';
  duration: string;
  when: string;
  rubricId: string;
  summary: string;
  transcript: { who: 'You' | 'StudyPilot'; text: string; t: string }[];
  actionItemIds: string[];
};

type ActionItem = {
  id: string;
  text: string;
  sessionId: string;
  rubricId: string;
  done: boolean;
};

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

const STUDENT = { name: 'Maya', initials: 'M', email: 'maya.l@northcrest.edu' };

const RUBRICS: Rubric[] = [
  {
    id: 'r1',
    title: 'Argumentative Essay Rubric',
    course: 'ENG 102 · Composition II',
    uploaded: 'Apr 12',
    active: true,
    sessionsCount: 3,
    criteria: [
      { name: 'Thesis clarity', score: 3, max: 4 },
      { name: 'Evidence quality', score: 2, max: 4 },
      { name: 'Analysis', score: 3, max: 4 },
      { name: 'Organization', score: 3, max: 4 },
      { name: 'Conclusion strength', score: 2, max: 4 },
    ],
  },
  {
    id: 'r2',
    title: 'Primary Source Analysis Rubric',
    course: 'HIS 214 · Modern Memory',
    uploaded: 'Mar 30',
    sessionsCount: 2,
    criteria: [
      { name: 'Context', score: 3, max: 4 },
      { name: 'Author intent', score: 2, max: 4 },
      { name: 'Argument support', score: 3, max: 4 },
      { name: 'Evaluation', score: 2, max: 4 },
    ],
  },
  {
    id: 'r3',
    title: 'Lab Report Rubric',
    course: 'BIO 110 · Intro Bio Lab',
    uploaded: 'Mar 22',
    sessionsCount: 1,
    criteria: [
      { name: 'Hypothesis', score: 4, max: 4 },
      { name: 'Methods', score: 3, max: 4 },
      { name: 'Data presentation', score: 3, max: 4 },
      { name: 'Discussion', score: 2, max: 4 },
      { name: 'Citations', score: 3, max: 4 },
    ],
  },
];

const ACTION_ITEMS_INITIAL: ActionItem[] = [
  { id: 'a1', text: 'Make the thesis more specific', sessionId: 's1', rubricId: 'r1', done: false },
  { id: 'a2', text: 'Add analysis after the quote in paragraph 2', sessionId: 's1', rubricId: 'r1', done: false },
  { id: 'a3', text: 'Connect the conclusion back to the central claim', sessionId: 's1', rubricId: 'r1', done: false },
  { id: 'a4', text: 'Check rubric criterion for evidence and explanation', sessionId: 's1', rubricId: 'r1', done: true },
  { id: 'a5', text: 'Rewrite topic sentence in paragraph 3', sessionId: 's2', rubricId: 'r1', done: false },
  { id: 'a6', text: 'Cite the Atlantic article in MLA, not APA', sessionId: 's2', rubricId: 'r1', done: true },
  { id: 'a7', text: 'Identify the author’s implicit assumption', sessionId: 's3', rubricId: 'r2', done: false },
  { id: 'a8', text: 'Add one counter-source from the syllabus reader', sessionId: 's3', rubricId: 'r2', done: true },
];

const SESSIONS: Session[] = [
  {
    id: 's1',
    title: 'Research Essay Draft',
    source: 'Chrome Extension',
    mode: 'Essay Coach',
    duration: '24m',
    when: 'Today · 2:38 PM',
    rubricId: 'r1',
    summary:
      'StudyPilot noticed your thesis is understandable but too broad. The strongest revision opportunity is adding analysis after your evidence instead of only summarizing sources.',
    transcript: [
      { who: 'You', text: 'I’m about to write the second body paragraph — can you check my thesis first?', t: '2:39' },
      {
        who: 'StudyPilot',
        text: 'Your thesis is clear, but the rubric asks for stronger evidence. Paragraph 2 summarizes the source instead of analyzing it.',
        t: '2:39',
      },
      { who: 'You', text: 'What should I add?', t: '2:40' },
      {
        who: 'StudyPilot',
        text: 'I can’t write the introduction for you, but I can help you improve it. What is the main claim you want your reader to believe?',
        t: '2:40',
      },
    ],
    actionItemIds: ['a1', 'a2', 'a3', 'a4'],
  },
  {
    id: 's2',
    title: 'Cover Letter — Internship',
    source: 'Chrome Extension',
    mode: 'Essay Coach',
    duration: '11m',
    when: 'Yesterday · 8:12 PM',
    rubricId: 'r1',
    summary:
      'Your opening is direct, but the third paragraph drifts from the role. We tightened the framing to keep the reader inside one argument.',
    transcript: [
      { who: 'You', text: 'Read this opener.', t: '8:12' },
      {
        who: 'StudyPilot',
        text: 'Clear and specific — good. Paragraph 3 reads like a CV summary. Want me to surface where it loses focus?',
        t: '8:13',
      },
    ],
    actionItemIds: ['a5', 'a6'],
  },
  {
    id: 's3',
    title: 'Primary Source — 1853 Pamphlet',
    source: 'Chrome Extension',
    mode: 'Research Reader',
    duration: '18m',
    when: 'Apr 21 · 10:02 AM',
    rubricId: 'r2',
    summary:
      'You located the central argument but did not surface the author’s assumption. The strongest move next is naming it explicitly before you evaluate.',
    transcript: [
      { who: 'You', text: 'Walk me through what this author is doing.', t: '10:03' },
      {
        who: 'StudyPilot',
        text: 'They’re arguing from a moral frame — not an economic one. The assumption underneath is that progress equals discipline. Worth naming that before you evaluate.',
        t: '10:04',
      },
    ],
    actionItemIds: ['a7', 'a8'],
  },
];

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
  const [actionItems, setActionItems] = useState<ActionItem[]>(ACTION_ITEMS_INITIAL);
  const [activeRubricId, setActiveRubricId] = useState<string>('r1');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('s1');
  const [chatContextSessionId, setChatContextSessionId] = useState<string>('s1');
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

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

  const rubricsById = useMemo(
    () => new Map(RUBRICS.map((rubric) => [rubric.id, rubric])),
    [],
  );
  const sessionsById = useMemo(
    () => new Map(SESSIONS.map((session) => [session.id, session])),
    [],
  );
  const activeRubric = useMemo(
    () => rubricsById.get(activeRubricId) ?? RUBRICS[0],
    [activeRubricId, rubricsById],
  );
  const selectedSession = useMemo(
    () => sessionsById.get(selectedSessionId) ?? SESSIONS[0],
    [selectedSessionId, sessionsById],
  );
  const chatSession = useMemo(
    () => sessionsById.get(chatContextSessionId) ?? SESSIONS[0],
    [chatContextSessionId, sessionsById],
  );

  const openActionItems = useMemo(() => actionItems.filter((a) => !a.done), [actionItems]);
  const doneActionItems = useMemo(() => actionItems.filter((a) => a.done), [actionItems]);
  const openActionIds = useMemo(
    () => new Set(openActionItems.map((item) => item.id)),
    [openActionItems],
  );
  const sessionRows = useMemo<SessionRow[]>(
    () =>
      SESSIONS.map((session) => ({
        session,
        rubric: rubricsById.get(session.rubricId),
        openCount: session.actionItemIds.reduce(
          (count, id) => count + (openActionIds.has(id) ? 1 : 0),
          0,
        ),
      })),
    [openActionIds, rubricsById],
  );
  const homeActionItems = useMemo(() => openActionItems.slice(0, 4), [openActionItems]);
  const latestSessionOpenCount = useMemo(
    () =>
      SESSIONS[0].actionItemIds.reduce(
        (count, id) => count + (openActionIds.has(id) ? 1 : 0),
        0,
      ),
    [openActionIds],
  );
  const selectedSessionActionItems = useMemo(
    () => actionItems.filter((a) => selectedSession.actionItemIds.includes(a.id)),
    [actionItems, selectedSession],
  );
  const selectedSessionRubric = rubricsById.get(selectedSession.rubricId) ?? RUBRICS[0];

  const toggleAction = useCallback((id: string) => {
    setActionItems((items) =>
      items.map((a) => (a.id === id ? { ...a, done: !a.done } : a)),
    );
  }, []);

  const openInChat = useCallback((sessionId: string) => {
    setChatContextSessionId(sessionId);
    setView('chat');
  }, []);

  const openSessionDetail = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
    setView('session-detail');
  }, []);

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const toggleContext = useCallback(() => setContextOpen((v) => !v), []);
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* localStorage unavailable */
      }
      return next;
    });
  }, []);
  const continueLatestInChat = useCallback(() => openInChat(SESSIONS[0].id), [openInChat]);
  const openChatSessionDetail = useCallback(
    () => openSessionDetail(chatSession.id),
    [chatSession.id, openSessionDetail],
  );
  const continueSelectedInChat = useCallback(
    () => openInChat(selectedSession.id),
    [openInChat, selectedSession.id],
  );
  const continueContextInChat = useCallback(
    () => openInChat(chatSession.id),
    [chatSession.id, openInChat],
  );
  const backToSessions = useCallback(() => setView('sessions'), []);
  const askAboutRubric = useCallback(
    (rubricId: string) => {
      const session = SESSIONS.find((s) => s.rubricId === rubricId);
      if (session) openInChat(session.id);
      else setView('chat');
    },
    [openInChat],
  );
  const openExtension = useCallback(() => {
    /* placeholder - would deep link the extension */
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
        view={view}
        setView={setView}
        openCount={openActionItems.length}
        sessionsCount={SESSIONS.length}
        rubricsCount={RUBRICS.length}
      />

      <section className="ds-main">
        <TopBar
          view={view}
          theme={theme}
          contextOpen={contextOpen}
          onToggleSidebar={toggleSidebar}
          onToggleContext={toggleContext}
          onToggleTheme={toggleTheme}
        />

        <div className="ds-canvas">
          {view === 'home' && (
            <HomeView
              student={STUDENT}
              activeRubric={activeRubric}
              latestSession={SESSIONS[0]}
              latestSessionOpenCount={latestSessionOpenCount}
              openActionItems={homeActionItems}
              onContinueInChat={continueLatestInChat}
              onOpenSession={openSessionDetail}
              onToggleAction={toggleAction}
              onGoTo={setView}
            />
          )}

          {view === 'chat' && (
            <ChatView
              activeRubric={activeRubric}
              session={chatSession}
              onOpenSession={openChatSessionDetail}
            />
          )}

          {view === 'sessions' && (
            <SessionsView
              rows={sessionRows}
              onOpenSession={openSessionDetail}
              onContinueInChat={openInChat}
            />
          )}

          {view === 'session-detail' && (
            <SessionDetailView
              session={selectedSession}
              rubric={selectedSessionRubric}
              actionItems={selectedSessionActionItems}
              onToggleAction={toggleAction}
              onBack={backToSessions}
              onContinueInChat={continueSelectedInChat}
            />
          )}

          {view === 'rubrics' && (
            <RubricsView
              rubrics={RUBRICS}
              activeRubricId={activeRubricId}
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
              onToggle={toggleAction}
              onOpenSession={openSessionDetail}
            />
          )}

          {view === 'settings' && (
            <SettingsView
              student={STUDENT}
              theme={theme}
              onSetTheme={(nextTheme) => {
                setTheme(nextTheme);
                try {
                  window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
                } catch {
                  /* localStorage unavailable */
                }
              }}
            />
          )}
        </div>
      </section>

      <ContextPanel
        view={view}
        student={STUDENT}
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
  view,
  setView,
  openCount,
  sessionsCount,
  rubricsCount,
}: {
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
            {STUDENT.initials}
          </span>
          <span className="ds-account-body">
            <b>{STUDENT.name}</b>
            <em>{STUDENT.email}</em>
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
  onToggleSidebar,
  onToggleContext,
  onToggleTheme,
}: {
  view: View;
  theme: Theme;
  contextOpen: boolean;
  onToggleSidebar: () => void;
  onToggleContext: () => void;
  onToggleTheme: () => void;
}) {
  const t = VIEW_TITLES[view];
  const isLight = theme === 'light';

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
          <input placeholder="Search sessions, rubrics, action items…" />
          <kbd>⌘K</kbd>
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
  onContinueInChat,
  onOpenSession,
  onToggleAction,
  onGoTo,
}: {
  student: typeof STUDENT;
  activeRubric: Rubric;
  latestSession: Session;
  latestSessionOpenCount: number;
  openActionItems: ActionItem[];
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
          Three open action items from your last coaching session. The extension picked up where
          your draft left off — pick up where it left off.
        </p>
      </header>

      <section className="ds-row ds-row-2">
        {/* Latest imported session */}
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
              <dd>{activeRubric.title.replace(' Rubric', '')}</dd>
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

        {/* Active rubric */}
        <article className="ds-card">
          <div className="ds-card-eyebrow">
            <span>Active rubric</span>
          </div>
          <h3 className="ds-card-title ds-card-title-sm">{activeRubric.title}</h3>
          <p className="ds-card-sub">{activeRubric.course}</p>

          <ul className="ds-criteria">
            {activeRubric.criteria.map((c) => (
              <li key={c.name}>
                <span>{c.name}</span>
                <ScoreDots score={c.score ?? 0} max={c.max ?? 4} />
              </li>
            ))}
          </ul>

          <div className="ds-card-actions">
            <DsButton variant="ghost" onClick={() => onGoTo('rubrics')}>
              All rubrics <ChevronRight size={13} strokeWidth={1.7} />
            </DsButton>
          </div>
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
                  sessionTitle={SESSIONS.find((s) => s.id === a.sessionId)?.title}
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
          <ul className="ds-activity">
            <li>
              <span className="ds-activity-time">2:38 PM</span>
              <span>
                Session imported · <b>Research Essay Draft</b>
              </span>
            </li>
            <li>
              <span className="ds-activity-time">2:41 PM</span>
              <span>
                4 action items added from <b>Essay Coach</b>
              </span>
            </li>
            <li>
              <span className="ds-activity-time">Yesterday</span>
              <span>
                Marked <b>Cite the Atlantic article in MLA</b> as done
              </span>
            </li>
            <li>
              <span className="ds-activity-time">Apr 21</span>
              <span>
                Activated rubric <b>Argumentative Essay</b>
              </span>
            </li>
          </ul>
        </article>
      </section>
    </div>
  );
});

/* ============================================================================
   Chat view
   ============================================================================ */

const SEED_MESSAGES: Message[] = [
  createMessage({
    id: 'm1',
    role: 'ai',
    text:
      "I pulled up your last session — Research Essay Draft. Your thesis is clear, but the rubric asks for stronger evidence. Paragraph 2 summarizes the source instead of analyzing it. Want to start there?",
    time: '2:47 PM',
  }),
  createMessage({
    id: 'm2',
    role: 'user',
    text: 'Yes — what should I revise first?',
    time: '2:47 PM',
  }),
  createMessage({
    id: 'm3',
    role: 'ai',
    text:
      "Start with the second body paragraph. The quote from Hochschild is strong, but you stop at restating it. Add one sentence linking it back to your thesis claim about working-class identity. I can’t write the introduction for you, but I can help you improve it. What is the main claim you want your reader to believe?",
    time: '2:48 PM',
  }),
];

const ChatView = memo(function ChatView({
  activeRubric,
  session,
  onOpenSession,
}: {
  activeRubric: Rubric;
  session: Session;
  onOpenSession: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>(SEED_MESSAGES);
  const [input, setInput] = useState('');
  const [micOn, setMicOn] = useState(false);
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

  const send = useCallback((text?: string) => {
    const value = (text ?? input).trim();
    if (!value) return;
    const userMsg = createMessage({
      id: String(Date.now()),
      role: 'user',
      text: value,
      time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    });
    setMessages((m) => [...m, userMsg]);
    setInput('');
  }, [input]);

  const toggleMic = useCallback(() => setMicOn((v) => !v), []);

  return (
    <div className="ds-view ds-view-chat">
      <div className="ds-context-strip">
        <span className="ds-context-chip ds-chip-accent" onClick={onOpenSession} role="button" tabIndex={0}>
          <ScrollText size={11} strokeWidth={1.8} />
          <span>{session.title}</span>
        </span>
        <span className="ds-context-chip">
          <BookOpen size={11} strokeWidth={1.8} />
          <span>{activeRubric.title.replace(' Rubric', '')}</span>
        </span>
        <span className="ds-context-chip">
          <Chrome size={11} strokeWidth={1.8} />
          <span>Imported from Chrome extension</span>
        </span>
        <span className="ds-context-chip ds-chip-muted">
          <Clock size={11} strokeWidth={1.8} />
          <span>{session.duration} · {session.mode}</span>
        </span>
      </div>

      <div className="ds-messages" ref={messagesRef}>
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
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

const MessageBubble = memo(function MessageBubble({ message }: { message: Message }) {
  return (
    <article className={`ds-msg ds-msg-${message.role}`}>
      <div className="ds-msg-avatar" aria-hidden="true">
        {message.role === 'ai' ? <StudyPilotMark size={14} /> : <span>{STUDENT.initials}</span>}
      </div>
      <div className="ds-msg-body">
        <div className="ds-msg-meta">
          <b>{message.role === 'ai' ? 'StudyPilot' : STUDENT.name}</b>
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
  onOpenSession,
  onContinueInChat,
}: {
  rows: SessionRow[];
  onOpenSession: (id: string) => void;
  onContinueInChat: (id: string) => void;
}) {
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

      <ul className="ds-session-list">
        {rows.map(({ session: s, rubric, openCount }) => {
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
  onToggleAction,
  onBack,
  onContinueInChat,
}: {
  session: Session;
  rubric: Rubric;
  actionItems: ActionItem[];
  onToggleAction: (id: string) => void;
  onBack: () => void;
  onContinueInChat: () => void;
}) {
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
            <ul className="ds-transcript">
              {session.transcript.map((t, i) => (
                <li key={i} className={t.who === 'You' ? 'is-you' : 'is-ai'}>
                  <span className="ds-transcript-who">{t.who}</span>
                  <p>{t.text}</p>
                  <time>{t.t}</time>
                </li>
              ))}
            </ul>
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
            <h4 className="ds-card-title ds-card-title-sm">{rubric.title}</h4>
            <p className="ds-card-sub">{rubric.course}</p>
            <ul className="ds-criteria">
              {rubric.criteria.map((c) => (
                <li key={c.name}>
                  <span>{c.name}</span>
                  <ScoreDots score={c.score ?? 0} max={c.max ?? 4} />
                </li>
              ))}
            </ul>
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
  onSetActive,
  onAskAbout,
}: {
  rubrics: Rubric[];
  activeRubricId: string;
  onSetActive: (id: string) => void;
  onAskAbout: (id: string) => void;
}) {
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

      <ul className="ds-rubric-list">
        {rubrics.map((r) => {
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
                  {r.criteria.map((c) => (
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
  onToggle,
  onOpenSession,
}: {
  open: ActionItem[];
  done: ActionItem[];
  sessionsById: ReadonlyMap<string, Session>;
  rubricsById: ReadonlyMap<string, Rubric>;
  onToggle: (id: string) => void;
  onOpenSession: (id: string) => void;
}) {
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const items = tab === 'open' ? open : done;

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
          title={tab === 'open' ? 'All clear.' : 'Nothing completed yet.'}
          body={
            tab === 'open'
              ? 'New action items from your next coaching session will land here.'
              : 'Check items off as you revise and they’ll show up here.'
          }
        />
      ) : (
        <ul className="ds-todo ds-todo-detailed">
          {items.map((a) => {
            const session = sessionsById.get(a.sessionId);
            const rubric = rubricsById.get(a.rubricId);
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
  onSetTheme,
}: {
  student: typeof STUDENT;
  theme: Theme;
  onSetTheme: (theme: Theme) => void;
}) {
  const [coachMode, setCoachMode] = useState<CoachMode>('essay');

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
            <DsButton variant="ghost">Sign out</DsButton>
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
                onClick={() => setCoachMode(m.id)}
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
  activeRubric: Rubric;
  chatSession: Session;
  selectedSession: Session;
  openActionItemCount: number;
  onGoTo: (v: View) => void;
  onContinueInChat: () => void;
  onOpenExtension: () => void;
}) {
  const contextSession = view === 'session-detail' ? selectedSession : chatSession;
  const visibleCriteria = useMemo(() => activeRubric.criteria.slice(0, 5), [activeRubric]);

  return (
    <aside className="ds-context">
      <div className="ds-context-head">
        <span className="ds-eyebrow">Current context</span>
      </div>

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
            {visibleCriteria.map((c) => (
              <li key={c.name}>
                <span>{c.name}</span>
                <ScoreDots score={c.score ?? 0} max={c.max ?? 4} />
              </li>
            ))}
          </ul>
        </button>
      </section>

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
