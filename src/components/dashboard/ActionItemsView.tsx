import { memo, useMemo, useState } from 'react';
import { BookOpen, Check, ScrollText } from 'lucide-react';
import { EmptyState } from './DashboardPrimitives';
import type { ActionItemsViewProps } from './dashboard-types';

export const ActionItemsView = memo(function ActionItemsView({
  open,
  done,
  sessionsById,
  rubricsById,
  query,
  onToggle,
  onOpenSession,
}: ActionItemsViewProps) {
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const q = query.trim().toLowerCase();
  const items = useMemo(() => {
    const base = tab === 'open' ? open : done;
    if (!q) return base;
    return base.filter((a) => {
      const sessionTitle = a.sessionId ? sessionsById.get(a.sessionId)?.title ?? '' : '';
      return [a.text, sessionTitle].some((f) => f.toLowerCase().includes(q));
    });
  }, [tab, open, done, q, sessionsById]);

  return (
    <div className="ds-view ds-view-todo">
      <header className="ds-view-head">
        <div>
          <h2 className="ds-h2">Action items</h2>
          <p className="ds-lede">
            What your coach flagged. Check them off as you revise — they sync back into the
            session they came from.
          </p>
        </div>
        <div className="ds-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'open'}
            className={`ds-tab ${tab === 'open' ? 'is-active' : ''}`}
            onClick={() => setTab('open')}
          >
            Open <em>{open.length}</em>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'done'}
            className={`ds-tab ${tab === 'done' ? 'is-active' : ''}`}
            onClick={() => setTab('done')}
          >
            Done <em>{done.length}</em>
          </button>
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title={q ? 'No matches.' : tab === 'open' ? 'All clear.' : 'Nothing completed yet.'}
          body={
            q
              ? `No ${tab} action items match “${query.trim()}”.`
              : tab === 'open'
                ? 'New action items from your next coaching session will land here.'
                : 'Check items off as you revise and they’ll show up here.'
          }
        />
      ) : (
        <ul className="ds-todo ds-todo-detailed">
          {items.map((a) => {
            const session = a.sessionId ? sessionsById.get(a.sessionId) : undefined;
            const rubric = a.rubricId ? rubricsById.get(a.rubricId) : undefined;
            return (
              <li key={a.id} className={a.done ? 'is-done' : ''}>
                <button
                  type="button"
                  className={`ds-check ${a.done ? 'is-checked' : ''}`}
                  onClick={() => onToggle(a.id)}
                  aria-pressed={a.done}
                  aria-label={a.done ? 'Mark as not done' : 'Mark as done'}
                >
                  {a.done && <Check size={11} strokeWidth={2.4} />}
                </button>
                <div className="ds-todo-body">
                  <p>{a.text}</p>
                  <div className="ds-todo-meta">
                    {session && (
                      <button
                        type="button"
                        className="ds-todo-source"
                        onClick={() => onOpenSession(session.id)}
                      >
                        <ScrollText size={10} strokeWidth={1.8} />
                        {session.title}
                      </button>
                    )}
                    {rubric && (
                      <span className="ds-todo-rubric">
                        <BookOpen size={10} strokeWidth={1.8} />
                        {rubric.title.replace(' Rubric', '')}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});
