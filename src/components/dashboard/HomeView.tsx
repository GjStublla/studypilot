import { memo, useMemo } from 'react';
import { ArrowRight, BookOpen, Chrome, ChevronRight } from 'lucide-react';
import { DsButton, EmptyState, ScoreDots, TodoRow } from './DashboardPrimitives';
import type { HomeViewProps } from './dashboard-types';

const homeDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export const HomeView = memo(function HomeView({
  student,
  activeRubric,
  latestSession,
  latestSessionOpenCount,
  openActionItems,
  sessionsById,
  recentActivity,
  onContinueInChat,
  onOpenSession,
  onToggleAction,
  onGoTo,
}: HomeViewProps) {
  const todayLabel = useMemo(() => homeDateFormatter.format(new Date()), []);
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return 'Still up,';
    if (h < 12) return 'Good morning,';
    if (h < 18) return 'Good afternoon,';
    return 'Good evening,';
  }, []);

  return (
    <div className="ds-view ds-view-home">
      <header className="ds-hero">
        <p className="ds-eyebrow">{todayLabel}</p>
        <h2 className="ds-display">
          {greeting} <i>{student.name}</i>.
        </h2>
        <p className="ds-lede">
          {openActionItems.length > 0
            ? `${openActionItems.length} open action ${openActionItems.length === 1 ? 'item' : 'items'} waiting. Pick up where the extension left off.`
            : 'Your coaching memory lives here. Import a session from the extension to get started.'}
        </p>
      </header>

      <section className="ds-row ds-row-2">
        {/* Latest imported session */}
        {latestSession ? (
          <article className="ds-card ds-card-primary">
            <div className="ds-card-eyebrow">
              <span className="ds-dot ds-dot-cyan" aria-hidden="true" />
              <span>Imported from Chrome extension · {latestSession.when}</span>
            </div>
            <h3 className="ds-card-title">{latestSession.title}</h3>
            <p className="ds-card-summary">{latestSession.summary}</p>

            <dl className="ds-meta-row">
              <div>
                <dt>Mode</dt>
                <dd>{latestSession.mode}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{latestSession.duration}</dd>
              </div>
              <div>
                <dt>Rubric</dt>
                <dd>{activeRubric ? activeRubric.title.replace(' Rubric', '') : '—'}</dd>
              </div>
              <div>
                <dt>Open items</dt>
                <dd>{latestSessionOpenCount}</dd>
              </div>
            </dl>

            <div className="ds-card-actions">
              <DsButton variant="primary" onClick={onContinueInChat}>
                Continue in chat <ArrowRight size={13} strokeWidth={1.7} />
              </DsButton>
              <DsButton variant="ghost" onClick={() => onOpenSession(latestSession.id)}>
                View transcript
              </DsButton>
            </div>
          </article>
        ) : (
          <article className="ds-card ds-card-primary">
            <div className="ds-card-eyebrow">
              <span className="ds-dot ds-dot-cyan" aria-hidden="true" />
              <span>No sessions yet</span>
            </div>
            <h3 className="ds-card-title">Import your first session</h3>
            <EmptyState
              title="Nothing here yet."
              body="Run a coaching session in the Chrome extension and it'll show up here with its transcript and action items."
            />
          </article>
        )}

        {/* Active rubric */}
        <article className="ds-card">
          <div className="ds-card-eyebrow">
            <span>Active rubric</span>
          </div>
          {activeRubric ? (
            <>
              <h3 className="ds-card-title ds-card-title-sm">{activeRubric.title}</h3>
              <p className="ds-card-sub">{activeRubric.course}</p>

              <ul className="ds-criteria">
                {activeRubric.criteria?.map((c) => (
                  <li key={c.name}>
                    <span>{c.name}</span>
                    <ScoreDots score={c.score ?? 0} max={c.max ?? 4} />
                  </li>
                )) || []}
              </ul>

              <div className="ds-card-actions">
                <DsButton variant="ghost" onClick={() => onGoTo('rubrics')}>
                  All rubrics <ChevronRight size={13} strokeWidth={1.7} />
                </DsButton>
              </div>
            </>
          ) : (
            <EmptyState
              title="No rubric yet."
              body="Upload a rubric to anchor your coaching feedback."
            />
          )}
        </article>
      </section>

      <section className="ds-row ds-row-2-1">
        {/* Open action items */}
        <article className="ds-card">
          <div className="ds-card-eyebrow ds-card-eyebrow-row">
            <span>Open action items</span>
            <button type="button" className="ds-link" onClick={() => onGoTo('action-items')}>
              All <ChevronRight size={12} strokeWidth={1.7} />
            </button>
          </div>

          {openActionItems.length === 0 ? (
            <EmptyState
              title="All clear."
              body="New action items from your next coaching session will land here."
            />
          ) : (
            <ul className="ds-todo">
              {openActionItems.map((a) => (
                <TodoRow
                  key={a.id}
                  item={a}
                  onToggle={() => onToggleAction(a.id)}
                  sessionTitle={a.sessionId ? sessionsById.get(a.sessionId)?.title : undefined}
                />
              ))}
            </ul>
          )}
        </article>

        {/* Recent activity */}
        <article className="ds-card">
          <div className="ds-card-eyebrow">
            <span>Recent activity</span>
          </div>
          {recentActivity.length === 0 ? (
            <EmptyState
              title="No activity yet."
              body="Imported coaching sessions will show up here."
            />
          ) : (
            <ul className="ds-activity">
              {recentActivity.map((a) => (
                <li key={a.id}>
                  <span className="ds-activity-time">{a.time}</span>
                  <span>
                    Session imported · <b>{a.title}</b>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
});
