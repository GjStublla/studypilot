import { normalizeIndexStatus } from '../../lib/chat-rubric-context';
import type { Rubric } from '../../lib/dashboard-types';

export function getRubricIndexStatus(rubric: Rubric | undefined): string {
  if (!rubric) return 'not_indexed';
  return normalizeIndexStatus(rubric.fileSearchStatus ?? rubric.file_search_status);
}
