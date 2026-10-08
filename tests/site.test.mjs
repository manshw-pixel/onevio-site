// Site checks: assembled output is fresh, links are sound, layout holds at 360px,
// dark scheme applies. Run with `npm test`. Set CRM_TEST_CHANNEL=msedge to use a
// locally installed browser channel instead of Playwright's bundled chromium.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { assemble, outPathFor, parseMeta, ROOT } from '../scripts/assemble.mjs';
import { serve } from './serve.mjs';

const LOGIN = 'https://crm.onevio.in/crm.html';

// Pages linked from the shared header/footer that later tasks build. Each task
// that adds one of these pages must delete it from this list.
const PLANNED = new Set([
  '/customer-health-score/', '/renewal-management/', '/nrr-grr-reporting/',
  '/license-deployment-tracking/', '/nrr-calculator/',
]);

const pageNames = readdirSync(join(ROOT, 'pages')).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort();
const pages = pageNames.map((name) => {
  const { meta } = parseMeta(readFileSync(join(ROOT, 'pages', `${name}.html`), 'utf8'), name);
  const file = outPathFor(name);
  const html = existsSync(join(ROOT, file)) ? readFileSync(join(ROOT, file), 'utf8') : '';
  return { name, file, path: meta.path, html };
});
const byPath = new Map(pages.map((p) => [p.path, p]));
const attrs = (html, tag, attr) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*\\s${attr}="([^"]*)"`, 'g'))].map((m) => m[1]);
const ids = (html) => new Set(attrs(html, '[a-z0-9]+', 'id'));

