import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DashboardProps, View, Theme, CoachMode, SessionRow } from './dashboard/dashboard-types';
import { Sidebar, TopBar } from './dashboard/DashboardShell';
import { ActionItemsView } from './dashboard/ActionItemsView';
import { HomeView } from './dashboard/HomeView';
import { SettingsView } from './dashboard/SettingsView';
import { SessionsView } from './dashboard/SessionsView';
import { RubricsView } from './dashboard/RubricsView';
import type { UploadedRubric } from './dashboard/dashboard-types';
import { ChatView } from './dashboard/ChatView';
import { ContextPanel } from './dashboard/ContextPanel';
import { SessionDetailView } from './dashboard/SessionDetailView';
import { ExtensionHelpModal } from './dashboard/ExtensionHelpModal';
import { useDashboardData } from './dashboard/useDashboardData';
export { ChatView } from './dashboard/ChatView';
import { clearAuth, apiFetch } from '../lib/api';
import { AUTH_REQUIRED } from '../lib/authConfig';
import {
  createDashboardChat,
  deleteDashboardChat,
  getOrCreateRubricChat,
  getOrCreateSessionChat,
  retryRubricIndexing,
  updateDashboardChat,
} from '../lib/studypilot-api';
import { fetchActionItems, fetchSessionTranscript, setActionItemDone, activateRubric, deleteRubric } from '../lib/dashboardApi';
import type { Rubric, Session } from '../lib/dashboard-types';
import { sendCoachingMessage } from '../lib/socraticCoach';
import type { DashboardChat } from '../lib/studypilot-types';
import { isChatBusy, isChatHistoryLoading, selectChatMessages } from '../lib/dashboard-chat-state';
import { formatDashboardRoute, parseDashboardRoute } from '../lib/dashboard-route';
import { resolveChatRubricContext, normalizeIndexStatus } from '../lib/chat-rubric-context';
import './dashboard/DashboardShell.css';
import './dashboard/ChatView.css';
import './dashboard/ContentViews.css';
import './Dashboard.css';

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
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

/* ---------- Mock data ---------- */

/* ---------- Read logged-in user from localStorage ---------- */

