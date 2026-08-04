import { describe, expect, it } from 'vitest';
import { formatDashboardRoute, parseDashboardRoute } from './dashboard-route';

const CHAT_ID = '123e4567-e89b-42d3-a456-426614174000';

describe('dashboard chat routes', () => {
  it('round-trips a canonical chat deep link', () => {
    expect(parseDashboardRoute(formatDashboardRoute(CHAT_ID))).toEqual({
      isDashboard: true,
      chatId: CHAT_ID,
    });
  });

  it('does not accept a malformed chat identifier', () => {
    expect(parseDashboardRoute('#dashboard?chat=not-a-uuid')).toEqual({
      isDashboard: true,
      chatId: null,
    });
  });

  it('does not treat another hash route as the dashboard', () => {
    expect(parseDashboardRoute(`#install?chat=${CHAT_ID}`)).toEqual({
      isDashboard: false,
      chatId: null,
    });
  });
});
