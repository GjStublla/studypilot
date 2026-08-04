const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DashboardRoute {
  isDashboard: boolean;
  chatId: string | null;
}

export function parseDashboardRoute(hash: string): DashboardRoute {
  const [path, query = ''] = hash.split('?', 2);
  if (path !== '#dashboard') return { isDashboard: false, chatId: null };
  const value = new URLSearchParams(query).get('chat');
  return {
    isDashboard: true,
    chatId: value && UUID_PATTERN.test(value) ? value : null,
  };
}

export function formatDashboardRoute(chatId?: string | null): string {
  return chatId ? `#dashboard?chat=${encodeURIComponent(chatId)}` : '#dashboard';
}
