import { describe, expect, it, vi, beforeEach } from 'vitest';
import { activateRubric } from './dashboardApi';
import { apiFetch } from './api';
import { setActiveRubric } from './studypilot-api';

vi.mock('./api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('./studypilot-api', () => ({
  setActiveRubric: vi.fn(),
}));

describe('dashboardApi.activateRubric', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers the set_active_rubric RPC via setActiveRubric', async () => {
    vi.mocked(setActiveRubric).mockResolvedValue(undefined);

    await activateRubric('rubric-123');

    expect(setActiveRubric).toHaveBeenCalledWith('rubric-123');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('falls back to FastAPI when the RPC fails', async () => {
    vi.mocked(setActiveRubric).mockRejectedValue(new Error('RPC missing'));
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      text: async () => '',
    } as Response);

    await activateRubric('rubric-123');

    expect(setActiveRubric).toHaveBeenCalledWith('rubric-123');
    expect(apiFetch).toHaveBeenCalledWith('/rubrics/rubric-123/active', { method: 'PATCH' });
  });
});
