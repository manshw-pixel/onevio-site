// Stamps partials into page sources and writes the committed static output.
//
//   pages/<name>.html  ->  index.html (name "index"), 404.html (name "404"),
//                          <name>/index.html (everything else)
//   + sitemap.xml (every page except 404), lastmod = $SITE_LASTMOD or today.
//
// Page sources start with  <!-- @meta {json} -->  (title, description, path,
// ogImage?, jsonld?[], noindex?) and use  <!-- @include NAME -->  markers that
// expand to partials/NAME.html. Usage: node scripts/assemble.mjs [outDir]
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ORIGIN = 'https://onevio.in';
export const DEFAULT_OG = '/assets/og-default.png';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const jsonForScript = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

export function outPathFor(name) {
  if (name === 'index') return 'index.html';
  if (name === '404') return '404.html';
  return `${name}/index.html`;
}

export function parseMeta(src, name) {
  const m = src.match(/^\s*<!--\s*@meta\s*([\s\S]*?)-->\s*/);
  if (!m) throw new Error(`pages/${name}.html: missing <!-- @meta {...} --> block`);
  let meta;
  try { meta = JSON.parse(m[1]); } catch (e) { throw new Error(`pages/${name}.html: bad @meta JSON: ${e.message}`); }
  for (const k of ['title', 'description', 'path']) if (!meta[k]) throw new Error(`pages/${name}.html: @meta.${k} is required`);
  return { meta, body: src.slice(m[0].length) };
}

function renderHead(tpl, meta) {
  const url = ORIGIN + meta.path;
  const og = meta.ogImage || DEFAULT_OG;
  const vals = {
    title: esc(meta.title),
    description: esc(meta.description),
    url: esc(url),
    ogImage: esc(/^https?:/.test(og) ? og : ORIGIN + og),
    canonical: meta.noindex ? '' : `<link rel="canonical" href="${esc(url)}">\n`,
    robots: meta.noindex ? '<meta name="robots" content="noindex">\n' : '',
    jsonld: (meta.jsonld || []).map((o) => `<script type="application/ld+json">${jsonForScript(o)}</script>`).join('\n'),
  };
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vals)) throw new Error(`head partial: unknown token {{${k}}}`);
    return vals[k];
  }).replace(/\n+$/, '');
}

export function renderPage(src, name, root = ROOT) {
  const { meta, body } = parseMeta(src, name);
  const html = body.replace(/<!--\s*@include\s+([\w-]+)\s*-->/g, (_, inc) => {
    let part;
    try { part = readFileSync(join(root, 'partials', `${inc}.html`), 'utf8'); }
    catch { throw new Error(`pages/${name}.html: unknown partial "${inc}"`); }
    return inc === 'head' ? renderHead(part, meta) : part.replace(/\n+$/, '');
  });
  return { meta, html: html.replace(/\r\n/g, '\n') };
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function assemble({ outDir = ROOT, root = ROOT, lastmod = process.env.SITE_LASTMOD || today() } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod)) throw new Error(`SITE_LASTMOD must be YYYY-MM-DD, got "${lastmod}"`);
  const names = readdirSync(join(root, 'pages')).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort();
  const written = [];
  const urls = [];
  for (const name of names) {
    const { meta, html } = renderPage(readFileSync(join(root, 'pages', `${name}.html`), 'utf8'), name, root);
    const rel = outPathFor(name);
    mkdirSync(dirname(join(outDir, rel)), { recursive: true });
    writeFileSync(join(outDir, rel), html);
    written.push(rel);
    if (name !== '404' && !meta.noindex) urls.push(meta.path);
  }
  urls.sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));
  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((p) => `  <url><loc>${ORIGIN}${p}</loc><lastmod>${lastmod}</lastmod></url>\n`).join('') + '</urlset>\n';
  writeFileSync(join(outDir, 'sitemap.xml'), sitemap);
  written.push('sitemap.xml');
  return written;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ? resolve(process.argv[2]) : ROOT;
  const files = assemble({ outDir: out });
  console.log(`assembled ${files.length} files -> ${out}`);
}
