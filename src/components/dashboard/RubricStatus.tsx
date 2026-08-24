import { normalizeIndexStatus } from '../../lib/chat-rubric-context';
import type { Rubric } from '../../lib/dashboardApi';
import type { FileSearchStatusBadgeProps } from './dashboard-types';

export function getRubricIndexStatus(rubric: Rubric | undefined): string {
  if (!rubric) return 'not_indexed';
  return normalizeIndexStatus(rubric.fileSearchStatus ?? rubric.file_search_status);
}

export function FileSearchStatusBadge({
  status,
  error,
  onRetry,
}: FileSearchStatusBadgeProps) {
  const label =
    status === 'indexed' ? 'Indexed'
      : status === 'indexing' ? 'Indexing…'
        : status === 'pending' ? 'Pending index'
          : status === 'failed' ? 'Index failed'
            : status === 'deleted' ? 'Index removed'
              : 'Not indexed';

  return (
    <span
      className={`ds-context-chip ds-index-chip is-${status}`}
      data-testid="file-search-status"
      title={error ?? undefined}
    >
      <span>{label}</span>
      {status === 'failed' && onRetry ? (
        <button type="button" className="ds-index-retry" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </span>
  );
}
