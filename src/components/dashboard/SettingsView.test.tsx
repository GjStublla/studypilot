import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsView } from './SettingsView';

const props = () => ({
  student: { name: 'Alex Student', email: 'alex@example.test', initials: 'AS' },
  theme: 'dark' as const,
  coachMode: 'essay' as const,
  aiUsage: null,
  savedNotice: null,
  onSetCoachMode: vi.fn(),
  onSignOut: vi.fn(),
  onDeleteAllData: vi.fn().mockResolvedValue(undefined),
  onDeleteAccount: vi.fn().mockResolvedValue(undefined),
  onSetTheme: vi.fn(),
});

describe('SettingsView deletion controls', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires a second click before deleting all data', async () => {
    const user = userEvent.setup();
    const viewProps = props();
    render(<SettingsView {...viewProps} />);

    await user.click(screen.getByRole('button', { name: 'Delete all data' }));
    expect(viewProps.onDeleteAllData).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm delete all data' }));
    expect(viewProps.onDeleteAllData).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent('All saved data was permanently deleted.');
  });

  it('requires a second click and reports account deletion failures', async () => {
    const user = userEvent.setup();
    const viewProps = props();
    viewProps.onDeleteAccount.mockRejectedValueOnce(new Error('cleanup unavailable'));
    render(<SettingsView {...viewProps} />);

    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(viewProps.onDeleteAccount).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm delete account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('cleanup unavailable');
  });
});