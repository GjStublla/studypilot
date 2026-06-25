import {
  AlignLeft,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Chrome,
  Command,
  Globe2,
  MessageSquareText,
  Target,
} from 'lucide-react';
import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from 'framer-motion';
import { Button } from './components/ui/button';
import GradientBlinds from './components/GradientBlinds';
import AuthPage from './components/AuthPage';
import { clearAuth, storeAuth, apiFetch, type AuthTokens } from './lib/api';
import { supabase } from './lib/supabase';
import './components/AuthPage.css';

const loadDashboard = () => import('./components/Dashboard');
const Dashboard = lazy(loadDashboard);
const prefetchDashboard = () => {
  void loadDashboard();
};

const heroGradientColors = ['#39D7FF', '#5B8CFF', '#7C5CFF', '#FF4FD8'] as const;

const productSvg = '/assets/studypilot-modal-demo.svg';
const footerLockupWebp = '/assets/01_main_horizontal_lockup_transparent.webp';

const modes = [
  {
    icon: AudioLines,
    title: 'Listen',
    body:
      'Picks up tab audio and your mic the moment the panel opens. No upload, no re-record.',
  },
  {
    icon: AlignLeft,
    title: 'Summarize',
    body:
      'Compresses the last few minutes of class into a checkpoint you can scan between slides.',
  },
  {
    icon: Target,
    title: 'Quiz',
    body:
      'Three questions on what just happened. Catch the gap before the next topic buries it.',
  },
  {
    icon: MessageSquareText,
    title: 'Ask',
    body:
      'Type a follow-up. Answers cite the exact second of the lecture they came from.',
  },
] as const;

const steps = [
  {
    n: '01',
    title: 'Pin it once.',
    body:
      'Lives quietly in the corner of every tab. One shortcut to open, one to close.',
  },
  {
    n: '02',
    title: "Open whatever you're studying.",
    body:
      'Lectures, articles, PDFs, recorded calls — StudyPilot reads the page you are already on.',
  },
  {
    n: '03',
    title: 'Talk, type, or quiz yourself.',
    body:
      'Voice when your hands are busy. Text when the lecturer talks fast. Quiz when you want to be honest.',
  },
] as const;

const principles = [
  {
    label: 'Quiet',
    body: 'No notifications. No background tabs. The panel only speaks when you call it.',
  },
  {
    label: 'Local',
    body: 'Audio and transcripts stay on your device. Cloud sync is an opt-in toggle.',
  },
  {
    label: 'Fast',
    body: 'Opens in under a second. Closes the same way. Built for the in-between moments.',
  },
] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.42, ease: [0.23, 1, 0.32, 1] },
  },
};