test('assembled output is fresh (re-run `npm run assemble`)', () => {
  const sitemap = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
  const lastmod = sitemap.match(/<lastmod>([\d-]+)<\/lastmod>/)[1];
  const tmp = mkdtempSync(join(tmpdir(), 'onevio-site-'));
  try {
    const files = assemble({ outDir: tmp, lastmod });
    for (const f of files) {
      assert.ok(existsSync(join(ROOT, f)), `${f} is not committed`);
      assert.equal(readFileSync(join(ROOT, f), 'utf8'), readFileSync(join(tmp, f), 'utf8'), `${f} is stale`);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('sitemap lists every page except 404, with lastmod', () => {
  const locs = [...readFileSync(join(ROOT, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g)].map((m) => m[1]);
  const want = pages.filter((p) => p.name !== '404').map((p) => 'https://onevio.in' + p.path).sort();
  assert.deepEqual([...locs].sort(), want);
});

test('every page has head metadata: title, description, canonical, OG, Twitter', () => {
  for (const p of pages) {
    assert.match(p.html, /^<!DOCTYPE html>\n<html lang="en">/, p.file);
    assert.match(p.html, /<title>[^<{]{10,}<\/title>/, `${p.file} title`);
    assert.match(p.html, /<meta name="description" content="[^"{]{50,}">/, `${p.file} description`);
    for (const k of ['og:title', 'og:description', 'og:image', 'og:url']) assert.ok(p.html.includes(`property="${k}"`), `${p.file} ${k}`);
    assert.ok(p.html.includes('name="twitter:card" content="summary_large_image"'), `${p.file} twitter`);
    if (p.name === '404') assert.ok(p.html.includes('content="noindex"') && !p.html.includes('rel="canonical"'), '404 is noindex, no canonical');
    else assert.ok(p.html.includes(`<link rel="canonical" href="https://onevio.in${p.path}">`), `${p.file} canonical`);
    for (const m of p.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const j = JSON.parse(m[1]);
      assert.equal(j['@context'], 'https://schema.org', `${p.file} JSON-LD context`);
      assert.ok(!JSON.stringify(j).includes('aggregateRating'), 'no aggregateRating, ever');
    }
  }
});

test('every page has exactly one <h1>', () => {
  for (const p of pages) assert.equal((p.html.match(/<h1[\s>]/g) || []).length, 1, p.file);
});

test('Login links point exactly at the CRM', () => {
  for (const p of pages) {
    const logins = [...p.html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>\s*Login\s*<\/a>/g)].map((m) => m[1]);
    assert.ok(logins.length >= 2, `${p.file}: header and footer Login present`);
    for (const h of logins) assert.equal(h, LOGIN, `${p.file}: Login href`);
    for (const h of attrs(p.html, 'a', 'href').filter((h) => h.includes('crm.onevio.in'))) assert.equal(h, LOGIN, `${p.file}: CRM href`);
  }
});

test('internal links and anchors resolve', () => {
  for (const p of pages) {
    const pageIds = ids(p.html);
    for (const href of [...attrs(p.html, 'a', 'href'), ...attrs(p.html, 'link', 'href')]) {
      if (/^(https?:|mailto:|tel:)/.test(href)) continue;
      const [path, hash] = href.split('#');
      if (!path) { assert.ok(pageIds.has(hash), `${p.file}: #${hash} has no target`); continue; }
      assert.ok(path.startsWith('/'), `${p.file}: use root-relative links (${href})`);
      if (PLANNED.has(path)) continue;
      const target = byPath.get(path);
      if (target) {
        if (hash) assert.ok(ids(target.html).has(hash), `${p.file}: ${href} anchor missing on ${target.file}`);
      } else {
        assert.ok(existsSync(join(ROOT, path)), `${p.file}: ${href} does not exist`);
        assert.ok(!hash, `${p.file}: anchor into non-page ${href}`);
      }
    }
  }
});

// ---------- Browser checks ----------
let server, browser;
before(async () => {
  server = await serve();
  browser = await chromium.launch(process.env.CRM_TEST_CHANNEL ? { channel: process.env.CRM_TEST_CHANNEL } : {});
});
after(async () => { await browser?.close(); await server?.close(); });

const urlOf = (p) => server.url + (p.name === '404' ? '/does-not-exist/' : p.path);

test('server serves every page (404 with status 404)', async () => {
  for (const p of pages) {
    const res = await fetch(urlOf(p));
    assert.equal(res.status, p.name === '404' ? 404 : 200, p.file);
  }
});

test('no horizontal scroll at 360px, menu open or closed', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const page = await ctx.newPage();
  try {
    for (const p of pages) {
      await page.goto(urlOf(p));
      const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(await over(), 0, `${p.file} overflows at 360px`);
      await page.locator('.mnav > summary').click();
      await page.locator('.mnav-panel').waitFor({ state: 'visible' });
      assert.equal(await over(), 0, `${p.file} overflows with the menu open`);
      assert.equal(await page.locator('.nav-links').isVisible(), false, 'desktop nav hidden on phones');
    }
  } finally { await ctx.close(); }
});

test('desktop Features dropdown opens without JS', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, javaScriptEnabled: false });
  const page = await ctx.newPage();
  try {
    await page.goto(server.url + '/');
    await page.locator('.dd > summary').click();
    const links = page.locator('.dd-panel a');
    await links.first().waitFor({ state: 'visible' });
    assert.equal(await links.count(), 5);
    assert.equal(await page.locator('.dd-panel a').last().getAttribute('href'), '/#features');
  } finally { await ctx.close(); }
});

test('dark scheme applies dark tokens; light applies light', async () => {
  for (const [scheme, bg, accent] of [['light', 'rgb(245, 246, 250)', '#4f46e5'], ['dark', 'rgb(12, 15, 29)', '#8b8cf8']]) {
    const ctx = await browser.newContext({ colorScheme: scheme });
    const page = await ctx.newPage();
    try {
      await page.goto(server.url + '/');
      const got = await page.evaluate(() => ({
        bg: getComputedStyle(document.body).backgroundColor,
        accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      }));
      assert.equal(got.bg, bg, `${scheme} background`);
      assert.equal(got.accent, accent, `${scheme} accent`);
    } finally { await ctx.close(); }
  }
});
