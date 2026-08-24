import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './api';

function response(status: number, body: unknown = ''): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiFetch auth and network recovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    window.location.hash = '#dashboard';
  });

  it('redirects to auth and clears tokens when an expired session cannot refresh', async () => {
    localStorage.setItem('sp_access_token', 'expired-access');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(401, { detail: 'expired' })),
    );

    await expect(apiFetch('/sessions')).rejects.toThrow('Session expired. Please log in again.');

    expect(window.location.hash).toBe('#auth');
    expect(localStorage.getItem('sp_access_token')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes once and retries the original request with the new access token', async () => {
    localStorage.setItem('sp_access_token', 'old-access');
    localStorage.setItem('sp_refresh_token', 'refresh-token');
    localStorage.setItem('sp_user_id', 'user-1');
    localStorage.setItem('sp_email', 'student@example.test');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(401, { detail: 'expired' }))
      .mockResolvedValueOnce(
        response(200, {
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          user_id: 'user-1',
          email: 'student@example.test',
        }),
      )
      .mockResolvedValueOnce(response(200, { sessions: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch('/sessions');

    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/auth/refresh');
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer new-access',
    });
    expect(window.location.hash).toBe('#dashboard');
  });

  it('propagates a network failure so the caller can show a recoverable message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network offline');
      }),
    );

    await expect(apiFetch('/sessions')).rejects.toThrow('network offline');
    expect(window.location.hash).toBe('#dashboard');
  });
});