const staggerParent: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.055, delayChildren: 0.03 },
  },
};

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function getStoredUser() {
  try {
    const token = localStorage.getItem('sp_access_token');
    const email = localStorage.getItem('sp_email');
    if (!token || !email) return null;
    // Derive display name from email (e.g. john.smith@uni.edu → John Smith)
    const name = email
      .split('@')[0]
      .replace(/[._]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
    return { token, email, name, initials };
  } catch {
    return null;
  }
}

function App() {
  const [hash, setHash] = useState(() => (typeof window !== 'undefined' ? window.location.hash : ''));
  const [user, setUser] = useState(() => getStoredUser());

  // Re-read auth state whenever hash changes (e.g. after login redirects to #dashboard)
  useEffect(() => {
    setUser(getStoredUser());
  }, [hash]);

  useEffect(() => {
    const handleHashChange = () => {
      setHash(window.location.hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const isDashboard = hash.startsWith('#dashboard');
  const isAuth = hash.startsWith('#auth');
  // Supabase appends tokens as the hash fragment after the redirect:
  //   http://127.0.0.1:5173/#access_token=...&refresh_token=...&type=signup
  // We anchor the check to the start of the hash so a random page section
  // named "#access_token" can't accidentally trigger this handler.
  const isSupabaseCallback = hash.startsWith('#access_token=') && hash.includes('type=');

  // ── Google OAuth callback ──────────────────────────────────────────────────
  // After the user approves on Google's consent screen, Supabase redirects
  // back here with the session tokens in the URL fragment. We read the
  // session, store the tokens via storeAuth(), then forward to #dashboard.
  // This runs in a useEffect so it only fires once per mount, not on every
  // render cycle.
  useEffect(() => {
    if (!isSupabaseCallback) return;

    supabase.auth.getSession().then(({ data, error }) => {
      if (error || !data.session) {
        // Session exchange failed — could be an expired link, a denied
        // consent, or a misconfigured redirect URI. Send the user back to
        // the auth page; the #oauth-error flag lets AuthPage show a message.
        console.error('[OAuth] getSession failed:', error?.message ?? 'no session returned');
        window.location.hash = '#auth?error=oauth';
        return;
      }

      // Session is valid — persist tokens and go to the dashboard.
      storeAuth({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user_id: data.session.user.id,
        email: data.session.user.email ?? '',
      } satisfies AuthTokens);
      window.location.hash = '#dashboard';
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — only run on the initial mount of this route

  // Render nothing while the async session exchange completes
  if (isSupabaseCallback) return null;

  // Block dashboard access if not logged in
  if (isDashboard) {
    if (!user) {
      // Redirect to auth
      window.location.hash = '#auth';
      return null;
    }
    return (
      <Suspense fallback={null}>
        <Dashboard />
      </Suspense>
    );
  }

  if (isAuth && !isSupabaseCallback) {
    // Already logged in — go straight to dashboard
    if (user) {
      window.location.hash = '#dashboard';
      return null;
    }
    return <AuthPage />;
  }

  return (
    <LazyMotion features={domAnimation}>
      <div className="site-shell">
        <Hero user={user} onLogout={async () => {
          // Invalidate the session server-side first (best-effort),
          // then clear local tokens regardless of whether it succeeded.
          try {
            await apiFetch('/auth/logout', { method: 'POST' });
          } catch {
            /* session may already be expired — clear locally regardless */
          }
          clearAuth();
          setUser(null);
        }} />
        <Compatibility />
        <Capabilities />
        <Workflow />
        <Principles />
        <Install />
        <Footer />
      </div>
    </LazyMotion>
  );
}

function Hero({ user, onLogout }: { user: ReturnType<typeof getStoredUser>; onLogout: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: scrollRef,
    offset: ['start start', 'end end'],
  });

  /* ---- viewport-responsive fly target ---- */
  const [flyTarget, setFlyTarget] = useState({ x: 500, y: -420 });

  useEffect(() => {
    const update = () =>
      setFlyTarget({
        x: window.innerWidth * 0.28,
        y: -window.innerHeight * 0.42,
      });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  /* ---- scroll-driven product transforms (refined to a premium subtle parallax tilt) ---- */
  const rotateY = useTransform(scrollYProgress, [0, 0.2, 0.6], [-9, -9, 15]);
  const rotateX = useTransform(scrollYProgress, [0, 0.2, 0.5], [4, 4, -4]);
  const rotateZ = useTransform(scrollYProgress, [0, 0.2, 0.5], [1.5, 1.5, -1.5]);
  const productScale = useTransform(scrollYProgress, [0, 0.55, 0.9], [1, 1, 0.12]);
  const productX = useTransform(scrollYProgress, [0.55, 0.9], [0, flyTarget.x]);
  const productY = useTransform(scrollYProgress, [0.55, 0.9], [0, flyTarget.y]);
  const productOpacity = useTransform(scrollYProgress, [0.76, 0.9], [1, 0]);

  /* ---- "installed" state (appears after product fades) ---- */
  const installedOpacity = useTransform(scrollYProgress, [0.78, 0.92], [0, 1]);
  const installedScale = useTransform(scrollYProgress, [0.78, 0.92], [0.88, 1]);
  const installedY = useTransform(scrollYProgress, [0.78, 0.92], [24, 0]);

  return (
    <div ref={scrollRef} className="hero-scroll-container">
    <section className="hero">
      <div className="hero-bg" aria-hidden="true">
        <GradientBlinds
          gradientColors={heroGradientColors}
          angle={18}
          noise={0.12}
          blindCount={18}
          blindMinWidth={72}
          spotlightRadius={0.58}
          spotlightSoftness={1.25}
          spotlightOpacity={0.62}
          mouseDampening={0.16}
          mirrorGradient
          distortAmount={0.35}
          shineDirection="left"
          mixBlendMode={undefined}
        />
      </div>
      <div className="hero-mask" aria-hidden="true" />
      <div className="hero-grain" aria-hidden="true" />

      <HeroNav user={user} onLogout={onLogout} />

      <div className="hero-frame">
        <div className="hero-grid">
          <m.div
            className="hero-copy"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.055, delayChildren: 0.06 } },
            }}
          >
            <m.h1
              className="hero-headline"
              variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.48, ease: [0.23, 1, 0.32, 1] }}
            >
              <span className="line">
                <span>Study</span> from{' '}
                <i>any</i>{' '}
                tab.
              </span>
              <span className="line">
                Ask without{' '}
                <i>switching</i>{' '}
                apps.
              </span>
            </m.h1>

            <m.div
              className="hero-actions"
              variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.36, ease: [0.23, 1, 0.32, 1] }}
            >
              <Button href="#install">
                Add to Chrome <ArrowRight size={15} />
              </Button>
              <Button href="#workflow" variant="secondary">
                See how it works <ArrowUpRight size={14} />
              </Button>
            </m.div>

            <m.dl
              className="hero-meta"
              variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            >
              <div>
                <dt>Built by</dt>
                <dd>
                  <a href="#">Edion Islami</a>, <a href="#">Gjin Stublla</a>, <a href="#">Leona Selishta</a>
                </dd>
              </div>
            </m.dl>
          </m.div>

          <m.div
            className="hero-stage"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1], delay: 0.12 }}
            style={{ perspective: 1600 }}
          >
            <m.div
              className="hero-product"
              style={{
                rotateY: prefersReducedMotion ? 0 : rotateY,
                rotateX: prefersReducedMotion ? 0 : rotateX,
                rotateZ: prefersReducedMotion ? 0 : rotateZ,
                scale: prefersReducedMotion ? 1 : productScale,
                x: prefersReducedMotion ? 0 : productX,
                y: prefersReducedMotion ? 0 : productY,
                z: 0, // Forces translateZ(0px) in output inline style to lock in hardware acceleration
                opacity: prefersReducedMotion ? 1 : productOpacity,
              }}
            >
              <img
                src={productSvg}
                width="430"
                height="820"
                alt="StudyPilot study panel showing voice listening, quick actions, and a summary card"
              />
              <div className="hero-product-shadow" aria-hidden="true" />
            </m.div>

            {/* Appears after the product flies away */}
            <m.div
              className="hero-installed"
              style={{
                opacity: prefersReducedMotion ? 0 : installedOpacity,
                scale: prefersReducedMotion ? 1 : installedScale,
                y: prefersReducedMotion ? 0 : installedY,
                z: 0, // Forces translateZ(0px) to hardware accelerate this block as well
              }}
            >
              <div className="hero-installed-ring">
                <StudyPilotMark size={48} />
              </div>
              <p className="hero-installed-text">Pinned &amp; ready.</p>
              <Button href="#install">
                Add to Chrome <Chrome size={15} />
              </Button>
            </m.div>
          </m.div>
        </div>
      </div>
    </section>
    </div>
  );
}

