// Builds raster assets with sharp. For now: the default 1200x630 Open Graph image.
// Later tasks add the WebP/PNG screenshot conversions and per-page OG images here.
import sharp from 'sharp';
import { join } from 'node:path';
import { ROOT } from './assemble.mjs';

const logo = `<g transform="translate(96 96) scale(1.5)"><rect x="1" y="1" width="62" height="62" rx="14" fill="#fff" stroke="#e2e8f0" stroke-width="2"/><circle cx="19" cy="32" r="11" fill="none" stroke="#0f172a" stroke-width="7"/><path d="M38 20.5 47 44 56 20.5" fill="none" stroke="#4f46e5" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5f6fa"/><stop offset="1" stop-color="#e6e8ff"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <circle cx="1080" cy="560" r="300" fill="#4f46e5" opacity=".08"/>
  ${logo}
  <text x="210" y="160" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="800" font-size="56" fill="#0f172a" letter-spacing="-1">One<tspan fill="#4f46e5">Vio</tspan></text>
  <text x="96" y="330" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="68" fill="#121729" letter-spacing="-2">See every renewal coming.</text>
  <text x="96" y="410" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="68" fill="#121729" letter-spacing="-2">Keep every customer.</text>
  <text x="96" y="500" font-family="Segoe UI, Arial, sans-serif" font-size="30" fill="#4a5068">Health scores, renewal playbooks and NRR reporting for B2B SaaS teams.</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(join(ROOT, 'assets', 'og-default.png'));
console.log('wrote assets/og-default.png');
