import type { ComponentType, SVGProps } from 'react';
import { BookOpen, Home, ListTodo, MessageCircle, ScrollText, Settings as SettingsIcon } from 'lucide-react';
import type { ActionItem, Rubric, Session } from '../../lib/dashboardApi';

export type View =
  | 'home'
  | 'chat'
  | 'sessions'
  | 'session-detail'
  | 'rubrics'
  | 'action-items'
  | 'settings';

export type Theme = 'dark' | 'light';

export type DashboardStudent = {
  name: string;
  initials: string;
  email: string;
};

export type DashboardRequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'error'; message?: string };

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