function HeroNav({ user, onLogout }: { user: ReturnType<typeof getStoredUser>; onLogout: () => void }) {
  return (
    <header className="hero-nav">
      <a href="#" className="brand">
        <StudyPilotMark size={80} />
        <span className="brand-text">studypilot.</span>
      </a>
      <nav aria-label="Primary">
        <a className="active" href="#">Home</a>
        <a href="#capabilities">Modes</a>
        <a href="#workflow">Workflow</a>
        <a href="#install">Install</a>
        {user ? (
          <a href="#dashboard" onMouseEnter={prefetchDashboard} onFocus={prefetchDashboard}>
            Dashboard
          </a>
        ) : (
          <span className="hero-nav-disabled" title="Sign in to access the dashboard">
            Dashboard
          </span>
        )}
        <a href="#privacy">
          <Globe2 size={13} />
          EN
        </a>
      </nav>

      {user ? (
        <div className="nav-user">
          <span className="nav-user-avatar" aria-hidden="true">{user.initials}</span>
          <span className="nav-user-name">{user.name}</span>
          <button
            className="nav-user-logout"
            onClick={onLogout}
            aria-label="Sign out"
          >
            Sign out
          </button>
        </div>
      ) : (
        <a href="#auth" className="login-button">
          Log in
          <ArrowRight size={13} />
        </a>
      )}
    </header>
  );
}

