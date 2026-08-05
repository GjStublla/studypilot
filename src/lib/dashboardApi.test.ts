import { describe, expect, it, vi, beforeEach } from 'vitest';
import { activateRubric } from './dashboardApi';
import { apiFetch } from './api';

vi.mock('./api', () => ({
  apiFetch: vi.fn(),
}));

describe('dashboardApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('activates a rubric through the FastAPI endpoint', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ok: true } as Response);

    await activateRubric('rubric-123');

    expect(apiFetch).toHaveBeenCalledWith('/rubrics/rubric-123/active', { method: 'PATCH' });
  });
});
