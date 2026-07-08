import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Loader } from 'lucide-react';
import { apiPost, storeAuth, type AuthTokens } from '../lib/api';
import { supabase } from '../lib/supabase';


// ─── Types ───────────────────────────────────────────────────────────────────

type Mode = 'login' | 'signup';

// ─── Main component ───────────────────────────────────────────────────────────

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('login');

  // If the OAuth callback redirected back here with ?error=oauth, show a
  // clear message so the user knows what happened and can try again.
  // Anchor to startsWith('#auth') so arbitrary hashes can't trigger this.
  const oauthFailed = window.location.hash.startsWith('#auth') && window.location.hash.includes('error=oauth');

  return (
    <div className="auth-shell">
      {/* Background gradient matching the hero */}
      <div className="auth-bg" aria-hidden="true" />

      <div className="auth-card">
        {/* Logo */}
        <div className="auth-brand">
          <StudyPilotMark size={40} />
          <span className="auth-brand-text">studypilot.</span>
        </div>

        {/* OAuth error banner — shown when Google sign-in fails at the
            callback stage (e.g. denied consent, expired link, wrong redirect URI) */}
        {oauthFailed && (
          <p className="auth-error auth-error--banner" role="alert">
            Google sign-in failed. Please try again or use email and password.
          </p>
        )}

        {/* Tab switcher */}
        <div className="auth-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={mode === 'login'}
            className={`auth-tab ${mode === 'login' ? 'is-active' : ''}`}
            onClick={() => setMode('login')}
          >
            Sign in
          </button>
          <button
            role="tab"
            aria-selected={mode === 'signup'}
            className={`auth-tab ${mode === 'signup' ? 'is-active' : ''}`}
            onClick={() => setMode('signup')}
          >
            Create account
          </button>
        </div>

        {/* Forms — each one owns its own divider + Google button placement */}
        {mode === 'login' ? (
          <LoginForm />
        ) : (
          <SignupForm onSuccess={() => setMode('login')} />
        )}
      </div>
    </div>
  );
}

// ─── Google OAuth button ──────────────────────────────────────────────────────

function GoogleButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogle() {
    setError('');
    setLoading(true);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // Supabase redirects back to the app root after Google confirms
          // the user. The session tokens arrive in the URL fragment
          // (#access_token=...&type=...) and are handled by App.tsx.
          redirectTo: window.location.origin + '/',
        },
      });

      if (oauthError) {
        // This fires if the OAuth request itself couldn't be initiated
        // (e.g. Google provider not enabled in Supabase, network error).
        // If the user denies consent on Google's side, the error surfaces
        // at the callback stage in App.tsx instead.
        console.error('[OAuth] signInWithOAuth error:', oauthError.message);
        setError('Could not start Google sign-in. Please try again.');
        setLoading(false);
        return;
      }
      // If no error, the browser is navigating to Google — nothing more to do.
    } catch (err) {
      // Unexpected failure (e.g. Supabase client not initialised, offline)
      console.error('[OAuth] unexpected error:', err);
      setError('Something went wrong. Check your connection and try again.');
      setLoading(false);
    }
  }

  return (
    <div className="auth-oauth">
      <button
        type="button"
        className="auth-google-btn"
        onClick={handleGoogle}
        disabled={loading}
        aria-label="Continue with Google"
      >
        {loading ? (
          <Loader size={16} className="auth-spinner" />
        ) : (
          <GoogleLogo />
        )}
        Continue with Google
      </button>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

// ─── Password strength helpers ───────────────────────────────────────────────

type PasswordRule = { label: string; test: (p: string) => boolean };

const PASSWORD_RULES: PasswordRule[] = [
  { label: 'At least 8 characters',      test: (p) => p.length >= 8 },
  { label: 'One uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'One number (0–9)',           test: (p) => /\d/.test(p) },
];

function passwordValid(p: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(p));
}

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  return (
    <ul className="auth-pw-rules" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <li key={rule.label} className={`auth-pw-rule ${ok ? 'is-met' : 'is-unmet'}`}>
            <span className="auth-pw-rule-icon" aria-hidden="true">{ok ? '✓' : '·'}</span>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}

// ─── Login form ───────────────────────────────────────────────────────────────

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [suggestGoogle, setSuggestGoogle] = useState(false);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError('');
    setSuggestGoogle(false);
    setLoading(true);

    try {
      const res = await apiPost('/auth/login', { email, password });
      const data = await res.json();

      if (!res.ok) {
        const message = typeof data.detail === 'string' ? data.detail : 'Login failed.';
        // Backend sends a specific message when the account is Google-only
        if (message.toLowerCase().includes('google sign-in') || message.toLowerCase().includes('continue with google')) {
          setSuggestGoogle(true);
        } else {
          setError(message);
        }
        return;
      }

      storeAuth(data as AuthTokens);
      window.location.hash = '#dashboard';
    } catch {
      setError('Could not connect to the server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <div className="auth-field">
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          placeholder="you@university.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
      </div>

      <div className="auth-field">
        <label htmlFor="login-password">Password</label>
        <div className="auth-input-wrap">
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
          <button
            type="button"
            className="auth-eye"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>

      {suggestGoogle && (
        <div className="auth-google-prompt" role="alert">
          <p>This account was created with Google. Use the button below to sign in.</p>
        </div>
      )}

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="auth-submit" disabled={loading}>
        {loading ? (
          <>
            <Loader size={15} className="auth-spinner" />
            Signing in…
          </>
        ) : (
          <>
            Sign in <ArrowRight size={15} />
          </>
        )}
      </button>

      <div className="auth-divider" aria-hidden="true"><span>or</span></div>
      <GoogleButton />
    </form>
  );
}

// ─── Signup form ──────────────────────────────────────────────────────────────

function SignupForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }

    if (!passwordValid(password)) {
      setError('Password does not meet the requirements below.');
      return;
    }

    setLoading(true);

    try {
      const res = await apiPost("/auth/signup", { name, email, password });
      const data = await res.json();

      if (!res.ok) {
        const message =
          typeof data.detail === 'string'
            ? data.detail
            : typeof data.message === 'string'
              ? data.message
              : typeof data.error === 'string'
                ? data.error
                : 'Could not create account. Please try again.';

        setError(message);
        return;
      }

      if (data.email_confirmation_required === false && data.access_token) {
        storeAuth(data as AuthTokens);
        setSuccessMessage('Account created! Taking you to your dashboard…');
        setSuccess(true);
        window.location.hash = '#dashboard';
        return;
      }

      if (data.email_confirmation_required) {
        setSuccessMessage(data.message);
        setSuccess(true);
        setTimeout(() => onSuccess(), 4000);
        return;
      }

      // Account created but no session returned — send them to the sign-in tab.
      setSuccessMessage(data.message || 'Account created. You can sign in now.');
      setSuccess(true);
      setTimeout(() => onSuccess(), 2000);
    } catch {
      setError('Could not connect to the server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="auth-success">
        <div className="auth-success-icon">✓</div>
        <p>{successMessage}</p>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <div className="auth-field">
        <label htmlFor="signup-name">Full name</label>
        <input
          id="signup-name"
          type="text"
          autoComplete="name"
          placeholder="Alex Johnson"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={loading}
        />
      </div>

      <div className="auth-field">
        <label htmlFor="signup-email">Email</label>
        <input
          id="signup-email"
          type="email"
          autoComplete="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
      </div>

      <div className="auth-field">
        <label htmlFor="signup-password">
          Password
        </label>
        <div className="auth-input-wrap">
          <input
            id="signup-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
          <button
            type="button"
            className="auth-eye"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <PasswordStrength password={password} />
      </div>

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="auth-submit" disabled={loading}>
        {loading ? (
          <>
            <Loader size={15} className="auth-spinner" />
            Creating account…
          </>
        ) : (
          <>
            Create account <ArrowRight size={15} />
          </>
        )}
      </button>

      <div className="auth-divider" aria-hidden="true"><span>or</span></div>
      <GoogleButton />

      <p className="auth-legal">
        By creating an account you agree to our{' '}
        <a href="#terms">Terms of Use</a> and{' '}
        <a href="#privacy">Privacy Policy</a>.
      </p>
    </form>
  );
}

// ─── Mark (reused from App.tsx) ───────────────────────────────────────────────

function StudyPilotMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.9} viewBox="0 0 200 180" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`authMarkOrb${size}`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#39D7FF" />
          <stop offset="0.42" stopColor="#5C6CFF" />
          <stop offset="0.72" stopColor="#A855F7" />
          <stop offset="1" stopColor="#FF4FD8" />
        </linearGradient>
        <linearGradient id={`authMarkLine${size}`} x1="0" y1="0" x2="1" y2="0">
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
      <circle cx="100" cy="92" r="44" fill={`url(#authMarkOrb${size})`} />
      <path d="M100 61l19 58-19-13-19 13 19-58z" stroke="#fff" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M100 155c-23-16-49-22-86-22" stroke={`url(#authMarkLine${size})`} strokeWidth="4" strokeLinecap="round" />
      <path d="M100 155c23-16 49-22 86-22" stroke={`url(#authMarkLine${size})`} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
