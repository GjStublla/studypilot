import { memo, useEffect, useState } from 'react';
import { ArrowRight, ChevronRight, Sparkles } from 'lucide-react';
import { createSessionCaptureSignedUrl } from '../../lib/studypilot-api';
import { DsButton, EmptyState, ScoreDots, TodoRow } from './DashboardPrimitives';
import type { SessionDetailViewProps } from './dashboard-types';

const SESSION_DETAIL_PROMPTS = [
  'Show me the strongest revision opportunity.',
  'Convert this session into a checklist.',
  'Ask me Socratic questions about my thesis.',
] as const;

export const SessionDetailView = memo(function SessionDetailView({
  session,
  rubric,
  actionItems,
  transcript,
  transcriptLoading,
  transcriptError,
  onToggleAction,
  onBack,
  onContinueInChat,
  onRetryTranscript,
}: SessionDetailViewProps) {
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setScreenshotUrl(null);
    setScreenshotError(false);

    if (!session?.screenshotPath)
      return () => {
        cancelled = true;
      };

    createSessionCaptureSignedUrl(session.screenshotPath)
      .then((url) => {
        if (!cancelled) setScreenshotUrl(url);
      })
      .catch(() => {
        if (!cancelled) setScreenshotError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.id, session?.screenshotPath]);

  if (!session) {
    return (
      <div className="ds-view ds-view-session">
        <button type="button" className="ds-back" onClick={onBack}>
          <ChevronRight size={13} strokeWidth={1.7} style={{ transform: 'rotate(180deg)' }} />
          <span>Back to sessions</span>
        </button>
        <EmptyState title="Session not found." body="It may have been removed. Head back to your sessions." />
      </div>
    );
  }

  return (
    <div className="ds-view ds-view-session">
      <button type="button" className="ds-back" onClick={onBack}>
        <ChevronRight size={13} strokeWidth={1.7} style={{ transform: 'rotate(180deg)' }} />
        <span>Back to sessions</span>
      </button>

      <header className="ds-view-head ds-view-head-stack">
        <div className="ds-card-eyebrow">
          <span className="ds-dot ds-dot-cyan" aria-hidden="true" />
          <span>{session.when}</span>
          <span className="ds-divider" aria-hidden="true" />
          <span>{session.source}</span>
          <span className="ds-divider" aria-hidden="true" />
          <span>{session.mode}</span>
          <span className="ds-divider" aria-hidden="true" />
          <span>{session.duration}</span>
        </div>
        <h2 className="ds-h1 ds-serif">{session.title}</h2>
      </header>

      <div className="ds-row ds-row-2-1">
        <div className="ds-stack">
          {session.screenshotPath ? (
            <article className="ds-card ds-screenshot-card">
              <div className="ds-card-eyebrow">
                <span>Screenshot</span>
              </div>
              {screenshotUrl ? (
                <img
                  className="ds-session-screenshot"
                  src={screenshotUrl}
                  alt={`Screenshot captured during ${session.title}`}
                />
              ) : screenshotError ? (
                <EmptyState
                  title="Screenshot unavailable."
                  body="StudyPilot could not create a signed preview for this capture."
                />
              ) : (
                <div className="ds-state ds-state-loading ds-state-inline">
                  <span className="ds-state-spinner" aria-hidden="true" />
                  <p>Loading screenshot...</p>
                </div>
              )}
            </article>
          ) : null}

          <article className="ds-card">
            <div className="ds-card-eyebrow">
              <span>Summary</span>
            </div>
            <p className="ds-prose">{session.summary}</p>
          </article>

          <article className="ds-card">
            <div className="ds-card-eyebrow ds-card-eyebrow-row">
              <span>Transcript preview</span>
              <button type="button" className="ds-link" onClick={onContinueInChat}>
                Continue in chat <ChevronRight size={12} strokeWidth={1.7} />
              </button>
            </div>
            {transcriptLoading ? (
              <div className="ds-state ds-state-loading ds-state-inline">
                <span className="ds-state-spinner" aria-hidden="true" />
                <p>Loading transcript…</p>
              </div>
            ) : transcriptError ? (
              <EmptyState
                title="Transcript unavailable."
                body={transcriptError}
                action={onRetryTranscript ? { label: 'Try again', onClick: onRetryTranscript } : undefined}
              />
            ) : transcript.length === 0 ? (
              <EmptyState title="No transcript." body="This session didn't capture any messages." />
            ) : (
              <ul className="ds-transcript">
                {transcript.map((t) => (
                  <li key={t.id} className={t.who === 'You' ? 'is-you' : 'is-ai'}>
                    <span className="ds-transcript-who">{t.who}</span>
                    <p>{t.text}</p>
                    <time>{t.t}</time>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="ds-card">
            <div className="ds-card-eyebrow">
              <span>Action items from this session</span>
            </div>
            {actionItems.length === 0 ? (
              <EmptyState title="No action items." body="Nothing was flagged in this session." />
            ) : (
              <ul className="ds-todo">
                {actionItems.map((item) => (
                  <TodoRow key={item.id} item={item} onToggle={() => onToggleAction(item.id)} />
                ))}
              </ul>
            )}
          </article>
        </div>

        <div className="ds-stack">
          <article className="ds-card">
            <div className="ds-card-eyebrow">
              <span>Rubric used</span>
            </div>
            {rubric ? (
              <>
                <h4 className="ds-card-title ds-card-title-sm">{rubric.title}</h4>
                <p className="ds-card-sub">{rubric.course}</p>
                <ul className="ds-criteria">
                  {rubric.criteria.map((criterion) => (
                    <li key={criterion.name}>
                      <span>{criterion.name}</span>
                      <ScoreDots score={criterion.score ?? 0} max={criterion.max ?? 4} />
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState title="No rubric." body="This session wasn't linked to a rubric." />
            )}
          </article>

          <article className="ds-card">
            <div className="ds-card-eyebrow">
              <span>Follow-up prompts</span>
            </div>
            <ul className="ds-followups">
              {SESSION_DETAIL_PROMPTS.map((prompt) => (
                <li key={prompt}>
                  <button type="button" onClick={onContinueInChat}>
                    <Sparkles size={11} strokeWidth={1.7} />
                    <span>{prompt}</span>
                    <ArrowRight size={12} strokeWidth={1.7} />
                  </button>
                </li>
              ))}
            </ul>

            <DsButton variant="primary" onClick={onContinueInChat}>
              Continue in chat <ArrowRight size={13} strokeWidth={1.7} />
            </DsButton>
          </article>
        </div>
      </div>
    </div>
  );
});
