import { signUp, signIn, resetPassword, getSession } from './auth.js';

const tabSignin   = document.getElementById('tab-signin');
const tabSignup   = document.getElementById('tab-signup');
const heading     = document.getElementById('login-heading');
const form        = document.getElementById('login-form');
const emailIn     = document.getElementById('login-email');
const emailError  = document.getElementById('email-error');
const passIn      = document.getElementById('login-password');
const confirmField = document.getElementById('confirm-field');
const confirmIn   = document.getElementById('login-confirm');
const rulesEl     = document.getElementById('password-rules');
const statusEl    = document.getElementById('login-status');
const submitBtn   = document.getElementById('login-submit');
const forgotBtn   = document.getElementById('forgot-link');
const toggleBtn   = document.getElementById('password-toggle');

const EYE_ICON =
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round">
     <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>
     <circle cx="12" cy="12" r="3"/>
   </svg>`;
const EYE_OFF_ICON =
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round">
     <path d="M3 3l18 18"/>
     <path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a15.5 15.5 0 0 1-3.2 4.1M6.5 6.6C4 8.3 2 12 2 12s3.5 7 10 7c1.4 0 2.6-.3 3.7-.8"/>
     <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>
   </svg>`;

const RULES = [
  ['length',  '8+ characters',       s => s.length >= 8],
  ['upper',   'an uppercase letter', s => /[A-Z]/.test(s)],
  ['number',  'a number',            s => /[0-9]/.test(s)],
  ['special', 'a symbol',            s => /[^A-Za-z0-9]/.test(s)],
];

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

let mode = 'signin';

function setMode(next) {
  mode = next;
  const isSignup = mode === 'signup';

  tabSignin.classList.toggle('is-active', !isSignup);
  tabSignup.classList.toggle('is-active', isSignup);
  tabSignin.setAttribute('aria-selected', String(!isSignup));
  tabSignup.setAttribute('aria-selected', String(isSignup));

  heading.textContent = isSignup ? 'Create your account' : 'Sign in to your account';
  submitBtn.textContent = isSignup ? 'Create account' : 'Sign in';
  passIn.autocomplete = isSignup ? 'new-password' : 'current-password';

  confirmField.hidden = !isSignup;
  confirmIn.required = isSignup;
  forgotBtn.hidden = isSignup;

  statusEl.textContent = '';
  statusEl.classList.remove('error');
  updatePasswordRules();
}

tabSignin.addEventListener('click', () => setMode('signin'));
tabSignup.addEventListener('click', () => setMode('signup'));

function updatePasswordRules() {
  if (mode !== 'signup' || !passIn.value) {
    rulesEl.hidden = true;
    return;
  }
  const missing = RULES.filter(([, , test]) => !test(passIn.value)).map(([, label]) => label);
  if (missing.length === 0) {
    rulesEl.hidden = true;
    return;
  }
  rulesEl.hidden = false;
  rulesEl.textContent = `Needs ${missing.join(', ')}.`;
}
passIn.addEventListener('input', updatePasswordRules);

function updateEmailError(force) {
  const value = emailIn.value.trim();
  if (!value || isValidEmail(value)) {
    emailError.hidden = true;
    return;
  }
  if (force || !emailError.hidden) {
    emailError.hidden = false;
    emailError.textContent = 'Enter a valid email address.';
  }
}
emailIn.addEventListener('blur', () => updateEmailError(true));
emailIn.addEventListener('input', () => updateEmailError(false));

toggleBtn.addEventListener('click', () => {
  const showing = passIn.type === 'text';
  passIn.type = showing ? 'password' : 'text';
  toggleBtn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  toggleBtn.innerHTML = showing ? EYE_ICON : EYE_OFF_ICON;
});

function fail(message) {
  statusEl.textContent = message;
  statusEl.classList.add('error');
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  statusEl.classList.remove('error');

  const email = emailIn.value.trim();
  const password = passIn.value;

  if (!isValidEmail(email)) {
    updateEmailError(true);
    return fail('Enter a valid email address.');
  }

  if (mode === 'signup') {
    const allMet = RULES.every(([, , test]) => test(password));
    if (!allMet) { updatePasswordRules(); return fail('Password doesn’t meet the requirements above.'); }
    if (password !== confirmIn.value) return fail("Passwords don't match.");
  } else if (!password) {
    return fail('Enter your password.');
  }

  submitBtn.disabled = true;
  statusEl.textContent = mode === 'signup' ? 'Creating your account…' : 'Signing in…';

  try {
    if (mode === 'signup') {
      const { session } = await signUp(email, password);
      if (!session) {
        statusEl.textContent = `Check ${email} to confirm.`;
        submitBtn.disabled = false;
        return;
      }
    } else {
      await signIn(email, password);
    }
    window.location.href = 'index.html';
  } catch (err) {
    submitBtn.disabled = false;
    fail(err.message);
  }
});

forgotBtn.addEventListener('click', async () => {
  const email = emailIn.value.trim();
  statusEl.classList.remove('error');
  if (!isValidEmail(email)) {
    updateEmailError(true);
    statusEl.textContent = 'Enter your email first.';
    return;
  }
  forgotBtn.disabled = true;
  try {
    await resetPassword(email);
    statusEl.textContent = `Reset link sent to ${email}, if it has an account.`;
  } catch (err) {
    fail(err.message);
  } finally {
    forgotBtn.disabled = false;
  }
});

setMode('signin');

getSession().then(session => {
  if (session) window.location.href = 'index.html';
});
