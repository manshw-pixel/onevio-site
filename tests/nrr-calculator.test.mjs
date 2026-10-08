// Browser tests for /nrr-calculator/. Set NRR_SHOTS=<dir> to also write screenshots (1440 and 390, light and dark).
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

async function open({ width = 1280, height = 900, colorScheme = 'light' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme });
  const page = await ctx.newPage();
  await page.route(/challenges\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(server.url + '/nrr-calculator/');
  await page.waitForLoadState('networkidle');
  return { page, ctx };
}
async function typeExample(page) {
  await page.fill('[name=start]', '4,00,00,000');
  await page.fill('[name=expansion]', '60,00,000');
  await page.fill('[name=contraction]', '10,00,000');
  await page.fill('[name=churn]', '22,00,000');
}
const text = (page, sel) => page.locator(sel).innerText();
const words = async (page, sel) => (await text(page, sel)).split(/\s+/).filter(Boolean).length;

test('typing the example shows 107%, 92% and the ending ARR', async () => {
  const { page, ctx } = await open();
  await typeExample(page);
  assert.equal(await text(page, '.out-nrr'), '107%');
  assert.equal(await text(page, '.out-grr'), '92%');
  assert.equal(await text(page, '.out-end'), '₹4,28,00,000');
  assert.equal(await page.locator('.calc-error').innerText(), '');
  await ctx.close();
});

test('western grouping is accepted too, and results update on every keystroke', async () => {
  const { page, ctx } = await open();
  await page.fill('[name=start]', '4,000,000');
  assert.equal(await text(page, '.out-nrr'), '100%');
  await page.fill('[name=expansion]', '600,000');
  assert.equal(await text(page, '.out-nrr'), '115%');
  await page.fill('[name=start]', '');
  assert.equal(await text(page, '.calc-error'), 'Starting ARR must be more than 0.');
  await ctx.close();
});

test('each validation message appears inline', async () => {
  const { page, ctx } = await open();
  await page.fill('[name=start]', '0');
  assert.equal(await text(page, '.calc-error'), 'Starting ARR must be more than 0.');
  await page.fill('[name=start]', '100');
  await page.fill('[name=churn]', '-5');
  assert.equal(await text(page, '.calc-error'), "Values can't be negative.");
  await page.fill('[name=churn]', '70');
  await page.fill('[name=contraction]', '40');
  assert.equal(await text(page, '.calc-error'), "Contraction and churn can't be more than starting ARR.");
  assert.equal(await page.locator('.calc-results').isHidden(), true);
  await page.fill('[name=contraction]', '10');
  assert.equal(await text(page, '.calc-error'), '');
  assert.equal(await page.locator('.calc-results').isVisible(), true);
  await ctx.close();
});

test('the currency switch changes formatting and the symbol', async () => {
  const { page, ctx } = await open();
  await typeExample(page);
  await page.locator('.cur label', { hasText: '$' }).click();
  assert.equal(await text(page, '.out-end'), '$42,800,000');
  assert.equal(await page.locator('[name=start]').inputValue(), '40,000,000');
  assert.equal(await page.locator('.amt .sym').first().innerText(), '$');
  assert.match(await page.locator('.bridge').getAttribute('aria-label'), /\$42,800,000/);
  await page.locator('.cur label', { hasText: '€' }).click();
  assert.equal(await text(page, '.out-end'), '€42,800,000');
  await page.locator('.cur label', { hasText: '₹' }).click();
  assert.equal(await text(page, '.out-end'), '₹4,28,00,000');
  assert.equal(await page.locator('[name=start]').inputValue(), '4,00,00,000');
  await ctx.close();
});

test('chart: five bars with explicit, distinct fills, everything inside the viewBox', async () => {
  const { page, ctx } = await open();
  await typeExample(page);
  const info = await page.evaluate(() => {
    const svg = document.querySelector('.bridge');
    const vb = svg.viewBox.baseVal;
    return [...svg.querySelectorAll('rect, text')].map((n) => {
      const b = n.getBBox();
      return { tag: n.tagName, fill: getComputedStyle(n).fill, inside: b.x >= 0 && b.y >= 0 && b.x + b.width <= vb.width && b.y + b.height <= vb.height };
    });
  });
  const rects = info.filter((s) => s.tag === 'rect');
  assert.equal(rects.length, 5);
  for (const s of info) {
    assert.ok(s.fill && s.fill !== 'none' && s.fill !== 'rgba(0, 0, 0, 0)', `fill ${s.fill}`);
    assert.ok(s.inside, 'shape inside viewBox');
  }
  assert.equal(new Set(rects.map((r) => r.fill)).size, 5);
  await ctx.close();
});