const surfaces: { name: string; logo: React.ReactNode }[] = [
  {
    name: 'MIT OCW',
    logo: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="4" width="4" height="16" fill="currentColor" />
        <rect x="8" y="4" width="4" height="16" fill="currentColor" />
        <rect x="14" y="4" width="8" height="4" fill="currentColor" />
        <rect x="16" y="4" width="4" height="16" fill="currentColor" />
      </svg>
    ),
  },
  {
    name: 'Khan Academy',
    logo: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 3L2 8v8l10 5 10-5V8L12 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 13V21M2 8l10 5 10-5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="18" cy="14" r="1.2" fill="currentColor" />
        <path d="M18 15.2V18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: 'YouTube',
    logo: (
      <svg width="28" height="20" viewBox="0 0 28 20" fill="none">
        <rect x="1" y="1" width="26" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M11 7v6l5.5-3L11 7z" fill="currentColor" />
      </svg>
    ),
  },
  {
    name: 'Coursera',
    logo: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M16.5 12a4.5 4.5 0 10-4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: 'Zoom',
    logo: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="5" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M16 10l5-3v10l-5-3v-4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: 'Wikipedia',
    logo: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M3 4h3M18 4h3M6 4l6 16 6-16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="4" r="1.2" fill="currentColor" />
      </svg>
    ),
  },
  {
    name: 'PDFs',
    logo: (
      <svg width="22" height="26" viewBox="0 0 22 26" fill="none">
        <path d="M4 1h10l5 5v18a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M14 1v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M7 13h8M7 17h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: 'Google Docs',
    logo: (
      <svg width="22" height="26" viewBox="0 0 22 26" fill="none">
        <path d="M4 1h10l5 5v18a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M14 1v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M7 11h8M7 15h8M7 19h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
];

function Compatibility() {
  const marqueeRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const marquee = marqueeRef.current;

    if (!marquee) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '160px 0px' },
    );

    observer.observe(marquee);
    return () => observer.disconnect();
  }, []);

  const renderItems = (prefix: string) =>
    surfaces.map(({ name, logo }) => (
      <div key={`${prefix}-${name}`} className="compat-item">
        <span className="compat-icon">{logo}</span>
        <b>{name}</b>
      </div>
    ));

  return (
    <m.section
      ref={marqueeRef}
      className={`compat ${isVisible ? 'is-visible' : ''}`}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      variants={fadeUp}
    >
      <div className="compat-marquee">
        <div className="compat-track">
          {renderItems('a')}
          {renderItems('b')}
        </div>
      </div>
    </m.section>
  );
}

function Capabilities() {
  return (
    <m.section
      id="capabilities"
      className="section capabilities"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-120px' }}
      variants={staggerParent}
    >
      <SectionIntro
        title={
          <>
            Four moves. <i>Same</i> shortcut.
          </>
        }
        body="Pinned to the tab you are already on. Nothing to upload, nothing to re-explain."
      />

      <m.div className="mode-grid" variants={staggerParent}>
        {modes.map(({ icon: Icon, title, body }) => (
          <m.article key={title} className="mode-card" variants={fadeUp}>
            <div className="mode-head">
              <Icon size={18} strokeWidth={1.4} className="mode-icon" />
            </div>
            <h3 className="mode-title">{title}</h3>
            <p>{body}</p>
            <span className="mode-visual" aria-hidden="true" />
            <span className="mode-accent" aria-hidden="true" />
          </m.article>
        ))}
      </m.div>
    </m.section>
  );
}

function Workflow() {
  return (
    <m.section
      id="workflow"
      className="section workflow"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-120px' }}
      variants={staggerParent}
    >
      <SectionIntro
        title={
          <>
            Three steps. Then it <i>gets out</i> of the way.
          </>
        }
        body="No accounts to wire up. No syllabi to upload. The shortcut works the first time you press it."
      />

      <m.ol className="steps" variants={staggerParent}>
        {steps.map((step) => (
          <m.li key={step.n} className="step" variants={fadeUp}>
            <span className="step-marker" aria-hidden="true" />
            <div className="step-body">
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
            <span className="step-rule" aria-hidden="true" />
          </m.li>
        ))}
      </m.ol>
    </m.section>
  );
}

function Principles() {
  return (
    <m.section
      className="section principles"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-100px' }}
      variants={staggerParent}
    >
      <SectionIntro
        title={
          <>
            A study tool that <i>refuses</i> to be a distraction.
          </>
        }
      />

      <m.div className="principle-row" variants={staggerParent}>
        {principles.map((p) => (
          <m.div key={p.label} className="principle" variants={fadeUp}>
            <span className="principle-label">{p.label}</span>
            <p>{p.body}</p>
          </m.div>
        ))}
      </m.div>
    </m.section>
  );
}

