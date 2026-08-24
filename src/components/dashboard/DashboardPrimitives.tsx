import { memo, type MouseEvent, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { ActionItem } from '../../lib/dashboardApi';
import { SCORE_DOT_INDEXES } from './dashboard-types';

export function DsButton({
  children,
  variant = 'primary',
  onClick,
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      className={`ds-btn ds-btn-${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export const ScoreDots = memo(function ScoreDots({ score, max }: { score: number; max: number }) {
  const dotIndexes =
    max <= SCORE_DOT_INDEXES.length
      ? SCORE_DOT_INDEXES.slice(0, max)
      : Array.from({ length: max }, (_, i) => i);

  return (
    <span className="ds-dots" role="img" aria-label={`${score} of ${max}`}>
      {dotIndexes.map((i) => (
        <i key={i} className={i < score ? 'on' : ''} />
      ))}
    </span>
  );
});

export const TodoRow = memo(function TodoRow({
  item,
  onToggle,
  sessionTitle,
}: {
  item: ActionItem;
  onToggle: () => void;
  sessionTitle?: string;
}) {
  return (
    <li className={item.done ? 'is-done' : ''}>
      <button
        type="button"
        className={`ds-check ${item.done ? 'is-checked' : ''}`}
        onClick={onToggle}
        aria-pressed={item.done}
        aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
      >
        {item.done && <Check size={10} strokeWidth={2.6} />}
      </button>
      <span className="ds-todo-text">{item.text}</span>
      {sessionTitle && <span className="ds-todo-tag">{sessionTitle}</span>}
    </li>
  );
});

export const EmptyState = memo(function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="ds-empty">
      <p className="ds-empty-title">{title}</p>
      <p className="ds-empty-body">{body}</p>
      {action ? (
        <DsButton variant="secondary" onClick={action.onClick}>
          {action.label}
        </DsButton>
      ) : null}
    </div>
  );
});

export const StudyPilotMark = memo(function StudyPilotMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      aria-hidden="true"
      className="ds-spmark"
    >
      <circle cx="100" cy="100" r="84" className="ds-spmark-bg" />
      <path
        d="M100 56l26 84-26-18-26 18 26-84z"
        className="ds-spmark-arrow"
        strokeWidth="6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
});