test('chart stays inside the viewBox for extreme inputs', async () => {
  const { page, ctx } = await open();
  await page.fill('[name=start]', '100');
  await page.fill('[name=expansion]', '9,999,999');
  await page.fill('[name=churn]', '100');
  const ok = await page.evaluate(() => {
    const svg = document.querySelector('.bridge');
    const vb = svg.viewBox.baseVal;
    return [...svg.querySelectorAll('rect, text')].every((n) => { const b = n.getBBox(); return b.x >= 0 && b.y >= 0 && b.x + b.width <= vb.width && b.y + b.height <= vb.height; });
  });
  assert.ok(ok);
  await ctx.close();
});

test('no network requests while the visitor uses the tool', async () => {
  const { page, ctx } = await open();
  const seen = [];
  page.on('request', (r) => seen.push(r.url()));
  await typeExample(page);
  await page.locator('.cur label', { hasText: '$' }).click();
  await page.fill('[name=churn]', '-1');
  await page.click('.try-example');
  await page.locator('[name=start]').blur();
  await page.waitForTimeout(300);
  assert.deepEqual(seen, []);
  await ctx.close();
});

test('accessibility: live region, labelled decimal inputs, aria-invalid', async () => {
  const { page, ctx } = await open();
  assert.equal(await page.locator('.calc-out').getAttribute('aria-live'), 'polite');
  for (const name of ['start', 'expansion', 'contraction', 'churn']) {
    assert.equal(await page.locator(`[name=${name}]`).getAttribute('inputmode'), 'decimal');
    assert.ok((await page.locator(`label:has([name=${name}])`).innerText()).length > 5, `${name} has a label`);
  }
  await typeExample(page);
  await page.fill('[name=start]', '0');
  assert.equal(await page.locator('[name=start]').getAttribute('aria-invalid'), 'true');
  await ctx.close();
});

test('no horizontal scroll at 360px, with and without results', async () => {
  const { page, ctx } = await open({ width: 360, height: 800 });
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert.equal(await wide(), false);
  await page.fill('[name=start]', '9,999,999,999,999');
  await page.fill('[name=expansion]', '999,999,999,999');
  assert.equal(await wide(), false);
  await typeExample(page);
  assert.equal(await wide(), false);
  await ctx.close();
});

test('the FAQ matches its JSON-LD', async () => {
  const { page, ctx } = await open();
  const dom = await page.$$eval('#faq details', (ds) => ds.map((d) => [d.querySelector('summary').textContent.trim(), d.querySelector('p').textContent.trim()]));
  const ld = await page.$$eval('script[type="application/ld+json"]', (s) => s.map((x) => JSON.parse(x.textContent)));
  const faq = ld.find((o) => o['@type'] === 'FAQPage');
  assert.deepEqual(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), dom);
  assert.ok(dom.length >= 3 && dom.length <= 4);
  assert.ok(ld.some((o) => o['@type'] === 'WebApplication'));
  assert.ok(ld.some((o) => o['@type'] === 'BreadcrumbList'));
  await ctx.close();
});

test('title, description and copy length', async () => {
  const { page, ctx } = await open();
  const title = await page.title();
  const desc = await page.getAttribute('meta[name=description]', 'content');
  assert.ok(title.length >= 50 && title.length <= 60, `title ${title.length}`);
  assert.ok(desc.length >= 140 && desc.length <= 160, `description ${desc.length}`);
  const prose = (await words(page, '.calc-copy')) - (await words(page, '.calc-copy .related')) - (await words(page, '.calc-copy .callout'));
  assert.ok(prose >= 500 && prose <= 700, `prose words ${prose}`);
  await ctx.close();
});

test('screenshots (only with NRR_SHOTS)', { skip: !process.env.NRR_SHOTS }, async () => {
  mkdirSync(process.env.NRR_SHOTS, { recursive: true });
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    for (const colorScheme of ['light', 'dark']) {
      const { page, ctx } = await open({ width, height, colorScheme });
      await typeExample(page);
      await page.screenshot({ path: `${process.env.NRR_SHOTS}/calc-${width}-${colorScheme}.png`, fullPage: true });
      await page.fill('[name=churn]', '999,999,999');
      await page.screenshot({ path: `${process.env.NRR_SHOTS}/calc-error-${width}-${colorScheme}.png`, clip: { x: 0, y: 0, width, height } });
      await ctx.close();
    }
  }
});
