import { useEffect } from 'react';
import { X } from 'lucide-react';
import { BETA_ACCESS_MAILTO, getChromeWebStoreUrl } from '../../lib/productLinks';

export function ExtensionHelpModal({ onClose }: { onClose: () => void }) {
  const storeUrl = getChromeWebStoreUrl();

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
      aria-labelledby="extension-help-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ds-modal">
        <div className="ds-modal-head">
          <h2 id="extension-help-title" className="ds-modal-title">
            Open the StudyPilot extension
          </h2>
          <button type="button" className="ds-icon-btn" onClick={onClose} aria-label="Close">
            <X size={14} strokeWidth={1.7} />
          </button>
        </div>
        <div className="ds-modal-body">
          <p className="ds-help-lead">
            StudyPilot lives in Chrome. Install it, pin it, then click the toolbar icon on the page you are studying.
          </p>
          <ol className="ds-help-steps">
            <li>
              {storeUrl ? (
                <>
                  Install the extension from the{' '}
                  <a href={storeUrl} target="_blank" rel="noopener noreferrer">
                    Chrome Web Store
                  </a>
                  .
                </>
              ) : (
                <>
                  Install the Chrome extension. The public listing is not live yet — this beta is invite-only.{' '}
                  <a href={BETA_ACCESS_MAILTO}>Request beta access</a>.
                </>
              )}
            </li>
            <li>Pin StudyPilot to the Chrome toolbar so the icon stays visible.</li>
            <li>Open a study page and click the StudyPilot toolbar icon to start coaching.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