function Install() {
  return (
    <m.section
      id="install"
      className="install"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-100px' }}
      variants={staggerParent}
    >
      <m.div className="install-icon" variants={fadeUp}>
        <StudyPilotMark size={82} />
        <span className="install-shortcut" aria-hidden="true">
          <Command size={11} strokeWidth={2} />
          <i>+</i>
          <b>E</b>
        </span>
      </m.div>

      <m.div className="install-body" variants={fadeUp}>
        <h2>
          Pin it once. <i>Use</i> it everywhere.
        </h2>
        <p>
          Free during beta. Audio and transcripts stay on your device by default — cloud sync
          is a single toggle, never a default.
        </p>
        <div className="install-actions">
          <Button href="#chrome">
            Add to Chrome <Chrome size={15} />
          </Button>
        </div>
      </m.div>
    </m.section>
  );
}

function Footer() {
  return (
    <footer id="privacy" className="footer">
      <div className="footer-inner">
        <div className="footer-main">
          <div className="footer-brand-col">
            <a href="#" className="footer-brand" aria-label="StudyPilot home">
              <img
                src={footerLockupWebp}
                width="1100"
                height="330"
                loading="lazy"
                decoding="async"
                alt="StudyPilot"
              />
            </a>
          </div>

          <nav className="footer-directory" aria-label="Footer directory">
            <div>
              <h2>Explore</h2>
              <a href="#capabilities">Modes</a>
              <a href="#workflow">Workflow</a>
              <a href="#install">Install</a>
            </div>
            <div>
              <h2>Product</h2>
              <a href="#dashboard" onMouseEnter={prefetchDashboard} onFocus={prefetchDashboard}>
                Dashboard
              </a>
              <a href="#chrome">Chrome extension</a>
              <a href="#privacy">Privacy</a>
            </div>
            <div>
              <h2>Company</h2>
              <a href="#">About</a>
              <a href="#changelog">Changelog</a>
              <a href="mailto:hello@studypilot.app">Contact</a>
            </div>
            <div>
              <h2>Legal</h2>
              <a href="#privacy">Privacy Policy</a>
              <a href="#terms">Terms of Use</a>
              <a href="#cookies">Cookie Settings</a>
            </div>
          </nav>
        </div>

        <div className="footer-bottom">
          <span>Built by three students who got tired of fourteen open tabs.</span>
          <nav aria-label="Legal">
            <a href="#privacy">Privacy</a>
            <a href="#terms">Terms</a>
            <a href="#changelog">Changelog</a>
          </nav>
          <span>Privacy-first beta · 2026</span>
        </div>
      </div>
    </footer>
  );
}

function SectionIntro({
  title,
  body,
}: {
  title: ReactNode;
  body?: string;
}) {
  return (
    <m.div className="section-intro" variants={fadeUp}>
      <h2>{title}</h2>
      {body && <p>{body}</p>}
    </m.div>
  );
}

function StudyPilotMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.9} viewBox="0 0 200 180" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`markOrb${size}`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#39D7FF" />
          <stop offset="0.42" stopColor="#5C6CFF" />
          <stop offset="0.72" stopColor="#A855F7" />
          <stop offset="1" stopColor="#FF4FD8" />
        </linearGradient>
        <linearGradient id={`markLine${size}`} x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#5BB8FF" />
          <stop offset="0.5" stopColor="#7C5CFF" />
          <stop offset="1" stopColor="#F04CFF" />
        </linearGradient>
      </defs>
      <path d="M34 72V38c0-9.9 8.1-18 18-18h96c9.9 0 18 8.1 18 18v34" stroke="#5A6273" strokeWidth="4" strokeLinecap="round" />
      <path d="M34 48h132" stroke="#3A4154" strokeWidth="3" />
      <circle cx="52" cy="34" r="4.5" fill="#7A8290" />
      <circle cx="66" cy="34" r="4.5" fill="#7A8290" opacity="0.8" />
      <circle cx="80" cy="34" r="4.5" fill="#7A8290" opacity="0.6" />
      <path d="M132 28l3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8z" fill="#fff" />
      <circle cx="100" cy="92" r="44" fill={`url(#markOrb${size})`} />
      <path d="M100 61l19 58-19-13-19 13 19-58z" stroke="#fff" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M100 155c-23-16-49-22-86-22" stroke={`url(#markLine${size})`} strokeWidth="4" strokeLinecap="round" />
      <path d="M100 155c23-16 49-22 86-22" stroke={`url(#markLine${size})`} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export default App;
