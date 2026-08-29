import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, signUp, resetPassword } from '../lib/supabase';
import './LoginPage.css';

type Mode = 'signin' | 'signup';

const PASSWORD_RULES: [string, (value: string) => boolean][] = [
  ['8+ characters', value => value.length >= 8],
  ['an uppercase letter', value => /[A-Z]/.test(value)],
  ['a number', value => /[0-9]/.test(value)],
  ['a symbol', value => /[^A-Za-z0-9]/.test(value)],
];

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailErrorShown, setEmailErrorShown] = useState(false);
  const [status, setStatus] = useState('');
  const [statusIsError, setStatusIsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isSignup = mode === 'signup';
  const missingRules = PASSWORD_RULES.filter(([, test]) => !test(password)).map(([label]) => label);
  const showPasswordRules = isSignup && password.length > 0 && missingRules.length > 0;
  const showEmailError = emailErrorShown && email.trim().length > 0 && !isValidEmail(email.trim());

  function switchMode(next: Mode) {
    setMode(next);
    setStatus('');
    setStatusIsError(false);
  }

  function fail(message: string) {
    setStatus(message);
    setStatusIsError(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatusIsError(false);

    const trimmedEmail = email.trim();

    if (!isValidEmail(trimmedEmail)) {
      setEmailErrorShown(true);
      fail('Enter a valid email address.');
      return;
    }

    if (isSignup) {
      if (missingRules.length > 0) {
        fail('Password doesn’t meet the requirements above.');
        return;
      }
      if (password !== confirm) {
        fail('Passwords don’t match.');
        return;
      }
    } else if (!password) {
      fail('Enter your password.');
      return;
    }

    setSubmitting(true);
    setStatus(isSignup ? 'Creating your account…' : 'Signing in…');

    try {
      if (isSignup) {
        const { session } = await signUp(trimmedEmail, password);
        if (!session) {
          setStatus(`Check ${trimmedEmail} to confirm.`);
          setSubmitting(false);
          return;
        }
      } else {
        await signIn(trimmedEmail, password);
      }
      navigate('/', { replace: true });
    } catch (err) {
      setSubmitting(false);
      fail(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  async function handleForgotPassword() {
    const trimmedEmail = email.trim();
    setStatusIsError(false);
    if (!isValidEmail(trimmedEmail)) {
      setEmailErrorShown(true);
      setStatus('Enter your email first.');
      return;
    }
    try {
      await resetPassword(trimmedEmail);
      setStatus(`Reset link sent to ${trimmedEmail}, if it has an account.`);
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <main className="login-stage">
      <div className="login-hero">
        <h1 className="login-title">Dastaan</h1>
        <p className="login-subtitle">Language lessons and bedtime stories for kids</p>
      </div>

      <div className="login-panel">
        <div className="login-tabs" role="tablist" aria-label="Sign in or create an account">
          <button
            type="button"
            className={`login-tab${!isSignup ? ' is-active' : ''}`}
            role="tab"
            aria-selected={!isSignup}
            onClick={() => switchMode('signin')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`login-tab${isSignup ? ' is-active' : ''}`}
            role="tab"
            aria-selected={isSignup}
            onClick={() => switchMode('signup')}
          >
            Create account
          </button>
        </div>

        <h2 className="sr-only">{isSignup ? 'Create your account' : 'Sign in to your account'}</h2>

        <form onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              onBlur={() => setEmailErrorShown(true)}
            />
          </label>
          {showEmailError && <p className="note error">Enter a valid email address.</p>}

          <label className="field">
            <span className="field-label">Password</span>
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                minLength={8}
                maxLength={72}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(v => !v)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </label>
          {showPasswordRules && (
            <p className="note error" aria-live="polite">
              Needs {missingRules.join(', ')}.
            </p>
          )}

          {isSignup && (
            <label className="field">
              <span className="field-label">Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                maxLength={72}
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
              />
            </label>
          )}

          <p className={`note${statusIsError ? ' error' : ''}`} aria-live="polite">
            {status}
          </p>

          <button type="submit" className="start-btn" disabled={submitting}>
            {isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {!isSignup && (
          <button type="button" className="forgot-link" onClick={handleForgotPassword}>
            Forgot your password?
          </button>
        )}
      </div>
    </main>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a15.5 15.5 0 0 1-3.2 4.1M6.5 6.6C4 8.3 2 12 2 12s3.5 7 10 7c1.4 0 2.6-.3 3.7-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
