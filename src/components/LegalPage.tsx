import { LEGAL_HASHES, type LegalPageId } from '../lib/productLinks';
import './LegalPage.css';

const TITLES: Record<LegalPageId, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms of Use',
  cookies: 'Cookies',
  changelog: 'Changelog',
};

export default function LegalPage({ page, disclosure }: { page: LegalPageId; disclosure: string }) {
  return (
    <div className="legal-page">
      <a
        className="legal-skip"
        href={LEGAL_HASHES[page]}
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('legal-content')?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="legal-top">
        <a className="legal-brand" href="#">
          StudyPilot
        </a>
        <nav className="legal-nav" aria-label="Legal">
          {(Object.keys(LEGAL_HASHES) as LegalPageId[]).map((id) => (
            <a key={id} href={LEGAL_HASHES[id]} aria-current={id === page ? 'page' : undefined}>
              {TITLES[id]}
            </a>
          ))}
        </nav>
      </header>

      <main id="legal-content" className="legal-main" tabIndex={-1}>
        <p className="legal-kicker">StudyPilot beta</p>
        <h1>{TITLES[page]}</h1>
        {page === 'privacy' && <PrivacyBody disclosure={disclosure} />}
        {page === 'terms' && <TermsBody />}
        {page === 'cookies' && <CookiesBody disclosure={disclosure} />}
        {page === 'changelog' && <ChangelogBody />}
      </main>
    </div>
  );
}

function PrivacyBody({ disclosure }: { disclosure: string }) {
  return (
    <>
      <p>
        StudyPilot is a study coach that runs in Chrome and on this dashboard. An account is required. Sign in once to
        connect the extension and dashboard.
      </p>
      <h2>What we process</h2>
      <p>{disclosure}</p>
      <p>
        Coaching uses your microphone and the page context you choose to share. Answers can cite retrieved rubric or
        uploaded-document evidence when grounding is available.
      </p>
      <h2>What you control</h2>
      <ul>
        <li>Screenshots are off unless you turn them on.</li>
        <li>Saving chats and sessions to the dashboard is off unless you turn it on.</li>
        <li>You can close a live session at any time; processing of the microphone stream then stops.</li>
      </ul>
      <h2>Account</h2>
      <p>
        We store the email and authentication tokens needed to keep you signed in and to authorize dashboard and
        extension requests. Coaching is not available without an account.
      </p>
      <p>
        Questions: <a href="mailto:hello@studypilot.app">hello@studypilot.app</a>.
      </p>
    </>
  );
}

function TermsBody() {
  return (
    <>
      <p>
        These terms cover the StudyPilot beta website, dashboard, and Chrome extension. An account is required to use
        coaching.
      </p>
      <h2>The product</h2>
      <p>
        StudyPilot helps you study from the page you are already on. It is a coach, not a silent answer machine. You
        remain responsible for your own academic work and for following your school’s rules.
      </p>
      <h2>Acceptable use</h2>
      <p>
        Do not use StudyPilot to impersonate another person, attack the service, or bypass access controls. We may
        suspend accounts that abuse the beta.
      </p>
      <h2>Availability</h2>
      <p>
        This is beta software. Features, uptime, and model quality can change without notice. The Chrome extension is
        invite-only until a public store listing exists.
      </p>
      <p>
        See the <a href={LEGAL_HASHES.privacy}>Privacy Policy</a> for how study data is processed.
      </p>
    </>
  );
}

function CookiesBody({ disclosure }: { disclosure: string }) {
  return (
    <>
      <p>
        The current beta uses essential cookies and browser storage only: authentication session data and preferences
        such as dashboard theme. There are no advertising cookies and no third-party ad pixels.
      </p>
      <h2>Cloud processing is separate</h2>
      <p>
        Cookies are not how live study audio is handled. {disclosure} Details are in the{' '}
        <a href={LEGAL_HASHES.privacy}>Privacy Policy</a>.
      </p>
      <h2>Managing storage</h2>
      <p>
        You can clear site data in your browser. Signing out removes local auth tokens. That does not by itself delete
        cloud records you already chose to save to the dashboard.
      </p>
    </>
  );
}

function ChangelogBody() {
  return (
    <>
      <p>Notes for the public beta. Dates are when the change reached this site.</p>
      <h2>2026-08-23</h2>
      <ul>
        <li>Privacy, terms, cookies, and changelog pages now live at hash routes.</li>
        <li>Chrome install is invite-only until a Chrome Web Store URL is configured.</li>
      </ul>
      <h2>2026-08-21</h2>
      <ul>
        <li>
          Public copy now matches the beta: microphone plus chosen page context, rubric or document citations when
          grounding is available, and an account to connect the extension and dashboard.
        </li>
        <li>
          Screenshots and dashboard save stay off unless you enable them. Live microphone audio is processed by Google
          Vertex AI while a session is active.
        </li>
      </ul>
    </>
  );
}
