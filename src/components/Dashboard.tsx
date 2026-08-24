import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { View, Theme, CoachMode, SessionRow } from './dashboard/dashboard-types';
import { Sidebar, TopBar } from './dashboard/DashboardShell';
import { ActionItemsView } from './dashboard/ActionItemsView';
import { HomeView } from './dashboard/HomeView';
import { SettingsView } from './dashboard/SettingsView';
import { StudyPilotMark } from './dashboard/DashboardPrimitives';
import { SessionsView } from './dashboard/SessionsView';
import { RubricsView, type UploadedRubric } from './dashboard/RubricsView';
import { ChatView } from './dashboard/ChatView';
import { ContextPanel } from './dashboard/ContextPanel';
import { SessionDetailView } from './dashboard/SessionDetailView';
export { ChatView } from './dashboard/ChatView';
import { clearAuth, apiFetch } from '../lib/api';
import { AUTH_REQUIRED } from '../lib/authConfig';
import { supabase } from '../lib/supabaseClient';
import {
  getAiUsage,
  createDashboardChat,
  deleteDashboardChat,
  getDashboardChatMessages,
  getDashboardChats,
  getOrCreateRubricChat,
  getOrCreateSessionChat,
  retryRubricIndexing,
  updateDashboardChat,
  type AiUsage,
} from '../lib/studypilot-api';
import {
  fetchSessions,
  fetchRubrics,
  fetchActionItems,
  fetchSessionTranscript,
  setActionItemDone,
  activateRubric,
  type ActionItem,
  type Rubric,
  type Session,
  type TranscriptLine,
} from '../lib/dashboardApi';
import { sendCoachingMessage } from '../lib/socraticCoach';
import { useStudyPilotRealtime } from '../lib/useRealtime';
import type { DashboardChat } from '../lib/studypilot-types';
import {
  dashboardChatReducer,
  isChatBusy,
  isChatHistoryLoading,
  selectChatMessages,
} from '../lib/dashboard-chat-state';
import { formatDashboardRoute, parseDashboardRoute } from '../lib/dashboard-route';
import { BETA_ACCESS_MAILTO, getChromeWebStoreUrl } from '../lib/productLinks';
import {
  normalizeIndexStatus,
  resolveChatRubricContext,
} from '../lib/chat-rubric-context';
import './Dashboard.css';

import { X } from 'lucide-react';

/* ============================================================================
   StudyPilot — Dashboard
   The "memory layer" of the Chrome extension.
   Renders inside #dashboard hash route (lazy-loaded from App.tsx).
   ============================================================================ */


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

type DashboardBootstrapState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error' };

/* ---------- Component ---------- */

