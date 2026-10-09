// "Book a demo" form: validates, checks the Turnstile token, posts JSON to the demo-form Worker.
// Loads as an ES module in the browser and in Node (tests import buildPayload); the DOM wiring only
// runs when there is a document. No dependencies.
export const ENDPOINT = 'https://demo.onevio.in/';
export const CONTACT_EMAIL = 'support@onevio.in';
export const MSG = {
  name: 'Please enter your name.',
  company: 'Please enter your company.',
  email: 'Please check your email address.',
  token: 'Please complete the check above.',
  generic: "We couldn't send that. Please try again, or email us.",
  thanks: "Thanks — we'll be in touch within one working day.",
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// formData: a FormData (or anything with .get). Returns exactly what the Worker reads.
export function buildPayload(formData, token) {
  const get = (k) => { const v = formData.get(k); return v == null ? '' : String(v); };
  return {
    name: get('name').trim(),
    company: get('company').trim(),
    email: get('email').trim(),
    team_size: get('team_size'),
    message: get('message').trim(),
    website: get('website'),
    token: token || '',
  };
}

// Returns { field, message } for the first problem, or null.
export function validate(payload) {
  if (!payload.name) return { field: 'name', message: MSG.name };
  if (!payload.company) return { field: 'company', message: MSG.company };
  if (!EMAIL_RE.test(payload.email)) return { field: 'email', message: MSG.email };
  return null;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function init(form) {
  const status = form.querySelector('.form-status');
  const button = form.querySelector('button[type="submit"]');
  const idle = button.textContent;
  let sending = false;

  const clear = () => { status.replaceChildren(); };
  const showError = (message, withEmail) => {
    clear();
    const box = el('div', 'form-msg err');
    box.append(el('span', null, message));
    status.append(box);
    if (!withEmail) return;
    const line = el('p', 'contact-line');
    const email = el('span', 'email', CONTACT_EMAIL);
    const copy = el('button', 'btn btn-ghost', 'Copy');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(CONTACT_EMAIL);
        copy.textContent = 'Copied';
      } catch {
        const r = document.createRange();
        r.selectNodeContents(email);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        copy.textContent = 'Press Ctrl+C';
      }
    });
    const who = el('span', null, 'Or email us at ');
    who.append(email);
    line.append(who, copy);
    box.append(line);
  };

  const token = () => form.querySelector('[name="cf-turnstile-response"]')?.value || '';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    const payload = buildPayload(new FormData(form), token());
    const bad = validate(payload);
    if (bad) { showError(bad.message, false); form.elements[bad.field]?.focus(); return; }
    if (!payload.token) { showError(MSG.token, false); return; }

    sending = true;
    button.disabled = true;
    button.textContent = 'Sending…';
    clear();
    let result;
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      result = res.ok && body && body.ok === true
        ? { ok: true }
        : { ok: false, message: body && typeof body.message === 'string' ? body.message : '' };
    } catch {
      result = { ok: false, message: '' };
    }
    sending = false;
    if (result.ok) {
      const done = el('p', 'form-msg ok', MSG.thanks);
      done.tabIndex = -1;
      form.replaceWith(done);
      done.focus();
      return;
    }
    button.disabled = false;
    button.textContent = idle;
    showError(result.message || MSG.generic, true);
    window.turnstile?.reset();
  });
}

if (typeof document !== 'undefined') {
  const form = document.getElementById('demo-form');
  if (form) init(form);
}
