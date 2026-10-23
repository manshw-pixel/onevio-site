// Churn rate calculator. The maths is a pure function (importable by node --test);
// the DOM wiring at the bottom runs only in a browser. Nothing leaves the page.
import { parseAmount, formatNumber } from './nrr-calculator.js';

export const MSG = {
  customers: 'Customers at the start must be more than 0.',
  whole: 'Customer counts must be whole numbers.',
  lostOver: "Customers lost can't be more than customers at the start.",
  revenue: 'Enter revenue at the start to see revenue churn.',
  revOver: "Revenue lost can't be more than revenue at the start.",
  negative: "Values can't be negative.",
  nan: 'Enter numbers only, for example 2,40,000.',
};

// Customer churn = lost / start. Revenue churn = lost revenue / start revenue (optional).
// A monthly rate is also annualised by compounding: 1 - (1 - m)^12.
export function calcChurn({ customers, lost, revenue = null, revenueLost = null, months = 12 }) {
  const v = [customers, lost, revenue ?? 0, revenueLost ?? 0];
  if (!v.every((n) => typeof n === 'number' && Number.isFinite(n))) return { ok: false, error: MSG.nan };
  if (v.some((n) => n < 0)) return { ok: false, error: MSG.negative };
  if (!(customers > 0)) return { ok: false, error: MSG.customers };
  if (!Number.isInteger(customers) || !Number.isInteger(lost)) return { ok: false, error: MSG.whole };
  if (lost > customers) return { ok: false, error: MSG.lostOver };
  const annualise = (r) => (months === 1 ? 1 - (1 - r) ** 12 : r);
  const logo = lost / customers;
  const out = { ok: true, logo, logoAnnual: annualise(logo), retained: customers - lost, revenueChurn: null, revenueAnnual: null };
  if (revenueLost !== null && revenueLost > 0 && !(revenue > 0)) return { ok: false, error: MSG.revenue };
  if (revenue !== null && revenue > 0) {
    const lostRev = revenueLost ?? 0;
    if (lostRev > revenue * (1 + 1e-9)) return { ok: false, error: MSG.revOver };
    out.revenueChurn = Math.min(1, lostRev / revenue);
    out.revenueAnnual = annualise(out.revenueChurn);
  }
  return out;
}

// One-decimal percentage for display ("2.5%"); trailing ".0" dropped.
export const pct1 = (ratio) => `${(Math.round(ratio * 1000 + 1e-9) / 10).toFixed(1).replace(/\.0$/, '')}%`;

/* ---------------- DOM wiring ---------------- */
function init(root) {
  const $ = (sel) => root.querySelector(sel);
  const inp = (n) => $(`[name=${n}]`);
  const fields = ['customers', 'lost', 'revenue', 'revenueLost'];
  const moneyFields = ['revenue', 'revenueLost'];
  const out = {
    idle: $('.calc-idle'), error: $('.calc-error'), results: $('.calc-results'),
    logo: $('.out-logo'), rev: $('.out-rev'), revBox: $('.out-rev-box'), note: $('.out-note'), annual: $('.out-annual'),
  };
  const symbolEls = root.querySelectorAll('.sym');
  let symbol = '₹';
  const months = () => Number(root.querySelector('input[name=period]:checked').value);

  function update() {
    if (!fields.some((f) => inp(f).value.trim() !== '')) {
      out.error.textContent = '';
      out.results.hidden = true;
      out.idle.hidden = false;
      return;
    }
    const r = calcChurn({
      customers: parseAmount(inp('customers').value),
      lost: parseAmount(inp('lost').value),
      revenue: parseAmount(inp('revenue').value, { allowEmpty: true }),
      revenueLost: parseAmount(inp('revenueLost').value, { allowEmpty: true }),
      months: months(),
    });
    out.idle.hidden = true;
    if (!r.ok) {
      out.error.textContent = r.error;
      out.results.hidden = true;
      return;
    }
    out.error.textContent = '';
    out.results.hidden = false;
    out.logo.textContent = pct1(r.logo);
    out.revBox.hidden = r.revenueChurn === null;
    if (r.revenueChurn !== null) out.rev.textContent = pct1(r.revenueChurn);
    const period = months() === 1 ? 'this month' : 'over the year';
    out.note.textContent = `You kept ${formatNumber(r.retained)} customers ${period}.`;
    out.annual.hidden = months() !== 1;
    if (months() === 1) {
      out.annual.textContent = `At this monthly rate, about ${pct1(r.logoAnnual)} of customers would leave over 12 months` +
        (r.revenueAnnual !== null ? `, and ${pct1(r.revenueAnnual)} of revenue.` : '.');
    }
  }

  function reformat() {
    for (const f of moneyFields) {
      const n = parseAmount(inp(f).value, { allowEmpty: true });
      if (n !== null && Number.isFinite(n)) inp(f).value = formatNumber(n, symbol);
    }
  }

  for (const f of fields) inp(f).addEventListener('input', update);
  for (const f of moneyFields) inp(f).addEventListener('blur', reformat);
  root.querySelectorAll('input[name=period]').forEach((r) => r.addEventListener('change', update));
  root.querySelectorAll('input[name=currency]').forEach((radio) => {
    radio.addEventListener('change', () => {
      symbol = radio.value;
      symbolEls.forEach((e) => { e.textContent = symbol; });
      reformat();
      update();
    });
  });
  $('.try-example')?.addEventListener('click', () => {
    root.querySelector('input[name=period][value="12"]').checked = true;
    inp('customers').value = '200';
    inp('lost').value = '18';
    inp('revenue').value = formatNumber(40000000, symbol);
    inp('revenueLost').value = formatNumber(3200000, symbol);
    update();
  });
  update();
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('churn-calc');
  if (root) init(root);
  // Enter in an input must not submit (and reload) the page; set here because the CSP forbids inline handlers.
  document.querySelectorAll('form.calc-in').forEach((f) => f.addEventListener('submit', (e) => e.preventDefault()));
}
