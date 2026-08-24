import { memo, useMemo } from 'react';
import { ArrowRight, Chrome } from 'lucide-react';
import type { AiUsage } from '../../lib/studypilot-api';
import type { Rubric, Session } from '../../lib/dashboardApi';
import type { View } from './dashboard-types';
import { DsButton, ScoreDots } from './DashboardPrimitives';

const CONTEXT_PROMPTS = [
  'What should I revise first?',
  'Turn my feedback into a checklist',
  'Ask me Socratic questions',
] as const;

export const ContextPanel = memo(function ContextPanel({
  view,
  activeRubric,
  chatSession,
  selectedSession,
  openActionItemCount,
  aiUsage,
  onGoTo,
  onContinueInChat,
  onOpenExtension,
}: {
  view: View;
  activeRubric: Rubric | undefined;
  chatSession: Session | undefined;
  selectedSession: Session | undefined;
  openActionItemCount: number;
  aiUsage: AiUsage | null;
  onGoTo: (v: View) => void;
  onContinueInChat: () => void;
  onOpenExtension: () => void;
}) {
  const contextSession = view === 'session-detail' ? selectedSession : chatSession;
  const visibleCriteria = useMemo(
    () => activeRubric?.criteria.slice(0, 5) ?? [],
    [activeRubric],
  );

  return (
    <aside className="ds-context" aria-label="Current context">
      <div className="ds-context-head">
        <span className="ds-eyebrow">Current context</span>
      </div>

      {activeRubric && (
        <section className="ds-context-section">
          <span className="ds-context-label">Active rubric</span>
          <button
            type="button"
            className="ds-context-block ds-context-block-button"
            onClick={() => onGoTo('rubrics')}
          >
            <span className="ds-context-block-title">{activeRubric.title}</span>
            <span className="ds-context-block-sub">{activeRubric.course}</span>
            <ul className="ds-mini-criteria">
              {visibleCriteria.map((criterion) => (
                <li key={criterion.name}>
                  <span>{criterion.name}</span>
                  <ScoreDots score={criterion.score ?? 0} max={criterion.max ?? 4} />
                </li>
              ))}
            </ul>
          </button>
        </section>
      )}

      {contextSession && (
        <section className="ds-context-section">
          <span className="ds-context-label">From the extension</span>
          <div className="ds-context-block">
            <div className="ds-context-source">
              <span className="ds-context-source-ico" aria-hidden="true">
                <Chrome size={12} strokeWidth={1.7} />
              </span>
              <div>
                <b>{contextSession.title}</b>
                <em>
                  {contextSession.mode} · {contextSession.duration} · {contextSession.when}
                </em>
              </div>
            </div>
            <p className="ds-context-quote">{contextSession.summary}</p>
          </div>
        </section>
      )}

      <section className="ds-context-section">
        <span className="ds-context-label">Suggested next steps</span>
        <ul className="ds-context-prompts">
          {CONTEXT_PROMPTS.map((prompt) => (
            <li key={prompt}>
              <button type="button" onClick={onContinueInChat}>
                <span>{prompt}</span>
                <ArrowRight size={11} strokeWidth={1.8} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="ds-context-foot">
        <div className="ds-context-stat">
          <span className="ds-eyebrow">Open</span>
          <b>{openActionItemCount}</b>
          <em>action items</em>
        </div>
        {aiUsage && (
          <div className="ds-context-stat">
            <span className="ds-eyebrow">AI today</span>
            <b>{aiUsage.used}</b>
            <em>of {aiUsage.limit} requests</em>
          </div>
        )}
        <DsButton variant="secondary" onClick={onOpenExtension}>
          <Chrome size={13} strokeWidth={1.7} />
          Open extension
        </DsButton>
      </div>
    </aside>
  );
});
