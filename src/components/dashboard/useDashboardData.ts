import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { AUTH_REQUIRED } from '../../lib/authConfig';
import { apiFetch } from '../../lib/api';
import { fetchActionItems, fetchRubrics, fetchSessionTranscript, fetchSessions } from '../../lib/dashboardApi';
import type { ActionItem, Rubric, Session, TranscriptLine } from '../../lib/dashboard-types';
import { getAiUsage, getDashboardChatMessages, getDashboardChats, type AiUsage } from '../../lib/studypilot-api';
import type { DashboardChat } from '../../lib/studypilot-types';
import { useStudyPilotRealtime } from '../../lib/useRealtime';
import {
  dashboardChatReducer,
  type DashboardChatAction,
  type DashboardChatState,
} from '../../lib/dashboard-chat-state';
import { normalizeIndexStatus } from '../../lib/chat-rubric-context';
import type {
  DashboardBootstrapState,
  DashboardRequestState,
  DashboardStudent,
  CoachMode,
  Theme,
} from './dashboard-types';
import { supabase } from '../../lib/supabaseClient';

const THEME_STORAGE_KEY = 'studypilot.dashboard-theme';

export type DashboardDataOptions = {
  initialStudent: DashboardStudent;
  selectedSessionId: string;
  replaceChatRoute: (chatId?: string | null) => void;
  setActiveRubricId: Dispatch<SetStateAction<string>>;
  setCoachMode: Dispatch<SetStateAction<CoachMode>>;
  setTheme: Dispatch<SetStateAction<Theme>>;
};

export type DashboardData = {
  sessions: Session[];
  setSessions: Dispatch<SetStateAction<Session[]>>;
  rubrics: Rubric[];
  setRubrics: Dispatch<SetStateAction<Rubric[]>>;
  actionItems: ActionItem[];
  setActionItems: Dispatch<SetStateAction<ActionItem[]>>;
  chats: DashboardChat[];
  setChats: Dispatch<SetStateAction<DashboardChat[]>>;
  activeChatId: string | null;
  setActiveChatId: Dispatch<SetStateAction<string | null>>;
  chatState: DashboardChatState;
  dispatchChat: Dispatch<DashboardChatAction>;
  draftCreating: boolean;
  setDraftCreating: Dispatch<SetStateAction<boolean>>;
  chatRequestState: DashboardRequestState;
  transcripts: Record<string, TranscriptLine[]>;
  setTranscripts: Dispatch<SetStateAction<Record<string, TranscriptLine[]>>>;
  transcriptStates: Record<string, DashboardRequestState>;
  setTranscriptStates: Dispatch<SetStateAction<Record<string, DashboardRequestState>>>;
  rubricIndexRequestStates: Record<string, DashboardRequestState>;
  setRubricIndexRequestStates: Dispatch<SetStateAction<Record<string, DashboardRequestState>>>;
  bootstrapState: DashboardBootstrapState;
  aiUsage: AiUsage | null;
  student: DashboardStudent;
  chatsRef: MutableRefObject<DashboardChat[]>;
  activeChatIdRef: MutableRefObject<string | null>;
  chatLoadVersionsRef: MutableRefObject<Map<string, number>>;
  rubricIndexRequestVersionsRef: MutableRefObject<Map<string, number>>;
  transcriptRequestVersionsRef: MutableRefObject<Map<string, number>>;
  dashboardMountedRef: MutableRefObject<boolean>;
  inFlightChatIdsRef: MutableRefObject<Set<string>>;
  draftCreatingRef: MutableRefObject<boolean>;
  refreshAiUsage: () => void;
  refreshChats: () => Promise<DashboardChat[]>;
  loadChatMessages: (chatId: string) => Promise<void>;
  invalidateChat: (chatId: string) => void;
};

