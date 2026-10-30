// Builds raster assets with sharp:
//   - assets/og-default.png (1200x630, drawn)
//   - assets/shots/<name>-{800,1600}.webp + <name>-1600.png from assets/shots-src (CRM, demo data)
//   - assets/shots/og-home.png (1200x630 crop of the dashboard)
// Sources are 2880x1800 captures (1440x900 at 2x). Crops are in source pixels.
import sharp from 'sharp';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ROOT } from './assemble.mjs';

const SRC = join(ROOT, 'assets', 'shots-src');
const OUT = join(ROOT, 'assets', 'shots');
mkdirSync(OUT, { recursive: true });

export const SHOTS = [
  { name: 'customer-success-dashboard', src: 'dashboard.png' },
  { name: 'customer-health-score', src: 'health.png', crop: { left: 560, top: 170, width: 2250, height: 1300 } },
  { name: 'renewal-management', src: 'renewals.png', crop: { left: 560, top: 170, width: 2250, height: 1400 } },
  { name: 'arr-bridge-nrr-grr', src: 'licenses.png', crop: { left: 560, top: 490, width: 1115, height: 640 } },
  { name: 'customer-account-record', src: 'account.png', crop: { left: 560, top: 170, width: 2250, height: 1400 } },
  { name: 'team-tasks', src: 'tasks.png', crop: { left: 560, top: 170, width: 2250, height: 1400 } },
  { name: 'health-score-weights', src: 'settings-weights.png', crop: { left: 1700, top: 40, width: 1110, height: 870 } },
  { name: 'renewal-playbook', src: 'settings-playbook.png', crop: { left: 568, top: 74, width: 1104, height: 926 } },
  { name: 'license-deployment', src: 'licenses.png', crop: { left: 1700, top: 490, width: 1110, height: 640 } },
  { name: 'finance-invoicing', src: 'finance.png', crop: { left: 560, top: 170, width: 2250, height: 1630 } },
  { name: 'finance-overview', src: 'finance.png', crop: { left: 560, top: 295, width: 2250, height: 320 } },
  { name: 'finance-queues', src: 'finance.png', crop: { left: 560, top: 640, width: 2250, height: 480 } },
  // Onboarding (Implementation). The board is captured with the sidebar collapsed so all five columns fit.
  { name: 'customer-onboarding-board', src: 'customer-onboarding-board.png', crop: { left: 180, top: 175, width: 2630, height: 1020 } },
  { name: 'onboarding-handover-checklist', src: 'onboarding-handover-checklist.png', crop: { left: 560, top: 210, width: 2250, height: 1040 } },
  { name: 'onboarding-project-plan', src: 'onboarding-project-plan.png', crop: { left: 560, top: 175, width: 2250, height: 1625 } },
  { name: 'onboarding-csm-signoff', src: 'onboarding-csm-signoff.png', crop: { left: 560, top: 175, width: 2250, height: 1250 } },
];

const sizes = {};
for (const s of SHOTS) {
  const base = () => { const i = sharp(join(SRC, s.src)); return s.crop ? i.extract(s.crop) : i; };
  for (const w of [800, 1600]) {
    const info = await base().resize({ width: w }).webp({ quality: 82 }).toFile(join(OUT, `${s.name}-${w}.webp`));
    sizes[s.name] = { width: info.width, height: info.height };
  }
  await base().resize({ width: 1600 }).png({ palette: true, quality: 90, compressionLevel: 9 }).toFile(join(OUT, `${s.name}-1600.png`));
}
writeFileSync(join(OUT, 'sizes.json'), JSON.stringify(sizes, null, 2) + '\n');

// OG for the home page: top-left of the dashboard (tiles + ARR bridge).
await sharp(join(SRC, 'dashboard.png')).extract({ left: 0, top: 0, width: 2880, height: 1512 })
  .resize(1200, 630).png({ palette: true, compressionLevel: 9 }).toFile(join(OUT, 'og-home.png'));

// OG images for the feature pages: 1200x630 (1.905:1) crops of the matching screen.
const OGS = [
  ['og-customer-health-score', 'health.png', { left: 560, top: 170, width: 2250, height: 1181 }],
  ['og-renewal-management', 'renewals.png', { left: 560, top: 170, width: 2250, height: 1181 }],
  ['og-nrr-grr-reporting', 'dashboard.png', { left: 560, top: 190, width: 2250, height: 1181 }],
  ['og-license-deployment-tracking', 'licenses.png', { left: 560, top: 480, width: 2250, height: 1181 }],
  ['og-finance-invoicing', 'finance.png', { left: 560, top: 170, width: 2250, height: 1181 }],
  ['og-customer-onboarding', 'customer-onboarding-board.png', { left: 180, top: 175, width: 2630, height: 1381 }],
];
for (const [name, src, crop] of OGS) {
  await sharp(join(SRC, src)).extract(crop).resize(1200, 630).png({ palette: true, compressionLevel: 9 }).toFile(join(OUT, name + '.png'));
}

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
console.log('wrote assets/shots/* and assets/og-default.png');
