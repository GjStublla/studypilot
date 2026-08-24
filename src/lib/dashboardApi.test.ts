import { describe, expect, it, vi, beforeEach } from 'vitest';
import { activateRubric } from './dashboardApi';
import { apiFetch } from './api';

vi.mock('./api', () => ({
  apiFetch: vi.fn(),
}));

describe('dashboardApi.activateRubric', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the FastAPI rubric CRUD boundary', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      text: async () => '',
    } as Response);

    await activateRubric('rubric-123');

    expect(apiFetch).toHaveBeenCalledWith('/rubrics/rubric-123/active', { method: 'PATCH' });
  });

  it('surfaces a failed activation response', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => '',
    } as Response);

    await expect(activateRubric('rubric-123')).rejects.toThrow('PATCH /rubrics/rubric-123/active failed: 409');
  });
});
