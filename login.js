/**
 * login.js — sign-in / create-account behaviour for Dastaan
 *
 * Design pass, not the real thing yet: every check below (email shape,
 * password rules, confirm-match) runs for real, but there's no backend
 * wired up — a well-formed submission always "succeeds" and moves on to
 * the app. When real auth lands, only the body of the submit handler
 * changes; the markup, validation, and states here stay as designed.
 */

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

// Length-over-complexity is the current best-practice line, but "password
// limitations, considered" was the ask, so this checks the classic four —
// tuned to not be so strict a real parent gives up mid-signup.
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

/** Only surfaces what's still missing — nothing shown once it's all met,
 *  and nothing shown at all outside sign-up (sign-in doesn't re-check an
 *  existing password against today's rules). */
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

/** Same idea for email: quiet until it's actually invalid, and only
 *  checked once the parent has finished typing it (on blur), not while
 *  they're still mid-address. Clears itself the moment it's fixed. */
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
    if (!allMet) { updatePasswordRules(); return fail('Your password doesn’t meet the requirements above.'); }
    if (password !== confirmIn.value) return fail("Passwords don't match.");
  } else if (!password) {
    return fail('Enter your password.');
  }

  submitBtn.disabled = true;
  statusEl.textContent = mode === 'signup' ? 'Creating your account…' : 'Signing in…';

  // No backend yet — this is a design pass. Any well-formed submission
  // succeeds so the rest of the app is reachable for review.
  await new Promise(r => setTimeout(r, 550));
  statusEl.textContent = "You're in.";
  await new Promise(r => setTimeout(r, 350));
  window.location.href = 'index.html';
});

forgotBtn.addEventListener('click', () => {
  const email = emailIn.value.trim();
  statusEl.classList.remove('error');
  statusEl.textContent = isValidEmail(email)
    ? `If ${email} has an account, a reset link is on its way.`
    : 'Enter your email above first.';
});

setMode('signin');
