import { memo, useState } from 'react';
import { Check } from 'lucide-react';
import { DsButton } from './DashboardPrimitives';
import { SETTINGS_COACH_MODES, type SettingsViewProps } from './dashboard-types';

export const SettingsView = memo(function SettingsView({
  student,
  theme,
  coachMode,
  aiUsage,
  savedNotice,
  onSetCoachMode,
  onSignOut,
  onDeleteAllData,
  onDeleteAccount,
  onSetTheme,
}: SettingsViewProps) {
  const [pending, setPending] = useState<'data' | 'account' | null>(null);
  const [busy, setBusy] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [deletionSuccess, setDeletionSuccess] = useState<string | null>(null);

  async function confirmDeletion(kind: 'data' | 'account') {
    if (busy) return;
    if (pending !== kind) {
      setPending(kind);
      setDeletionError(null);
      setDeletionSuccess(null);
      return;
    }
    setBusy(true);
    setDeletionError(null);
    setDeletionSuccess(null);
    try {
      if (kind === 'data') {
        await onDeleteAllData();
        setDeletionSuccess('All saved data was permanently deleted.');
      } else {
        await onDeleteAccount();
      }
      setPending(null);
    } catch (error) {
      setDeletionError(error instanceof Error ? error.message : 'Deletion could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ds-view ds-view-settings">
      <header className="ds-view-head">
        <div>
          <h2 className="ds-h2">Settings</h2>
          <p className="ds-lede">A short list, kept short on purpose.</p>
        </div>
        {savedNotice && (
          <span className="ds-save-notice" aria-live="polite">
            <Check size={13} strokeWidth={2.4} />
            {savedNotice}
          </span>
        )}
      </header>

      <div className="ds-stack ds-stack-tight">
        <article className="ds-card">
          <div className="ds-card-eyebrow">
            <span>Account</span>
          </div>
          <div className="ds-settings-row">
            <span className="ds-account-avatar ds-account-avatar-lg" aria-hidden="true">
              {student.initials}
            </span>
            <div className="ds-account-body">
              <b>{student.name}</b>
              <em>{student.email}</em>
              {aiUsage && (
                <em>
                  AI usage today: {aiUsage.used} of {aiUsage.limit} requests · resets midnight UTC
                </em>
              )}
            </div>
            <DsButton variant="ghost" onClick={onSignOut}>
              Sign out
            </DsButton>
          </div>
        </article>

        <article className="ds-card">
          <div className="ds-card-eyebrow">
            <span>Default coach mode</span>
          </div>
          <p className="ds-card-sub">What StudyPilot opens with in a new tab. Each session can still switch modes.</p>
          <div className="ds-segment" role="radiogroup">
            {SETTINGS_COACH_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={coachMode === m.id}
                className={`ds-segment-btn ${coachMode === m.id ? 'is-active' : ''}`}
                onClick={() => onSetCoachMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </article>

        <article className="ds-card">
          <div className="ds-card-eyebrow">
            <span>Appearance</span>
          </div>
          <p className="ds-card-sub">Customize the dashboard look. Toggling updates the colors instantly.</p>
          <div className="ds-segment" role="radiogroup">
            <button
              type="button"
              role="radio"
              aria-checked={theme === 'dark'}
              className={`ds-segment-btn ${theme === 'dark' ? 'is-active' : ''}`}
              onClick={() => onSetTheme('dark')}
            >
              Dark mode
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={theme === 'light'}
              className={`ds-segment-btn ${theme === 'light' ? 'is-active' : ''}`}
              onClick={() => onSetTheme('light')}
            >
              Light mode
            </button>
          </div>
        </article>

        <article className="ds-card">
          <div className="ds-card-eyebrow">
            <span>Privacy</span>
          </div>
          <p className="ds-prose">
            Live microphone audio is processed by Google Vertex AI while a session is active. Screenshots are sent only
            when you enable them. AI chats may be retained for conversation continuity; "Save to dashboard" controls
            session and capture syncing.
          </p>
          <p className="ds-prose ds-prose-quiet">Session and capture syncing is controlled by a single toggle.</p>
        </article>

        <article className="ds-card">
          <div className="ds-card-eyebrow">
            <span>Data retention</span>
          </div>
          <p className="ds-prose">
            Imported sessions and completed action items are kept until you delete them.
          </p>
        </article>

        <article className="ds-card">
          <div className="ds-card-eyebrow"><span>Danger zone</span></div>
          <p className="ds-prose">Deletion is permanent. This removes your saved sessions, transcripts, action items, rubrics, captures, chats, and indexed documents.</p>
          {deletionError ? <p className="ds-prose" role="alert">{deletionError}</p> : null}
          {deletionSuccess ? <p className="ds-prose" role="status">{deletionSuccess}</p> : null}
          <div className="ds-settings-actions">
            <DsButton variant="ghost" disabled={busy} onClick={() => void confirmDeletion('data')}>
              {busy && pending === 'data' ? 'Deleting...' : pending === 'data' ? 'Confirm delete all data' : 'Delete all data'}
            </DsButton>
            <DsButton variant="ghost" disabled={busy} onClick={() => void confirmDeletion('account')}>
              {busy && pending === 'account' ? 'Deleting...' : pending === 'account' ? 'Confirm delete account' : 'Delete account'}
            </DsButton>
          </div>
          {pending ? <p className="ds-card-sub">Click the same action again to permanently confirm deletion.</p> : null}
        </article>
      </div>
    </div>
  );
});
