import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  storeAuth: vi.fn(),
  signInWithOAuth: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  apiPost: authMocks.apiPost,
  storeAuth: authMocks.storeAuth,
}));

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signInWithOAuth: authMocks.signInWithOAuth } },
}));

import AuthPage from './AuthPage';

describe('AuthPage recoverable errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '#auth';
  });

  it('shows a recoverable message when email login cannot reach the backend', async () => {
    const user = userEvent.setup();
    authMocks.apiPost.mockRejectedValueOnce(new Error('offline'));
    render(<AuthPage />);
    const form = document.querySelector('form')!;

    await user.type(screen.getByLabelText('Email'), 'student@example.test');
    await user.type(screen.getByLabelText('Password'), 'CorrectHorse1');
    await user.click(within(form).getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not connect to the server. Is the backend running?',
    );
  });

  it('shows the backend error instead of silently treating a failed login as success', async () => {
    const user = userEvent.setup();
    authMocks.apiPost.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Invalid email or password.' }),
    });
    render(<AuthPage />);
    const form = document.querySelector('form')!;

    await user.type(screen.getByLabelText('Email'), 'student@example.test');
    await user.type(screen.getByLabelText('Password'), 'WrongPassword1');
    await user.click(within(form).getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(window.location.hash).toBe('#auth');
  });

  it('shows a recoverable message when Google OAuth initiation fails', async () => {
    const user = userEvent.setup();
    authMocks.signInWithOAuth.mockResolvedValueOnce({
      error: { message: 'provider unavailable' },
    });
    render(<AuthPage />);

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not start Google sign-in. Please try again.',
    );
  });

  it('keeps password visibility controls in the keyboard tab order', async () => {
    const user = userEvent.setup();
    render(<AuthPage />);

    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('tabindex', '0');
    await user.click(screen.getByRole('tab', { name: 'Create account' }));
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('tabindex', '0');
  });
});
