import { memo, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { FileText, ScrollText, Upload, X } from 'lucide-react';
import { uploadRubricFile } from '../../lib/studypilot-api';
import { DsButton, EmptyState } from './DashboardPrimitives';
import { FileSearchStatusBadge } from './RubricStatus';
import { getRubricIndexStatus } from './rubric-index-status';
import type { RubricsViewProps, UploadRubricModalProps } from './dashboard-types';

export const RubricsView = memo(function RubricsView({
  rubrics,
  activeRubricId,
  query,
  rubricIndexRequestStates = {},
  onSetActive,
  onDelete,
  onAskAbout,
  onRetryIndex,
  onRubricUploaded,
}: RubricsViewProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? rubrics.filter((r) =>
            [r.title, r.course, ...(r.criteria?.map((c) => c.name) || [])].some((f) => f.toLowerCase().includes(q)),
          )
        : rubrics,
    [rubrics, q],
  );

  return (
    <div className="ds-view ds-view-rubrics">
      <header className="ds-view-head">
        <div>
          <h2 className="ds-h2">Rubrics</h2>
          <p className="ds-lede">
            The criteria your coach holds you to. Set one as active and every session inherits its scoring — including
            your imports from the extension.
          </p>
        </div>
        <DsButton variant="secondary" onClick={() => setUploadOpen(true)}>
          <Upload size={13} strokeWidth={1.7} /> Upload rubric
        </DsButton>
      </header>

      {uploadOpen && (
        <UploadRubricModal
          onClose={() => setUploadOpen(false)}
          onUploaded={(rubric) => {
            onRubricUploaded(rubric);
            setUploadOpen(false);
          }}
        />
      )}

      {rubrics.length === 0 ? (
        <EmptyState title="No rubrics yet." body="Upload a rubric to set the criteria your coach holds you to." />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches." body={`No rubrics match “${query.trim()}”.`} />
      ) : (
        <ul className="ds-rubric-list">
          {filtered.map((r) => {
            const isActive = r.id === activeRubricId;
            const indexStatus = getRubricIndexStatus(r);
            const indexRequestState = rubricIndexRequestStates[r.id];
            const indexing = indexRequestState?.status === 'loading';
            const indexError = indexRequestState?.status === 'error' ? indexRequestState.message : undefined;
            return (
              <li key={r.id}>
                <article className={`ds-rubric-card ${isActive ? 'is-active' : ''}`}>
                  <div className="ds-card-eyebrow ds-card-eyebrow-row">
                    <span className="ds-card-eyebrow-left">
                      <FileText size={11} strokeWidth={1.8} />
                      <span>{r.course}</span>
                    </span>
                    <span className="ds-rubric-status-row">
                      <FileSearchStatusBadge
                        status={indexing ? 'indexing' : indexStatus}
                        error={indexError ?? r.fileSearchError ?? r.file_search_error}
                        onRetry={
                          !indexing && indexStatus === 'failed' && onRetryIndex ? () => onRetryIndex(r.id) : undefined
                        }
                      />
                      {isActive ? (
                        <span className="ds-pill ds-pill-active">
                          <span className="ds-dot ds-dot-mint" aria-hidden="true" />
                          Active
                        </span>
                      ) : (
                        <span className="ds-pill ds-pill-quiet">Uploaded {r.uploaded}</span>
                      )}
                    </span>
                  </div>
                  <h3 className="ds-card-title">{r.title}</h3>

                  <div className="ds-criteria-grid">
                    {r.criteria?.map((c) => (
                      <div key={c.name} className="ds-criteria-pill">
                        <span>{c.name}</span>
                      </div>
                    ))}
                  </div>

                  <div className="ds-rubric-foot">
                    <span className="ds-quiet-meta">
                      <ScrollText size={11} strokeWidth={1.8} /> {r.sessionsCount} sessions
                    </span>
                    <div className="ds-card-actions">
                      <DsButton variant="ghost" onClick={() => onAskAbout(r.id)}>
                        Ask about rubric
                      </DsButton>
                      {!isActive && (
                        <DsButton
                          variant="ghost"
                          onClick={() => {
                            if (window.confirm(`Delete "${r.title}"? This cannot be undone.`)) {
                              onDelete(r.id);
                            }
                          }}
                          aria-label={`Delete ${r.title}`}
                        >
                          <X size={13} strokeWidth={1.7} /> Delete
                        </DsButton>
                      )}
                      <DsButton
                        variant={isActive ? 'secondary' : 'primary'}
                        disabled={isActive}
                        onClick={() => onSetActive(r.id)}
                      >
                        {isActive ? 'Currently active' : 'Set active'}
                      </DsButton>
                    </div>
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
/* ============================================================================
   Upload Rubric Modal
   ============================================================================ */

export const UploadRubricModal = memo(function UploadRubricModal({ onClose, onUploaded }: UploadRubricModalProps) {
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_MB = 20;

  function handleFileSelect(f: File) {
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`File must be under ${MAX_MB} MB.`);
      return;
    }
    setError('');
    setFile(f);
    if (!title)
      setTitle(
        f.name
          .replace(/\.[^.]+$/, '')
          .replace(/[-_]/g, ' ')
          .trim(),
      );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Please select a file.');
      return;
    }
    if (!title.trim()) {
      setError('Please enter a rubric title.');
      return;
    }
    if (!course.trim()) {
      setError('Please enter a course name.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const result = await uploadRubricFile(file, title.trim(), course.trim());
      onUploaded({
        id: result.rubricId,
        title: result.title,
        course: result.course,
        uploaded_at: new Date().toISOString(),
        active: result.active,
        sessions_count: 0,
        knowledgeDocumentId: result.knowledgeDocumentId,
        knowledge_document_id: result.knowledgeDocumentId,
        file_search_status: result.fileSearchStatus,
        fileSearchStatus: result.fileSearchStatus,
        criteria: (result.criteria ?? []).map((c) => ({ ...c, score: 0, max: c.max_score })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setUploading(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="ds-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Upload rubric"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ds-modal">
        <div className="ds-modal-head">
          <h3 className="ds-modal-title">Upload rubric</h3>
          <button type="button" className="ds-icon-btn" onClick={onClose} aria-label="Close">
            <X size={14} strokeWidth={1.7} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="ds-modal-body" noValidate>
          <div
            className={`ds-dropzone${dragOver ? ' is-over' : ''}${file ? ' has-file' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFileSelect(f);
            }}
            role="button"
            tabIndex={0}
            aria-label="Drop file here or click to browse"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="ds-dropzone-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
            {file ? (
              <div className="ds-dropzone-file">
                <FileText size={20} strokeWidth={1.4} />
                <span>{file.name}</span>
                <button
                  type="button"
                  className="ds-dropzone-remove"
                  aria-label="Remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setError('');
                  }}
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <>
                <Upload size={22} strokeWidth={1.4} />
                <p className="ds-dropzone-label">Drop any file here or click to browse</p>
                <p className="ds-dropzone-hint">PDF, DOCX, TXT, MD, images — max {MAX_MB} MB</p>
              </>
            )}
          </div>
          <div className="ds-modal-fields">
            <div className="ds-modal-field">
              <label htmlFor="rubric-title">Rubric title</label>
              <input
                id="rubric-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Argumentative Essay Rubric"
                disabled={uploading}
                required
              />
            </div>
            <div className="ds-modal-field">
              <label htmlFor="rubric-course">Course</label>
              <input
                id="rubric-course"
                type="text"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="ENG 102 · Composition II"
                disabled={uploading}
                required
              />
            </div>
          </div>
          {error && (
            <p className="ds-modal-error" role="alert">
              {error}
            </p>
          )}
          <div className="ds-modal-foot">
            <DsButton variant="ghost" type="button" onClick={onClose} disabled={uploading}>
              Cancel
            </DsButton>
            <DsButton variant="primary" type="submit" disabled={uploading || !file}>
              {uploading ? (
                <>
                  <span className="ds-state-spinner" style={{ width: 12, height: 12 }} aria-hidden="true" /> Uploading…
                </>
              ) : (
                <>
                  <Upload size={13} strokeWidth={1.7} /> Upload &amp; extract
                </>
              )}
            </DsButton>
          </div>
        </form>
      </div>
    </div>
  );
});