function getLoggedInStudent() {
  try {
    const email = localStorage.getItem('sp_email') ?? 'student@university.edu';
    const name = email
      .split('@')[0]
      .replace(/[._]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const initials = name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    return { name, initials, email };
  } catch {
    return { name: 'Student', initials: 'S', email: '' };
  }
}

const STUDENT = getLoggedInStudent();

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
}: DashboardProps) {
  const [view, setView] = useState<View>(() => (parseDashboardRoute(routeHash).chatId ? 'chat' : 'home'));

  const [activeRubricId, setActiveRubricId] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  // Default coach mode also comes from the profile; persisted back via PATCH /users/me.
  const [coachMode, setCoachMode] = useState<CoachMode>('essay');
  const replaceChatRoute = useCallback(replaceDashboardHash, []);

  const {
    sessions,
    rubrics,
    setRubrics,
    actionItems,
    setActionItems,
    chats,
    setChats,
    activeChatId,
    setActiveChatId,
    chatState,
    dispatchChat,
    draftCreating,
    setDraftCreating,
    chatRequestState,
    transcripts,
    setTranscripts,
    transcriptStates,
    setTranscriptStates,
    rubricIndexRequestStates,
    setRubricIndexRequestStates,
    bootstrapState,
    aiUsage,
    student,
    chatsRef,
    activeChatIdRef,
    rubricIndexRequestVersionsRef,
    transcriptRequestVersionsRef,
    dashboardMountedRef,
    inFlightChatIdsRef,
    draftCreatingRef,
    refreshAiUsage,
    refreshChats,
    loadChatMessages,
  } = useDashboardData({
    initialStudent: STUDENT,
    selectedSessionId,
    replaceChatRoute,
    setActiveRubricId,
    setCoachMode,
    setTheme,
  });

  const [extensionHelpOpen, setExtensionHelpOpen] = useState(false);

  useEffect(() => {
    const chatRequestSettled = chatRequestState.status === 'success' || chatRequestState.status === 'error';
    if (!chatRequestSettled) return;
    const requestedChatId = parseDashboardRoute(routeHash).chatId;
    if (!requestedChatId) return;

    const target = chatsRef.current.find((chat) => chat.id === requestedChatId);
    const fallback = target ?? chatsRef.current[0];
    setView('chat');
    setActiveChatId(fallback?.id ?? null);
    if (!target) replaceChatRoute(fallback?.id ?? null);
  }, [chatRequestState.status, chatsRef, replaceChatRoute, routeHash, setActiveChatId]);

  useEffect(() => {
    if (activeChatId) void loadChatMessages(activeChatId);
  }, [activeChatId, loadChatMessages]);

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

  const rubricsById = useMemo(() => new Map(rubrics.map((rubric) => [rubric.id, rubric])), [rubrics]);
  const sessionsById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions]);
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
    () =>
      resolveChatRubricContext({
        chat: activeChat,
        session: chatSession,
        rubricsById,
        activeRubric,
      }),
    [activeChat, chatSession, rubricsById, activeRubric],
  );
  const chatRubric = chatRubricContext.rubric;
  const activeChatMessages = useMemo(() => selectChatMessages(chatState, activeChatId), [activeChatId, chatState]);
  const activeChatBusy = activeChatId ? isChatBusy(chatState, activeChatId) : draftCreating;
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
    () => (latestSession ? actionItems.filter((a) => a.sessionId === latestSession.id && !a.done).length : 0),
    [latestSession, actionItems],
  );
  const selectedSessionActionItems = useMemo(
    () => (selectedSession ? actionItems.filter((a) => a.sessionId === selectedSession.id) : []),
    [actionItems, selectedSession],
  );
  const selectedSessionRubric =
    selectedSession && selectedSession.rubricId ? rubricsById.get(selectedSession.rubricId) : undefined;
  const selectedTranscript = selectedSession ? (transcripts[selectedSession.id] ?? []) : [];
  const selectedTranscriptState = selectedSession ? transcriptStates[selectedSession.id] : undefined;
  const selectedTranscriptLoading = selectedTranscriptState?.status === 'loading';
  const selectedTranscriptError =
    selectedTranscriptState?.status === 'error'
      ? (selectedTranscriptState.message ?? 'StudyPilot could not load this transcript.')
      : null;
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
        setActionItems((items) => items.map((a) => (a.id === id ? { ...a, done: current.done } : a)));
      });
    },
    [actionItems, setActionItems],
  );

  // Fetch a session's transcript the first time it's needed, then cache it.
  // Using a ref for the transcripts lookup so this callback is stable and
  // doesn't re-create (and cascade to openInChat / openSessionDetail) every
  // time a transcript is fetched.
  const transcriptsRef = useRef(transcripts);
  useEffect(() => {
    transcriptsRef.current = transcripts;
  });
  const transcriptStatesRef = useRef(transcriptStates);
  useEffect(() => {
    transcriptStatesRef.current = transcriptStates;
  });
  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const ensureTranscript = useCallback(
    (sessionId: string, force = false) => {
      if (!force && transcriptsRef.current[sessionId] !== undefined) return;
      if (transcriptStatesRef.current[sessionId]?.status === 'loading') return;
      const requestVersion = (transcriptRequestVersionsRef.current.get(sessionId) ?? 0) + 1;
      transcriptRequestVersionsRef.current.set(sessionId, requestVersion);
      setTranscriptStates((current) => ({ ...current, [sessionId]: { status: 'loading' } }));
      fetchSessionTranscript(sessionId)
        .then((lines) => {
          if (!dashboardMountedRef.current || transcriptRequestVersionsRef.current.get(sessionId) !== requestVersion)
            return;
          setTranscripts((prev) => ({ ...prev, [sessionId]: lines }));
          setTranscriptStates((current) => ({ ...current, [sessionId]: { status: 'success' } }));
        })
        .catch((error) => {
          if (!dashboardMountedRef.current || transcriptRequestVersionsRef.current.get(sessionId) !== requestVersion)
            return;
          setTranscripts((prev) => ({ ...prev, [sessionId]: [] }));
          setTranscriptStates((current) => ({
            ...current,
            [sessionId]: {
              status: 'error',
              message: error instanceof Error ? error.message : 'Transcript unavailable',
            },
          }));
        });
    },
    [dashboardMountedRef, setTranscriptStates, setTranscripts, transcriptRequestVersionsRef],
  );

  const navigateToView = useCallback(
    (nextView: View) => {
      setView(nextView);
      replaceChatRoute(nextView === 'chat' ? activeChatIdRef.current : null);
    },
    [activeChatIdRef, replaceChatRoute],
  );

  const selectChat = useCallback(
    (chatId: string) => {
      activeChatIdRef.current = chatId;
      setActiveChatId(chatId);
      setView('chat');
      replaceChatRoute(chatId);
    },
    [activeChatIdRef, replaceChatRoute, setActiveChatId],
  );

  const startNewChat = useCallback(() => {
    activeChatIdRef.current = null;
    setActiveChatId(null);
    setView('chat');
    replaceChatRoute(null);
  }, [activeChatIdRef, replaceChatRoute, setActiveChatId]);

  const createChat = useCallback(
    async (title: string, sessionId?: string | null) => {
      const chat = sessionId ? await getOrCreateSessionChat(sessionId, title) : await createDashboardChat(title, null);
      if (!dashboardMountedRef.current) return chat;
      setChats((current) => {
        const next = [chat, ...current.filter((item) => item.id !== chat.id)];
        chatsRef.current = next;
        return next;
      });
      activeChatIdRef.current = chat.id;
      setActiveChatId(chat.id);
      replaceChatRoute(chat.id);
      return chat;
    },
    [activeChatIdRef, chatsRef, dashboardMountedRef, replaceChatRoute, setActiveChatId, setChats],
  );

  const renameChat = useCallback(
    (chatId: string, title: string) => {
      const previous = chatsRef.current.find((chat) => chat.id === chatId);
      if (!previous) return;

      const nextTitle = title.trim() || previous.title;
      setChats((current) => current.map((chat) => (chat.id === chatId ? { ...chat, title: nextTitle } : chat)));
      updateDashboardChat(chatId, { title: nextTitle })
        .then((updated) => {
          if (!dashboardMountedRef.current) return;
          setChats((current) => current.map((chat) => (chat.id === chatId ? updated : chat)));
        })
        .catch(() => {
          if (!dashboardMountedRef.current) return;
          setChats((current) => current.map((chat) => (chat.id === chatId ? previous : chat)));
        });
    },
    [chatsRef, dashboardMountedRef, setChats],
  );

  const deleteChat = useCallback(
    (chatId: string) => {
      const previousChats = chatsRef.current;
      const nextChats = previousChats.filter((chat) => chat.id !== chatId);
      if (nextChats.length === previousChats.length) return;

      const previousActiveChatId = activeChatIdRef.current;
      const nextActiveChatId = previousActiveChatId === chatId ? (nextChats[0]?.id ?? null) : previousActiveChatId;
      chatsRef.current = nextChats;
      setChats(nextChats);
      dispatchChat({ type: 'chat-deleted', chatId });
      if (previousActiveChatId === chatId) {
        activeChatIdRef.current = nextActiveChatId;
        setActiveChatId(nextActiveChatId);
        replaceChatRoute(nextActiveChatId);
      }

      deleteDashboardChat(chatId).catch(() => {
        if (!dashboardMountedRef.current) return;
        chatsRef.current = previousChats;
        setChats(previousChats);
        if (activeChatIdRef.current === nextActiveChatId) {
          setActiveChatId(previousActiveChatId);
          activeChatIdRef.current = previousActiveChatId;
          replaceChatRoute(previousActiveChatId);
        }
      });
    },
    [activeChatIdRef, chatsRef, dashboardMountedRef, dispatchChat, replaceChatRoute, setActiveChatId, setChats],
  );

  const touchChat = useCallback(
    (chatId: string) => {
      setChats((current) => {
        const chat = current.find((item) => item.id === chatId);
        if (!chat) return current;
        return [{ ...chat, updated_at: new Date().toISOString() }, ...current.filter((item) => item.id !== chatId)];
      });
    },
    [setChats],
  );

  const sendChatMessage = useCallback(
    (text: string, sessionId?: string | null): boolean => {
      const value = text.trim();
      if (!dashboardMountedRef.current || !value || (aiUsage !== null && aiUsage.used >= aiUsage.limit)) return false;

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
            if (!dashboardMountedRef.current) return;
            chatId = chat.id;
            if (inFlightChatIdsRef.current.has(chatId)) return;
            inFlightChatIdsRef.current.add(chatId);
          }
        } catch (error) {
          if (!dashboardMountedRef.current) return;
          console.error('Failed to create chat:', error);
          return;
        } finally {
          if (!currentChatId) {
            draftCreatingRef.current = false;
            if (dashboardMountedRef.current) setDraftCreating(false);
          }
        }

        if (!chatId || !dashboardMountedRef.current) return;
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
                if (!dashboardMountedRef.current) return;
                dispatchChat({ type: 'token-received', chatId, requestId, token });
              },
            },
          );
          if (dashboardMountedRef.current) {
            if (result.commit) {
              dispatchChat({ type: 'turn-committed', chatId, requestId, commit: result.commit });
            } else {
              dispatchChat({ type: 'turn-completed', chatId, requestId });
            }
            touchChat(chatId);
          }
        } catch (error) {
          if (dashboardMountedRef.current) {
            console.error('Chat stream error:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            dispatchChat({ type: 'turn-failed', chatId, requestId, error: message });
          }
        } finally {
          inFlightChatIdsRef.current.delete(chatId);
          if (dashboardMountedRef.current) {
            refreshAiUsage();
            void fetchActionItems()
              .then((rows) => {
                if (dashboardMountedRef.current) setActionItems(rows);
              })
              .catch(() => undefined);
            dispatchChat({ type: 'invalidate', chatId });
            void loadChatMessages(chatId);
            void refreshChats().catch(() => undefined);
          }
        }
      })();

      return true;
    },
    [
      activeChatIdRef,
      aiUsage,
      createChat,
      dashboardMountedRef,
      dispatchChat,
      draftCreatingRef,
      inFlightChatIdsRef,
      loadChatMessages,
      refreshAiUsage,
      refreshChats,
      setActionItems,
      setDraftCreating,
      touchChat,
    ],
  );

  const openInChat = useCallback(
    (sessionId: string) => {
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
    },
    [activeChatIdRef, chatsRef, createChat, selectChat, setActiveChatId],
  );

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
  const toggleTheme = useCallback(() => applyTheme(theme === 'dark' ? 'light' : 'dark'), [applyTheme, theme]);
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
  const setActiveRubricOnServer = useCallback(
    async (rubricId: string) => {
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
    },
    [activeRubricId, setRubrics],
  );

  const handleDeleteRubric = useCallback(
    async (rubricId: string) => {
      // Optimistically remove from local state.
      const removed = rubrics.find((r) => r.id === rubricId);
      setRubrics((prev) => prev.filter((r) => r.id !== rubricId));
      // If we just removed the active rubric ID, clear it.
      if (activeRubricId === rubricId) setActiveRubricId('');
      try {
        await deleteRubric(rubricId);
      } catch (error) {
        // Rollback on failure.
        console.error('Failed to delete rubric:', error);
        if (removed) setRubrics((prev) => [removed, ...prev.filter((r) => r.id !== rubricId)]);
        if (activeRubricId === rubricId) setActiveRubricId(rubricId);
        alert(error instanceof Error ? error.message : 'Could not delete rubric. Please try again.');
      }
    },
    [activeRubricId, rubrics, setRubrics],
  );

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
    [activeChatIdRef, chatsRef, loadChatMessages, replaceChatRoute, setActiveChatId, setChats, startNewChat],
  );

  const retryIndexRubric = useCallback(
    async (rubricId: string) => {
      const rubric = rubrics.find((r) => r.id === rubricId);
      const knowledgeDocumentId = rubric?.knowledgeDocumentId ?? rubric?.knowledge_document_id;
      if (!knowledgeDocumentId) return;

      const requestVersion = (rubricIndexRequestVersionsRef.current.get(rubricId) ?? 0) + 1;
      rubricIndexRequestVersionsRef.current.set(rubricId, requestVersion);
      setRubricIndexRequestStates((current) => ({
        ...current,
        [rubricId]: { status: 'loading' },
      }));

      setRubrics((prev) =>
        prev.map((r) =>
          r.id === rubricId
            ? { ...r, file_search_status: 'indexing', fileSearchStatus: 'indexing', fileSearchError: null }
            : r,
        ),
      );
      try {
        const result = await retryRubricIndexing(knowledgeDocumentId);
        if (!dashboardMountedRef.current || rubricIndexRequestVersionsRef.current.get(rubricId) !== requestVersion)
          return;
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
        setRubricIndexRequestStates((current) => ({
          ...current,
          [rubricId]: { status: 'success' },
        }));
      } catch (error) {
        if (!dashboardMountedRef.current || rubricIndexRequestVersionsRef.current.get(rubricId) !== requestVersion)
          return;
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
        setRubricIndexRequestStates((current) => ({
          ...current,
          [rubricId]: {
            status: 'error',
            message: error instanceof Error ? error.message : 'Indexing failed',
          },
        }));
      }
    },
    [dashboardMountedRef, rubricIndexRequestVersionsRef, rubrics, setRubricIndexRequestStates, setRubrics],
  );
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
                  rubricIndexRequestStates={rubricIndexRequestStates}
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
                  transcriptLoading={selectedTranscriptLoading}
                  transcriptError={selectedTranscriptError}
                  onToggleAction={toggleAction}
                  onBack={backToSessions}
                  onContinueInChat={continueSelectedInChat}
                  onRetryTranscript={selectedSession ? () => ensureTranscript(selectedSession.id, true) : undefined}
                />
              )}

              {view === 'rubrics' && (
                <RubricsView
                  rubrics={rubrics}
                  activeRubricId={activeRubricId}
                  query={query}
                  onSetActive={setActiveRubricOnServer}
                  onDelete={handleDeleteRubric}
                  onAskAbout={askAboutRubric}
                  onRetryIndex={retryIndexRubric}
                  rubricIndexRequestStates={rubricIndexRequestStates}
                  onRubricUploaded={(newRubric: UploadedRubric) => {
                    const adapted = {
                      ...newRubric,
                      sessionsCount: 0,
                      uploaded: new Date(newRubric.uploaded_at ?? new Date()).toLocaleDateString(),
                      knowledgeDocumentId: newRubric.knowledgeDocumentId ?? newRubric.knowledge_document_id ?? null,
                      fileSearchStatus: newRubric.file_search_status ?? newRubric.fileSearchStatus ?? 'not_indexed',
                      file_search_status: newRubric.file_search_status ?? newRubric.fileSearchStatus ?? 'not_indexed',
                      criteria: (newRubric.criteria ?? []).map((criterion, index) => ({
                        id: `${newRubric.id}-criterion-${index}`,
                        name: criterion.name,
                        score: criterion.score ?? 0,
                        max: criterion.max_score ?? criterion.max,
                      })),
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

      {extensionHelpOpen && <ExtensionHelpModal onClose={() => setExtensionHelpOpen(false)} />}
    </main>
  );
}

function titleFromFirstMessage(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 40) || 'New chat';
}