export function useDashboardData({
  initialStudent,
  selectedSessionId,
  replaceChatRoute,
  setActiveRubricId,
  setCoachMode,
  setTheme,
}: DashboardDataOptions): DashboardData {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [chats, setChats] = useState<DashboardChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatState, dispatchChat] = useReducer(dashboardChatReducer, {});
  const [draftCreating, setDraftCreating] = useState(false);
  const [chatRequestState, setChatRequestState] = useState<DashboardRequestState>({ status: 'idle' });
  const [transcripts, setTranscripts] = useState<Record<string, TranscriptLine[]>>({});
  const [transcriptStates, setTranscriptStates] = useState<Record<string, DashboardRequestState>>({});
  const [rubricIndexRequestStates, setRubricIndexRequestStates] = useState<Record<string, DashboardRequestState>>({});
  const [bootstrapState, setBootstrapState] = useState<DashboardBootstrapState>({ status: 'loading' });
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [student, setStudent] = useState<DashboardStudent>(initialStudent);
  const [userId, setUserId] = useState<string | null>(null);

  const chatsRef = useRef<DashboardChat[]>([]);
  const activeChatIdRef = useRef<string | null>(null);
  const chatListVersionRef = useRef(0);
  const hasLoadedChatsRef = useRef(false);
  const chatLoadVersionsRef = useRef(new Map<string, number>());
  const rubricIndexRequestVersionsRef = useRef(new Map<string, number>());
  const transcriptRequestVersionsRef = useRef(new Map<string, number>());
  const dashboardMountedRef = useRef(true);
  const inFlightChatIdsRef = useRef(new Set<string>());
  const draftCreatingRef = useRef(false);

  useEffect(() => {
    const transcriptRequestVersions = transcriptRequestVersionsRef.current;
    dashboardMountedRef.current = true;
    return () => {
      dashboardMountedRef.current = false;
      transcriptRequestVersions.clear();
    };
  }, []);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  const refreshAiUsage = useCallback(() => {
    if (!AUTH_REQUIRED) return;
    getAiUsage()
      .then((usage) => {
        if (dashboardMountedRef.current) setAiUsage(usage);
      })
      .catch(() => {
        // The migration may not be deployed yet; usage UI is optional in that case.
      });
  }, []);

  const refreshChats = useCallback(async (): Promise<DashboardChat[]> => {
    const version = ++chatListVersionRef.current;
    if (dashboardMountedRef.current) setChatRequestState({ status: 'loading' });

    try {
      const rows = await getDashboardChats();
      if (!dashboardMountedRef.current || version !== chatListVersionRef.current) return chatsRef.current;

      const firstLoad = !hasLoadedChatsRef.current;
      hasLoadedChatsRef.current = true;
      setChats(rows);
      setChatRequestState({ status: 'success' });
      const current = activeChatIdRef.current;
      const next =
        firstLoad && current === null
          ? (rows[0]?.id ?? null)
          : current && !rows.some((chat) => chat.id === current)
            ? (rows[0]?.id ?? null)
            : current;
      activeChatIdRef.current = next;
      setActiveChatId(next);
      if (!firstLoad && current && current !== next) replaceChatRoute(next);
      return rows;
    } catch (error) {
      if (dashboardMountedRef.current && version === chatListVersionRef.current) {
        setChatRequestState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Could not load chats',
        });
      }
      throw error;
    }
  }, [replaceChatRoute]);

  const loadChatMessages = useCallback(async (chatId: string): Promise<void> => {
    if (!dashboardMountedRef.current) return;
    const version = (chatLoadVersionsRef.current.get(chatId) ?? 0) + 1;
    chatLoadVersionsRef.current.set(chatId, version);
    dispatchChat({ type: 'load-started', chatId, version });
    try {
      const rows = await getDashboardChatMessages(chatId);
      if (!dashboardMountedRef.current) return;
      dispatchChat({ type: 'load-succeeded', chatId, version, rows });
    } catch (error) {
      if (!dashboardMountedRef.current) return;
      console.error('Failed to load dashboard chat messages:', error);
      dispatchChat({ type: 'load-failed', chatId, version });
    }
  }, []);

  const invalidateChat = useCallback(
    (chatId: string) => {
      dispatchChat({ type: 'invalidate', chatId });
      if (activeChatIdRef.current === chatId) void loadChatMessages(chatId);
    },
    [loadChatMessages],
  );

  useEffect(() => {
    const storedId = localStorage.getItem('sp_user_id');
    if (storedId) {
      setUserId(storedId);
      return;
    }
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (dashboardMountedRef.current && session?.user?.id) setUserId(session.user.id);
      })
      .catch(() => {
        /* not fatal */
      });
  }, []);

  useStudyPilotRealtime(userId, {
    onNewSession: () => {
      void fetchSessions()
        .then((rows) => {
          if (dashboardMountedRef.current) setSessions(rows);
        })
        .catch(() => undefined);
    },
    onSessionChanged: () => {
      void fetchSessions()
        .then((rows) => {
          if (dashboardMountedRef.current) setSessions(rows);
        })
        .catch(() => undefined);
    },
    onSessionMessageChanged: (payload) => {
      const sessionId = (payload.new as Record<string, unknown>).session_id;
      if (typeof sessionId !== 'string') return;
      void fetchSessionTranscript(sessionId)
        .then((lines) => {
          if (!dashboardMountedRef.current) return;
          setTranscripts((current) => ({ ...current, [sessionId]: lines }));
          setTranscriptStates((current) => ({ ...current, [sessionId]: { status: 'success' } }));
        })
        .catch((error) => {
          if (!dashboardMountedRef.current) return;
          setTranscriptStates((current) => ({
            ...current,
            [sessionId]: {
              status: 'error',
              message: error instanceof Error ? error.message : 'Transcript unavailable',
            },
          }));
        });
    },
    onDocumentUpdated: (doc) => {
      if (!dashboardMountedRef.current || !doc.rubric_id) return;
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
            : r,
        ),
      );
    },
    onActionItemChanged: (payload) => {
      if (!dashboardMountedRef.current) return;
      if (payload.eventType === 'INSERT') {
        setActionItems((prev) => [payload.new as ActionItem, ...prev]);
      } else if (payload.eventType === 'UPDATE') {
        setActionItems((prev) =>
          prev.map((item) =>
            item.id === (payload.new as Record<string, unknown>).id ? (payload.new as ActionItem) : item,
          ),
        );
      } else if (payload.eventType === 'DELETE') {
        const deletedId = (payload.old as Record<string, unknown>).id;
        setActionItems((prev) => prev.filter((item) => item.id !== deletedId));
      }
    },
    onRubricChanged: (payload) => {
      if (!dashboardMountedRef.current) return;
      if (payload.eventType === 'INSERT') {
        setRubrics((prev) => [payload.new as Rubric, ...prev]);
      } else if (payload.eventType === 'UPDATE') {
        setRubrics((prev) =>
          prev.map((r) => (r.id === (payload.new as Record<string, unknown>).id ? (payload.new as Rubric) : r)),
        );
      } else if (payload.eventType === 'DELETE') {
        const deletedId = (payload.old as Record<string, unknown>).id;
        setRubrics((prev) => prev.filter((r) => r.id !== deletedId));
      }
    },
    onDashboardChatChanged: () => {
      if (!dashboardMountedRef.current) return;
      void refreshChats().catch(() => undefined);
    },
    onDashboardChatMessageChanged: (payload) => {
      if (!dashboardMountedRef.current) return;
      const chatId = (payload.new as Record<string, unknown>).chat_id;
      if (typeof chatId === 'string') invalidateChat(chatId);
    },
    onSubscribed: () => {
      if (!dashboardMountedRef.current) return;
      void refreshChats().catch(() => undefined);
      const activeId = activeChatIdRef.current;
      if (activeId) void loadChatMessages(activeId);
    },
  });

  useEffect(() => {
    let cancelled = false;
    apiFetch('/users/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((profile) => {
        if (cancelled || !profile) return;
        setStudent({ name: profile.name, email: profile.email, initials: profile.initials });
        if (profile.default_coach_mode) {
          setCoachMode(profile.default_coach_mode as CoachMode);
        }
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
  }, [setCoachMode, setTheme]);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchSessions(), fetchRubrics(), fetchActionItems(), refreshChats()])
      .then(([s, r, a]) => {
        if (cancelled) return;
        if (s.status === 'fulfilled') setSessions(s.value);
        if (r.status === 'fulfilled') {
          setRubrics(r.value);
          const active = r.value.find((x) => x.active) ?? r.value[0];
          if (active) setActiveRubricId((prev) => prev || active.id);
        }
        if (a.status === 'fulfilled') setActionItems(a.value);
        const fatalLoadError =
          AUTH_REQUIRED && s.status === 'rejected' && r.status === 'rejected' && a.status === 'rejected';
        setBootstrapState({ status: fatalLoadError ? 'error' : 'success' });
      })
      .catch(() => {
        if (!cancelled) setBootstrapState({ status: 'success' });
      });
    return () => {
      cancelled = true;
    };
  }, [refreshChats, setActiveRubricId]);

  useEffect(() => {
    refreshAiUsage();
  }, [refreshAiUsage]);

  useEffect(() => {
    let refreshPending = false;
    const refreshCanonicalState = () => {
      if (document.visibilityState === 'hidden' || refreshPending) return;
      refreshPending = true;
      const activeId = activeChatIdRef.current;
      void Promise.allSettled([
        refreshChats(),
        activeId ? loadChatMessages(activeId) : Promise.resolve(),
        fetchSessions().then((rows) => {
          if (dashboardMountedRef.current) setSessions(rows);
        }),
        selectedSessionId
          ? fetchSessionTranscript(selectedSessionId).then((lines) => {
              if (!dashboardMountedRef.current) return;
              setTranscripts((current) => ({ ...current, [selectedSessionId]: lines }));
              setTranscriptStates((current) => ({ ...current, [selectedSessionId]: { status: 'success' } }));
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

  return {
    sessions,
    setSessions,
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
    chatLoadVersionsRef,
    rubricIndexRequestVersionsRef,
    transcriptRequestVersionsRef,
    dashboardMountedRef,
    inFlightChatIdsRef,
    draftCreatingRef,
    refreshAiUsage,
    refreshChats,
    loadChatMessages,
    invalidateChat,
  };
}