function replaceDashboardHash(chatId?: string | null): void {
  if (typeof window === 'undefined') return;
  const nextHash = formatDashboardRoute(chatId);
  if (window.location.hash === nextHash) return;
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${window.location.search}${nextHash}`,
  );
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export default function Dashboard({
  routeHash = typeof window === 'undefined' ? '#dashboard' : window.location.hash,
}: {
  routeHash?: string;
}) {
  const [view, setView] = useState<View>(() => (
    parseDashboardRoute(routeHash).chatId ? 'chat' : 'home'
  ));

  // ── Live data from the backend ──────────────────────────────────────────────
  const [sessions, setSessions] = useState<Session[]>([]);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [chats, setChats] = useState<DashboardChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatState, dispatchChat] = useReducer(dashboardChatReducer, {});
  const [draftCreating, setDraftCreating] = useState(false);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [transcripts, setTranscripts] = useState<Record<string, TranscriptLine[]>>({});
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [bootstrapState, setBootstrapState] = useState<DashboardBootstrapState>({ status: 'loading' });
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [extensionHelpOpen, setExtensionHelpOpen] = useState(false);
  const chatsRef = useRef<DashboardChat[]>([]);
  const activeChatIdRef = useRef<string | null>(null);
  const chatListVersionRef = useRef(0);
  const hasLoadedChatsRef = useRef(false);
  const chatLoadVersionsRef = useRef(new Map<string, number>());
  const inFlightChatIdsRef = useRef(new Set<string>());
  const draftCreatingRef = useRef(false);

  useEffect(() => { chatsRef.current = chats; }, [chats]);
  useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);

  const refreshAiUsage = useCallback(() => {
    if (!AUTH_REQUIRED) return;
    getAiUsage().then(setAiUsage).catch(() => {
      // The migration may not be deployed yet; usage UI is optional in that case.
    });
  }, []);

  const refreshChats = useCallback(async (): Promise<DashboardChat[]> => {
    const version = ++chatListVersionRef.current;
    const rows = await getDashboardChats();
    if (version !== chatListVersionRef.current) return chatsRef.current;

    const firstLoad = !hasLoadedChatsRef.current;
    hasLoadedChatsRef.current = true;
    setChats(rows);
    setChatsLoaded(true);
    const current = activeChatIdRef.current;
    const next = firstLoad && current === null
      ? rows[0]?.id ?? null
      : current && !rows.some((chat) => chat.id === current)
        ? rows[0]?.id ?? null
        : current;
    activeChatIdRef.current = next;
    setActiveChatId(next);
    if (!firstLoad && current && current !== next) replaceDashboardHash(next);
    return rows;
  }, []);

  const loadChatMessages = useCallback(async (chatId: string): Promise<void> => {
    const version = (chatLoadVersionsRef.current.get(chatId) ?? 0) + 1;
    chatLoadVersionsRef.current.set(chatId, version);
    dispatchChat({ type: 'load-started', chatId, version });
    try {
      const rows = await getDashboardChatMessages(chatId);
      dispatchChat({ type: 'load-succeeded', chatId, version, rows });
    } catch (error) {
      console.error('Failed to load dashboard chat messages:', error);
      dispatchChat({ type: 'load-failed', chatId, version });
    }
  }, []);

  const invalidateChat = useCallback((chatId: string) => {
    dispatchChat({ type: 'invalidate', chatId });
    if (activeChatIdRef.current === chatId) void loadChatMessages(chatId);
  }, [loadChatMessages]);

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
    onNewSession: () => {
      void fetchSessions().then(setSessions).catch(() => undefined);
    },
    onSessionChanged: () => {
      void fetchSessions().then(setSessions).catch(() => undefined);
    },
    onSessionMessageChanged: (payload) => {
      const sessionId = payload.new?.session_id;
      if (typeof sessionId !== 'string') return;
      void fetchSessionTranscript(sessionId)
        .then((lines) => setTranscripts((current) => ({ ...current, [sessionId]: lines })))
        .catch(() => undefined);
    },
    onDocumentUpdated: (doc) => {
      // Update rubric status if document is linked to a rubric
      if (doc.rubric_id) {
        const status = normalizeIndexStatus(doc.index_status);
        setRubrics((prev) =>
          prev.map((r) =>
            r.id === doc.rubric_id
              ? {
                ...r,
                file_search_status: status,
                fileSearchStatus: status,
                knowledgeDocumentId: doc.id ?? r.knowledgeDocumentId,
              }
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
    onDashboardChatChanged: () => {
      void refreshChats().catch(() => undefined);
    },
    onDashboardChatMessageChanged: (payload) => {
      const chatId = payload.new?.chat_id;
      if (typeof chatId === 'string') invalidateChat(chatId);
    },
    onSubscribed: () => {
      void refreshChats().catch(() => undefined);
      const activeId = activeChatIdRef.current;
      if (activeId) void loadChatMessages(activeId);
    },
  });

  const [activeRubricId, setActiveRubricId] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
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

  // Load sessions, rubrics, action items, and chats in parallel. allSettled means one
  // failing endpoint doesn't blank the whole dashboard — we render whatever loaded.
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchSessions(), fetchRubrics(), fetchActionItems(), refreshChats()])
      .then(([s, r, a, c]) => {
        if (cancelled) return;
        if (s.status === 'fulfilled') setSessions(s.value);
        if (r.status === 'fulfilled') {
          setRubrics(r.value);
          const active = r.value.find((x) => x.active) ?? r.value[0];
          if (active) setActiveRubricId((prev) => prev || active.id);
        }
        if (a.status === 'fulfilled') setActionItems(a.value);
        if (c.status === 'rejected') setChatsLoaded(true);
        const fatalLoadError =
          AUTH_REQUIRED &&
          s.status === 'rejected' &&
          r.status === 'rejected' &&
          a.status === 'rejected';
        setBootstrapState({ status: fatalLoadError ? 'error' : 'ready' });
      })
      .catch(() => {
        if (!cancelled) setBootstrapState({ status: 'ready' });
      });
    return () => {
      cancelled = true;
    };
  }, [refreshChats]);

  useEffect(() => {
    refreshAiUsage();
  }, [refreshAiUsage]);

  const replaceChatRoute = useCallback(replaceDashboardHash, []);

  useEffect(() => {
    if (!chatsLoaded) return;
    const requestedChatId = parseDashboardRoute(routeHash).chatId;
    if (!requestedChatId) return;

    const target = chatsRef.current.find((chat) => chat.id === requestedChatId);
    const fallback = target ?? chatsRef.current[0];
    setView('chat');
    setActiveChatId(fallback?.id ?? null);
    if (!target) replaceChatRoute(fallback?.id ?? null);
  }, [chatsLoaded, replaceChatRoute, routeHash]);

  useEffect(() => {
    if (activeChatId) void loadChatMessages(activeChatId);
  }, [activeChatId, loadChatMessages]);

  useEffect(() => {
    let refreshPending = false;
    const refreshCanonicalState = () => {
      if (document.visibilityState === 'hidden' || refreshPending) return;
      refreshPending = true;
      const activeId = activeChatIdRef.current;
      void Promise.allSettled([
        refreshChats(),
        activeId ? loadChatMessages(activeId) : Promise.resolve(),
        fetchSessions().then(setSessions),
        selectedSessionId
          ? fetchSessionTranscript(selectedSessionId).then((lines) => {
            setTranscripts((current) => ({ ...current, [selectedSessionId]: lines }));
          })
          : Promise.resolve(),
      ]).finally(() => {
        refreshPending = false;
      });
    };

    window.addEventListener('focus', refreshCanonicalState);
    document.addEventListener('visibilitychange', refreshCanonicalState);
    return () => {
      window.removeEventListener('focus', refreshCanonicalState);
      document.removeEventListener('visibilitychange', refreshCanonicalState);
    };
  }, [loadChatMessages, refreshChats, selectedSessionId]);

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
  const activeChat = useMemo<DashboardChat | undefined>(
    () => chats.find((chat) => chat.id === activeChatId),
    [activeChatId, chats],
  );
  const chatSession = useMemo<Session | undefined>(
    () => (activeChat?.session_id ? sessionsById.get(activeChat.session_id) : undefined),
    [activeChat, sessionsById],
  );
  const chatRubricContext = useMemo(
    () => resolveChatRubricContext({
      chat: activeChat,
      session: chatSession,
      rubricsById,
      activeRubric,
    }),
    [activeChat, chatSession, rubricsById, activeRubric],
  );
  const chatRubric = chatRubricContext.rubric;
  const activeChatMessages = useMemo(
    () => selectChatMessages(chatState, activeChatId),
    [activeChatId, chatState],
  );
  const activeChatBusy = activeChatId
    ? isChatBusy(chatState, activeChatId)
    : draftCreating;
  const activeChatHistoryLoading = isChatHistoryLoading(chatState, activeChatId);

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
  const sessionsRef = useRef(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

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

  const navigateToView = useCallback((nextView: View) => {
    setView(nextView);
    replaceChatRoute(nextView === 'chat' ? activeChatIdRef.current : null);
  }, [replaceChatRoute]);

  const selectChat = useCallback((chatId: string) => {
    activeChatIdRef.current = chatId;
    setActiveChatId(chatId);
    setView('chat');
    replaceChatRoute(chatId);
  }, [replaceChatRoute]);

  const startNewChat = useCallback(() => {
    activeChatIdRef.current = null;
    setActiveChatId(null);
    setView('chat');
    replaceChatRoute(null);
  }, [replaceChatRoute]);

  const createChat = useCallback(async (title: string, sessionId?: string | null) => {
    const chat = sessionId
      ? await getOrCreateSessionChat(sessionId, title)
      : await createDashboardChat(title, null);
    setChats((current) => {
      const next = [chat, ...current.filter((item) => item.id !== chat.id)];
      chatsRef.current = next;
      return next;
    });
    activeChatIdRef.current = chat.id;
    setActiveChatId(chat.id);
    replaceChatRoute(chat.id);
    return chat;
  }, [replaceChatRoute]);

  const renameChat = useCallback((chatId: string, title: string) => {
    const previous = chatsRef.current.find((chat) => chat.id === chatId);
    if (!previous) return;

    const nextTitle = title.trim() || previous.title;
    setChats((current) =>
      current.map((chat) => (chat.id === chatId ? { ...chat, title: nextTitle } : chat)),
    );
    updateDashboardChat(chatId, { title: nextTitle })
      .then((updated) => {
        setChats((current) =>
          current.map((chat) => (chat.id === chatId ? updated : chat)),
        );
      })
      .catch(() => {
        setChats((current) =>
          current.map((chat) => (chat.id === chatId ? previous : chat)),
        );
      });
  }, []);

  const deleteChat = useCallback((chatId: string) => {
    const previousChats = chatsRef.current;
    const nextChats = previousChats.filter((chat) => chat.id !== chatId);
    if (nextChats.length === previousChats.length) return;

    const previousActiveChatId = activeChatIdRef.current;
    const nextActiveChatId = previousActiveChatId === chatId ? nextChats[0]?.id ?? null : previousActiveChatId;
    chatsRef.current = nextChats;
    setChats(nextChats);
    dispatchChat({ type: 'chat-deleted', chatId });
    if (previousActiveChatId === chatId) {
      activeChatIdRef.current = nextActiveChatId;
      setActiveChatId(nextActiveChatId);
      replaceChatRoute(nextActiveChatId);
    }

    deleteDashboardChat(chatId).catch(() => {
      chatsRef.current = previousChats;
      setChats(previousChats);
      if (activeChatIdRef.current === nextActiveChatId) {
        setActiveChatId(previousActiveChatId);
        activeChatIdRef.current = previousActiveChatId;
        replaceChatRoute(previousActiveChatId);
      }
    });
  }, [replaceChatRoute]);

  const touchChat = useCallback((chatId: string) => {
    setChats((current) => {
      const chat = current.find((item) => item.id === chatId);
      if (!chat) return current;
      return [
        { ...chat, updated_at: new Date().toISOString() },
        ...current.filter((item) => item.id !== chatId),
      ];
    });
  }, []);

  const sendChatMessage = useCallback((text: string, sessionId?: string | null): boolean => {
    const value = text.trim();
    if (!value || (aiUsage !== null && aiUsage.used >= aiUsage.limit)) return false;

    const currentChatId = activeChatIdRef.current;
    if (currentChatId) {
      if (inFlightChatIdsRef.current.has(currentChatId)) return false;
      inFlightChatIdsRef.current.add(currentChatId);
    } else {
      if (draftCreatingRef.current) return false;
      draftCreatingRef.current = true;
      setDraftCreating(true);
    }

    void (async () => {
      let chatId = currentChatId;
      try {
        if (!chatId) {
          const chat = await createChat(titleFromFirstMessage(value), sessionId ?? null);
          chatId = chat.id;
          if (inFlightChatIdsRef.current.has(chatId)) return;
          inFlightChatIdsRef.current.add(chatId);
        }
      } catch (error) {
        console.error('Failed to create chat:', error);
        return;
      } finally {
        if (!currentChatId) {
          draftCreatingRef.current = false;
          setDraftCreating(false);
        }
      }

      if (!chatId) return;
      const requestId = crypto.randomUUID();
      dispatchChat({
        type: 'turn-started',
        chatId,
        requestId,
        userText: value,
        createdAt: new Date().toISOString(),
        originSurface: 'dashboard',
      });

      try {
        const result = await sendCoachingMessage(
          chatId,
          value,
          { requestId, originSurface: 'dashboard' },
          {
            onTokenReceived: (token) => {
              dispatchChat({ type: 'token-received', chatId, requestId, token });
            },
          },
        );
        if (result.commit) {
          dispatchChat({ type: 'turn-committed', chatId, requestId, commit: result.commit });
        } else {
          dispatchChat({ type: 'turn-completed', chatId, requestId });
        }
        touchChat(chatId);
      } catch (error) {
        console.error('Chat stream error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        dispatchChat({ type: 'turn-failed', chatId, requestId, error: message });
      } finally {
        inFlightChatIdsRef.current.delete(chatId);
        refreshAiUsage();
        dispatchChat({ type: 'invalidate', chatId });
        void loadChatMessages(chatId);
        void refreshChats().catch(() => undefined);
      }
    })();

    return true;
  }, [aiUsage, createChat, loadChatMessages, refreshAiUsage, refreshChats, touchChat]);

  const openInChat = useCallback((sessionId: string) => {
    setView('chat');
    const session = sessionsRef.current.find((item) => item.id === sessionId);
    const linkedChatId = session?.chatId ?? session?.chat_id ?? null;

    if (typeof linkedChatId === 'string' && linkedChatId) {
      const byChatId = chatsRef.current.find((chat) => chat.id === linkedChatId);
      if (byChatId) {
        selectChat(byChatId.id);
        return;
      }
    }

    const existing = chatsRef.current.find((chat) => chat.session_id === sessionId);
    if (existing) {
      selectChat(existing.id);
      return;
    }

    activeChatIdRef.current = null;
    setActiveChatId(null);
    void createChat(session?.title ?? 'Session chat', sessionId).catch(() => {
      /* Leave the user in a fresh rubric-only draft if the chat could not be created. */
    });
  }, [createChat, selectChat]);

  const openSessionDetail = useCallback(
    (sessionId: string) => {
      setSelectedSessionId(sessionId);
      navigateToView('session-detail');
      ensureTranscript(sessionId);
    },
    [ensureTranscript, navigateToView],
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
  const backToSessions = useCallback(() => navigateToView('sessions'), [navigateToView]);
  const setActiveRubricOnServer = useCallback(async (rubricId: string) => {
    const previousId = activeRubricId;
    setRubrics((prev) => prev.map((r) => ({ ...r, active: r.id === rubricId })));
    setActiveRubricId(rubricId);
    try {
      await activateRubric(rubricId);
    } catch (error) {
      console.error('Failed to activate rubric:', error);
      setRubrics((prev) => prev.map((r) => ({ ...r, active: r.id === previousId })));
      setActiveRubricId(previousId);
    }
  }, [activeRubricId]);

  const askAboutRubric = useCallback(
    async (rubricId: string) => {
      // Open (or reuse) the durable rubric chat without changing the global default.
      setView('chat');
      try {
        const chat = await getOrCreateRubricChat(rubricId);
        setChats((current) => {
          const next = [chat, ...current.filter((item) => item.id !== chat.id)];
          chatsRef.current = next;
          return next;
        });
        activeChatIdRef.current = chat.id;
        setActiveChatId(chat.id);
        replaceChatRoute(chat.id);
        void loadChatMessages(chat.id);
      } catch (error) {
        console.error('Failed to open rubric chat:', error);
        startNewChat();
      }
    },
    [loadChatMessages, replaceChatRoute, startNewChat],
  );

  const retryIndexRubric = useCallback(async (rubricId: string) => {
    const rubric = rubrics.find((r) => r.id === rubricId);
    const knowledgeDocumentId = rubric?.knowledgeDocumentId ?? rubric?.knowledge_document_id;
    if (!knowledgeDocumentId) return;

    setRubrics((prev) =>
      prev.map((r) =>
        r.id === rubricId
          ? { ...r, file_search_status: 'indexing', fileSearchStatus: 'indexing', fileSearchError: null }
          : r,
      ),
    );
    try {
      const result = await retryRubricIndexing(knowledgeDocumentId);
      const status = normalizeIndexStatus(result.status);
      setRubrics((prev) =>
        prev.map((r) =>
          r.id === rubricId
            ? {
              ...r,
              file_search_status: status,
              fileSearchStatus: status,
              fileSearchError: status === 'failed' ? (result.error ?? null) : null,
            }
            : r,
        ),
      );
    } catch (error) {
      setRubrics((prev) =>
        prev.map((r) =>
          r.id === rubricId
            ? {
              ...r,
              file_search_status: 'failed',
              fileSearchStatus: 'failed',
              fileSearchError: error instanceof Error ? error.message : 'Indexing failed',
            }
            : r,
        ),
      );
    }
  }, [rubrics]);
  const openExtension = useCallback(() => {
    setExtensionHelpOpen(true);
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
    window.location.hash = AUTH_REQUIRED ? '#auth' : '#dashboard';
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
        setView={navigateToView}
        openCount={openActionItems.length}
        sessionsCount={sessions.length}
        rubricsCount={rubrics.length}
        onOpenExtension={openExtension}
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
          {bootstrapState.status === 'loading' ? (
            <div className="ds-state ds-state-loading">
              <span className="ds-state-spinner" aria-hidden="true" />
              <p>Loading your workspace…</p>
            </div>
          ) : bootstrapState.status === 'error' ? (
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
                  onGoTo={navigateToView}
                />
              )}

              {view === 'chat' && (
                <ChatView
                  student={student}
                  activeRubric={chatRubric}
                  rubricRemoved={chatRubricContext.rubricRemoved}
                  session={chatSession}
                  chats={chats}
                  rubricsById={rubricsById}
                  activeChatId={activeChatId}
                  messages={activeChatMessages}
                  historyLoading={activeChatHistoryLoading}
                  activeChatBusy={activeChatBusy}
                  draftCreating={draftCreating}
                  aiUsage={aiUsage}
                  onOpenSession={openChatSessionDetail}
                  onSelectChat={selectChat}
                  onStartNewChat={startNewChat}
                  onRenameChat={renameChat}
                  onDeleteChat={deleteChat}
                  onSendMessage={sendChatMessage}
                  onRetryIndex={retryIndexRubric}
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
                  onSetActive={setActiveRubricOnServer}
                  onAskAbout={askAboutRubric}
                  onRetryIndex={retryIndexRubric}
                  onRubricUploaded={(newRubric: UploadedRubric) => {
                    const adapted = {
                      ...newRubric,
                      sessionsCount: 0,
                      uploaded: new Date(newRubric.uploaded_at ?? new Date()).toLocaleDateString(),
                      knowledgeDocumentId: newRubric.knowledgeDocumentId ?? newRubric.knowledge_document_id ?? null,
                      fileSearchStatus: newRubric.file_search_status ?? newRubric.fileSearchStatus ?? 'not_indexed',
                      file_search_status: newRubric.file_search_status ?? newRubric.fileSearchStatus ?? 'not_indexed',
                      criteria: (newRubric.criteria ?? []).map((c: any) => ({ ...c, max: c.max_score ?? c.max })),
                    };
                    const shouldActivate = Boolean(newRubric.active) || rubrics.length === 0;
                    setRubrics((prev) => {
                      const next = [adapted, ...prev.filter((r) => r.id !== adapted.id)];
                      if (!shouldActivate) return next;
                      return next.map((r) => ({ ...r, active: r.id === adapted.id }));
                    });
                    if (shouldActivate) setActiveRubricId(adapted.id);
                  }}
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
                  aiUsage={aiUsage}
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
        activeRubric={activeRubric}
        chatSession={chatSession}
        selectedSession={selectedSession}
        openActionItemCount={openActionItems.length}
        aiUsage={aiUsage}
        onGoTo={navigateToView}
        onContinueInChat={continueContextInChat}
        onOpenExtension={openExtension}
      />

      {extensionHelpOpen && (
        <ExtensionHelpModal onClose={() => setExtensionHelpOpen(false)} />
      )}
    </main>
  );
}

/* ============================================================================
   Sidebar
   ============================================================================ */

/* ============================================================================
   Chat view
   ============================================================================ */

function titleFromFirstMessage(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 40) || 'New chat';
}



/* ============================================================================
   Sessions view
   ============================================================================ */


function ExtensionHelpModal({ onClose }: { onClose: () => void }) {
  const storeUrl = getChromeWebStoreUrl();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="ds-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="extension-help-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ds-modal">
        <div className="ds-modal-head">
          <h2 id="extension-help-title" className="ds-modal-title">
            Open the StudyPilot extension
          </h2>
          <button type="button" className="ds-icon-btn" onClick={onClose} aria-label="Close">
            <X size={14} strokeWidth={1.7} />
          </button>
        </div>
        <div className="ds-modal-body">
          <p className="ds-help-lead">
            StudyPilot lives in Chrome. Install it, pin it, then click the toolbar icon on the page you are studying.
          </p>
          <ol className="ds-help-steps">
            <li>
              {storeUrl ? (
                <>
                  Install the extension from the{' '}
                  <a href={storeUrl} target="_blank" rel="noopener noreferrer">
                    Chrome Web Store
                  </a>
                  .
                </>
              ) : (
                <>
                  Install the Chrome extension. The public listing is not live yet — this beta is invite-only.{' '}
                  <a href={BETA_ACCESS_MAILTO}>Request beta access</a>.
                </>
              )}
            </li>
            <li>Pin StudyPilot to the Chrome toolbar so the icon stays visible.</li>
            <li>Open a study page and click the StudyPilot toolbar icon to start coaching.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
