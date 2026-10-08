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
const PLANNED = new Set(['/nrr-calculator/']);

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

test('PLANNED lists only pages that do not exist yet (prune your entry when you build one)', () => {
  for (const p of PLANNED) assert.ok(!byPath.has(p), `${p} is built now: remove it from PLANNED`);
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

// ---------- Home page ----------
const home = byPath.get('/');
const decode = (t) => t.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const jsonld = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

test('home: title and H1 match the spec', () => {
  assert.equal(decode(home.html.match(/<title>([^<]*)<\/title>/)[1]), 'OneVio: Customer Success Software for Renewals, Health Scores & NRR');
  assert.equal(decode(home.html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]), 'See every renewal coming. Keep every customer.');
});

test('home: JSON-LD has Organization, SoftwareApplication and FAQPage with required fields', () => {
  const by = Object.fromEntries(jsonld(home.html).map((j) => [j['@type'], j]));
  const org = by.Organization, app = by.SoftwareApplication, faq = by.FAQPage;
  assert.ok(org && app && faq, 'all three types present');
  assert.equal(org.name, 'OneVio'); assert.equal(org.url, 'https://onevio.in/');
  assert.match(org.logo, /^https:\/\/onevio\.in\//);
  assert.equal(org.contactPoint?.email, 'manshw@gmail.com');
  assert.equal(app.name, 'OneVio'); assert.equal(app.applicationCategory, 'BusinessApplication');
  assert.equal(app.operatingSystem, 'Web'); assert.equal(app.url, 'https://onevio.in/');
  for (const k of ['aggregateRating', 'review', 'offers']) assert.ok(!(k in app), `no ${k}`);
  assert.ok(Array.isArray(faq.mainEntity) && faq.mainEntity.length === 8, '8 questions');
  for (const q of faq.mainEntity) {
    assert.equal(q['@type'], 'Question'); assert.ok(q.name);
    assert.equal(q.acceptedAnswer?.['@type'], 'Answer'); assert.ok(q.acceptedAnswer.text.length > 60, `${q.name}: full answer`);
  }
});

test('every FAQPage JSON-LD equals its page\'s visible FAQ, question and answer', () => {
  const withFaq = pages.filter((p) => jsonld(p.html).some((j) => j['@type'] === 'FAQPage'));
  assert.ok(withFaq.length >= 5, 'home + four feature pages have FAQs');
  for (const p of withFaq) {
    const faq = jsonld(p.html).find((j) => j['@type'] === 'FAQPage');
    const visible = [...p.html.matchAll(/<details[^>]*><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => [decode(m[1]), decode(m[2])]);
    assert.deepEqual(visible, faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), p.file);
  }
});

// ---------- Feature pages ----------
const FEATURE_PATHS = ['/customer-health-score/', '/renewal-management/', '/nrr-grr-reporting/', '/license-deployment-tracking/'];
const linksOf = (html) => new Set(attrs(html, 'a', 'href'));
const titleOf = (html) => decode(html.match(/<title>([^<]*)<\/title>/)[1]);
const descOf = (html) => decode(html.match(/<meta name="description" content="([^"]*)">/)[1]);
const bodyOf = (html) => html.slice(html.indexOf('</header>'), html.indexOf('<footer'));

test('titles and descriptions are unique across pages', () => {
  const t = pages.map((p) => titleOf(p.html)), d = pages.map((p) => descOf(p.html));
  assert.equal(new Set(t).size, t.length, `duplicate title in ${t.join(' | ')}`);
  assert.equal(new Set(d).size, d.length, 'duplicate description');
});

test('breadcrumb JSON-LD is a valid BreadcrumbList matching the visible breadcrumb', () => {
  for (const p of pages.filter((x) => x.path !== '/' && x.name !== '404')) {
    const bc = jsonld(p.html).find((j) => j['@type'] === 'BreadcrumbList');
    assert.ok(bc, `${p.file}: BreadcrumbList`);
    const items = bc.itemListElement;
    assert.ok(Array.isArray(items) && items.length >= 2, p.file);
    items.forEach((it, i) => {
      assert.equal(it['@type'], 'ListItem'); assert.equal(it.position, i + 1); assert.ok(it.name, 'name');
      assert.match(it.item, /^https:\/\/onevio\.in\//);
    });
    assert.equal(items[0].item, 'https://onevio.in/');
    assert.equal(items.at(-1).item, 'https://onevio.in' + p.path, `${p.file}: last crumb is the page`);
    const crumbs = p.html.match(/<nav class="crumbs"[^>]*>([\s\S]*?)<\/nav>/);
    assert.ok(crumbs, `${p.file}: visible breadcrumb`);
    assert.equal(decode(crumbs[1]).replace(/\s*\/\s*/g, ' / '), items.map((it) => it.name).join(' / '), `${p.file}: visible crumbs match JSON-LD`);
  }
});

test('feature pages: title/description length, one H1 with JSON-LD, screenshots, links and length', () => {
  for (const path of FEATURE_PATHS) {
    const p = byPath.get(path);
    assert.ok(p, `${path} built`);
    const title = titleOf(p.html), desc = descOf(p.html);
    assert.ok(title.length >= 50 && title.length <= 60, `${path} title length ${title.length}`);
    assert.ok(desc.length >= 140 && desc.length <= 160, `${path} description length ${desc.length}`);
    const ld = jsonld(p.html);
    for (const t of ['BreadcrumbList', 'SoftwareApplication', 'FAQPage']) assert.ok(ld.some((j) => j['@type'] === t), `${path} ${t}`);
    const app = ld.find((j) => j['@type'] === 'SoftwareApplication');
    assert.equal(app.name, 'OneVio');
    for (const k of ['aggregateRating', 'review', 'offers']) assert.ok(!(k in app), `${path}: no ${k}`);
    const nFaq = ld.find((j) => j['@type'] === 'FAQPage').mainEntity.length;
    assert.ok(nFaq >= 3 && nFaq <= 4, `${path}: 3-4 FAQs`);
    const prose = p.html.match(/<section class="fp-body">([\s\S]*?)<\/section>/)[1];
    const h2 = (prose.match(/<h2[\s>]/g) || []).length - 1; // minus "Related"
    assert.ok(h2 >= 3 && h2 <= 5, `${path}: ${h2} content H2s`);
    const imgs = (p.html.match(/<img\b/g) || []).length;
    assert.ok(imgs >= 1 && imgs <= 2, `${path}: 1-2 screenshots`);
    assert.ok(p.html.includes('id="demo"'), `${path}: demo partial`);
    assert.ok(p.html.includes(`property="og:image" content="https://onevio.in/assets/shots/og-${p.name}.png"`), `${path}: own OG image`);
    const links = linksOf(bodyOf(p.html));
    for (const h of ['/', '#demo', '/nrr-calculator/', ...FEATURE_PATHS.filter((x) => x !== path)]) assert.ok(links.has(h), `${path}: body links to ${h}`);
    const words = decode((p.html.match(/<section class="page-hero[\s\S]*?<\/section>/)[0] + prose).replace(/<[^>]+>/g, ' ')).split(' ').length;
    assert.ok(words >= 600 && words <= 900, `${path}: ${words} words`);
  }
});

test('every feature page is linked from the home page body and from every footer', () => {
  for (const path of FEATURE_PATHS) {
    assert.ok(linksOf(bodyOf(home.html)).has(path), `home links ${path}`);
    for (const p of pages) assert.ok(linksOf(p.html.slice(p.html.indexOf('<footer'))).has(path), `${p.file} footer links ${path}`);
  }
});

test('every <img> and <source> has alt (img), width and height; only the hero loads eagerly', () => {
  for (const p of pages) {
    for (const m of p.html.matchAll(/<(img|source)\b[^>]*>/g)) {
      const tag = m[0];
      if (m[1] === 'img') assert.match(tag, /\salt="[^"]{10,}"/, `${p.file}: img alt ${tag}`);
      assert.match(tag, /\swidth="\d+"/, `${p.file}: width ${tag}`);
      assert.match(tag, /\sheight="\d+"/, `${p.file}: height ${tag}`);
      if (m[1] === 'source') for (const u of tag.match(/srcset="([^"]+)"/)[1].split(',')) assert.ok(existsSync(join(ROOT, u.trim().split(' ')[0])), `${p.file}: ${u} missing`);
      else assert.ok(existsSync(join(ROOT, tag.match(/src="([^"]+)"/)[1])), `${p.file}: img src missing`);
    }
  }
  const imgs = [...home.html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(imgs.length >= 7, 'hero + six feature screenshots');
  assert.match(imgs[0], /loading="eager"/); assert.match(imgs[0], /fetchpriority="high"/);
  assert.match(imgs[0], /customer-success-dashboard/);
  for (const i of imgs.slice(1)) { assert.match(i, /loading="lazy"/); assert.doesNotMatch(i, /fetchpriority/); }
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
