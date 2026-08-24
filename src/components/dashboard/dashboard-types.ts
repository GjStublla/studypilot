import type { ComponentType, MouseEvent, ReactNode, SVGProps } from 'react';
import { BookOpen, Home, ListTodo, MessageCircle, ScrollText, Settings as SettingsIcon } from 'lucide-react';
import type { ActionItem, FileSearchStatus, Rubric, Session, TranscriptLine } from '../../lib/dashboard-types';
import type { ChatViewMessage } from '../../lib/dashboard-chat-state';
import type { DashboardChat, GroundingCitation } from '../../lib/studypilot-types';

export type View = 'home' | 'chat' | 'sessions' | 'session-detail' | 'rubrics' | 'action-items' | 'settings';

export type Theme = 'dark' | 'light';

export type DashboardStudent = {
  name: string;
  initials: string;
  email: string;
};

export type DashboardAiUsage = {
  used: number;
  limit: number;
};

export type DashboardRequestState =
  { status: 'idle' } | { status: 'loading' } | { status: 'success' } | { status: 'error'; message?: string };

export type DashboardBootstrapState = DashboardRequestState;

export type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

export const SETTINGS_COACH_MODES = [
  { id: 'essay', label: 'Essay coach' },
  { id: 'lecture', label: 'Lecture' },
  { id: 'reader', label: 'Research reader' },
] as const;

export type CoachMode = (typeof SETTINGS_COACH_MODES)[number]['id'];

export const SCORE_DOT_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

export const SIDEBAR_NAV_ITEMS: {
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

export const VIEW_TITLES: Record<View, { eyebrow: string; title: string }> = {
  home: { eyebrow: 'Today', title: 'Home' },
  chat: { eyebrow: 'Coach', title: 'Chat' },
  sessions: { eyebrow: 'Memory', title: 'Sessions' },
  'session-detail': { eyebrow: 'Memory', title: 'Session' },
  rubrics: { eyebrow: 'Library', title: 'Rubrics' },
  'action-items': { eyebrow: 'Followups', title: 'Action items' },
  settings: { eyebrow: 'Account', title: 'Settings' },
};

export type DashboardRubric = Rubric;
export type DashboardSession = Session;
export type DashboardActionItem = ActionItem;

export type SessionRow = {
  session: Session;
  rubric?: Rubric;
  openCount: number;
};

export interface SidebarProps {
  student: DashboardStudent;
  view: View;
  setView: (view: View) => void;
  openCount: number;
  sessionsCount: number;
  rubricsCount: number;
  onOpenExtension: () => void;
}

export interface TopBarProps {
  view: View;
  theme: Theme;
  contextOpen: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onToggleSidebar: () => void;
  onToggleContext: () => void;
  onToggleTheme: () => void;
}

export interface HomeViewProps {
  student: DashboardStudent;
  activeRubric: Rubric | undefined;
  latestSession: Session | undefined;
  latestSessionOpenCount: number;
  openActionItems: ActionItem[];
  sessionsById: Map<string, Session>;
  recentActivity: Array<{ id: string; time: string; title: string }>;
  onContinueInChat: () => void;
  onOpenSession: (id: string) => void;
  onToggleAction: (id: string) => void;
  onGoTo: (view: View) => void;
}

export interface ActionItemsViewProps {
  open: ActionItem[];
  done: ActionItem[];
  sessionsById: ReadonlyMap<string, Session>;
  rubricsById: ReadonlyMap<string, Rubric>;
  query: string;
  onToggle: (id: string) => void;
  onOpenSession: (id: string) => void;
}

export interface SettingsViewProps {
  student: DashboardStudent;
  theme: Theme;
  coachMode: CoachMode;
  aiUsage: DashboardAiUsage | null;
  onSetCoachMode: (mode: CoachMode) => void;
  onSignOut: () => void;
  onSetTheme: (theme: Theme) => void;
}

export interface SessionsViewProps {
  rows: SessionRow[];
  query: string;
  onOpenSession: (id: string) => void;
  onContinueInChat: (id: string) => void;
}

export interface ContextPanelProps {
  view: View;
  activeRubric: Rubric | undefined;
  chatSession: Session | undefined;
  selectedSession: Session | undefined;
  openActionItemCount: number;
  aiUsage: DashboardAiUsage | null;
  onGoTo: (view: View) => void;
  onContinueInChat: () => void;
  onOpenExtension: () => void;
}

export interface SessionDetailViewProps {
  session: Session | undefined;
  rubric: Rubric | undefined;
  actionItems: ActionItem[];
  transcript: TranscriptLine[];
  transcriptLoading: boolean;
  transcriptError?: string | null;
  onToggleAction: (id: string) => void;
  onBack: () => void;
  onContinueInChat: () => void;
  onRetryTranscript?: () => void;
}

export interface FileSearchStatusBadgeProps {
  status: string;
  error?: string | null;
  onRetry?: () => void;
}

export interface DsButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}

export interface ScoreDotsProps {
  score: number;
  max: number;
}

export interface TodoRowProps {
  item: ActionItem;
  onToggle: () => void;
  sessionTitle?: string;
}

export interface EmptyStateProps {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}

export interface StudyPilotMarkProps {
  size?: number;
}

export interface RubricsViewProps {
  rubrics: Rubric[];
  activeRubricId: string;
  query: string;
  rubricIndexRequestStates?: Readonly<Record<string, DashboardRequestState>>;
  onSetActive: (id: string) => void;
  onAskAbout: (id: string) => void;
  onRetryIndex?: (id: string) => void;
  onRubricUploaded: (rubric: UploadedRubric) => void;
}

export type UploadedRubric = {
  id: string;
  title: string;
  course: string;
  uploaded_at: string;
  active: boolean;
  sessions_count: number;
  knowledgeDocumentId: string | null;
  knowledge_document_id: string | null;
  file_search_status?: FileSearchStatus;
  fileSearchStatus?: FileSearchStatus;
  criteria: Array<{ name: string; score: number; max_score: number; max: number }>;
};

export interface UploadRubricModalProps {
  onClose: () => void;
  onUploaded: (rubric: UploadedRubric) => void;
}

export interface ChatViewProps {
  student: DashboardStudent;
  activeRubric: Rubric | undefined;
  rubricRemoved?: boolean;
  session: Session | undefined;
  chats: DashboardChat[];
  rubricsById: ReadonlyMap<string, Rubric>;
  activeChatId: string | null;
  messages: ChatViewMessage[];
  historyLoading: boolean;
  activeChatBusy: boolean;
  draftCreating: boolean;
  aiUsage: DashboardAiUsage | null;
  rubricIndexRequestStates?: Readonly<Record<string, DashboardRequestState>>;
  onOpenSession: () => void;
  onSelectChat: (chatId: string) => void;
  onStartNewChat: () => void;
  onRenameChat: (chatId: string, title: string) => void;
  onDeleteChat: (chatId: string) => void;
  onSendMessage: (text: string, sessionId?: string | null) => boolean;
  onRetryIndex?: (rubricId: string) => void;
}

export interface ChatListRowProps {
  chat: DashboardChat;
  active: boolean;
  rubricTitle?: string;
  onSelect: (chatId: string) => void;
  onRename: (chatId: string, title: string) => void;
  onDelete: (chatId: string) => void;
}

export interface MessageBubbleProps {
  message: ChatViewMessage;
  student: DashboardStudent;
  thinking?: boolean;
}

export interface CitationItemProps {
  citation: GroundingCitation;
  index: number;
}

export interface ExtensionHelpModalProps {
  onClose: () => void;
}

export interface DashboardProps {
  routeHash?: string;
}
