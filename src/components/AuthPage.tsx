import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Loader } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type Mode = 'login' | 'signup';

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user_id: string;
  email: string;
}

// ─── Config ──────────────────────────────────────────────────────────────────

// Point this at your FastAPI server
const API_BASE = 'http://localhost:8000';

// ─── Main component ───────────────────────────────────────────────────────────

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('login');

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

        {/* Form */}
        {mode === 'login' ? (
          <LoginForm />
        ) : (
          <SignupForm onSuccess={() => setMode('login')} />
        )}
      </div>
    </div>
  );
}

// ─── Login form ───────────────────────────────────────────────────────────────

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'Login failed. Please try again.');
        return;
      }

      const auth = data as AuthResponse;

      // Store the JWT so the rest of the app can use it
      localStorage.setItem('sp_access_token', auth.access_token);
      localStorage.setItem('sp_refresh_token', auth.refresh_token);
      localStorage.setItem('sp_user_id', auth.user_id);
      localStorage.setItem('sp_email', auth.email);

      // Redirect to dashboard
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'Signup failed. Please try again.');
        return;
      }

      // Email confirmation required — no token yet
      if (data.email_confirmation_required) {
        setSuccess(true);
        setTimeout(() => onSuccess(), 3000);
        return;
      }

      setSuccess(true);

      // Auto-switch to login after 2 seconds
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
        <p>Account created. Check your email to confirm, then sign in.</p>
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
          <span className="auth-field-hint">min. 8 characters</span>
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
