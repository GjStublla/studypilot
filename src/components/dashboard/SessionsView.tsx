import { memo, useMemo } from 'react';
import { ArrowRight, Chrome } from 'lucide-react';
import { DsButton, EmptyState } from './DashboardPrimitives';
import type { SessionsViewProps } from './dashboard-types';

export const SessionsView = memo(function SessionsView({
  rows,
  query,
  onOpenSession,
  onContinueInChat,
}: SessionsViewProps) {
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? rows.filter(({ session: s, rubric }) =>
            [s.title, s.summary, s.mode, s.source, rubric?.title ?? ''].some((f) => f.toLowerCase().includes(q)),
          )
        : rows,
    [rows, q],
  );

  return (
    <div className="ds-view ds-view-sessions">
      <header className="ds-view-head">
        <div>
          <h2 className="ds-h2">Coaching sessions</h2>
          <p className="ds-lede">
            Every coaching session imported from the extension. Continue any of them in chat — your rubric, transcript,
            and feedback travel with the conversation.
          </p>
        </div>
        <span className="ds-pill ds-pill-quiet">
          <Chrome size={11} strokeWidth={1.8} />
          {rows.length} imported
        </span>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="No sessions yet."
          body="Run a coaching session in the Chrome extension and it'll be imported here automatically."
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches." body={`No sessions match “${query.trim()}”.`} />
      ) : (
        <ul className="ds-session-list">
          {filtered.map(({ session: s, rubric, openCount }) => {
            return (
              <li key={s.id}>
                <article className="ds-session-card">
                  <button type="button" className="ds-session-body" onClick={() => onOpenSession(s.id)}>
                    <div className="ds-card-eyebrow">
                      <span className="ds-dot ds-dot-cyan" aria-hidden="true" />
                      <span>{s.when}</span>
                      <span className="ds-divider" aria-hidden="true" />
                      <span>{s.source}</span>
                      <span className="ds-divider" aria-hidden="true" />
                      <span>{s.mode}</span>
                    </div>
                    <h3 className="ds-card-title">{s.title}</h3>
                    <p className="ds-card-summary">{s.summary}</p>
                    <dl className="ds-meta-row">
                      <div>
                        <dt>Duration</dt>
                        <dd>{s.duration}</dd>
                      </div>
                      <div>
                        <dt>Rubric</dt>
                        <dd>{rubric ? rubric.title.replace(' Rubric', '') : '—'}</dd>
                      </div>
                      <div>
                        <dt>Open items</dt>
                        <dd>{openCount}</dd>
                      </div>
                    </dl>
                  </button>
                  <div className="ds-session-actions">
                    <DsButton variant="primary" onClick={() => onContinueInChat(s.id)}>
                      Continue in chat <ArrowRight size={13} strokeWidth={1.7} />
                    </DsButton>
                    <DsButton variant="ghost" onClick={() => onOpenSession(s.id)}>
                      View transcript
                    </DsButton>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});
