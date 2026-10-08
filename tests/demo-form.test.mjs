// Browser tests for the demo form. Turnstile and the Worker are stubbed with routes; nothing leaves the machine.
// Set DEMO_SHOTS=<dir> to also write error/success screenshots at 390 and 1440.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

let server, browser;
before(async () => {
  server = await serve();
  browser = await chromium.launch(process.env.CRM_TEST_CHANNEL ? { channel: process.env.CRM_TEST_CHANNEL } : {});
});
after(async () => { await browser?.close(); await server?.close(); });

const GENERIC = "We couldn't send that. Please try again, or email us.";
const THANKS = "Thanks — we'll be in touch within one working day.";
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };

const stub = (inject) => `window.__resets = 0;
window.turnstile = { reset() { window.__resets++; var i = document.querySelector('[name="cf-turnstile-response"]'); if (i) i.value = 'tok-' + (window.__resets + 1); } };
${inject ? `function put() {
  var i = document.createElement('input'); i.type = 'hidden'; i.name = 'cf-turnstile-response'; i.value = 'tok-1';
  document.querySelector('.cf-turnstile').appendChild(i);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', put); else put();` : ''}`;

async function open({ token = true, worker, viewport = { width: 1280, height: 900 } } = {}) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const posts = [];
  await page.route('https://challenges.cloudflare.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: stub(token) }));
  await page.route('https://demo.onevio.in/**', async (r) => {
    const req = r.request();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    posts.push(JSON.parse(req.postData()));
    return worker(r);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(server.url + '/#demo');
  await page.waitForFunction(() => window.turnstile);
  if (token) await page.waitForSelector('[name="cf-turnstile-response"]', { state: 'attached' });
  return { page, posts, ctx };
}
const json = (status, body) => (r) => r.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });
async function fill(page, extra = {}) {
  await page.fill('[name=name]', ' Ada Lovelace ');
  await page.fill('[name=company]', 'Acme');
  await page.fill('[name=email]', 'ada@acme.com');
  await page.selectOption('[name=team_size]', '6–20');
  await page.fill('[name=message]', 'Show me renewals');
  if (extra.website) await page.evaluate((v) => { document.querySelector('[name=website]').value = v; }, extra.website);
}
const submit = (page) => page.click('#demo-form button[type=submit]');

test('success: exact POST body, then the thanks message with focus', async () => {
  const { page, posts, ctx } = await open({ worker: json(200, { ok: true }) });
  await fill(page);
  await submit(page);
  await page.waitForFunction((t) => document.activeElement?.textContent === t, THANKS);
  assert.deepEqual(posts, [{ name: 'Ada Lovelace', company: 'Acme', email: 'ada@acme.com', team_size: '6–20', message: 'Show me renewals', website: '', token: 'tok-1' }]);
  assert.equal(await page.locator('#demo-form').count(), 0, 'form is replaced');
  await ctx.close();
});

test('button shows Sending… and is disabled while the request is in flight', async () => {
  let release;
  const gate = new Promise((ok) => { release = ok; });
  const { page, ctx } = await open({ worker: async (r) => { await gate; return json(200, { ok: true })(r); } });
  await fill(page);
  await submit(page);
  await page.waitForSelector('#demo-form button[type=submit][disabled]');
  assert.equal(await page.locator('#demo-form button[type=submit]').textContent(), 'Sending…');
  release();
  await page.getByText(THANKS).waitFor();
  await ctx.close();
});

test('a 400 shows the Worker message, the email line, and resets Turnstile', async () => {
  const { page, ctx } = await open({ worker: json(400, { ok: false, error: 'rejected', message: 'Please check your email address.' }) });
  await fill(page);
  await submit(page);
  const err = page.locator('.form-status .form-msg.err');
  await err.waitFor();
  const text = await err.textContent();
  assert.match(text, /^Please check your email address\./);
  assert.match(text, /Or email us at manshw@gmail\.com/);
  assert.equal(await page.locator('.form-status button', { hasText: 'Copy' }).count(), 1);
  await page.waitForFunction(() => window.__resets === 1);
  assert.equal(await page.getByText(THANKS).count(), 0);
  assert.equal(await page.locator('#demo-form button[type=submit]').isDisabled(), false);
  await ctx.close();
});

test('a network failure shows the generic error and the email line, never success', async () => {
  const { page, ctx } = await open({ worker: (r) => r.abort('failed') });
  await fill(page);
  await submit(page);
  const err = page.locator('.form-status .form-msg.err');
  await err.waitFor();
  const text = await err.textContent();
  assert.ok(text.startsWith(GENERIC), text);
  assert.match(text, /Or email us at manshw@gmail\.com/);
  assert.equal(await page.getByText(THANKS).count(), 0);
  assert.equal(await page.locator('#demo-form').count(), 1);
  await ctx.close();
});

test('a non-JSON server error shows the generic error', async () => {
  const { page, ctx } = await open({ worker: (r) => r.fulfill({ status: 502, headers: CORS, contentType: 'text/plain', body: 'bad gateway' }) });
  await fill(page);
  await submit(page);
  const err = page.locator('.form-status .form-msg.err');
  await err.waitFor();
  assert.ok((await err.textContent()).startsWith(GENERIC));
  await ctx.close();
});

test('an empty token shows the prompt and makes no POST', async () => {
  const { page, posts, ctx } = await open({ token: false, worker: json(200, { ok: true }) });
  await fill(page);
  await submit(page);
  await page.getByText('Please complete the check above.').waitFor();
  assert.equal(posts.length, 0);
  await ctx.close();
});

test('client validation: name, company, email, with no POST', async () => {
  const { page, posts, ctx } = await open({ worker: json(200, { ok: true }) });
  await submit(page);
  await page.getByText('Please enter your name.').waitFor();
  await page.fill('[name=name]', 'Ada');
  await submit(page);
  await page.getByText('Please enter your company.').waitFor();
  await page.fill('[name=company]', 'Acme');
  await page.fill('[name=email]', 'not-an-email');
  await submit(page);
  await page.getByText('Please check your email address.').waitFor();
  assert.equal(posts.length, 0);
  await ctx.close();
});

test('a filled honeypot is passed through as website', async () => {
  const { page, posts, ctx } = await open({ worker: json(200, { ok: true }) });
  await fill(page, { website: 'http://spam.example' });
  await submit(page);
  await page.getByText(THANKS).waitFor();
  assert.equal(posts[0].website, 'http://spam.example');
  await ctx.close();
});

test('Copy falls back to selecting the address when the clipboard is refused', async () => {
  const { page, ctx } = await open({ worker: json(400, { ok: false, message: 'x' }) });
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('no')) }, configurable: true }); });
  await fill(page);
  await submit(page);
  await page.locator('.form-status button', { hasText: 'Copy' }).click();
  await page.waitForFunction(() => window.getSelection().toString() === 'manshw@gmail.com');
  await ctx.close();
});

test('screenshots of the error and success states (only when DEMO_SHOTS is set)', async (t) => {
  const dir = process.env.DEMO_SHOTS;
  if (!dir) return t.skip('DEMO_SHOTS not set');
  mkdirSync(dir, { recursive: true });
  for (const width of [390, 1440]) {
    for (const state of ['error', 'success']) {
      const worker = state === 'error' ? json(400, { ok: false, message: 'Please check your email address.' }) : json(200, { ok: true });
      const { page, ctx } = await open({ viewport: { width, height: 900 }, worker });
      await fill(page);
      await submit(page);
      await (state === 'error' ? page.locator('.form-status .form-msg.err') : page.getByText(THANKS)).waitFor();
      await page.locator('#demo').screenshot({ path: `${dir}/${state}-${width}.png` });
      await ctx.close();
    }
  }
});
