import { memo, useMemo } from 'react';
import { ArrowRight, Chrome } from 'lucide-react';
import { DsButton } from './DashboardPrimitives';
import type { ContextPanelProps } from './dashboard-types';

/**
 * Prompts are shown in the panel and fire as real chat messages.
 * They cover the most useful coaching questions regardless of context.
 */
const PANEL_PROMPTS = [
  'What should I revise first?',
  'Explain the rubric criteria to me',
  'Give me Socratic questions to test my understanding',
  'Turn my session feedback into a step-by-step checklist',
  'What are my main weaknesses based on this rubric?',
] as const;

/**
 * Build a one-sentence prose summary of the rubric so the panel card
 * reads naturally instead of showing a bullet list.
 */
function rubricProse(rubric: { title: string; course: string; criteria?: { name: string }[] }): string {
  const criteria = rubric.criteria ?? [];
  if (criteria.length === 0) {
    return `${rubric.title} for ${rubric.course}. No criteria loaded yet.`;
  }
  if (criteria.length <= 3) {
    const names = criteria.map((c) => c.name).join(', ');
    return `${rubric.title} for ${rubric.course} — assesses ${names}.`;
  }
  const shown = criteria
    .slice(0, 3)
    .map((c) => c.name)
    .join(', ');
  const rest = criteria.length - 3;
  return `${rubric.title} for ${rubric.course} — assesses ${shown} and ${rest} more criteria.`;
}

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
  onSendMessage,
}: ContextPanelProps) {
  const contextSession = view === 'session-detail' ? selectedSession : chatSession;
  const rubricSummary = useMemo(
    () => (activeRubric ? rubricProse(activeRubric) : null),
    [activeRubric],
  );

  const handlePrompt = (text: string) => {
    if (onSendMessage) {
      onSendMessage(text);
    } else {
      onContinueInChat();
    }
  };

  return (
    <aside className="ds-context" aria-label="Current context">
      <div className="ds-context-head">
        <span className="ds-eyebrow">Context</span>
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
            <p className="ds-context-rubric-prose">{rubricSummary}</p>
          </button>
        </section>
      )}

      {contextSession && (
        <section className="ds-context-section">
          <span className="ds-context-label">Session</span>
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
            {contextSession.summary ? (
              <p className="ds-context-quote">{contextSession.summary}</p>
            ) : null}
          </div>
        </section>
      )}

      <section className="ds-context-section">
        <span className="ds-context-label">Ask the coach</span>
        <ul className="ds-context-prompts">
          {PANEL_PROMPTS.map((prompt) => (
            <li key={prompt}>
              <button type="button" onClick={() => handlePrompt(prompt)}>
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
            <em>of {aiUsage.limit}</em>
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
