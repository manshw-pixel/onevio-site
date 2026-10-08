import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, validate } from '../demo-form.js';

function fd(o) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; }

test('buildPayload returns exactly the Worker fields, trimmed, with the token', () => {
  const p = buildPayload(fd({ name: ' Ada ', company: 'Acme ', email: ' ada@acme.com', team_size: '6–20', message: ' hi ', website: '' }), 'tok');
  assert.deepEqual(p, { name: 'Ada', company: 'Acme', email: 'ada@acme.com', team_size: '6–20', message: 'hi', website: '', token: 'tok' });
});

test('buildPayload tolerates missing fields and passes the honeypot through', () => {
  const p = buildPayload(fd({ name: 'A', website: 'http://spam' }), undefined);
  assert.equal(p.company, '');
  assert.equal(p.team_size, '');
  assert.equal(p.token, '');
  assert.equal(p.website, 'http://spam');
});

test('validate reports the first problem in order', () => {
  assert.equal(validate({ name: '', company: '', email: '' }).message, 'Please enter your name.');
  assert.equal(validate({ name: 'a', company: '', email: '' }).message, 'Please enter your company.');
  assert.equal(validate({ name: 'a', company: 'b', email: 'nope@x' }).message, 'Please check your email address.');
  assert.equal(validate({ name: 'a', company: 'b', email: 'a@b.co' }), null);
});
